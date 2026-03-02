// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) return alert("❌ Credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    miEmpresaId = perfil.id_empresa;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    cargarDatos();
});

async function cerrarSesion() { await clienteSupabase.auth.signOut(); location.reload(); }

// --- NAVEGACIÓN ---
function cambiarVista(v) {
    document.getElementById('vista-catalogos').style.display = v === 'catalogos' ? 'block' : 'none';
    document.getElementById('vista-productos').style.display = v === 'productos' ? 'block' : 'none';
    if(v === 'productos') { cargarDatosSelects(); cargarProductos(); }
}

function cambiarTab(tab) {
    const tabs = ['categorias', 'unidades', 'proveedores', 'locaciones', 'ubicaciones'];
    tabs.forEach(t => {
        document.getElementById(`seccion-${t}`).style.display = tab === t ? 'block' : 'none';
        document.getElementById(`tab-${t}`).className = tab === t ? 'px-6 py-3 font-medium text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500';
    });
    if(tab === 'ubicaciones') cargarLocacionesSelect();
}

// --- CARGA DE DATOS ---
async function cargarDatos() { 
    cargarCategorias(); cargarUnidades(); cargarProveedores(); cargarLocaciones(); cargarUbicaciones(); 
}

async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    document.getElementById('lista-categorias').innerHTML = data.map(c => `<li class="p-4 flex justify-between"><span>${c.nombre}</span><button onclick="borrarReg('categorias','${c.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

async function cargarUnidades() {
    const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    document.getElementById('lista-unidades').innerHTML = data.map(u => `<li class="p-4 flex justify-between"><span>${u.nombre} (${u.abreviatura})</span><button onclick="borrarReg('unidades','${u.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

async function cargarProveedores() {
    const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    document.getElementById('lista-proveedores').innerHTML = data.map(p => `<li class="p-4 flex justify-between"><div><b>${p.nombre}</b><p class="text-xs text-gray-500">${p.nombre_contacto || ''}</p></div><button onclick="borrarReg('proveedores','${p.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

async function cargarLocaciones() {
    const { data } = await clienteSupabase.from('locaciones').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    document.getElementById('lista-locaciones').innerHTML = data.map(l => `<li class="p-4 flex justify-between"><div><b>${l.nombre}</b><p class="text-xs text-gray-500">${l.direccion || ''}</p></div><button onclick="borrarReg('locaciones','${l.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

async function cargarLocacionesSelect() {
    const { data } = await clienteSupabase.from('locaciones').select('*').eq('id_empresa', miEmpresaId);
    document.getElementById('sel-locacion').innerHTML = '<option value="">Elegir Lugar Físico...</option>' + data.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
}

async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, locaciones(nombre)').eq('id_empresa', miEmpresaId);
    document.getElementById('lista-ubicaciones').innerHTML = data.map(u => `<li class="p-4 flex justify-between"><span>${u.nombre} <b class="text-emerald-600">(@${u.locaciones.nombre})</b></span><button onclick="borrarReg('ubicaciones_internas','${u.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

// --- FORMULARIOS ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('categorias').insert([{ nombre: document.getElementById('nombre-categoria').value, id_empresa: miEmpresaId }]); cargarCategorias(); });
document.getElementById('form-locacion').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('locaciones').insert([{ nombre: document.getElementById('nombre-locacion').value, direccion: document.getElementById('dir-locacion').value, id_empresa: miEmpresaId }]); cargarLocaciones(); });
document.getElementById('form-ubicacion').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('ubicaciones_internas').insert([{ nombre: document.getElementById('nombre-ubicacion').value, id_locacion: document.getElementById('sel-locacion').value, id_empresa: miEmpresaId }]); cargarUbicaciones(); });

async function borrarReg(t, id) { if(confirm("¿Seguro?")) { await clienteSupabase.from(t).delete().eq('id', id); cargarDatos(); } }

// --- PRODUCTOS ---
async function cargarDatosSelects() {
    const { data: cats } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}
// Aquí puedes pegar el resto de funciones de productos del archivo anterior...
