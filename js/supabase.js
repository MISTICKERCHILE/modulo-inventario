// Esperamos a que la configuración esté lista
const supabaseUrl = window.SUPABASE_CONFIG?.url;
const supabaseKey = window.SUPABASE_CONFIG?.key;

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: No se cargaron las llaves de configuración.");
}

window.clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
