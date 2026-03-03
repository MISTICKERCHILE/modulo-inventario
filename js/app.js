window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.productosParaRecetaMemoria = [];

// Objeto global para saber qué estamos editando
window.editMode = { formId: null, tabla: null, idRegistro: null };

// --- LOGIN Y NAVEGACIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email: document.getElementById('email').value, password: document.getElementById('password').value });
    if (error) return alert("❌ Credenciales incorrectas");
    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    window.miEmpresaId = perfil.id_empresa;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    cambiarVista('catalogos');
});

function cerrarSesion() { location.reload(); }

function cambiarVista(v) {
    if(!window.miEmpresaId) return;
    ['catalogos', 'productos', 'recetas'].forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        document.getElementById(`btn-menu-${vis}`).className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70';
    });
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    document.getElementById(`btn-menu-${v}`).className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') { cargarDatosSelects(); cargarProductos(); }
}

function cambiarTab(tab) {
    if(!window.miEmpresaId) return;
    ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'].forEach(t => {
        document.getElementById(`seccion-${t}`).style.display = tab === t ? 'block' : 'none';
        document.getElementById(`tab-${t}`).className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700';
    });
    
    if(tab === 'categorias') cargarCategorias();
    if(tab === 'unidades') cargarUnidades();
    if(tab === 'proveedores') cargarProveedores();
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
}

// --- SISTEMA DE EDICIÓN (NUEVO) ---
function activarEdicion(formId, tabla, idRegistro, datosMap) {
    window.editMode = { formId, tabla, idRegistro };
    // Llenar el formulario con los datos
    for (const [inputId, valor] of Object.entries(datosMap)) {
        if(document.getElementById(inputId)) document.getElementById(inputId).value = valor;
    }
    // Cambiar estado visual del formulario
    const form = document.getElementById(formId);
    form.querySelector('.btn-guardar').innerText = 'Actualizar ✏️';
    form.querySelector('.btn-guardar').classList.replace('bg-slate-800', 'bg-blue-600');
    if(form.querySelector('.btn-cancelar')) form.querySelector('.btn-cancelar').classList.remove('hidden');
}

function cancelarEdicion(formId) {
    window.editMode = { formId: null, tabla: null, idRegistro: null };
    const form = document.getElementById(formId);
    form.reset();
    form.querySelector('.btn-guardar').innerText = 'Guardar';
    form.querySelector('.btn-guardar').classList.replace('bg-blue-600', 'bg-slate-800');
    if(form.querySelector('.btn-cancelar')) form.querySelector('.btn-cancelar').classList.add('hidden');
}

async function guardarOActualizar(formId, tabla, datosInsert, funcionRecarga) {
    if (window.editMode.formId === formId && window.editMode.idRegistro) {
        // ACTUALIZAR
        const { error } = await clienteSupabase.from(tabla).update(datosInsert).eq('id', window.editMode.idRegistro);
        if(error) alert("Error actualizando: " + error.message);
    } else {
        // CREAR
        datosInsert.id_empresa = window.miEmpresaId;
        const { error } = await clienteSupabase.from(tabla).insert([datosInsert]);
        if(error) alert("Error guardando: " + error.message);
    }
    cancelarEdicion(formId);
    funcionRecarga();
}

// Generador de botones de acciones (Lápiz y Basura)
function getBotonesAccion(tabla, id, objJS_String) {
    return `
        <button onclick='activarEdicionGlobal("${tabla}", "${id}", ${objJS_String})' class="text-blue-500 hover:text-blue-700 mx-2 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
        <button onclick="eliminarReg('${tabla}','${id}')" class="text-red-500 hover:text-red-700 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
    `;
}

// Puente global para inyectar datos
window.activarEdicionGlobal = function(tabla, id, datosString) {
    const mapaDatos = JSON.parse(decodeURIComponent(datosString));
    if(tabla === 'categorias') activarEdicion('form-categoria', tabla, id, {'nombre-categoria': mapaDatos.nombre});
    if(tabla === 'unidades') activarEdicion('form-unidad', tabla, id, {'nombre-unidad': mapaDatos.nombre, 'abrev-unidad': mapaDatos.abrev});
    if(tabla === 'proveedores') activarEdicion('form-proveedor', tabla, id, {'nombre-proveedor': mapaDatos.nombre, 'contacto-proveedor': mapaDatos.contacto, 'tiempo-entrega': mapaDatos.entrega});
    if(tabla === 'sucursales') activarEdicion('form-sucursal', tabla, id, {'nombre-sucursal': mapaDatos.nombre, 'dir-sucursal': mapaDatos.dir});
    if(tabla === 'ubicaciones_internas') activarEdicion('form-ubicacion', tabla, id, {'nombre-ubicacion': mapaDatos.nombre, 'sel-sucursal-ubi': mapaDatos.id_sucursal});
};

