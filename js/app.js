window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 

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

// --- NAVEGACIÓN PRINCIPAL ---
function cambiarVista(v) {
    if(!window.miEmpresaId) return; 
    ['catalogos', 'productos', 'recetas'].forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        document.getElementById(`btn-menu-${vis}`).className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors';
    });
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    document.getElementById(`btn-menu-${v}`).className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') { cargarDatosSelects(); cargarProductos(); }
    if(v === 'recetas') { cargarBuscadorRecetas(); }
}

function cambiarTab(tab) {
    if(!window.miEmpresaId) return;
    ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'].forEach(t => {
        document.getElementById(`seccion-${t}`).style.display = tab === t ? 'block' : 'none';
        document.getElementById(`tab-${t}`).className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });
    if(tab === 'categorias') cargarCategorias();
    if(tab === 'unidades') cargarUnidades();
    if(tab === 'proveedores') cargarProveedores();
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
}

// --- LOGICA DE GUARDADO (CATALOGOS) ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('categorias').insert([{ nombre: document.getElementById('nombre-categoria').value, id_empresa: window.miEmpresaId }]); document.getElementById('form-categoria').reset(); cargarCategorias(); });
document.getElementById('form-unidad').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('unidades').insert([{ nombre: document.getElementById('nombre-unidad').value, abreviatura: document.getElementById('abrev-unidad').value, id_empresa: window.miEmpresaId }]); document.getElementById('form-unidad').reset(); cargarUnidades(); });
document.getElementById('form-proveedor').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('proveedores').insert([{ nombre: document.getElementById('nombre-proveedor').value, nombre_contacto: document.getElementById('contacto-proveedor').value, lapso_entrega_dias: document.getElementById('tiempo-entrega').value || null, id_empresa: window.miEmpresaId }]); document.getElementById('form-proveedor').reset(); cargarProveedores(); });
document.getElementById('form-sucursal').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('sucursales').insert([{ nombre: document.getElementById('nombre-sucursal').value, direccion: document.getElementById('dir-sucursal').value, id_empresa: window.miEmpresaId }]); document.getElementById('form-sucursal').reset(); cargarSucursales(); });
document.getElementById('form-ubicacion').addEventListener('submit', async (e) => { e.preventDefault(); await clienteSupabase.from('ubicaciones_internas').insert([{ nombre: document.getElementById('nombre-ubicacion').value, id_sucursal: document.getElementById('sel-sucursal-ubi').value, id_empresa: window.miEmpresaId }]); document.getElementById('form-ubicacion').reset(); cargarUbicaciones(); });

async function cargarCategorias() { const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `<li class="p-4 flex justify-between border-b hover:bg-slate-50"><span>${c.nombre}</span><button onclick="eliminarReg('categorias','${c.id}')" class="text-red-500 text-sm hover:underline">Borrar</button></li>`).join(''); }
async function cargarUnidades() { const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50"><span>${u.nombre} (${u.abreviatura})</span><button onclick="eliminarReg('unidades','${u.id}')" class="text-red-500 text-sm hover:underline">Borrar</button></li>`).join(''); }
async function cargarProveedores() { const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => `<li class="p-4 flex justify-between border-b hover:bg-slate-50"><div><p class="font-bold">${p.nombre}</p><p class="text-xs text-gray-500">${p.nombre_contacto||''} - ${p.lapso_entrega_dias||''} días</p></div><button onclick="eliminarReg('proveedores','${p.id}')" class="text-red-500 text-sm hover:underline">Borrar</button></li>`).join(''); }
async function cargarSucursales() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `<li class="p-4 flex justify-between border-b hover:bg-slate-50"><span>${s.nombre}</span><button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500 text-sm hover:underline">Borrar</button></li>`).join(''); }
async function cargarSelectSucursales() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId); document.getElementById('sel-sucursal-ubi').innerHTML = '<option value="">Elegir Sucursal...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join(''); }
async function cargarUbicaciones() { const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId); document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50"><span>${u.nombre} <b class="text-emerald-600">@${u.sucursales?.nombre}</b></span><button onclick="eliminarReg('ubicaciones_internas','${u.id}')" class="text-red-500 text-sm hover:underline">Borrar</button></li>`).join(''); }

async function eliminarReg(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro?")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla==='sucursales') cargarSucursales(); else cambiarVista('catalogos');
    }
}


// --- MODAL Y LOGICA DE PRODUCTOS ---
window.abrirModalProducto = function() {
    document.getElementById('form-producto').reset();
    const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('prod-sku').value = 'PRD-' + aleatorio;
    document.getElementById('modal-producto').classList.remove('hidden');
    // Asegurarnos de que los selects estén cargados
    if(window.unidadesMemoria.length === 0) cargarDatosSelects();
};

