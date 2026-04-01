const urlConfig = window.SUPABASE_CONFIG?.url;
const keyConfig = window.SUPABASE_CONFIG?.key;

if (!urlConfig || !keyConfig) {
    console.error("Error: No se cargaron las llaves de configuración desde Vercel.");
}

// Creamos el cliente usando las llaves de la configuración dinámica
window.clienteSupabase = supabase.createClient(urlConfig, keyConfig, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