// --- LOGICA DE FORMULARIOS CATALOGOS ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-categoria', 'categorias', { nombre: document.getElementById('nombre-categoria').value }, cargarCategorias);
});
document.getElementById('form-unidad').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-unidad', 'unidades', { nombre: document.getElementById('nombre-unidad').value, abreviatura: document.getElementById('abrev-unidad').value }, cargarUnidades);
});
document.getElementById('form-proveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-proveedor', 'proveedores', { nombre: document.getElementById('nombre-proveedor').value, nombre_contacto: document.getElementById('contacto-proveedor').value, lapso_entrega_dias: document.getElementById('tiempo-entrega').value || null }, cargarProveedores);
});
document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-sucursal', 'sucursales', { nombre: document.getElementById('nombre-sucursal').value, direccion: document.getElementById('dir-sucursal').value }, cargarSucursales);
});
document.getElementById('form-ubicacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-ubicacion', 'ubicaciones_internas', { nombre: document.getElementById('nombre-ubicacion').value, id_sucursal: document.getElementById('sel-sucursal-ubi').value }, cargarUbicaciones);
});

// --- CARGA DE LISTAS CATALOGOS ---
async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `<li class="p-4 flex justify-between border-b items-center"><span>${c.nombre}</span><div>${getBotonesAccion('categorias', c.id, `"${encodeURIComponent(JSON.stringify({nombre: c.nombre}))}"`)}</div></li>`).join('');
}
async function cargarUnidades() {
    const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b items-center"><span>${u.nombre} (${u.abreviatura})</span><div>${getBotonesAccion('unidades', u.id, `"${encodeURIComponent(JSON.stringify({nombre: u.nombre, abrev: u.abreviatura}))}"`)}</div></li>`).join('');
}
async function cargarProveedores() {
    const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => `<li class="p-4 flex justify-between border-b items-center"><div><p class="font-bold">${p.nombre}</p><p class="text-xs text-gray-500">${p.nombre_contacto||''} - ${p.lapso_entrega_dias||''} días</p></div><div>${getBotonesAccion('proveedores', p.id, `"${encodeURIComponent(JSON.stringify({nombre: p.nombre, contacto: p.nombre_contacto||'', entrega: p.lapso_entrega_dias||''}))}"`)}</div></li>`).join('');
}
async function cargarSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `<li class="p-4 flex justify-between border-b items-center"><span>${s.nombre}</span><div>${getBotonesAccion('sucursales', s.id, `"${encodeURIComponent(JSON.stringify({nombre: s.nombre, dir: s.direccion||''}))}"`)}</div></li>`).join('');
}
async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('sel-sucursal-ubi').innerHTML = '<option value="">Elegir Sucursal...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}
async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId);
    document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b items-center"><span>${u.nombre} <b class="text-emerald-600">@${u.sucursales?.nombre}</b></span><div>${getBotonesAccion('ubicaciones_internas', u.id, `"${encodeURIComponent(JSON.stringify({nombre: u.nombre, id_sucursal: u.id_sucursal}))}"`)}</div></li>`).join('');
}

async function eliminarReg(tabla, id) {
    if(confirm("¿Seguro de eliminar definitivamente este registro? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla==='productos') cargarProductos();
        else if(tabla==='recetas') cargarIngredientesReceta();
        else cambiarTab(document.querySelector('.border-emerald-600').id.replace('tab-','')); // Recarga pestaña actual
    }
}

// --- PRODUCTOS ---
function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.remove('hidden'); }

async function cargarDatosSelects() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId);
    const opcionesUni = '<option value="">Seleccione...</option>' + (uni||[]).map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => document.getElementById(id).innerHTML = opcionesUni);
}

