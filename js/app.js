// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (error) return alert("❌ Error: Correo o contraseña incorrectos");

    // Buscar la empresa del usuario
    const { data: perfil, error: errPerfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    
    if (errPerfil || !perfil) {
        alert("Este usuario no tiene una empresa asignada.");
        await clienteSupabase.auth.signOut();
        return;
    }

    miEmpresaId = perfil.id_empresa;
    
    // Cambiar pantallas
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    // Cargar los datos iniciales
    cargarDatos();
});

async function cerrarSesion() {
    await clienteSupabase.auth.signOut();
    location.reload(); // Recarga la página para limpiar todo
}

// --- NAVEGACIÓN Y PESTAÑAS ---
function cambiarVista(vista) {
    document.getElementById('vista-catalogos').style.display = vista === 'catalogos' ? 'block' : 'none';
    document.getElementById('vista-productos').style.display = vista === 'productos' ? 'block' : 'none';
    
    document.getElementById('btn-menu-catalogos').className = vista === 'catalogos' ? 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium' : 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium transition-colors';
    document.getElementById('btn-menu-productos').className = vista === 'productos' ? 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium' : 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium transition-colors';
    
    if(vista === 'productos') {
        cargarDatosSelects();
        cargarProductos();
    }
}

function cambiarTab(tab) {
    document.getElementById('seccion-categorias').style.display = tab === 'categorias' ? 'block' : 'none';
    document.getElementById('seccion-unidades').style.display = tab === 'unidades' ? 'block' : 'none';
    document.getElementById('tab-categorias').className = tab === 'categorias' ? 'px-6 py-3 font-medium text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700';
    document.getElementById('tab-unidades').className = tab === 'unidades' ? 'px-6 py-3 font-medium text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700';
}

function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.remove('hidden'); }
function ocultarFormProducto() { document.getElementById('panel-form-producto').classList.add('hidden'); document.getElementById('form-producto').reset(); }

// --- CARGA DE DATOS (CATÁLOGOS) ---
function cargarDatos() {
    cargarCategorias();
    cargarUnidades();
}

async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = '';
    data.forEach(c => lista.innerHTML += `<li class="p-4 flex justify-between border-b"><span>${c.nombre}</span><button onclick="borrarRegistro('categorias', '${c.id}')" class="text-red-500 hover:underline text-sm font-medium">Borrar</button></li>`);
}

async function cargarUnidades() {
    const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-unidades');
    lista.innerHTML = '';
    data.forEach(u => lista.innerHTML += `<li class="p-4 flex justify-between border-b"><span>${u.nombre} <b>(${u.abreviatura})</b></span><button onclick="borrarRegistro('unidades', '${u.id}')" class="text-red-500 hover:underline text-sm font-medium">Borrar</button></li>`);
}

// --- GUARDADO Y BORRADO DE CATÁLOGOS ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const n = document.getElementById('nombre-categoria').value; 
    await clienteSupabase.from('categorias').insert([{ nombre: n, id_empresa: miEmpresaId }]); 
    document.getElementById('nombre-categoria').value = ''; 
    cargarCategorias(); 
});

document.getElementById('form-unidad').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const n = document.getElementById('nombre-unidad').value; 
    const a = document.getElementById('abrev-unidad').value; 
    await clienteSupabase.from('unidades').insert([{ nombre: n, abreviatura: a, id_empresa: miEmpresaId }]); 
    document.getElementById('form-unidad').reset(); 
    cargarUnidades(); 
});

async function borrarRegistro(tabla, id) { 
    if(confirm("¿Seguro de eliminar este registro?")) { 
        await clienteSupabase.from(tabla).delete().eq('id', id); 
        cargarDatos(); 
        cargarProductos(); 
    } 
}

// --- LÓGICA DE PRODUCTOS ---
async function cargarDatosSelects() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId);
    const selCat = document.getElementById('prod-categoria');
    selCat.innerHTML = '<option value="">Seleccione...</option>';
    cat.forEach(c => selCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);

    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', miEmpresaId);
    const selectsUni = ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'];
    selectsUni.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="">Seleccione...</option>';
        uni.forEach(u => sel.innerHTML += `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`);
    });
}

async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select(`id, sku, nombre, id_unidad_compra(abreviatura), id_unidad_receta(abreviatura)`).eq('id_empresa', miEmpresaId);
    const lista = document.getElementById('lista-productos');
    lista.innerHTML = '';
    if(!data || data.length === 0) return lista.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No hay productos registrados.</td></tr>';
    
    data.forEach(p => {
        lista.innerHTML += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.sku || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap font-medium text-slate-800">${p.nombre}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.id_unidad_compra ? p.id_unidad_compra.abreviatura : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.id_unidad_receta ? p.id_unidad_receta.abreviatura : '-'}</td>
            </tr>
        `;
    });
}

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nuevoProducto = {
        id_empresa: miEmpresaId,
        nombre: document.getElementById('prod-nombre').value,
        sku: document.getElementById('prod-sku').value,
        id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value,
        cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value,
        cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value,
        cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value
    };

    const { error } = await clienteSupabase.from('productos').insert([nuevoProducto]);
    
    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        alert("¡Producto guardado con éxito!");
        ocultarFormProducto();
        cargarProductos();
    }
});
