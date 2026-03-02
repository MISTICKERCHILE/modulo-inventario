// IMPORTANTE: Solo declaramos esta variable UNA VEZ
if (typeof miEmpresaId === 'undefined') {
    var miEmpresaId = null;
}

// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    
    if (error) return alert("❌ Error: credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    
    if (!perfil) return alert("Usuario sin empresa asignada");

    miEmpresaId = perfil.id_empresa;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    document.getElementById('user-email-display').innerText = data.user.email;
    
    cambiarVista('catalogos');
});

// --- NAVEGACIÓN ---
function cambiarVista(v) {
    const vistas = ['catalogos', 'productos', 'recetas'];
    vistas.forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        document.getElementById(`btn-menu-${vis}`).className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium';
    });
    
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    document.getElementById(`btn-menu-${v}`).className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium';
    
    if(v === 'catalogos') cambiarTab('categorias');
}

function cambiarTab(tab) {
    const todosTabs = ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'];
    todosTabs.forEach(t => {
        const sec = document.getElementById(`seccion-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if(sec) sec.style.display = tab === t ? 'block' : 'none';
        if(btn) {
            btn.className = tab === t 
                ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' 
                : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700';
        }
    });
    
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') cargarSelectSucursales();
}

// --- GUARDAR SUCURSAL (SIN RECARGAR PÁGINA) ---
document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault(); // << ESTO ES LO MÁS IMPORTANTE
    const nombre = document.getElementById('nombre-sucursal').value;
    const direccion = document.getElementById('dir-sucursal').value;

    const { error } = await clienteSupabase.from('sucursales').insert([
        { nombre: nombre, direccion: direccion, id_empresa: miEmpresaId }
    ]);

    if(error) {
        alert("Error: " + error.message);
    } else {
        document.getElementById('form-sucursal').reset();
        cargarSucursales();
    }
});

// --- CARGAR DATOS ---
async function cargarSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-sucursales');
    if(!lista) return;
    lista.innerHTML = (data || []).map(s => `
        <li class="p-4 flex justify-between border-b">
            <span>${s.nombre}</span>
            <button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500">Borrar</button>
        </li>
    `).join('');
}

async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId);
    const sel = document.getElementById('sel-sucursal-ubi');
    if(sel) sel.innerHTML = '<option value="">Elegir Sucursal...</option>' + (data || []).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

async function eliminarReg(tabla, id) {
    if(confirm("¿Seguro?")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        cambiarTab(tabla === 'sucursales' ? 'sucursales' : 'categorias');
    }
}

function cerrarSesion() { location.reload(); }
