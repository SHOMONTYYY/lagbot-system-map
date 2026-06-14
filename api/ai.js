/* Forwards the ✦ Circuit AI bar's requests to the Anthropic API with the key
   kept server-side (ANTHROPIC_API_KEY), so it never appears in page source.
   Non-streaming passthrough of /v1/messages.

   Abuse guards (public endpoint): blocks requests from a foreign Origin so a
   third-party page can't bill your account through visitors' browsers, and
   clamps max_tokens so a caller can't request a giant (expensive) response.
   For hard per-IP rate limiting, add a Vercel Firewall rate rule. */
const MAX_TOKENS_CEILING = 8192;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: { message: "POST only" } }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: { message: "ANTHROPIC_API_KEY is not set." } }); return; }

  // Block cross-origin callers. Same-origin browser requests send no Origin (or
  // a matching one); a malicious site's fetch sends its own Origin → reject.
  const origin = req.headers.origin || "";
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    const ok = host.endsWith(".vercel.app") || host.startsWith("localhost") || host.startsWith("127.0.0.1");
    if (!ok) { res.status(403).json({ error: { message: "Cross-origin requests are not allowed." } }); return; }
  }

  let body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
  if (!body || typeof body !== "object") body = {};
  if (typeof body.max_tokens === "number" && body.max_tokens > MAX_TOKENS_CEILING) body.max_tokens = MAX_TOKENS_CEILING;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "application/json").send(text);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