async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-productos').innerHTML = (data||[]).map(p => {
        const payload = encodeURIComponent(JSON.stringify({ 'prod-nombre': p.nombre, 'prod-sku': p.sku||'', 'prod-categoria': p.id_categoria, 'prod-u-compra': p.id_unidad_compra, 'prod-cant-ua': p.cant_en_ua_de_uc, 'prod-u-almacen': p.id_unidad_almacenamiento, 'prod-cant-um': p.cant_en_um_de_ua, 'prod-u-menor': p.id_unidad_menor, 'prod-cant-ur': p.cant_en_ur_de_um, 'prod-u-receta': p.id_unidad_receta, 'prod-tiene-receta': p.tiene_receta }));
        return `
        <tr class="hover:bg-slate-50 border-b">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4">${p.tiene_receta ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Con Receta</span>' : '<span class="text-gray-400 text-xs">Simple</span>'}</td>
            <td class="px-6 py-4 text-right flex justify-end items-center">
                ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-600 font-bold mr-6 hover:underline">Receta →</button>` : ''}
                <button onclick='editarProductoGlobal("${p.id}", "${payload}")' class="text-blue-500 hover:text-blue-700 mx-2 text-lg">✏️</button>
                <button onclick="eliminarReg('productos', '${p.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button>
            </td>
        </tr>`
    }).join('');
}

window.editarProductoGlobal = function(id, payloadString) {
    const payload = JSON.parse(decodeURIComponent(payloadString));
    mostrarFormProducto();
    activarEdicion('form-producto', 'productos', id, payload);
    document.getElementById('prod-tiene-receta').checked = payload['prod-tiene-receta'];
};

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('prod-nombre').value, sku: document.getElementById('prod-sku').value, id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value, cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value, cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value, cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value, tiene_receta: document.getElementById('prod-tiene-receta').checked
    };
    await guardarOActualizar('form-producto', 'productos', payload, () => { document.getElementById('panel-form-producto').classList.add('hidden'); cargarProductos(); });
});

// --- RECETAS ---
async function abrirReceta(idProducto, nombre) {
    window.productoActualParaReceta = idProducto;
    document.getElementById('receta-titulo').innerText = "Receta de: " + nombre;
    const { data: prodFinal } = await clienteSupabase.from('productos').select('rendimiento_receta, id_unidad_receta(abreviatura)').eq('id', idProducto).single();
    const abrev = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    document.getElementById('receta-unidad-base').innerText = `Unidad: ${abrev}`;
    document.getElementById('receta-label-rendimiento').innerText = abrev;
    document.getElementById('receta-rendimiento').value = prodFinal?.rendimiento_receta || 1;
    await actualizarSelectInsumos();
    cambiarVista('recetas');
    cargarIngredientesReceta();
}

async function actualizarSelectInsumos() {
    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_receta(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosParaRecetaMemoria = prods || [];
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + window.productosParaRecetaMemoria.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}

document.getElementById('sel-ingrediente').addEventListener('change', (e) => {
    const prod = window.productosParaRecetaMemoria.find(p => p.id === e.target.value);
    document.getElementById('label-unidad-ingrediente').innerText = prod?.id_unidad_receta?.abreviatura || '';
});

async function guardarRendimiento() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    cargarIngredientesReceta();
}

async function cargarIngredientesReceta() {
    const { data } = await clienteSupabase.from('recetas').select('id, id_ingrediente, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))').eq('id_producto_padre', window.productoActualParaReceta);
    let costoTotalReceta = 0;
    document.getElementById('lista-ingredientes-receta').innerHTML = (data||[]).map(r => {
        let costoInsumo = 0;
        return `
        <tr class="hover:bg-slate-50 border-b">
            <td class="py-3 px-2 text-sm font-medium">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold bg-slate-100 rounded">${r.cantidad_neta} <span class="text-xs font-normal">${r.id_ingrediente.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 text-right text-slate-500 italic">$${costoInsumo.toFixed(2)}</td>
            <td class="py-3 text-right">
                <button onclick="activarEdicion('form-ingrediente', 'recetas', '${r.id}', {'sel-ingrediente': '${r.id_ingrediente}', 'ing-cantidad': ${r.cantidad_neta}})" class="text-blue-500 hover:text-blue-700 text-lg mx-2">✏️</button>
                <button onclick="eliminarReg('recetas', '${r.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button>
            </td>
        </tr>`
    }).join('');
    
    const rend = parseFloat(document.getElementById('receta-rendimiento').value) || 1;
    document.getElementById('receta-costo-total').innerText = `$${costoTotalReceta.toFixed(2)}`;
    document.getElementById('receta-costo-unitario').innerText = `$${(costoTotalReceta / rend).toFixed(2)}`;
}

document.getElementById('form-ingrediente').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarOActualizar('form-ingrediente', 'recetas', { id_producto_padre: window.productoActualParaReceta, id_ingrediente: document.getElementById('sel-ingrediente').value, cantidad_neta: document.getElementById('ing-cantidad').value }, cargarIngredientesReceta);
});

// --- MODAL INSUMO RÁPIDO ---
async function abrirModalInsumo() {
    const [{data: cats}, {data: unis}] = await Promise.all([
        clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId)
    ]);
    document.getElementById('rapido-categoria').innerHTML = (cats||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    document.getElementById('rapido-unidad').innerHTML = (unis||[]).map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    document.getElementById('modal-nuevo-insumo').classList.remove('hidden');
}

function cerrarModalInsumo() {
    document.getElementById('modal-nuevo-insumo').classList.add('hidden');
    document.getElementById('form-insumo-rapido').reset();
}

document.getElementById('form-insumo-rapido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const unidadId = document.getElementById('rapido-unidad').value;
    const nuevo = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('rapido-nombre').value,
        id_categoria: document.getElementById('rapido-categoria').value,
        id_unidad_compra: unidadId, id_unidad_almacenamiento: unidadId, id_unidad_menor: unidadId, id_unidad_receta: unidadId,
        cant_en_ua_de_uc: 1, cant_en_um_de_ua: 1, cant_en_ur_de_um: 1, tiene_receta: false
    };
    await clienteSupabase.from('productos').insert([nuevo]);
    cerrarModalInsumo();
    await actualizarSelectInsumos(); // Recarga la lista de ingredientes para que aparezca el nuevo
});
