
(function() {
    
    const urlConfig = window.SUPABASE_CONFIG?.url;
    const keyConfig = window.SUPABASE_CONFIG?.key;

    if (!urlConfig || !keyConfig) {
        console.warn("Aviso: Esperando configuración de Vercel...");
    }

    if (urlConfig && keyConfig && !window.clienteSupabase) {
        window.clienteSupabase = supabase.createClient(urlConfig, keyConfig, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });
        console.log("✅ Supabase conectado con éxito en buddyerp.com");
    }
})();
