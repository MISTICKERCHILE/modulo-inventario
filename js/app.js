// Usamos window para evitar errores de declaración duplicada
window.miEmpresaId = null;
let productoActualParaReceta = null;

// --- LOGIN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) return alert("❌ Credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    window.miEmpresaId = perfil.id_empresa;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    cambiarVista('catalogos');
});

function cerrarSesion() { location.reload(); }

// --- NAVEGACIÓN ---
function cambiarVista(v) {
    const vistas = ['catalogos', 'productos', 'recetas'];
    vistas.forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium';
    });
    
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    const btnActivo = document.getElementById(`btn-menu-${v}`);
    if(btnActivo) btnActivo.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') cargarProductos();
}

function cambiarTab(tab) {
    const todosTabs = ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'];
    todosTabs.forEach(t => {
        const sec = document.getElementById(`seccion-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if(sec) sec.style.display = tab === t ? 'block' : 'none';
        if(btn) btn.className = tab === t 
            ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 whitespace-nowrap' 
            : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap border-b-2 border-transparent';
    });
    
    if(tab === 'categorias') cargarCategorias();
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
}

// --- CATALOGOS ---
async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-categorias').innerHTML = (data || []).map(c => `<li class="p-4 flex justify-between border-b"><span>${c.nombre}</span></li>`).join('');
}

async function cargarSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-sucursales').innerHTML = (data || []).map(s => `<li class="p-4 flex justify-between border-b"><span>${s.nombre}</span></li>`).join('');
}

async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId);
    const sel = document.getElementById('sel-sucursal-ubi');
    if(sel) sel.innerHTML = '<option value="">Elegir Sucursal...</option>' + (data || []).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId);
    document.getElementById('lista-ubicaciones').innerHTML = (data || []).map(u => `<li class="p-4 flex justify-between border-b"><span>${u.nombre} <b class="text-emerald-600">(@${u.sucursales?.nombre})</b></span></li>`).join('');
}

// --- GUARDADO DE CATALOGOS ---
document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('sucursales').insert([{ 
        nombre: document.getElementById('nombre-sucursal').value, 
        direccion: document.getElementById('dir-sucursal').value, 
        id_empresa: window.miEmpresaId 
    }]);
    document.getElementById('form-sucursal').reset();
    cargarSucursales();
});

document.getElementById('form-ubicacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('ubicaciones_internas').insert([{ 
        nombre: document.getElementById('nombre-ubicacion').value, 
        id_sucursal: document.getElementById('sel-sucursal-ubi').value, 
        id_empresa: window.miEmpresaId 
    }]);
    document.getElementById('form-ubicacion').reset();
    cargarUbicaciones();
});

// --- PRODUCTOS Y RECETAS (Mismos de tu código) ---
async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-productos').innerHTML = (data || []).map(p => `
        <tr class="hover:bg-slate-50">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4">${p.tiene_receta ? 'Receta' : 'Simple'}</td>
            <td class="px-6 py-4 text-right">
                ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-600">Receta →</button>` : ''}
            </td>
        </tr>`).join('');
}

function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.remove('hidden'); }
