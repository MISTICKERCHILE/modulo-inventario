import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Aquí Vercel SÍ lee las variables de entorno de forma segura
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { table } = JSON.parse(req.body)
  const { data, error } = await supabase.from(table).select('*')

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}
