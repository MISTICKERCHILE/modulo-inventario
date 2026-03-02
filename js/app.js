let miEmpresaId = null;

// --- INICIO Y LOGIN ---
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
    
    inicializarFormularios(); // Conectamos los frenos a los botones
    cambiarVista('catalogos');
});

// --- EVITAR RECARGA DE PÁGINA (FRENOS) ---
function inicializarFormularios() {
    const ids = ['form-categoria', 'form-unidad', 'form-proveedor', 'form-sucursal', 'form-ubicacion', 'form-producto'];
    
    ids.forEach(id => {
        const f = document.getElementById(id);
        if (f) {
            f.onsubmit = (e) => e.preventDefault(); // Doble seguridad: frena la recarga
            f.addEventListener('submit', manejarEnvioFormulario);
        }
    });
}

async function manejarEnvioFormulario(e) {
    const idForm = e.target.id;
    
    if (idForm === 'form-sucursal') {
        await clienteSupabase.from('sucursales').insert([{ 
            nombre: document.getElementById('nombre-sucursal').value, 
            direccion: document.getElementById('dir-sucursal').value, 
            id_empresa: miEmpresaId 
        }]);
        document.getElementById('form-sucursal').reset();
        cargarSucursales();
    }
    
    if (idForm === 'form-ubicacion') {
        await clienteSupabase.from('ubicaciones_internas').insert([{ 
            nombre: document.getElementById('nombre-ubicacion').value, 
            id_sucursal: document.getElementById('sel-sucursal-ubi').value, 
            id_empresa: miEmpresaId 
        }]);
        document.getElementById('form-ubicacion').reset();
        cargarUbicaciones();
    }
    
    // Aquí puedes añadir los if para categoria, unidad, etc.
}

// --- NAVEGACIÓN ---
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
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
}

async function cargarSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-sucursales');
    if(!lista || !data) return;
    lista.innerHTML = data.map(s => `<li class="p-4 flex justify-between"><span>${s.nombre}</span><button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500">Borrar</button></li>`).join('');
}

async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', miEmpresaId);
    const sel = document.getElementById('sel-sucursal-ubi');
    if(!sel) return;
    sel.innerHTML = '<option value="">Elegir Sucursal...</option>' + (data ? data.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('') : '');
}

async function cerrarSesion() { await clienteSupabase.auth.signOut(); location.reload(); }
