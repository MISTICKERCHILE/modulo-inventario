// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (error) return alert("❌ Error: Correo o contraseña incorrectos");

    const { data: perfil, error: errPerfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    
    if (errPerfil || !perfil) {
        alert("Este usuario no tiene una empresa asignada.");
        await clienteSupabase.auth.signOut();
        return;
    }

    miEmpresaId = perfil.id_empresa;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    cargarDatos();
});

async function cerrarSesion() {
    await clienteSupabase.auth.signOut();
    location.reload(); 
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
    const tabs = ['categorias', 'unidades', 'proveedores', 'ubicaciones'];
    tabs.forEach(t => {
        document.getElementById(`seccion-${t}`).style.display = tab === t ? 'block' : 'none';
        document.getElementById(`tab-${t}`).className = tab === t 
            ? 'px-6 py-3 font-medium text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50 whitespace-nowrap' 
            : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap';
    });
}

function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.remove('hidden'); }
function ocultarFormProducto() { document.getElementById('panel-form-producto').classList.add('hidden'); document.getElementById('form-producto').reset(); }

// --- CARGA DE DATOS (CATÁLOGOS) ---
function cargarDatos() {
    cargarCategorias();
    cargarUnidades();
    cargarProveedores();
    cargarUbicaciones();
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

async function cargarProveedores() {
    const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-proveedores');
    lista.innerHTML = '';
    data.forEach(p => lista.innerHTML += `<li class="p-4 flex justify-between border-b items-center"><div><p class="font-medium">${p.nombre}</p><p class="text-xs text-gray-500">Contacto: ${p.nombre_contacto || '-'} | Entrega: ${p.lapso_entrega_dias || '-'} días</p></div><button onclick="borrarRegistro('proveedores', '${p.id}')" class="text-red-500 hover:underline text-sm font-medium">Borrar</button></li>`);
}

async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const lista = document.getElementById('lista-ubicaciones');
    lista.innerHTML = '';
    data.forEach(u => lista.innerHTML += `<li class="p-4 flex justify-between border-b"><span>${u.nombre}</span><button onclick="borrarRegistro('ubicaciones_internas', '${u.id}')" class="text-red-500 hover:underline text-sm font-medium">Borrar</button></li>`);
}

// --- GUARDADO Y BORRADO DE CATÁLOGOS ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    await clienteSupabase.from('categorias').insert([{ nombre: document.getElementById('nombre-categoria').value, id_empresa: miEmpresaId }]); 
    document.getElementById('nombre-categoria').value = ''; 
    cargarCategorias(); 
});

document.getElementById('form-unidad').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    await clienteSupabase.from('unidades').insert([{ nombre: document.getElementById('nombre-unidad').value, abreviatura: document.getElementById('abrev-unidad').value, id_empresa: miEmpresaId }]); 
    document.getElementById('form-unidad').reset(); 
    cargarUnidades(); 
});

document.getElementById('form-proveedor').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const nuevoProv = {
        nombre: document.getElementById('nombre-proveedor').value,
        nombre_contacto: document.getElementById('contacto-proveedor').value,
        lapso_entrega_dias: document.getElementById('tiempo-entrega').value || null,
        id_empresa: miEmpresaId
    };
    await clienteSupabase.from('proveedores').insert([nuevoProv]); 
    document.getElementById('form-proveedor').reset(); 
    cargarProveedores(); 
});

document.getElementById('form-ubicacion').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    await clienteSupabase.from('ubicaciones_internas').insert([{ nombre: document.getElementById('nombre-ubicacion').value, id_empresa: miEmpresaId }]); 
    document.getElementById('nombre-ubicacion').value = ''; 
    cargarUbicaciones(); 
});

async function borrarRegistro(tabla, id) { 
    if(confirm("¿Seguro de eliminar este registro?")) { 
        await clienteSupabase.from(tabla).delete().eq('id', id); 
        cargarDatos(); 
        if(tabla === 'categorias' || tabla === 'unidades') cargarProductos(); 
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
