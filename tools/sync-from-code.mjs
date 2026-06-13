#!/usr/bin/env node
/* Lagbot map — read-only code → architecture graph sync.
 *
 * Reads the Lagbot app codebase (a read-only clone) and emits SANITIZED
 * STRUCTURE — never raw source — into the map repo's docs so the map and the
 * Circuit AI stay grounded in the real code. One-way: this only reads the
 * codebase and writes into THIS repo's docs/. It cannot modify the codebase.
 *
 * Emits:
 *  - docs/architecture.json  { nodes:[{id,label,kind,layer,...}], edges:[{from,to,kind,label}] }
 *    a real graph derived from code: screen→route, route→service, route→table,
 *    service→service, service→table, webhook→pipeline→agent→push, external channels.
 *  - docs/code-facts.md      enriched digest (routes+their services/tables, service
 *    call graph, screen→API, env var names, SQL tables+columns, RLS policies).
 *  - docs/code-facts.json    raw structural facts.
 *
 * Safety:
 *  - never opens .env* / key / secret files (DENY below). .env.example KEY NAMES
 *    (never values) are allowed.
 *  - copies no file wholesale — only signatures, names, edges, columns.
 *  - scans its own output for secret patterns and ABORTS if any is found.
 *
 * Usage:  CODEBASE_DIR=/path/to/clone  node tools/sync-from-code.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

const SRC = process.env.CODEBASE_DIR || join(process.env.HOME || "", "lagbot-codebase");
const OUT = join(process.cwd(), "docs");
const DENY = /(^|\/)(\.env|\.git|node_modules|\.expo|dist|build)(\/|$)|\.(env|pem|key|p12|keystore)$|(^|\/)(secrets?|credentials?)(\/|\.)/i;
/* .env.example is allowed (names only) — it is NOT matched by DENY (no leading-dot ".env" boundary). */

if (!existsSync(SRC)) { console.error(`Codebase not found at ${SRC} — set CODEBASE_DIR.`); process.exit(1); }

function walk(dir, hit, depth = 0) {
  if (depth > 12) return;
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    if (DENY.test(full + (statSafe(full)?.isDirectory() ? "/" : ""))) continue;
    const s = statSafe(full); if (!s) continue;
    if (s.isDirectory()) walk(full, hit, depth + 1);
    else hit(full);
  }
}
function statSafe(p) { try { return statSync(p); } catch { return null; } }
function read(p) { try { return readFileSync(p, "utf8"); } catch { return ""; } }

/* path → canonical key: route params (:id) and template holes (${x}) collapse to :_ */
const canon = (method, path) =>
  `${method} ${path.replace(/:[A-Za-z_]+/g, ":_").replace(/\$\{[^}]+\}/g, ":_")}`;

/* ── service registry: server.js instance/identifier → service file node ── */
const SERVICE_FILES = {
  "llm.service.js": "LLMService",
  "message-pipeline.service.js": "MessagePipeline",
  "routing-engine.service.js": "RoutingEngine",
  "token.service.js": "TokenService",
  "evolution-api.client.js": "evolution-api.client",
  "evolution-webhook.handler.js": "evolution-webhook.handler",
  "nova-rules.js": "nova-rules",
  "sales.helpers.js": "sales.helpers",
  "file-parser.js": "file-parser",
};
const svcId = f => "svc:" + f.replace(/\.js$/, "");
/* server.js identifiers (instances / required helpers) → service file */
const INSTANCE_TO_FILE = {
  llm: "llm.service.js",
  pipeline: "message-pipeline.service.js",
  routingEngine: "routing-engine.service.js",
  tokenService: "token.service.js",
  evolutionClient: "evolution-api.client.js",
  webhookHandler: "evolution-webhook.handler.js",
  itemsForDecrement: "sales.helpers.js",
};
/* fuzzy: injected param / this-field name → service file (for DI edges inside services) */
function paramToFile(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("llm")) return "llm.service.js";
  if (n.includes("routing")) return "routing-engine.service.js";
  if (n.includes("token")) return "token.service.js";
  if (n.includes("pipeline")) return "message-pipeline.service.js";
  if (n.includes("evolution")) return "evolution-api.client.js";
  return null;
}

