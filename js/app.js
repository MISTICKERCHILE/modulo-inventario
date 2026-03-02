let productoActualParaReceta = null;

// --- LOGICA DE NAVEGACIÓN ---
function cambiarVista(v) {
    const vistas = ['catalogos', 'productos', 'recetas'];
    vistas.forEach(vis => {
        const el = document.getElementById(`vista-${vis}`);
        if(el) el.classList.add('hidden');
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium transition-colors';
    });
    
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    document.getElementById(`btn-menu-${v}`).className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium transition-colors';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') cargarProductos();
}

function cambiarTab(tab) {
    const todosTabs = ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'];
    todosTabs.forEach(t => {
        const sec = document.getElementById(`seccion-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if(sec) sec.style.display = tab === t ? 'block' : 'none';
        if(btn) {
            btn.className = tab === t 
                ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 whitespace-nowrap transition-all' 
                : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap transition-all border-b-2 border-transparent';
        }
    });
    
    if(tab === 'ubicaciones') cargarSelectSucursales();
}

// --- LOGICA DE CARGA DE DATOS (CON VALIDACIONES ANTI-ERROR) ---
async function cargarDatos() {
    await Promise.all([
        cargarCategorias(),
        cargarUnidades(),
        cargarProveedores(),
        cargarSucursales(),
        cargarUbicaciones()
    ]);
}

async function cargarCategorias() {
    const { data, error } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-categorias');
    if(!lista) return;
    if (error || !data || data.length === 0) {
        lista.innerHTML = '<li class="p-6 text-center text-slate-400 text-sm italic">No hay categorías</li>';
        return;
    }
    lista.innerHTML = data.map(c => `<li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50"><span>${c.nombre}</span><button onclick="eliminarReg('categorias', '${c.id}')" class="text-red-400 hover:text-red-600 text-sm">Borrar</button></li>`).join('');
}

async function cargarUnidades() {
    const { data, error } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-unidades');
    if(!lista || error || !data || data.length === 0) return;
    lista.innerHTML = data.map(u => `<li class="px-6 py-4 flex justify-between"><span>${u.nombre} (${u.abreviatura})</span><button onclick="eliminarReg('unidades', '${u.id}')" class="text-red-400 text-sm">Borrar</button></li>`).join('');
}

async function cargarSucursales() {
    const { data, error } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-sucursales');
    if(!lista) return;
    if (error || !data || data.length === 0) {
        lista.innerHTML = '<li class="p-6 text-center text-slate-400 text-sm italic">No hay sucursales</li>';
        return;
    }
    lista.innerHTML = data.map(s => `<li class="px-6 py-4 flex justify-between"><div><p class="font-medium">${s.nombre}</p><p class="text-xs text-slate-400">${s.direccion || ''}</p></div><button onclick="eliminarReg('sucursales', '${s.id}')" class="text-red-400 text-sm">Borrar</button></li>`).join('');
}

async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const sel = document.getElementById('sel-sucursal-ubi');
    if(!sel) return;
    if(!data || data.length === 0) {
        sel.innerHTML = '<option value="">Crea primero una sucursal...</option>';
        return;
    }
    sel.innerHTML = '<option value="">Elegir Sucursal...</option>' + data.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

async function cargarUbicaciones() {
    const { data, error } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', miEmpresaId);
    const lista = document.getElementById('lista-ubicaciones');
    if(!lista || error || !data || data.length === 0) return;
    lista.innerHTML = data.map(u => `<li class="px-6 py-4 flex justify-between"><span>${u.nombre} <b class="text-emerald-600 ml-2">@${u.sucursales?.nombre || 'Sin Sucursal'}</b></span><button onclick="eliminarReg('ubicaciones_internas', '${u.id}')" class="text-red-400 text-sm">Borrar</button></li>`).join('');
}

// --- PRODUCTOS ---
async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const tbody = document.getElementById('lista-productos');
    if(!tbody) return;
    tbody.innerHTML = data.map(p => `
        <tr class="hover:bg-slate-50">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4 text-right">
                ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-600 font-bold text-sm hover:underline">Receta →</button>` : ''}
                <button onclick="eliminarReg('productos', '${p.id}')" class="ml-4 text-red-400 text-xs">Borrar</button>
            </td>
        </tr>
    `).join('');
}

function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.toggle('hidden'); }

// --- FORMULARIOS ---
document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('sucursales').insert([{ 
        nombre: document.getElementById('nombre-sucursal').value, 
        direccion: document.getElementById('dir-sucursal').value, 
        id_empresa: miEmpresaId 
    }]);
    document.getElementById('form-sucursal').reset();
    cargarSucursales();
});

document.getElementById('form-ubicacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('ubicaciones_internas').insert([{ 
        nombre: document.getElementById('nombre-ubicacion').value, 
        id_sucursal: document.getElementById('sel-sucursal-ubi').value, 
        id_empresa: miEmpresaId 
    }]);
    document.getElementById('form-ubicacion').reset();
    cargarUbicaciones();
});

// --- LOGIN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) return alert("❌ Acceso denegado");
    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    miEmpresaId = perfil.id_empresa;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    document.getElementById('user-email-display').innerText = data.user.email;
    cambiarVista('catalogos');
});

async function eliminarReg(t, id) {
    if(confirm("¿Seguro de eliminar?")) {
        await clienteSupabase.from(t).delete().eq('id', id);
        cargarDatos();
        if(t === 'productos') cargarProductos();
    }
}

async function cerrarSesion() { await clienteSupabase.auth.signOut(); location.reload(); }
