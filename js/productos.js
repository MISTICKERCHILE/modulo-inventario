// --- VARIABLES GLOBALES PARA PAGINACIÓN Y FILTROS ---
window.productosListMemoria = [];
window.catListMemoria = [];
window.prodCurrentPage = 1;
window.prodItemsPerPage = 50;
window.prodSortCol = 'nombre';
window.prodSortAsc = true;
window.prodFilterCat = 'TODOS';
window.prodSortMode = 'A-Z'; 
window.prodSearchText = ''; 

// --- CREACIÓN / EDICIÓN ---
window.abrirModalProducto = async function(esEdicion = false, nombreSugerido = '') {
    document.getElementById('modal-producto').classList.remove('hidden');
    if(window.unidadesMemoria.length === 0) window.cargarDatosSelects();
    
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    
    let htmlReglas = '';
    (sucursales || []).forEach(suc => {
        htmlReglas += `
        <div class="bg-white p-3 rounded shadow-sm border border-orange-100 mb-2">
            <p class="text-xs font-bold text-slate-700 mb-2 uppercase">🏢 ${suc.nombre}</p>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-[10px] font-bold text-orange-700 mb-1">Mínimo (Alerta)</label>
                    <input type="number" step="0.01" id="regla-min-${suc.id}" class="regla-input w-full px-2 py-1 border border-orange-200 rounded text-sm outline-none focus:ring-1 focus:ring-orange-400" value="0">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-orange-700 mb-1">Ideal (Pedir)</label>
                    <input type="number" step="0.01" id="regla-ideal-${suc.id}" class="regla-input w-full px-2 py-1 border border-orange-200 rounded text-sm outline-none focus:ring-1 focus:ring-orange-400" value="0">
                </div>
            </div>
        </div>`;
    });
    document.getElementById('contenedor-reglas-stock').innerHTML = htmlReglas;

    if(!document.getElementById('contenedor-control-stock')) {
        const contenedorTipoReceta = document.getElementById('prod-tiene-receta').parentElement;
        const htmlInterruptor = `
            <div id="contenedor-control-stock" class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <input type="checkbox" id="prod-control-stock" class="mt-1 w-4 h-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer" checked>
                <div>
                    <label for="prod-control-stock" class="font-bold text-blue-900 cursor-pointer block">¿Lleva control de stock físico?</label>
                    <p class="text-xs text-blue-700 mt-1 leading-tight">Apágalo solo si es un producto "Sin Control de Stock" (Ej: Un combo o plato que se prepara al momento) para que el sistema no te exija tenerlo en bodega y descuente directamente sus ingredientes.</p>
                </div>
            </div>
        `;
        contenedorTipoReceta.insertAdjacentHTML('afterend', htmlInterruptor);
    }

    if(!esEdicion) {
        window.cancelarEdicion('producto');
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto / Insumo";
        const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('prod-sku').value = 'PRD-' + aleatorio;
        if(document.getElementById('prod-control-stock')) document.getElementById('prod-control-stock').checked = true;
        
        if (nombreSugerido) {
            document.getElementById('prod-nombre').value = nombreSugerido;
        }
    }
};

window.cerrarModalProducto = function() { 
    document.getElementById('modal-producto').classList.add('hidden'); 
    window.cancelarEdicion('producto'); 
};

window.toggleFilaProducto = function(idFila) { 
    document.getElementById(idFila).classList.toggle('hidden'); 
}

window.cargarDatosSelects = async function() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId);
    window.unidadesMemoria = uni || []; 
    const opcionesUni = '<option value="">Seleccione...</option>' + window.unidadesMemoria.map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = opcionesUni;
    });
}

function procesarUnidadInteligente(origenId, arrDestinos) {
    const idUnidad = document.getElementById(origenId).value;
    if(!idUnidad) return;
    const unidad = window.unidadesMemoria.find(u => u.id === idUnidad);
    if(!unidad) return;
    if(['gr', 'g', 'ml', 'cc', 'un', 'u', 'und'].includes(unidad.abreviatura.toLowerCase())) {
        arrDestinos.forEach(dest => { 
            document.getElementById(`prod-u-${dest.select}`).value = idUnidad; 
            document.getElementById(`prod-cant-${dest.cant}`).value = 1; 
        });
    }
}