/* classify the call immediately chained after .from('table') */
function rwOf(method) {
  if (/^select$/.test(method)) return "read";
  if (/^(insert|update|upsert|delete)$/.test(method)) return "write";
  return "read"; // default: a .from() with a non-mutating chain reads
}
/* pull table edges from a code window: [{table, op:'read'|'write'}] */
function tableEdges(win) {
  const out = [];
  const re = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*\n?\s*\.\s*([a-z_]+)/gi;
  let m; while ((m = re.exec(win))) out.push({ table: m[1], op: rwOf(m[2]) });
  // also catch .from('x') with no immediate dotted chain on same slice (rare) → read
  const re2 = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)(?!\s*\n?\s*\.)/gi;
  while ((m = re2.exec(win))) out.push({ table: m[1], op: "read" });
  // dedupe by table+op
  const seen = new Set(), uniq = [];
  for (const e of out) { const k = e.table + e.op; if (!seen.has(k)) { seen.add(k); uniq.push(e); } }
  return uniq;
}
function rpcEdges(win) {
  const out = new Set(), re = /\.rpc\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi; let m;
  while ((m = re.exec(win))) out.add(m[1]); return [...out];
}
function authEdges(win) {
  const out = new Set(), re = /supabase\.auth\.([a-zA-Z.]+)\(/g; let m;
  while ((m = re.exec(win))) out.add(m[1]); return [...out];
}
function httpEdges(win) {
  const out = new Set();
  if (/exp\.host\/--\/api\/v2\/push\/send/.test(win)) out.add("expo");
  if (/api\.anthropic\.com/.test(win)) out.add("anthropic");
  return [...out];
}
/* injected service identifiers called in a server.js route window */
function serviceCallEdges(win) {
  const out = new Set();
  const re = /\b(evolutionClient|llm|routingEngine|tokenService|pipeline|itemsForDecrement)\b\s*\.?\s*([a-zA-Z]+)?\s*\(/g;
  let m; while ((m = re.exec(win))) out.add(m[1]);
  return [...out];
}

/* ── ROUTES (all in backend/server.js) with the services/tables they touch ── */
function extractRoutes() {
  const file = join(SRC, "backend", "server.js");
  const txt = read(file);
  const decl = /\bapp\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]([^\n]*)/gi;
  const hits = []; let m;
  while ((m = decl.exec(txt))) hits.push({ idx: m.index, method: m[1].toUpperCase(), path: m[2], tail: m[3] });
  // boundaries that end the route region (app.use(notFoundHandler) / app.listen / server.listen)
  const stops = []; const sr = /\b(?:app\.use|app\.listen|server\.listen)\s*\(/g;
  while ((m = sr.exec(txt))) stops.push(m.index);
  const routes = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const nextRoute = i + 1 < hits.length ? hits[i + 1].idx : txt.length;
    const nextStop = stops.find(s => s > h.idx);
    const end = Math.min(nextRoute, nextStop ?? nextRoute);
    const win = txt.slice(h.idx, end);
    // middleware/guards between path and the handler arrow.
    // strip balanced (...) arg groups first so an inline-options middleware
    // (e.g. rateLimitBusiness({max:10})) doesn't truncate the list.
    const noArgs = h.tail.replace(/\([^()]*\)/g, "");
    const guardTail = noArgs.split(/async|=>|\breq\b|function/)[0];
    const guards = [...new Set((guardTail.match(/[A-Za-z_$][\w$]*/g) || [])
      .filter(w => !/^(req|res|next|function|single|max)$/.test(w)))];
    const svcCalls = serviceCallEdges(win);
    // route handler that IS a service instance (e.g. webhookHandler)
    for (const g of guards) if (INSTANCE_TO_FILE[g]) svcCalls.push(g);
    routes.push({
      method: h.method, path: h.path,
      guards, services: [...new Set(svcCalls)],
      tables: tableEdges(win), rpcs: rpcEdges(win),
      auth: authEdges(win), http: httpEdges(win),
    });
  }
  return routes;
}

/* ── SERVICES: exports, tables, rpcs, http, local requires, DI service calls ── */
function extractServices() {
  const dir = join(SRC, "backend", "services"), out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter(n => /\.js$/.test(n)).sort()) {
    const txt = read(join(dir, f));
    const c = txt.match(/^\s*\/\*\*?\s*\n?\s*\*?\s*(.+)/) || txt.match(/^\s*\/\/\s*(.+)/);
    const purpose = c ? c[1].replace(/\*\/.*/, "").trim().slice(0, 120) : "";
    // exports
    const exp = [];
    const en = txt.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    if (en) for (const p of en[1].split(",")) { const n = p.split(":")[0].trim(); if (/^[A-Za-z_]/.test(n)) exp.push(n); }
    const ec = txt.match(/module\.exports\s*=\s*(?:new\s+)?([A-Za-z_][\w]*)/);
    if (ec && !en) exp.push(ec[1]);
    // local requires → inter-service edges
    const reqs = new Set(), rr = /require\(\s*['"]\.\/([a-zA-Z.\-]+)['"]\)/g; let mm;
    while ((mm = rr.exec(txt))) { let n = mm[1]; if (!/\.js$/.test(n)) n += ".js"; if (SERVICE_FILES[n]) reqs.add(n); }
    // DI: this.FIELD = PARAM  +  this.FIELD.method(  →  resolve FIELD→PARAM→file
    const fieldToParam = Object.create(null), fa = /this\.([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w*)/g; /* null proto: 'constructor'/'toString' etc. must not resolve to Object.prototype */
    while ((mm = fa.exec(txt))) fieldToParam[mm[1]] = mm[2];
    const di = new Set(), dc = /this\.([a-zA-Z_]\w*)\s*\.\s*[a-zA-Z_]/g;
    while ((mm = dc.exec(txt))) {
      const field = mm[1], param = fieldToParam[field] || field;
      const tf = paramToFile(param) || paramToFile(field);
      if (tf && tf !== f) di.add(tf);
    }
    out.push({
      name: f, purpose, exports: [...new Set(exp)],
      requires: [...reqs], di: [...di],
      tables: tableEdges(txt), rpcs: rpcEdges(txt), http: httpEdges(txt),
    });
  }
  return out;
}

/* ── SQL schema: tables+columns (CREATE + ALTER ADD COLUMN), RLS policies ── */
const COLTYPE = "uuid|text\\[\\]|text|integer|int|bigint|smallint|boolean|bool|timestamptz|timestamp|jsonb|json|numeric|date|real|double";
function matchParen(s, open) { // index of ')' matching '(' at `open`
  let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "(") d++; else if (s[i] === ")") { if (--d === 0) return i; } }
  return -1;
}
function extractSchema() {
  const dir = join(SRC, "sql");
  const tables = {}, rlsEnabled = new Set(), fns = new Set(), policies = [];
  const addCols = (t, cols) => { tables[t] = tables[t] || []; for (const c of cols) if (!tables[t].includes(c)) tables[t].push(c); };
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) {
    const txt = read(join(dir, f));
    // CREATE TABLE name ( ... )
    const ct = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi; let m;
    while ((m = ct.exec(txt))) {
      const name = m[1], open = txt.indexOf("(", m.index + m[0].length - 1);
      const close = matchParen(txt, open); if (close < 0) continue;
      const body = txt.slice(open + 1, close), cols = [];
      const cl = new RegExp(`^\\s*([a-z_][a-z0-9_]*)\\s+(?:${COLTYPE})\\b`, "i");
      for (const line of body.split("\n")) {
        if (/^\s*(unique|primary|foreign|check|constraint|references)\b/i.test(line)) continue;
        const cm = line.match(cl); if (cm) cols.push(cm[1]);
      }
      addCols(name, cols);
    }
    // ALTER TABLE name ADD COLUMN ... (multi-column blocks up to ;)
    const at = /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi;
    while ((m = at.exec(txt))) {
      const name = m[1], blk = m[2], cols = [];
      const ac = new RegExp(`add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?([a-z_][a-z0-9_]*)\\s+(?:${COLTYPE})\\b`, "gi");
      let cm; while ((cm = ac.exec(blk))) cols.push(cm[1]);
      if (cols.length) addCols(name, cols);
      if (/enable\s+row\s+level\s+security/i.test(blk)) rlsEnabled.add(name);
    }
    // functions
    const fn = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
    while ((m = fn.exec(txt))) fns.add(m[1]);
    // RLS policies "name" ON table  (skip dynamic %I in format())
    const po = /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
    while ((m = po.exec(txt))) policies.push({ name: m[1], table: m[2] });
  }
  return { tables, rlsEnabled: [...rlsEnabled].sort(), functions: [...fns].sort(), policies };
}

