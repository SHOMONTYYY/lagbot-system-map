/* Forwards the ✦ Circuit AI bar's requests to the Anthropic API with the
   key kept server-side (ANTHROPIC_API_KEY env var), so it never appears in
   the page source. Non-streaming passthrough of /v1/messages. */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "POST only" } });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: { message: "ANTHROPIC_API_KEY is not set in the Vercel project environment." } });
    return;
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
    },
    body: typeof req.body === "string" ? req.body : JSON.stringify(req.body),
  });
  const text = await r.text();
  res.status(r.status)
    .setHeader("content-type", r.headers.get("content-type") || "application/json")
    .send(text);
}
