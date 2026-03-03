window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };

// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email: document.getElementById('email').value, password: document.getElementById('password').value });
    if (error) return alert("❌ Credenciales incorrectas");
    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    if (!perfil) return alert("Usuario sin empresa asignada");
    window.miEmpresaId = perfil.id_empresa;
    document.getElementById('user-email-display').innerText = data.user.email;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    cambiarVista('catalogos');
});

function cerrarSesion() { location.reload(); }

window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar.classList.contains('w-64')) {
        sidebar.classList.remove('w-64', 'p-4'); sidebar.classList.add('w-0', 'p-0');
    } else {
        sidebar.classList.remove('w-0', 'p-0'); sidebar.classList.add('w-64', 'p-4');
    }
}

// --- NAVEGACIÓN ---
function cambiarVista(v) {
    if(!window.miEmpresaId) return; 
    ['catalogos', 'productos', 'recetas', 'inventario', 'compras'].forEach(vis => {
        const el = document.getElementById(`vista-${vis}`);
        if(el) el.classList.add('hidden');
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors';
    });
    
    const activeEl = document.getElementById(`vista-${v}`);
    if(activeEl) activeEl.classList.remove('hidden');
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') { cargarDatosSelects(); cargarProductos(); }
    if(v === 'recetas') { cargarBuscadorRecetas(); }
    if(v === 'inventario') { cargarInventario(); }
}

function cambiarTab(tab) {
    if(!window.miEmpresaId) return;
    ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'].forEach(t => {
        const el = document.getElementById(`seccion-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        const btn = document.getElementById(`tab-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });
    if(tab === 'categorias') cargarCategorias();
    if(tab === 'unidades') cargarUnidades();
    if(tab === 'proveedores') cargarProveedores();
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
    cancelarEdicion(tab); 
}

// --- SISTEMA DE EDICIÓN GLOBAL ---
window.cancelarEdicion = function(formName) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const formEl = document.getElementById(`form-${formName}`);
    if(formEl) {
        formEl.reset();
        const btnSubmit = formEl.querySelector('button[type="submit"]');
        if(btnSubmit) { btnSubmit.innerText = formName === 'producto' ? 'Guardar Producto' : 'Guardar'; btnSubmit.classList.replace('bg-blue-600', formName === 'ingrediente' || formName === 'producto' ? 'bg-emerald-600' : 'bg-slate-800'); }
        const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}

// --- LOGICA DE GUARDADO Y EDICIÓN (CATÁLOGOS) ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-categoria').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'categoria') await clienteSupabase.from('categorias').update({nombre}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('categorias').insert([{ nombre, id_empresa: window.miEmpresaId }]); cancelarEdicion('categoria'); cargarCategorias(); });
document.getElementById('form-unidad').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-unidad').value, abreviatura = document.getElementById('abrev-unidad').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'unidad') await clienteSupabase.from('unidades').update({nombre, abreviatura}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('unidades').insert([{ nombre, abreviatura, id_empresa: window.miEmpresaId }]); cancelarEdicion('unidad'); cargarUnidades(); });
document.getElementById('form-proveedor').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-proveedor').value, nombre_contacto = document.getElementById('contacto-proveedor').value, lapso_entrega_dias = document.getElementById('tiempo-entrega').value || null; if(window.modoEdicion.activo && window.modoEdicion.form === 'proveedor') await clienteSupabase.from('proveedores').update({nombre, nombre_contacto, lapso_entrega_dias}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('proveedores').insert([{ nombre, nombre_contacto, lapso_entrega_dias, id_empresa: window.miEmpresaId }]); cancelarEdicion('proveedor'); cargarProveedores(); });
document.getElementById('form-sucursal').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-sucursal').value, direccion = document.getElementById('dir-sucursal').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'sucursal') await clienteSupabase.from('sucursales').update({nombre, direccion}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('sucursales').insert([{ nombre, direccion, id_empresa: window.miEmpresaId }]); cancelarEdicion('sucursal'); cargarSucursales(); });
document.getElementById('form-ubicacion').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-ubicacion').value, id_sucursal = document.getElementById('sel-sucursal-ubi').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'ubicacion') await clienteSupabase.from('ubicaciones_internas').update({nombre, id_sucursal}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('ubicaciones_internas').insert([{ nombre, id_sucursal, id_empresa: window.miEmpresaId }]); cancelarEdicion('ubicacion'); cargarUbicaciones(); });