/* ── ENV var NAMES only (never values) from .env.example ── */
function extractEnv() {
  const f = join(SRC, ".env.example");
  if (!existsSync(f)) return [];
  const names = [];
  for (const line of read(f).split("\n")) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m) names.push(m[1]);
  }
  return [...new Set(names)];
}

/* ── api.ts: method → route, and database.ts: export object → route(s) ── */
function extractClients() {
  const apiMethod = {}; // method name → {method, path}
  const apiTxt = read(join(SRC, "src", "services", "api.ts"));
  // find method starts and call('/...') literals, associate each call to nearest preceding method
  const starts = [];
  const sr = /(?:async\s+)?([a-zA-Z_]\w*)\s*\([^)]*\)\s*(?::[^={]+)?\{/g; let m;
  while ((m = sr.exec(apiTxt))) starts.push({ idx: m.index, name: m[1] });
  const cr = /call\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{[^}]*method:\s*['"]([A-Z]+)['"])?/g;
  while ((m = cr.exec(apiTxt))) {
    let owner = null; for (const s of starts) if (s.idx < m.index) owner = s.name; else break;
    if (!owner || /^(call|fetchOnce|getAuthHeader)$/.test(owner)) continue;
    if (!apiMethod[owner]) apiMethod[owner] = { method: m[2] || "GET", path: m[1] };
  }
  // database.ts export objects that make backend calls
  const dbObj = {}; // object name → [{method,path}]
  const dbTxt = read(join(SRC, "src", "services", "database.ts"));
  const objs = [];
  const or = /export\s+const\s+([a-zA-Z_]\w*)\s*=\s*\{/g;
  while ((m = or.exec(dbTxt))) objs.push({ idx: m.index, name: m[1] });
  const dcr = /call\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{[^}]*method:\s*['"]([A-Z]+)['"])?/g;
  while ((m = dcr.exec(dbTxt))) {
    let owner = null; for (const o of objs) if (o.idx < m.index) owner = o.name; else break;
    if (!owner) continue;
    (dbObj[owner] = dbObj[owner] || []).push({ method: m[2] || "GET", path: m[1] });
  }
  return { apiMethod, dbObj };
}

/* ── SCREENS → routes (transitive through api.ts / database.ts) ── */
function extractScreens(clients) {
  const { apiMethod, dbObj } = clients;
  const screens = [];
  const roots = ["app", "src"].map(d => join(SRC, d)).filter(existsSync);
  for (const root of roots) walk(root, f => {
    if (!/\.(tsx|ts)$/.test(f)) return;
    const rel = relative(SRC, f);
    if (/services\/(api|database|supabase|oauth)\.ts$/.test(rel)) return; // these are the clients
    if (/(^|\/)__tests__\/|\.(test|spec)\.[tj]sx?$/.test(rel)) return; // skip tests
    const txt = read(f);
    if (!/services\/(api|database)['"]/.test(txt)) {
      // still capture raw-fetch screens (import.tsx)
      if (!/\$\{BASE_URL\}\/api\//.test(txt)) return;
    }
    // imports: alias → {orig, source}
    const aliases = {}; let im;
    const ir = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*services\/(api|database)['"]/g;
    while ((im = ir.exec(txt))) {
      const source = im[2];
      for (const part of im[1].split(",")) {
        const mm = part.trim().match(/^([a-zA-Z_]\w*)(?:\s+as\s+([a-zA-Z_]\w*))?$/);
        if (mm) aliases[mm[2] || mm[1]] = { orig: mm[1], source };
      }
    }
    const routes = new Set();
    // api.<method>( and call('/...') and database-object usage
    for (const [alias, info] of Object.entries(aliases)) {
      if (info.source === "api" && info.orig === "api") {
        const mr = new RegExp(`\\b${alias}\\.([a-zA-Z_]\\w*)\\(`, "g"); let mm;
        while ((mm = mr.exec(txt))) { const r = apiMethod[mm[1]]; if (r) routes.add(canon(r.method, r.path)); }
      } else if (info.source === "api" && info.orig === "call") {
        const mr = new RegExp(`\\b${alias}\\(\\s*[\`'"]([^\`'"]+)[\`'"]\\s*(?:,\\s*\\{[^}]*method:\\s*['"]([A-Z]+)['"])?`, "g"); let mm;
        while ((mm = mr.exec(txt))) routes.add(canon(mm[2] || "GET", mm[1]));
      } else if (info.source === "database" && dbObj[info.orig]) {
        // used at all? (alias referenced beyond the import)
        if (new RegExp(`\\b${alias}\\b`).test(txt.replace(im?.[0] || "", "")))
          for (const r of dbObj[info.orig]) routes.add(canon(r.method, r.path));
      }
    }
    // raw fetch literal (import.tsx)
    const fr = /fetch\(\s*`\$\{BASE_URL\}(\/api\/[^`]+)`/g; let fm;
    while ((fm = fr.exec(txt))) routes.add(canon("POST", fm[1]));
    if (routes.size) screens.push({ file: rel, routes: [...routes] });
  });
  return screens.sort((a, b) => a.file.localeCompare(b.file));
}

/* ════════════════════════ assemble facts ════════════════════════ */
const routes = extractRoutes();
const services = extractServices();
const schema = extractSchema();
const env = extractEnv();
const clients = extractClients();
const screens = extractScreens(clients);

const facts = {
  source: "lagbot-codebase (read-only clone)",
  note: "Auto-generated structural graph (read-only). No source code is copied here.",
  routes, services, schema, env, screens,
};

/* ════════════════════════ architecture.json graph ════════════════════════ */
function buildGraph() {
  const nodes = new Map(), edges = [];
  const N = (id, label, kind, layer, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, label, kind, layer, ...extra }); return id; };
  const E = (from, to, kind, label = "") => { if (from && to) edges.push({ from, to, kind, label }); };

  // external channels
  const CH = {
    whatsapp: N("ch:whatsapp", "WhatsApp (customer)", "channel", "external"),
    evolution: N("ch:evolution", "Evolution API gateway", "channel", "external"),
    expo: N("ch:expo", "Expo Push (exp.host)", "channel", "external"),
    anthropic: N("ch:anthropic", "Anthropic Claude API", "channel", "external"),
    supaAuth: N("ext:supabase-auth", "Supabase Auth", "auth", "external"),
  };
  const WH = N("wh:evolution", "POST /webhook/evolution", "webhook", "edge");
  E(CH.whatsapp, CH.evolution, "channel", "inbound msg");
  E(CH.evolution, WH, "channel", "webhook POST");

  // service nodes
  for (const s of services) {
    const kind = s.name === "llm.service.js" ? "agent" : "service";
    N(svcId(s.name), s.name.replace(/\.js$/, ""), kind, "svc",
      { exports: s.exports, purpose: s.purpose });
  }
  // table nodes
  for (const t of Object.keys(schema.tables)) N("tbl:" + t, t, "table", "data", { columns: schema.tables[t].length });

  // route nodes + edges
  for (const r of routes) {
    const id = "route:" + r.method + " " + r.path;
    N(id, r.method + " " + r.path, "route", "api", { guards: r.guards });
    for (const g of r.services) { const f = INSTANCE_TO_FILE[g]; if (f) E(id, svcId(f), "route-service", g); }
    for (const t of r.tables) E(id, N("tbl:" + t.table, t.table, "table", "data"), "route-table", t.op);
    for (const rp of r.rpcs) E(id, "ext:rpc:" + rp, N("ext:rpc:" + rp, rp + "()", "rpc", "data"), "route-rpc");
    for (const a of r.auth) E(id, CH.supaAuth, "route-auth", a);
    for (const h of r.http) E(id, h === "expo" ? CH.expo : CH.anthropic, "route-http", h);
  }
  // webhook → pipeline
  E(WH, svcId("message-pipeline.service.js"), "webhook-service", "handleIncoming");
  E(svcId("evolution-webhook.handler.js"), svcId("message-pipeline.service.js"), "service-service", "handleIncoming");

  // service → service / table / rpc / http
  for (const s of services) {
    const from = svcId(s.name);
    for (const r of s.requires) if (r !== s.name) E(from, svcId(r), "service-service", "require");
    for (const d of s.di) if (d !== s.name) E(from, svcId(d), "service-service", "inject");
    for (const t of s.tables) E(from, N("tbl:" + t.table, t.table, "table", "data"), "service-table", t.op);
    for (const rp of s.rpcs) E(from, N("ext:rpc:" + rp, rp + "()", "rpc", "data"), "service-rpc", "");
    for (const h of s.http) E(from, h === "expo" ? CH.expo : CH.anthropic, "service-http", h);
  }
  // evolution-api.client is the only outbound WhatsApp path
  E(svcId("evolution-api.client.js"), CH.evolution, "service-http", "axios");

  // screens → routes (+ client nodes)
  N("client:api", "src/services/api.ts", "client", "app");
  N("client:database", "src/services/database.ts", "client", "app");
  const routeByCanon = {};
  for (const r of routes) routeByCanon[canon(r.method, r.path)] = "route:" + r.method + " " + r.path;
  for (const sc of screens) {
    const id = "scr:" + sc.file;
    N(id, sc.file, "screen", "app");
    for (const c of sc.routes) { const rid = routeByCanon[c]; if (rid) E(id, rid, "screen-route", ""); }
  }

  return { nodes: [...nodes.values()], edges };
}
const graph = buildGraph();

/* ════════════════════════ code-facts.md (digest, <~18KB) ════════════════════════ */
function fmtTables(arr) {
  const r = arr.filter(t => t.op === "read").map(t => t.table);
  const w = arr.filter(t => t.op === "write").map(t => t.table);
  const parts = [];
  if (r.length) parts.push("R:" + [...new Set(r)].join("/"));
  if (w.length) parts.push("W:" + [...new Set(w)].join("/"));
  return parts.join(" ") || "—";
}
function md() {
  const L = [];
  L.push("# Lagbot — live code facts (architecture graph)", "",
    "_Auto-generated by `tools/sync-from-code.mjs` from the read-only codebase. Structure + edges only — no source is copied. Full graph in `docs/architecture.json`. Do not edit by hand._", "");

  // routes enriched
  L.push(`## REST routes (${routes.length}) — server.js, one Express app`, "",
    "Method · Path · Guards · Services · Tables(R/W) · Ext", "");
  for (const r of routes) {
    const svc = r.services.map(g => INSTANCE_TO_FILE[g] ? INSTANCE_TO_FILE[g].replace(/\.js$/, "").replace(/\.(service|client|handler)$/, "") : g).filter(Boolean);
    const ext = [...r.http, ...r.auth.map(a => "auth." + a), ...r.rpcs.map(x => "rpc:" + x)];
    L.push(`- \`${r.method} ${r.path}\`` +
      (r.guards.length ? ` · g:${r.guards.join(",")}` : "") +
      (svc.length ? ` · svc:${[...new Set(svc)].join(",")}` : "") +
      ` · ${fmtTables(r.tables)}` +
      (ext.length ? ` · ${ext.join(",")}` : ""));
  }

  // service call graph
  L.push("", `## Service call graph (${services.length})`, "");
  for (const s of services) {
    const deps = [...new Set([...s.requires, ...s.di])].map(d => d.replace(/\.js$/, "").replace(/\.(service|client|handler)$/, "")).filter(Boolean);
    const ex = [...(s.http || [])];
    L.push(`- **${s.name.replace(/\.js$/, "")}**` + (s.purpose ? ` — ${s.purpose}` : "") +
      (deps.length ? `\n  - →svc: ${[...new Set(deps)].join(", ")}` : "") +
      (s.tables.length ? `\n  - db: ${fmtTables(s.tables)}` : "") +
      (s.rpcs.length ? `\n  - rpc: ${s.rpcs.join(", ")}` : "") +
      (ex.length ? `\n  - http: ${ex.join(", ")}` : "") +
      (s.exports.length ? `\n  - exports: ${s.exports.join(", ")}` : ""));
  }

  // screen → api (resolve canonical keys back to real server route paths)
  const labelByCanon = {};
  for (const r of routes) labelByCanon[canon(r.method, r.path)] = `${r.method} ${r.path}`;
  L.push("", `## Screen → API calls (${screens.length} screens that hit routes)`, "");
  for (const sc of screens) L.push(`- \`${sc.file}\` → ${sc.routes.map(c => labelByCanon[c] || `${c} (no backend route)`).join(", ")}`);

  // env
  L.push("", `## Env vars (names only, ${env.length})`, "", env.join(", ") || "—");

  // sql tables + columns
  const tnames = Object.keys(schema.tables).sort();
  L.push("", `## SQL tables + columns (${tnames.length})`, "");
  for (const t of tnames) {
    const cols = schema.tables[t];
    L.push(`- **${t}** (${cols.length}): ${cols.join(", ")}`);
  }

  // rls
  const byTable = {};
  for (const p of schema.policies) (byTable[p.table] = byTable[p.table] || []).push(p.name);
  L.push("", `## RLS policies (${schema.policies.length} on ${Object.keys(byTable).length} tables)`, "");
  for (const t of Object.keys(byTable).sort()) L.push(`- **${t}**: ${byTable[t].join(" | ")}`);
  L.push(`\nRLS enabled (ALTER): ${schema.rlsEnabled.join(", ") || "—"}`);
  L.push(`DB functions: ${schema.functions.join(", ") || "—"}`, "");

  return L.join("\n");
}

/* ── secret guard: never let a key reach the repo ── */
const SECRETS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9]{32,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/,
  /[sp]k_(live|test)_[A-Za-z0-9]{16,}/,                          // Paystack secret/public keys (underscore)
  /(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s:@/]+@/i, // DB connection string with embedded password
  /(EVOLUTION_API_KEY|EVOLUTION_WEBHOOK_SECRET)\s*[:=]\s*['"]?[A-Za-z0-9._-]{8,}/i, // Evolution credentials with a value
];
const jsonOut = JSON.stringify(facts, null, 2);
const graphOut = JSON.stringify(graph, null, 2);
const mdOut = md();
for (const re of SECRETS) for (const [label, body] of [["code-facts.json", jsonOut], ["architecture.json", graphOut], ["code-facts.md", mdOut]]) {
  if (re.test(body)) { console.error(`ABORT: possible secret matching ${re} in ${label} — nothing written.`); process.exit(2); }
}

writeFileSync(join(OUT, "code-facts.json"), jsonOut + "\n");
writeFileSync(join(OUT, "architecture.json"), graphOut + "\n");
writeFileSync(join(OUT, "code-facts.md"), mdOut);
const kb = (Buffer.byteLength(mdOut, "utf8") / 1024).toFixed(1);
if (Buffer.byteLength(mdOut, "utf8") > 24 * 1024) console.warn(`::warning::code-facts.md is ${kb}KB — it's injected into every AI call. Consider trimming column lists.`);
console.log(`OK — ${routes.length} routes, ${services.length} services, ${Object.keys(schema.tables).length} tables, ${schema.policies.length} policies, ${screens.length} screens; graph ${graph.nodes.length} nodes / ${graph.edges.length} edges; code-facts.md ${kb}KB.`);
