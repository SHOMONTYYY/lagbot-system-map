/* Hands the browser the team's shared Supabase keys when the map is hosted
   on Vercel. Values come from the project's Environment Variables — nothing
   is hardcoded here. The Anthropic key is NOT exposed; the page only learns
   whether the /api/ai proxy is available. */
export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    aiProxy: !!process.env.ANTHROPIC_API_KEY,
  });
}