window.cerrarModalProducto = function() {
    document.getElementById('modal-producto').classList.add('hidden');
    document.getElementById('form-producto').reset();
};

window.toggleFilaProducto = function(idFila) {
    const fila = document.getElementById(idFila);
    fila.classList.toggle('hidden');
}

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
    const abrev = unidad.abreviatura.toLowerCase();
    if(['gr', 'g', 'ml', 'cc', 'un', 'u', 'und'].includes(abrev)) {
        arrDestinos.forEach(dest => {
            document.getElementById(`prod-u-${dest.select}`).value = idUnidad;
            document.getElementById(`prod-cant-${dest.cant}`).value = 1;
        });
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
            <td class="px-6 py-4 text-right text-slate-400 text-xs">Ver opciones ▼</td>
        </tr>
        <tr id="acciones-${p.id}" class="hidden bg-slate-100/60 border-b border-slate-200 shadow-inner">
            <td colspan="3" class="px-6 py-3">
                <div class="flex justify-end gap-6 items-center">
                    ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-700 font-bold hover:underline flex items-center gap-1"><span>📝</span> Gestionar Receta</button>` : ''}
                    <button onclick="alert('La edición estará lista pronto')" class="text-blue-600 font-bold hover:underline flex items-center gap-1"><span>✏️</span> Editar</button>
                    <button onclick="eliminarReg('productos', '${p.id}'); cargarProductos();" class="text-red-600 font-bold hover:underline flex items-center gap-1"><span>🗑️</span> Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');
}

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevo = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('prod-nombre').value,
        sku: document.getElementById('prod-sku').value,
        id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value,
        cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value,
        cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value,
        cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value,
        tiene_receta: document.getElementById('prod-tiene-receta').checked
    };
    await clienteSupabase.from('productos').insert([nuevo]);
    cerrarModalProducto();
    
    // Si estamos en la vista de recetas, actualizamos el selector
    if(window.productoActualParaReceta) {
        await actualizarSelectInsumos();
    } else {
        cargarProductos();
    }
});

// --- RECETAS Y BUSCADOR ---

// Cargar el selector principal superior de recetas
async function cargarBuscadorRecetas() {
    const { data } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('tiene_receta', true).order('nombre');
    const sel = document.getElementById('buscador-recetas');
    sel.innerHTML = '<option value="">Buscar o seleccionar receta...</option>' + (data||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    // Si ya había una receta activa, la dejamos seleccionada
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
    if(!id) {
        window.productoActualParaReceta = null;
        cargarBuscadorRecetas();
        return;
    }
    const sel = document.getElementById('buscador-recetas');
    const nombre = sel.options[sel.selectedIndex].text;
    abrirReceta(id, nombre);
};

// Se ejecuta desde Productos o desde el Buscador
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
    
    // OJO AL DETALLE: Añadimos la opción de Crear Nuevo Insumo al final
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + 
        (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('') +
        '<option value="NUEVO" class="font-bold text-emerald-600 bg-emerald-50">➕ Crear Nuevo Insumo...</option>';
}

// Si en el selector de insumos escoge "Crear Nuevo", abrimos el modal
document.getElementById('sel-ingrediente').addEventListener('change', (e) => {
    if(e.target.value === 'NUEVO') {
        e.target.value = ''; // Reseteamos la selección para que no se quede pegado
        abrirModalProducto();
        return;
    }
    const prod = window.productosParaRecetaMemoria.find(p => p.id === e.target.value);
    document.getElementById('label-unidad-ingrediente').innerText = prod?.id_unidad_receta?.abreviatura || '';
});


async function guardarRendimiento() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    cargarIngredientesReceta();
}

async function cargarIngredientesReceta() {
    const { data } = await clienteSupabase.from('recetas').select('id, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))').eq('id_producto_padre', window.productoActualParaReceta);
    document.getElementById('lista-ingredientes-receta').innerHTML = (data||[]).map(r => `
        <tr class="border-b hover:bg-slate-50">
            <td class="py-3 px-2 text-sm font-medium text-slate-700">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold text-slate-600 bg-slate-100 rounded">${r.cantidad_neta} <span class="text-xs font-normal text-slate-400">${r.id_ingrediente.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 text-right"><button onclick="quitarIngrediente('${r.id}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors font-bold">✕</button></td>
        </tr>`).join('');
}

document.getElementById('form-ingrediente').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('recetas').insert([{ id_empresa: window.miEmpresaId, id_producto_padre: window.productoActualParaReceta, id_ingrediente: document.getElementById('sel-ingrediente').value, cantidad_neta: document.getElementById('ing-cantidad').value }]);
    document.getElementById('ing-cantidad').value = '';
    cargarIngredientesReceta();
});

async function quitarIngrediente(id) {
    await clienteSupabase.from('recetas').delete().eq('id', id);
    cargarIngredientesReceta();
}
