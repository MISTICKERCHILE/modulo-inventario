window.miEmpresaId = null;
window.productoActualParaReceta = null;

// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    
    if (error) return alert("❌ Credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    if (!perfil) return alert("Usuario sin empresa asignada");

    window.miEmpresaId = perfil.id_empresa;
    
    // Mostramos el correo del usuario en el header
    document.getElementById('user-email-display').innerText = data.user.email;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    cambiarVista('catalogos');
});

function cerrarSesion() { location.reload(); }

// --- MENÚ COLAPSABLE (NUEVO) ---
function toggleMenu() {
    const sidebar = document.getElementById('sidebar-menu');
    // Si tiene la clase w-64, significa que está abierto, entonces lo cerramos
    if (sidebar.classList.contains('w-64')) {
        sidebar.classList.remove('w-64', 'p-4');
        sidebar.classList.add('w-0', 'p-0'); // Se colapsa a 0
    } else {
        // Si está cerrado, lo abrimos
        sidebar.classList.remove('w-0', 'p-0');
        sidebar.classList.add('w-64', 'p-4');
    }
}

// --- NAVEGACIÓN PRINCIPAL ---
function cambiarVista(v) {
    if(!window.miEmpresaId) return; 
    
    ['catalogos', 'productos', 'recetas'].forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        document.getElementById(`btn-menu-${vis}`).className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-