window.activarEdicionGlobal = function(formName, id, objJS) {
    window.modoEdicion = { activo: true, id: id, form: formName };
    for (const [inputId, valor] of Object.entries(objJS)) { document.getElementById(inputId).value = valor; }
    document.querySelector(`#form-${formName} button[type="submit"]`).innerText = 'Actualizar ✏️';
    document.querySelector(`#form-${formName} button[type="submit"]`).classList.replace('bg-slate-800', 'bg-blue-600');
    document.getElementById(`btn-cancelar-${formName}`).classList.remove('hidden');
};

async function cargarCategorias() { const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${c.nombre}</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("categoria", "${c.id}", {"nombre-categoria": "${c.nombre}"})' class="text-blue-500 hover:text-blue-700 text-lg" title="Editar">✏️</button><button onclick="eliminarReg('categorias','${c.id}')" class="text-red-500 hover:text-red-700 text-lg" title="Eliminar">🗑️</button></div></li>`).join(''); }
async function cargarUnidades() { const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${u.nombre} (${u.abreviatura})</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("unidad", "${u.id}", {"nombre-unidad": "${u.nombre}", "abrev-unidad": "${u.abreviatura}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('unidades','${u.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
async function cargarProveedores() { const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><div><p class="font-bold">${p.nombre}</p><p class="text-xs text-gray-500">${p.nombre_contacto||''} - ${p.lapso_entrega_dias||''} días</p></div><div class="flex gap-2"><button onclick='activarEdicionGlobal("proveedor", "${p.id}", {"nombre-proveedor": "${p.nombre}", "contacto-proveedor": "${p.nombre_contacto||''}", "tiempo-entrega": "${p.lapso_entrega_dias||''}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('proveedores','${p.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
async function cargarSucursales() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${s.nombre}</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("sucursal", "${s.id}", {"nombre-sucursal": "${s.nombre}", "dir-sucursal": "${s.direccion||''}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
async function cargarSelectSucursales() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId); document.getElementById('sel-sucursal-ubi').innerHTML = '<option value="">Elegir Sucursal...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join(''); }
async function cargarUbicaciones() { const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId); document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${u.nombre} <b class="text-emerald-600">@${u.sucursales?.nombre}</b></span><div class="flex gap-2"><button onclick='activarEdicionGlobal("ubicacion", "${u.id}", {"nombre-ubicacion": "${u.nombre}", "sel-sucursal-ubi": "${u.id_sucursal}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('ubicaciones_internas','${u.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }

async function eliminarReg(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro definitivamente? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla==='sucursales') cargarSucursales(); else cambiarVista(document.querySelector('.bg-emerald-600').id.replace('btn-menu-',''));
    }
}

// --- PRODUCTOS ---
window.abrirModalProducto = function(esEdicion = false) {
    document.getElementById('modal-producto').classList.remove('hidden');
    if(window.unidadesMemoria.length === 0) cargarDatosSelects();
    if(!esEdicion) {
        cancelarEdicion('producto');
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto / Insumo";
        const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('prod-sku').value = 'PRD-' + aleatorio;
        document.getElementById('prod-stock-min').value = "0";
        document.getElementById('prod-stock-ideal').value = "0";
    }
};

window.cerrarModalProducto = function() { document.getElementById('modal-producto').classList.add('hidden'); cancelarEdicion('producto'); };
window.toggleFilaProducto = function(idFila) { document.getElementById(idFila).classList.toggle('hidden'); }

async function cargarDatosSelects() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId);
    window.unidadesMemoria = uni || []; 
    const opcionesUni = '<option value="">Seleccione...</option>' + window.unidadesMemoria.map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => document.getElementById(id).innerHTML = opcionesUni);
}

function procesarUnidadInteligente(origenId, arrDestinos) {
    const idUnidad = document.getElementById(origenId).value;
    if(!idUnidad) return;
    const unidad = window.unidadesMemoria.find(u => u.id === idUnidad);
    if(!unidad) return;
    if(['gr', 'g', 'ml', 'cc', 'un', 'u', 'und'].includes(unidad.abreviatura.toLowerCase())) {
        arrDestinos.forEach(dest => { document.getElementById(`prod-u-${dest.select}`).value = idUnidad; document.getElementById(`prod-cant-${dest.cant}`).value = 1; });
    }
}
document.getElementById('prod-u-compra').addEventListener('change', () => { procesarUnidadInteligente('prod-u-compra', [{select:'almacen', cant:'ua'}, {select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-almacen').addEventListener('change', () => { procesarUnidadInteligente('prod-u-almacen', [{select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-menor').addEventListener('change', () => { procesarUnidadInteligente('prod-u-menor', [{select:'receta', cant:'ur'}]); });

async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-productos').innerHTML = (data||[]).map(p => `
        <tr class="hover:bg-slate-50 border-b transition-colors cursor-pointer" onclick="toggleFilaProducto('acciones-${p.id}')">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4 text-center">${p.tiene_receta ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">Con Receta</span>' : '<span class="text-gray-400 text-xs">Simple</span>'}</td>
            <td class="px-6 py-4 text-right text-slate-400 text-xs">Opciones ▼</td>
        </tr>
        <tr id="acciones-${p.id}" class="hidden bg-slate-100/60 border-b border-slate-200 shadow-inner">
            <td colspan="3" class="px-6 py-3">
                <div class="flex justify-end gap-6 items-center">
                    ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-700 font-bold hover:underline flex items-center gap-1"><span>📝</span> Receta</button>` : ''}
                    <button onclick="editarProductoFull('${p.id}')" class="text-blue-600 font-bold hover:underline flex items-center gap-1 text-lg">✏️ Editar</button>
                    <button onclick="eliminarReg('productos', '${p.id}'); cargarProductos();" class="text-red-600 font-bold hover:underline flex items-center gap-1 text-lg">🗑️ Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.editarProductoFull = async function(id) {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id', id).single();
    document.getElementById('prod-nombre').value = data.nombre;
    document.getElementById('prod-sku').value = data.sku;
    document.getElementById('prod-categoria').value = data.id_categoria;
    document.getElementById('prod-u-compra').value = data.id_unidad_compra;
    document.getElementById('prod-cant-ua').value = data.cant_en_ua_de_uc;
    document.getElementById('prod-u-almacen').value = data.id_unidad_almacenamiento;
    document.getElementById('prod-cant-um').value = data.cant_en_um_de_ua;
    document.getElementById('prod-u-menor').value = data.id_unidad_menor;
    document.getElementById('prod-cant-ur').value = data.cant_en_ur_de_um;
    document.getElementById('prod-u-receta').value = data.id_unidad_receta;
    document.getElementById('prod-tiene-receta').checked = data.tiene_receta;
    
    document.getElementById('prod-stock-min').value = data.stock_minimo_ua || 0;
    document.getElementById('prod-stock-ideal').value = data.stock_ideal_ua || 0;
    
    window.modoEdicion = { activo: true, id: id, form: 'producto' };
    document.getElementById('titulo-modal-producto').innerText = "Editando Producto ✏️";
    document.getElementById('btn-guardar-producto').innerText = 'Actualizar ✏️';
    document.getElementById('btn-guardar-producto').classList.replace('bg-emerald-600', 'bg-blue-600');
    
    abrirModalProducto(true);
}

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('prod-nombre').value, sku: document.getElementById('prod-sku').value, id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value, cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value, cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value, cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value, tiene_receta: document.getElementById('prod-tiene-receta').checked,
        stock_minimo_ua: parseFloat(document.getElementById('prod-stock-min').value) || 0,
        stock_ideal_ua: parseFloat(document.getElementById('prod-stock-ideal').value) || 0
    };
    
    if (window.modoEdicion.activo && window.modoEdicion.form === 'producto') {
        await clienteSupabase.from('productos').update(payload).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('productos').insert([{...payload, id_empresa: window.miEmpresaId}]);
    }
    cerrarModalProducto();
    if(window.productoActualParaReceta) await actualizarSelectInsumos(); else cargarProductos();
});

// --- RECETAS Y BUSCADOR ---
async function cargarBuscadorRecetas() {
    const { data } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('tiene_receta', true).order('nombre');
    const sel = document.getElementById('buscador-recetas');
    sel.innerHTML = '<option value="">Buscar o seleccionar receta...</option>' + (data||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    if(window.productoActualParaReceta) {
        sel.value = window.productoActualParaReceta;
        document.getElementById('msj-receta-vacia').classList.add('hidden');
        document.getElementById('panel-receta-activa').classList.remove('hidden');
        document.getElementById('panel-estadisticas-receta').classList.remove('hidden');
        document.getElementById('receta-unidad-base').classList.remove('hidden');
    } else {
        document.getElementById('msj-receta-vacia').classList.remove('hidden');
        document.getElementById('panel-receta-activa').classList.add('hidden');
        document.getElementById('panel-estadisticas-receta').classList.add('hidden');
        document.getElementById('receta-unidad-base').classList.add('hidden');
    }
}

window.seleccionarRecetaDesdeBuscador = function(id) {
    if(!id) { window.productoActualParaReceta = null; cargarBuscadorRecetas(); return; }
    const sel = document.getElementById('buscador-recetas');
    abrirReceta(id, sel.options[sel.selectedIndex].text);
};

async function abrirReceta(idProducto, nombre) {
    window.productoActualParaReceta = idProducto;
    const { data: prodFinal } = await clienteSupabase.from('productos').select('rendimiento_receta, id_unidad_receta(abreviatura)').eq('id', idProducto).single();
    const abrev = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    document.getElementById('receta-unidad-base').innerText = `Unidad base: ${abrev}`;
    document.getElementById('receta-label-rendimiento').innerText = abrev;
    document.getElementById('receta-rendimiento').value = prodFinal?.rendimiento_receta || 1;
    await actualizarSelectInsumos();
    cambiarVista('recetas');
    cargarIngredientesReceta();
}

async function actualizarSelectInsumos() {
    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_receta(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosParaRecetaMemoria = prods || [];
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + 
        (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('') +
        '<option value="NUEVO" class="font-bold text-emerald-600 bg-emerald-50">➕ Crear Nuevo Insumo...</option>';
}

document.getElementById('sel-ingrediente').addEventListener('change', (e) => {
    if(e.target.value === 'NUEVO') { e.target.value = ''; abrirModalProducto(); return; }
    const prod = window.productosParaRecetaMemoria.find(p => p.id === e.target.value);
    document.getElementById('label-unidad-ingrediente').innerText = prod?.id_unidad_receta?.abreviatura || '';
});

async function guardarRendimiento() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    cargarIngredientesReceta();
}

async function cargarIngredientesReceta() {
    const { data } = await clienteSupabase.from('recetas').select('id, id_ingrediente, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))').eq('id_producto_padre', window.productoActualParaReceta);
    document.getElementById('lista-ingredientes-receta').innerHTML = (data||[]).map(r => `
        <tr class="border-b hover:bg-slate-50 items-center">
            <td class="py-3 px-2 text-sm font-medium text-slate-700 w-1/2">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold text-slate-600 bg-slate-100 rounded">${r.cantidad_neta} <span class="text-xs font-normal text-slate-400">${r.id_ingrediente.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 text-right flex justify-end gap-2 pr-2">
                <button onclick="editarIngredienteReceta('${r.id}', '${r.id_ingrediente}', '${r.cantidad_neta}')" class="text-blue-500 hover:text-blue-700 text-lg">✏️</button>
                <button onclick="quitarIngrediente('${r.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button>
            </td>
        </tr>`).join('');
}

window.editarIngredienteReceta = function(idReceta, idInsumo, cantidad) {
    document.getElementById('sel-ingrediente').value = idInsumo;
    document.getElementById('ing-cantidad').value = cantidad;
    document.getElementById('sel-ingrediente').dispatchEvent(new Event('change'));
    window.modoEdicion = { activo: true, id: idReceta, form: 'ingrediente' };
    const btnSubmit = document.querySelector(`#form-ingrediente button[type="submit"]`);
    btnSubmit.innerText = 'Actualizar ✏️';
    btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600');
    document.getElementById('btn-cancelar-ingrediente').classList.remove('hidden');
}

document.getElementById('form-ingrediente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { id_producto_padre: window.productoActualParaReceta, id_ingrediente: document.getElementById('sel-ingrediente').value, cantidad_neta: document.getElementById('ing-cantidad').value };
    if(window.modoEdicion.activo && window.modoEdicion.form === 'ingrediente') {
        await clienteSupabase.from('recetas').update(payload).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('recetas').insert([{...payload, id_empresa: window.miEmpresaId}]);
    }
    cancelarEdicion('ingrediente');
    cargarIngredientesReceta();
});

async function quitarIngrediente(id) {
    if(confirm("¿Seguro de quitar este ingrediente de la receta? 🗑️")) {
        await clienteSupabase.from('recetas').delete().eq('id', id);
        cargarIngredientesReceta();
    }
}

// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO ---
// ==========================================

async function cargarInventario() {
    const { data } = await clienteSupabase
        .from('inventario_saldos')
        .select(`
            id, 
            cantidad_actual_ua, 
            productos (id, nombre, stock_minimo_ua), 
            sucursales (nombre)
        `)
        .eq('id_empresa', window.miEmpresaId)
        .order('cantidad_actual_ua', { ascending: true }); 

    const tbody = document.getElementById('lista-inventario');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">No hay registros de inventario aún. Registra tu primer conteo físico.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(inv => {
        const stockMinimo = inv.productos?.stock_minimo_ua || 0;
        const estaBajo = inv.cantidad_actual_ua <= stockMinimo;
        
        const iconoEstado = estaBajo 
            ? '<span class="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo</span>' 
            : '<span class="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full w-max border border-emerald-200">🟢 OK</span>';

        return `
        <tr class="hover:bg-slate-50 border-b transition-colors">
            <td class="px-6 py-4">${iconoEstado}</td>
            <td class="px-6 py-4 font-bold text-slate-700">${inv.productos?.nombre || 'Producto Eliminado'}</td>
            <td class="px-6 py-4 text-slate-500">${inv.sucursales?.nombre || 'N/A'}</td>
            <td class="px-6 py-4 text-right font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_actual_ua}</td>
        </tr>`;
    }).join('');
}

window.abrirModalInventario = async function() {
    const [{ data: sucursales }, { data: productos }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);

    document.getElementById('inv-sucursal').innerHTML = '<option value="">Elegir sucursal...</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    document.getElementById('inv-producto').innerHTML = '<option value="">Elegir producto...</option>' + (productos||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    document.getElementById('form-inventario').reset();
    document.getElementById('modal-inventario').classList.remove('hidden');
}

window.cerrarModalInventario = function() {
    document.getElementById('modal-inventario').classList.add('hidden');
}

document.getElementById('form-inventario').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const idProd = document.getElementById('inv-producto').value;
    const idSuc = document.getElementById('inv-sucursal').value;
    const nuevaCant = parseFloat(document.getElementById('inv-cantidad').value);

    const { data: previo } = await clienteSupabase
        .from('inventario_saldos')
        .select('id, cantidad_actual_ua')
        .eq('id_producto', idProd)
        .eq('id_sucursal', idSuc)
        .single(); 

    let cantAnterior = 0;

    if (previo) {
        cantAnterior = previo.cantidad_actual_ua;
        await clienteSupabase.from('inventario_saldos')
            .update({ cantidad_actual_ua: nuevaCant, ultima_actualizacion: new Date() })
            .eq('id', previo.id);
    } else {
        await clienteSupabase.from('inventario_saldos')
            .insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: nuevaCant }]);
    }

    const diferencia = nuevaCant - cantAnterior;
    
    if (diferencia !== 0) {
        await clienteSupabase.from('movimientos_inventario').insert([{
            id_empresa: window.miEmpresaId,
            id_producto: idProd,
            tipo_movimiento: 'AJUSTE',
            cantidad_movida: diferencia,
            referencia: 'Ajuste por Conteo Físico'
        }]);
    }

    cerrarModalInventario();
    cargarInventario(); 
});
