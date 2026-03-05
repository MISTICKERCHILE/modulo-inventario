const supabaseUrl = 'https://your-url.supabase.co'
const supabaseKey = 'your-key'
window.clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true // Esto asegura que la RLS sepa quién es el usuario
  }
});
