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
    
    if(v === 'catalogos') cambiarTab('categorias'); // << ESTO SOLUCIONA EL DETALLE: Abre categorías por defecto
    if(v === 'productos') cargarProductos();
}

function cambiarTab(tab) {
    const todosTabs = ['categorias', 'unidades', 'proveedores', 'locaciones', 'ubicaciones'];
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
    
    if(tab === 'ubicaciones') cargarSelectLocaciones();
}

// --- LOGICA DE CARGA DE DATOS ---
async function cargarDatos() {
    await Promise.all([
        cargarCategorias(),
        cargarUnidades(),
        cargarProveedores(),
        cargarLocaciones(),
        cargarUbicaciones()
    ]);
}

// --- CATEGORIAS ---
async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-categorias');
    if(!lista) return;
    lista.innerHTML = data.length ? data.map(c => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50">
            <span class="font-medium">${c.nombre}</span>
            <button onclick="eliminarReg('categorias', '${c.id}')" class="text-red-400 hover:text-red-600 text-sm">Borrar</button>
        </li>
    `).join('') : '<li class="p-6 text-center text-slate-400 text-sm italic">No hay categorías registradas</li>';
}

// --- LUGARES FÍSICOS (LOCACIONES) ---
async function cargarLocaciones() {
    const { data } = await clienteSupabase.from('locaciones').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-locaciones');
    if(!lista) return;
    lista.innerHTML = data.length ? data.map(l => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50">
            <div><p class="font-medium">${l.nombre}</p><p class="text-xs text-slate-400">${l.direccion || 'Sin dirección'}</p></div>
            <button onclick="eliminarReg('locaciones', '${l.id}')" class="text-red-400 hover:text-red-600 text-sm">Borrar</button>
        </li>
    `).join('') : '<li class="p-6 text-center text-slate-400 text-sm italic">No hay lugares físicos registrados</li>';
}

async function cargarSelectLocaciones() {
    const { data } = await clienteSupabase.from('locaciones').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const sel = document.getElementById('sel-locacion-ubi');
    if(sel) sel.innerHTML = '<option value="">Elegir Lugar Físico...</option>' + data.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
}

// --- UBICACIONES INTERNAS ---
async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, locaciones(nombre)').eq('id_empresa', miEmpresaId);
    const lista = document.getElementById('lista-ubicaciones');
    if(!lista) return;
    lista.innerHTML = data.length ? data.map(u => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50">
            <span>${u.nombre} <b class="text-emerald-600 ml-2">@${u.locaciones.nombre}</b></span>
            <button onclick="eliminarReg('ubicaciones_internas', '${u.id}')" class="text-red-400 hover:text-red-600 text-sm">Borrar</button>
        </li>
    `).join('') : '<li class="p-6 text-center text-slate-400 text-sm italic">No hay ubicaciones internas registradas</li>';
}

// --- LOGIN (Asegurar carga al entrar) ---
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
    
    cambiarVista('catalogos'); // << Al entrar, abre catálogos y activa la primera pestaña
});

async function eliminarReg(t, id) {
    if(confirm("¿Seguro de eliminar este registro?")) {
        await clienteSupabase.from(t).delete().eq('id', id);
        cargarDatos();
    }
}
