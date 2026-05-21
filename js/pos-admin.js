// ==========================================
// ADMINISTRACIÓN DEL POS (MENÚ, USUARIOS, REPORTES Z)
// ==========================================
window.categoriasMenuMemoria = [];

window.abrirPosAdminMenu = async function() {
    // 1. Ocultar el dashboard y mostrar esta pantalla
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    document.getElementById('pos-admin-menu-screen').classList.remove('hidden');
    document.getElementById('pos-admin-menu-screen').classList.add('flex');

    // 2. Cargar las categorías
    await cargarCategoriasParaAdmin();
}

window.cerrarPosAdminMenu = function() {
    document.getElementById('pos-admin-menu-screen').classList.add('hidden');
    document.getElementById('pos-admin-menu-screen').classList.remove('flex');
    window.abrirDashboardPOS(); // Te devuelve al inicio
}

async function cargarCategoriasParaAdmin() {
    const lista = document.getElementById('lista-admin-categorias');
    try {
        const { data, error } = await clienteSupabase
            .from('categorias')
            .select('id, nombre') // Si tienes columna 'orden', agrégala aquí
            .eq('id_empresa', window.miEmpresaId)
            .order('nombre'); // Temporalmente ordenado alfabéticamente

        if (error) throw error;
        
        window.categoriasMenuMemoria = data || [];
        renderizarListaCategoriasAdmin();
        
    } catch (err) {
        console.error("Error:", err);
        lista.innerHTML = '<p class="text-red-500 font-bold text-center">❌ Error al cargar categorías.</p>';
    }
}

function renderizarListaCategoriasAdmin() {
    const lista = document.getElementById('lista-admin-categorias');
    if (window.categoriasMenuMemoria.length === 0) {
        lista.innerHTML = '<p class="text-slate-400 italic">No tienes categorías creadas.</p>';
        return;
    }

    lista.innerHTML = window.categoriasMenuMemoria.map((cat, index) => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-slate-100 transition-colors">
            <span class="font-bold text-slate-700">${cat.nombre}</span>
            <div class="flex gap-1">
                <button onclick="moverCategoriaMenu(${index}, -1)" class="w-8 h-8 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-500 hover:bg-slate-200 font-bold disabled:opacity-30" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button onclick="moverCategoriaMenu(${index}, 1)" class="w-8 h-8 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-500 hover:bg-slate-200 font-bold disabled:opacity-30" ${index === window.categoriasMenuMemoria.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        </div>
    `).join('');
}

window.moverCategoriaMenu = function(index, direccion) {
    // direccion: -1 (subir), 1 (bajar)
    const nuevoIndex = index + direccion;
    if (nuevoIndex < 0 || nuevoIndex >= window.categoriasMenuMemoria.length) return;

    // Intercambiar posiciones en el array
    const temp = window.categoriasMenuMemoria[index];
    window.categoriasMenuMemoria[index] = window.categoriasMenuMemoria[nuevoIndex];
    window.categoriasMenuMemoria[nuevoIndex] = temp;

    renderizarListaCategoriasAdmin();
}

window.guardarOrdenMenu = async function() {
    alert("Aquí guardaremos el orden numérico en Supabase para que ventas.js lo lea.");
    // Luego actualizaremos Supabase
}