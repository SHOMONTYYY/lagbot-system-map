#!/usr/bin/env node
/* Lagbot map — read-only code → docs sync.
 *
 * Reads the Lagbot app codebase (a read-only clone) and emits SANITIZED
 * STRUCTURE — never raw source — into the map repo's docs so the map and the
 * Circuit AI stay grounded in the real code. One-way: this only reads the
 * codebase and writes into THIS repo's docs/. It cannot modify the codebase.
 *
 * Safety:
 *  - never opens .env* / key / secret files (DENY below)
 *  - copies no file wholesale — only route signatures, table/policy names,
 *    service names + their top doc-comment, and screen paths
 *  - scans its own output for secret patterns and ABORTS if any is found
 *
 * Usage:  CODEBASE_DIR=/path/to/clone  node tools/sync-from-code.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

const SRC = process.env.CODEBASE_DIR || join(process.env.HOME || "", "lagbot-codebase");
const OUT = join(process.cwd(), "docs");
const DENY = /(^|\/)(\.env|\.git|node_modules|\.expo|dist|build)(\/|$)|\.(env|pem|key|p12|keystore)$|(^|\/)(secrets?|credentials?)(\/|\.)/i;

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

/* ---- routes: backend Express app.METHOD('/path', ...mw, handler) ---- */
function extractRoutes() {
  const routes = [];
  walk(join(SRC, "backend"), f => {
    if (!/\.(js|ts|mjs)$/.test(f)) return;
    const txt = read(f);
    const re = /\b(?:app|router)\.(get|post|put|delete|patch)\(\s*(['"`])([^'"`]+)\2([^\n]*)/g;
    let m;
    while ((m = re.exec(txt))) {
      const method = m[1].toUpperCase(), path = m[3];
      const rest = m[4].split(/\(req|async|=>|\{/)[0]; // stop before handler/options object
      const mw = (rest.match(/[A-Za-z_$][\w$]*/g) || []).filter(w => !/^(req|res|next|function|max)$/.test(w));
      routes.push({ method, path, guards: [...new Set(mw)], file: relative(SRC, f) });
    }
  });
  return routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

/* ---- supabase schema: table / policy / rls / function NAMES only ---- */
function extractSchema() {
  const norm = t => t.replace(/^public\./i, "").replace(/\.$/, "").trim();
  const ok = t => t && !/^(now|as|select|table)$/i.test(t);
  const tables = new Set(), rls = new Set(), fns = new Set();
  const policies = {};
  const dir = join(SRC, "sql");
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) {
    const txt = read(join(dir, f));
    for (const x of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["']?([\w.]+)/gi)) { const t = norm(x[1]); if (ok(t)) tables.add(t); }
    for (const x of txt.matchAll(/alter\s+table\s+["']?([\w.]+)["']?\s+enable\s+row\s+level\s+security/gi)) { const t = norm(x[1]); if (ok(t)) rls.add(t); }
    for (const x of txt.matchAll(/create\s+(?:or\s+replace\s+)?function\s+["']?([\w.]+)/gi)) { const t = norm(x[1]); if (ok(t)) fns.add(t); }
    for (const x of txt.matchAll(/create\s+policy\s+["']([^"']+)["']\s+on\s+["']?([\w.]+)/gi)) { const t = norm(x[2]); if (ok(t)) policies[t] = (policies[t] || 0) + 1; }
  }
  return { tables: [...tables].sort(), rlsEnabled: [...rls].sort(), functions: [...fns].sort(), policyCounts: policies };
}

/* ---- backend services: filename + first doc-comment line ---- */
function extractServices() {
  const dir = join(SRC, "backend", "services"), out = [];
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(n => /\.(js|ts)$/.test(n)).sort()) {
    const txt = read(join(dir, f));
    const c = txt.match(/^\s*\/\*\*?\s*\n?\s*\*?\s*(.+)/) || txt.match(/^\s*\/\/\s*(.+)/);
    out.push({ name: f, purpose: c ? c[1].replace(/\*\/.*/, "").trim().slice(0, 140) : "" });
  }
  return out;
}

/* ---- screens: Expo Router app/(group)/name.tsx ---- */
function extractScreens() {
  const dir = join(SRC, "app"), groups = {};
  walk(dir, f => {
    if (!f.endsWith(".tsx") || /_layout\.tsx$/.test(f)) return;
    const rel = relative(dir, f);
    const g = (rel.match(/\(([^)]+)\)/) || [, "root"])[1];
    (groups[g] = groups[g] || []).push(rel.replace(/\.tsx$/, ""));
  });
  for (const g in groups) groups[g].sort();
  return groups;
}

/* ---- assemble + render ---- */
const facts = {
  source: "github.com/Joseph-Banke/lagbot-mobile-main",
  note: "Auto-generated structural facts (read-only). No source code is copied here.",
  routes: extractRoutes(),
  schema: extractSchema(),
  services: extractServices(),
  screens: extractScreens(),
};

function md() {
  const L = [];
  L.push("# Lagbot — live code facts", "", "_Auto-generated by `tools/sync-from-code.mjs` from the read-only codebase. Structure only — no source is copied. Do not edit by hand._", "");
  L.push(`## REST routes (${facts.routes.length})`, "", "| Method | Path | Guards | File |", "|---|---|---|---|");
  for (const r of facts.routes) L.push(`| ${r.method} | \`${r.path}\` | ${r.guards.join(", ") || "—"} | ${r.file} |`);
  L.push("", `## Supabase schema`, "", `**Tables (${facts.schema.tables.length}):** ${facts.schema.tables.join(", ") || "—"}`, "");
  L.push(`**Row-level security enabled on:** ${facts.schema.rlsEnabled.join(", ") || "—"}`, "");
  const pc = Object.entries(facts.schema.policyCounts).map(([t, n]) => `${t} (${n})`).join(", ");
  L.push(`**Policies per table:** ${pc || "—"}`, "", `**DB functions:** ${facts.schema.functions.join(", ") || "—"}`, "");
  L.push(`## Backend services (${facts.services.length})`, "");
  for (const s of facts.services) L.push(`- **${s.name}**${s.purpose ? ` — ${s.purpose}` : ""}`);
  L.push("", "## App screens (Expo Router)", "");
  for (const g of Object.keys(facts.screens).sort()) L.push(`- **(${g})**: ${facts.screens[g].join(", ")}`);
  L.push("");
  return L.join("\n");
}

/* ---- secret guard: never let a key reach the public repo ---- */
const SECRETS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9]{32,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/,
];
const jsonOut = JSON.stringify(facts, null, 2);
const mdOut = md();
for (const re of SECRETS) for (const [label, body] of [["code-facts.json", jsonOut], ["code-facts.md", mdOut]]) {
  if (re.test(body)) { console.error(`ABORT: possible secret matching ${re} in ${label} — nothing written.`); process.exit(2); }
}

writeFileSync(join(OUT, "code-facts.json"), jsonOut + "\n");
writeFileSync(join(OUT, "code-facts.md"), mdOut);
console.log(`OK — ${facts.routes.length} routes, ${facts.schema.tables.length} tables, ${facts.services.length} services, ${Object.values(facts.screens).flat().length} screens.`);
