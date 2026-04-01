export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.status(200).send(`
    window.SUPABASE_CONFIG = {
      url: "${process.env.NEXT_PUBLIC_SUPABASE_URL}",
      key: "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}"
    };
  `);
}
