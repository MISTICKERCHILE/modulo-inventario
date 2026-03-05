const supabaseUrl = 'https://gdtrkrnxkhiqimvmfrms.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkdHJrcm54a2hpcWltdm1mcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NjYyODcsImV4cCI6MjA4ODA0MjI4N30.IYJR0fsehO0nXZ5YdEQ53S7Q1Z0e8qYSWdDeQkcTDS0'; 

// Agregamos el tercer parámetro para mantener la sesión viva
window.clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // Esto guarda el login para que no se cierre al recargar
    autoRefreshToken: true // Esto renueva el token automáticamente por detrás
  }
});