document.getElementById('prod-u-compra')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-compra', [{select:'almacen', cant:'ua'}, {select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-almacen')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-almacen', [{select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-menor')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-menor', [{select:'receta', cant:'ur'}]); });

// --- CARGA, FILTROS Y PAGINACIÓN ---
window.cargarProductos = async function() {
    const lista = document.getElementById('lista-productos');
    if (!lista) {
        if(document.getElementById('cuerpo-inventario')) window.cargarInventario();
        return; 
    }
    
    lista.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400 font-bold animate-pulse">⏳ Cargando catálogo...</td></tr>';

    const [{ data: prods }, { data: cats }] = await Promise.all([
        clienteSupabase.from('productos').select('*, categorias(nombre)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('categorias').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);
    
    window.productosListMemoria = prods || [];
    window.catListMemoria = cats || [];

    const selectCat = document.getElementById('filtro-cat-prod');
    if (selectCat) {
        selectCat.innerHTML = '<option value="TODOS">Todas las Categorías</option>' + 
            window.catListMemoria.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        selectCat.value = window.prodFilterCat;
    }

    window.renderizarTablaProductos();
}

window.buscarProductoCatalogo = function(texto) { window.prodSearchText = texto.toLowerCase().trim(); window.prodCurrentPage = 1; window.renderizarTablaProductos(); }
window.cambiarFiltroCatProd = function(val) { window.prodFilterCat = val; window.prodCurrentPage = 1; window.renderizarTablaProductos(); }
window.cambiarOrdenProd = function(val) { window.prodSortMode = val; window.prodCurrentPage = 1; window.renderizarTablaProductos(); }
window.cambiarPageSizeProd = function(val) { window.prodItemsPerPage = parseInt(val); window.prodCurrentPage = 1; window.renderizarTablaProductos(); }

// Clics en la cabecera de la tabla
window.ordenarTablaProd = function(columna) {
    if(window.prodSortCol === columna) {
        window.prodSortAsc = !window.prodSortAsc; 
    } else {
        window.prodSortCol = columna;
        window.prodSortAsc = true;
    }
    window.prodSortMode = 'CUSTOM'; 
    const elOrden = document.getElementById('orden-prod');
    if (elOrden) elOrden.value = 'A-Z'; 
    window.renderizarTablaProductos();
}

window.cambiarPaginaProd = function(delta) {
    window.prodCurrentPage += delta;
    window.renderizarTablaProductos();
}

// Lógica Maestra de Filtrado y Renderizado
window.renderizarTablaProductos = function() {
    let filtrados = [...window.productosListMemoria];

    if(window.prodSearchText) {
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(window.prodSearchText));
    }

    if(window.prodFilterCat !== 'TODOS') {
        filtrados = filtrados.filter(p => p.id_categoria === window.prodFilterCat);
    }

    if(window.prodSortMode === 'NUEVOS') {
        filtrados.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    } else if(window.prodSortMode === 'VIEJOS') {
        filtrados.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    } else if(window.prodSortMode === 'A-Z') {
        filtrados.sort((a,b) => a.nombre.localeCompare(b.nombre));
    } else {
        filtrados.sort((a,b) => {
            let valA = a[window.prodSortCol];
            let valB = b[window.prodSortCol];
            if(valA == null) valA = '';
            if(valB == null) valB = '';

            if(typeof valA === 'string') {
                return window.prodSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return window.prodSortAsc ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valA ? 1 : -1);
            }
        });
    }

    const totalItems = filtrados.length;
    const totalPages = Math.ceil(totalItems / window.prodItemsPerPage) || 1;
    if(window.prodCurrentPage > totalPages) window.prodCurrentPage = totalPages;
    if(window.prodCurrentPage < 1) window.prodCurrentPage = 1;

    const startIdx = (window.prodCurrentPage - 1) * window.prodItemsPerPage;
    const endIdx = startIdx + window.prodItemsPerPage;
    const paginaActualData = filtrados.slice(startIdx, endIdx);

    const lista = document.getElementById('lista-productos');
    if(!lista) return;

    if(paginaActualData.length === 0) {
        lista.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400 italic">No se encontraron productos con estos filtros.</td></tr>';
    } else {
        lista.innerHTML = paginaActualData.map(p => {
            const labelStock = p.control_stock === false 
                ? '<span class="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-200">Sin Control de Stock</span>' 
                : '<span class="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-200">Control Stock</span>';

            const labelReceta = p.tiene_receta 
                ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">Con Receta</span>' 
                : '<span class="text-gray-400 text-xs italic">Simple</span>';

            return `
            <tr class="hover:bg-slate-50 border-b transition-colors cursor-pointer group" onclick="toggleFilaProducto('acciones-${p.id}')">
                <td class="px-6 py-4 font-medium text-slate-800 group-hover:text-emerald-700 transition-colors">${p.nombre}</td>
                <td class="px-6 py-4 text-center">${labelStock}</td>
                <td class="px-6 py-4 text-center">${labelReceta}</td>
                <td class="px-6 py-4 text-right text-slate-400 text-xs no-print">Opciones ▼</td>
            </tr>
            <tr id="acciones-${p.id}" class="hidden bg-slate-100/60 border-b border-slate-200 shadow-inner no-print">
                <td colspan="4" class="px-6 py-3">
                    <div class="flex justify-end gap-6 items-center flex-wrap">
                        ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')" class="text-emerald-700 font-bold hover:underline flex items-center gap-1 bg-white px-3 py-1.5 rounded shadow-sm border border-emerald-200"><span>📝</span> Construir Receta</button>` : ''}
                        <button onclick="editarProductoFull('${p.id}')" class="text-blue-600 font-bold hover:underline flex items-center gap-1 text-sm bg-white px-3 py-1.5 rounded shadow-sm border border-blue-200">✏️ Editar Detalles</button>
                        <button onclick="eliminarReg('productos', '${p.id}'); window.cargarProductos();" class="text-red-600 font-bold hover:underline flex items-center gap-1 text-sm bg-white px-3 py-1.5 rounded shadow-sm border border-red-200">🗑️ Eliminar</button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    const elInfo = document.getElementById('prod-pag-info');
    const elPrev = document.getElementById('btn-prod-prev');
    const elNext = document.getElementById('btn-prod-next');
    
    if(elInfo) elInfo.innerText = `Mostrando ${totalItems === 0 ? 0 : startIdx + 1} a ${Math.min(endIdx, totalItems)} de ${totalItems} productos`;
    if(elPrev) elPrev.disabled = window.prodCurrentPage === 1;
    if(elNext) elNext.disabled = window.prodCurrentPage === totalPages || totalPages === 0;
}

// --- ACTUALIZACIÓN DE PRODUCTO ---
window.editarProductoFull = async function(id) {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id', id).single();
    
    await window.abrirModalProducto(true); 

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
    
    const checkControl = document.getElementById('prod-control-stock');
    if(checkControl) {
        checkControl.checked = data.control_stock !== false; 
    }

    const { data: reglas } = await clienteSupabase.from('reglas_stock_sucursal').select('*').eq('id_producto', id);
    (reglas || []).forEach(r => {
        const inputMin = document.getElementById(`regla-min-${r.id_sucursal}`);
        const inputIdeal = document.getElementById(`regla-ideal-${r.id_sucursal}`);
        if(inputMin) inputMin.value = r.stock_minimo_ua || 0;
        if(inputIdeal) inputIdeal.value = r.stock_ideal_ua || 0;
    });
    
    window.modoEdicion = { activo: true, id: id, form: 'producto' };
    document.getElementById('titulo-modal-producto').innerText = "Editando Producto ✏️";
    document.getElementById('btn-guardar-producto').innerText = 'Actualizar ✏️';
    document.getElementById('btn-guardar-producto').classList.replace('bg-emerald-600', 'bg-blue-600');
}

document.getElementById('form-producto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const checkControl = document.getElementById('prod-control-stock');
    const valorControlStock = checkControl ? checkControl.checked : true;

    const payload = {
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
        tiene_receta: document.getElementById('prod-tiene-receta').checked,
        control_stock: valorControlStock
    };
    
    let idProdActual = null;

    if (window.modoEdicion.activo && window.modoEdicion.form === 'producto') {
        idProdActual = window.modoEdicion.id;
        await clienteSupabase.from('productos').update(payload).eq('id', idProdActual);
    } else {
        const { data: nuevoProd } = await clienteSupabase.from('productos').insert([{...payload, id_empresa: window.miEmpresaId}]).select('id').single();
        if(nuevoProd) idProdActual = nuevoProd.id;
    }

    if(idProdActual && valorControlStock === true) {
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id').eq('id_empresa', window.miEmpresaId);
        for (const suc of sucursales) {
            const valMin = parseFloat(document.getElementById(`regla-min-${suc.id}`)?.value) || 0;
            const valIdeal = parseFloat(document.getElementById(`regla-ideal-${suc.id}`)?.value) || 0;
            const { data: existeRegla } = await clienteSupabase.from('reglas_stock_sucursal').select('id').eq('id_producto', idProdActual).eq('id_sucursal', suc.id).maybeSingle();
            if(existeRegla) {
                await clienteSupabase.from('reglas_stock_sucursal').update({ stock_minimo_ua: valMin, stock_ideal_ua: valIdeal }).eq('id', existeRegla.id);
            } else {
                await clienteSupabase.from('reglas_stock_sucursal').insert([{ 
                    id_empresa: window.miEmpresaId, id_producto: idProdActual, id_sucursal: suc.id, stock_minimo_ua: valMin, stock_ideal_ua: valIdeal 
                }]);
            }
        }
    } else if (idProdActual && valorControlStock === false) {
        await clienteSupabase.from('reglas_stock_sucursal').delete().eq('id_producto', idProdActual);
    }

    window.cerrarModalProducto();
    
    const panelCSV = document.getElementById('panel-mapeo-csv');
    if(window.productoActualParaReceta) {
        await window.actualizarSelectInsumos(); 
    } else if (panelCSV && !panelCSV.classList.contains('hidden') && typeof window.actualizarSelectsMapeoCSV === 'function') {
        await window.actualizarSelectsMapeoCSV(idProdActual);
    } else {
        window.cargarProductos();
    }
});

// --- RECETAS Y BUSCADOR ---
window.cargarBuscadorRecetas = async function() {
    const { data } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('tiene_receta', true).order('nombre');
    const sel = document.getElementById('buscador-recetas');
    if(!sel) return;
    
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
    if(!id) { window.productoActualParaReceta = null; window.cargarBuscadorRecetas(); return; }
    const sel = document.getElementById('buscador-recetas');
    window.abrirReceta(id, sel.options[sel.selectedIndex].text);
};

window.abrirReceta = async function(idProducto, nombre) {
    window.productoActualParaReceta = idProducto;
    const { data: prodFinal } = await clienteSupabase.from('productos').select('rendimiento_receta, id_unidad_receta(abreviatura)').eq('id', idProducto).single();
    
    const abrev = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    document.getElementById('receta-unidad-base').innerText = `Unidad base: ${abrev}`;
    document.getElementById('receta-label-rendimiento').innerText = abrev;
    document.getElementById('receta-rendimiento').value = prodFinal?.rendimiento_receta || 1;
    
    await window.actualizarSelectInsumos();
    window.cambiarVista('recetas');
    window.cargarIngredientesReceta();
}

window.actualizarSelectInsumos = async function() {
    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_receta(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosParaRecetaMemoria = prods || [];
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + 
        (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('') +
        '<option value="NUEVO" class="font-bold text-emerald-600 bg-emerald-50">➕ Crear Nuevo Insumo...</option>';
}

document.getElementById('sel-ingrediente')?.addEventListener('change', (e) => {
    if(e.target.value === 'NUEVO') { e.target.value = ''; window.abrirModalProducto(); return; }
    const prod = window.productosParaRecetaMemoria.find(p => p.id === e.target.value);
    document.getElementById('label-unidad-ingrediente').innerText = prod?.id_unidad_receta?.abreviatura || '';
});

window.guardarRendimiento = async function() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    window.cargarIngredientesReceta();
}

window.cargarIngredientesReceta = async function() {
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
    if(btnSubmit) {
        btnSubmit.innerText = 'Actualizar ✏️';
        btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600');
    }
    document.getElementById('btn-cancelar-ingrediente').classList.remove('hidden');
}

document.getElementById('form-ingrediente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { 
        id_producto_padre: window.productoActualParaReceta, 
        id_ingrediente: document.getElementById('sel-ingrediente').value, 
        cantidad_neta: document.getElementById('ing-cantidad').value 
    };
    
    if(window.modoEdicion.activo && window.modoEdicion.form === 'ingrediente') {
        await clienteSupabase.from('recetas').update(payload).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('recetas').insert([{...payload, id_empresa: window.miEmpresaId}]);
    }
    window.cancelarEdicion('ingrediente');
    window.cargarIngredientesReceta();
});

window.quitarIngrediente = async function(id) {
    if(confirm("¿Seguro de quitar este ingrediente de la receta? 🗑️")) {
        await clienteSupabase.from('recetas').delete().eq('id', id);
        window.cargarIngredientesReceta();
    }
}

// ==========================================
// --- IMPORTAR, EXPORTAR Y PDF ---
// ==========================================

window.exportarProductosCSV = function() {
    if (!window.productosERPGlobal || window.productosERPGlobal.length === 0) {
        return alert("No hay productos para exportar.");
    }

    let csvContent = "Nombre,Categoria_ID,Unidad_Compra_ID,Cant_UA_por_UC,Unidad_Almacen_ID,Tiene_Receta,Control_Fisico\n";

    window.productosERPGlobal.forEach(p => {
        let nombre = p.nombre ? `"${p.nombre.replace(/"/g, '""')}"` : "";
        let idCat = p.id_categoria || "";
        let idUC = p.id_unidad_compra?.id || "";
        let factor = p.cant_en_ua_de_uc || "1";
        let idUA = p.id_unidad_almacenamiento?.id || "";
        let tieneReceta = p.tiene_receta ? "TRUE" : "FALSE";
        let controlFisico = p.control_stock !== false ? "TRUE" : "FALSE";
        
        csvContent += `${nombre},${idCat},${idUC},${factor},${idUA},${tieneReceta},${controlFisico}\n`;
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Catalogo_Productos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.importarProductosCSV = function(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    inputElement.value = '';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const filas = results.data;
            if(filas.length === 0) return alert("El archivo está vacío.");
            
            if(!filas[0].hasOwnProperty('Nombre')) {
                return alert("❌ Formato incorrecto. Por favor descarga la plantilla con el botón Exportar primero.");
            }

            let insertados = 0;
            let omitidos = 0;

            const tbody = document.getElementById('lista-productos');
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-emerald-600 font-bold animate-pulse">⏳ Importando y validando ${filas.length} productos...</td></tr>`;

            for (const fila of filas) {
                const nombre = fila['Nombre']?.trim();
                if (!nombre) continue;

                const existe = window.productosERPGlobal.some(p => p.nombre.toLowerCase() === nombre.toLowerCase());
                
                if (existe) {
                    omitidos++;
                    continue; 
                }

                const payload = {
                    id_empresa: window.miEmpresaId,
                    nombre: nombre,
                    id_categoria: fila['Categoria_ID'] || null,
                    id_unidad_compra: fila['Unidad_Compra_ID'] || null,
                    cant_en_ua_de_uc: fila['Cant_UA_por_UC'] ? parseFloat(fila['Cant_UA_por_UC']) : 1,
                    id_unidad_almacenamiento: fila['Unidad_Almacen_ID'] || null,
                    tiene_receta: fila['Tiene_Receta'] === 'TRUE',
                    control_stock: fila['Control_Fisico'] === 'FALSE' ? false : true
                };

                const { error } = await clienteSupabase.from('productos').insert([payload]);
                if (!error) insertados++;
            }

            alert(`✅ Importación terminada.\n\nNuevos agregados: ${insertados}\nDuplicados omitidos: ${omitidos}`);
            window.cargarProductos(); 
            if(window.cargarDatosSelects) window.cargarDatosSelects(); 
        },
        error: function(err) {
            alert("Error leyendo el archivo CSV: " + err.message);
        }
    });
}

// NUEVA FUNCIÓN: IMPRIMIR CATÁLOGO CON FORMATO
window.imprimirCatalogoProductos = function() {
    let filtrados = [...window.productosListMemoria];

    // Aplicar filtros actuales
    if(window.prodSearchText) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(window.prodSearchText));
    if(window.prodFilterCat !== 'TODOS') filtrados = filtrados.filter(p => p.id_categoria === window.prodFilterCat);
    
    if(window.prodSortMode === 'NUEVOS') filtrados.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    else if(window.prodSortMode === 'VIEJOS') filtrados.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    else if(window.prodSortMode === 'A-Z') filtrados.sort((a,b) => a.nombre.localeCompare(b.nombre));
    else {
        filtrados.sort((a,b) => {
            let valA = a[window.prodSortCol] == null ? '' : a[window.prodSortCol];
            let valB = b[window.prodSortCol] == null ? '' : b[window.prodSortCol];
            if(typeof valA === 'string') return window.prodSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            else return window.prodSortAsc ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valA ? 1 : -1);
        });
    }

    if(filtrados.length === 0) return alert("No hay productos en pantalla para imprimir.");

    const fechaHoy = new Date().toLocaleDateString('es-CL');
    const empresaActual = document.getElementById('lista-empresas-usuario')?.innerText.split('\n')[0].replace('🏢 ', '') || 'Empresa Global';

    let filasHtml = '';
    filtrados.forEach(p => {
        const catNombre = p.categorias?.nombre || '-';
        const controlStr = p.control_stock === false ? 'No (Fantasma)' : 'Sí (Físico)';
        const recetaStr = p.tiene_receta ? 'Sí' : 'No';
        
        filasHtml += `
            <tr>
                <td class="prod-col">${p.nombre}</td>
                <td class="center-col text-xs text-gray-500">${catNombre}</td>
                <td class="center-col font-bold">${controlStr}</td>
                <td class="center-col">${recetaStr}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Catálogo de Productos - ${empresaActual}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #333; }
                .header-box { border: 2px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #fff; }
                .header-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 15px 0; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .info-grid { display: flex; flex-wrap: wrap; gap: 15px; }
                .info-item { flex: 1 1 45%; font-size: 14px; }
                .info-item strong { text-transform: uppercase; font-size: 12px; color: #555; display: block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 10px 8px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 12px; }
                thead { display: table-header-group; } 
                tr { page-break-inside: avoid; }
                .prod-col { font-weight: bold; font-size: 13px; }
                .center-col { text-align: center; font-size: 12px; }
                @media print { body { padding: 0; } @page { margin: 15mm; } .header-box { background-color: white !important; -webkit-print-color-adjust: exact; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">Catálogo General de Productos</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Empresa:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${empresaActual}</div></div>
                    <div class="info-item"><strong>Fecha de Emisión:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                    <div class="info-item"><strong>Total Listados:</strong><div style="font-size: 14px; margin-top: 4px;">${filtrados.length} Productos</div></div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Producto / Insumo</th>
                        <th style="width: 150px; text-align: center;">Categoría</th>
                        <th style="width: 120px; text-align: center;">Control Físico</th>
                        <th style="width: 100px; text-align: center;">Receta</th>
                    </tr>
                </thead>
                <tbody>${filasHtml}</tbody>
            </table>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
