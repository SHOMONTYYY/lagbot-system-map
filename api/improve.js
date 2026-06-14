/* "Improve the Circuit" — turns an in-app request into an autonomous PR.
 *
 * Fires a GitHub workflow (repository_dispatch) that runs a coding agent which
 * edits this app's own repo, opens a Pull Request, and (when AUTO_MERGE is on,
 * the default) auto-merges + deploys it. The Lagbot codebase is not involved.
 *
 * This endpoint is public, so it is deliberately gated and minimal: it requires
 * the maintainer code, only enqueues a job, and the token stays server-side
 * (never returned). The agent it triggers is sandboxed to file-editing tools
 * (no shell, no network), so it cannot read or exfiltrate secrets. The open-PR
 * cap fails CLOSED so a GitHub hiccup can't disable it. NOTE: with AUTO_MERGE on,
 * the maintainer code is the only gate before code reaches the live site — keep
 * it long/secret, or set AUTO_MERGE=false to require a human PR review.
 */
const REPO = "SHOMONTYYY/lagbot-system-map";
const MAX_PENDING = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return res.status(503).json({ error: "Not set up yet — add the GH_DISPATCH_TOKEN env var (see tools/README.md)." });

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
  // mandatory maintainer code — fail CLOSED. Because a triggered change can
  // auto-merge + deploy, the public trigger must never work without this.
  const code = process.env.MAINTAINER_CODE;
  if (!code) return res.status(503).json({ error: "Not set up yet — set the MAINTAINER_CODE env var to enable the in-app trigger." });
  if (String(body.code || "") !== code) return res.status(401).json({ error: "Wrong or missing maintainer code." });
  const instruction = String(body.instruction || "").trim();
  const author = String(body.author || "Someone").trim().slice(0, 40);
  if (instruction.length < 8) return res.status(400).json({ error: "Describe the change in a bit more detail." });
  if (instruction.length > 2000) return res.status(400).json({ error: "Please keep the request under 2000 characters." });

  const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "circuit-improve" },
  });

  // abuse / clutter cap — FAIL CLOSED: if we can't count, we refuse.
  try {
    const r = await gh("/pulls?state=open&per_page=100");
    if (!r.ok) return res.status(503).json({ error: "Couldn't check pending requests — try again shortly." });
    const open = await r.json();
    const pending = open.filter(p => (p.head?.ref || "").startsWith("claude")).length;
    if (pending >= MAX_PENDING) return res.status(429).json({ error: `There are already ${pending} improvement PRs waiting — merge or close some first.` });
  } catch {
    return res.status(503).json({ error: "Couldn't check pending requests — try again shortly." });
  }

  const d = await gh("/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "improve-circuit", client_payload: { instruction, author } }),
  });
  if (!d.ok && d.status !== 204) return res.status(502).json({ error: "Couldn't start the job — try again shortly." });
  return res.status(200).json({ ok: true, message: "On it — the Circuit is making your change. It'll auto-merge and deploy to the live site in a minute or two; refresh to see it." });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
