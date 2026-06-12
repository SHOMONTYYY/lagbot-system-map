/* "Improve the Circuit" — turns an in-app request into an autonomous PR.
 *
 * Fires a GitHub workflow (repository_dispatch) that runs a coding agent which
 * edits this app's own repo and opens a Pull Request. It never merges; a human
 * merges. The Lagbot codebase is not involved.
 *
 * This endpoint is public, so it is deliberately minimal: it only enqueues a
 * job. The agent it triggers is sandboxed to file-editing tools (no shell, no
 * network) in the workflow, so it cannot read or exfiltrate secrets. The token
 * here stays server-side and is never returned. The open-PR cap fails CLOSED so
 * a GitHub hiccup can't disable it.
 */
const REPO = "SHOMONTYYY/lagbot-system-map";
const MAX_PENDING = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return res.status(503).json({ error: "Not set up yet — add the GH_DISPATCH_TOKEN env var (see tools/README.md)." });

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
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
  return res.status(200).json({ ok: true, message: "On it — the Circuit is drafting a pull request. It'll appear under Pull requests for your team to review and merge." });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
