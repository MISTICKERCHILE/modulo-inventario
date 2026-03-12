// --- VARIABLES GLOBALES ---
window.productosListMemoria = [];
window.catListMemoria = [];
window.prodCurrentPage = 1;
window.prodItemsPerPage = 50;
window.prodSortCol = 'nombre';
window.prodSortAsc = true;
window.prodFilterCat = 'TODOS';
window.prodSortMode = 'A-Z'; 
window.prodSearchText = ''; 

// Cierra el buscador de ingredientes si haces click afuera
document.addEventListener('click', (e) => {
    const contenedorDrop = document.getElementById('contenedor-dropdown-receta');
    if (contenedorDrop && !contenedorDrop.contains(e.target)) {
        const drop = document.getElementById('dropdown-ingrediente');
        if(drop) drop.classList.add('hidden');
    }
});

// ==========================================
// 1. PRIMERO DEFINIMOS LA FUNCIÓN DE CARGA
// ==========================================
window.cargarDatosSelects = async function() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    const selCat = document.getElementById('prod-categoria');
    if(selCat) selCat.innerHTML = '<option value="">Sin Categoría asignada...</option>' + (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.unidadesMemoria = uni || []; 
    const opcionesUni = '<option value="">Seleccione Unidad...</option>' + window.unidadesMemoria.map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = opcionesUni;
    });

    // Amarramos los eventos inmediatamente después de dibujarlos.
    if(typeof window.atarEventosUnidades === 'function') {
        window.atarEventosUnidades();
    }
}

// ==========================================
// 2. LUEGO DEFINIMOS LA FUNCIÓN DEL MODAL
// ==========================================
window.abrirModalProducto = async function(esEdicion = false, nombreSugerido = '') {
    document.getElementById('modal-producto').classList.remove('hidden');
    
    // Revisamos si el HTML está vacío
    const catSelect = document.getElementById('prod-categoria');
    if(!catSelect || catSelect.options.length <= 1) {
        await window.cargarDatosSelects();
    }
    
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    
    // ESTO DIBUJA LAS REGLAS DE STOCK (Mínimo / Ideal)
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

    // ESTO DIBUJA EL CHECKBOX DE CONTROL DE STOCK
    if(!document.getElementById('contenedor-control-stock')) {
        const contenedorTipoReceta = document.getElementById('prod-tiene-receta').parentElement;
        const htmlInterruptor = `
            <div id="contenedor-control-stock" class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <input type="checkbox" id="prod-control-stock" class="mt-1 w-4 h-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer" checked>
                <div>
                    <label for="prod-control-stock" class="font-bold text-blue-900 cursor-pointer block">¿Lleva control de stock físico?</label>
                    <p class="text-xs text-blue-700 mt-1 leading-tight">Apágalo solo si es un producto ensamblado al momento (Ej: Un combo o plato preparado) para que el sistema no te exija tenerlo en bodega y descuente directamente sus ingredientes.</p>
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

// ==========================================
// 3. UNIDADES INTELIGENTES
// ==========================================
window.procesarUnidadInteligente = function(origenId, arrDestinos) {
    const selOrigen = document.getElementById(origenId);
    if(!selOrigen) return;
    const idUnidad = selOrigen.value;
    if(!idUnidad) return;
    const unidad = window.unidadesMemoria.find(u => u.id === idUnidad);
    if(!unidad) return;
    
    if(['gr', 'g', 'ml', 'cc', 'un', 'u', 'und'].includes(unidad.abreviatura.toLowerCase())) {
        arrDestinos.forEach(dest => { 
            const selDest = document.getElementById(`prod-u-${dest.select}`);
            const cantDest = document.getElementById(`prod-cant-${dest.cant}`);
            if(selDest) selDest.value = idUnidad; 
            if(cantDest) cantDest.value = 1; 
        });
    }
}

window.atarEventosUnidades = function() {
    const uCompra = document.getElementById('prod-u-compra');
    const uAlmacen = document.getElementById('prod-u-almacen');
    const uMenor = document.getElementById('prod-u-menor');

    if(uCompra) {
        const newUCompra = uCompra.cloneNode(true); uCompra.parentNode.replaceChild(newUCompra, uCompra);
        document.getElementById('prod-u-compra').addEventListener('change', () => window.procesarUnidadInteligente('prod-u-compra', [{select:'almacen', cant:'ua'}, {select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]));
    }
    if(uAlmacen) {
        const newUAlmacen = uAlmacen.cloneNode(true); uAlmacen.parentNode.replaceChild(newUAlmacen, uAlmacen);
        document.getElementById('prod-u-almacen').addEventListener('change', () => window.procesarUnidadInteligente('prod-u-almacen', [{select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]));
    }
    if(uMenor) {
        const newUMenor = uMenor.cloneNode(true); uMenor.parentNode.replaceChild(newUMenor, uMenor);
        document.getElementById('prod-u-menor').addEventListener('change', () => window.procesarUnidadInteligente('prod-u-menor', [{select:'receta', cant:'ur'}]));
    }
}

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
            
            // LOS NUEVOS TEXTOS FORMALES
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

window.editarProductoFull = async function(id) {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id', id).single();
    
    await window.abrirModalProducto(true); 

    document.getElementById('prod-nombre').value = data.nombre || '';
    
    // Si vino del Excel sin SKU, le generamos uno en el acto
    const finalSku = data.sku || ('PRD-' + Math.random().toString(36).substring(2, 8).toUpperCase());
    document.getElementById('prod-sku').value = finalSku;
    
    document.getElementById('prod-categoria').value = data.id_categoria || '';
    document.getElementById('prod-u-compra').value = data.id_unidad_compra || '';
    document.getElementById('prod-cant-ua').value = data.cant_en_ua_de_uc || 1;
    document.getElementById('prod-u-almacen').value = data.id_unidad_almacenamiento || '';
    document.getElementById('prod-cant-um').value = data.cant_en_um_de_ua || 1;
    document.getElementById('prod-u-menor').value = data.id_unidad_menor || '';
    document.getElementById('prod-cant-ur').value = data.cant_en_ur_de_um || 1;
    document.getElementById('prod-u-receta').value = data.id_unidad_receta || '';
    document.getElementById('prod-tiene-receta').checked = data.tiene_receta || false;
    
    if(document.getElementById('prod-costo-borrador')) {
        document.getElementById('prod-costo-borrador').value = data.ultimo_costo_uc || '';
    }

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

// ==========================================
// DELEGADOR GLOBAL DE FORMULARIO DE PRODUCTOS
// ==========================================
if (!window.eventosFormProductoAtados) {
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'form-producto') {
            e.preventDefault(); // ¡Freno de mano al navegador!
            
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            const textoOriginal = btnSubmit ? btnSubmit.innerText : 'Guardar';
            if(btnSubmit) { btnSubmit.innerText = '⏳ Guardando...'; btnSubmit.disabled = true; }

            const checkControl = document.getElementById('prod-control-stock');
            const valorControlStock = checkControl ? checkControl.checked : true;
            const costoBorrador = document.getElementById('prod-costo-borrador') ? parseFloat(document.getElementById('prod-costo-borrador').value) : null;

            const payload = {
                nombre: document.getElementById('prod-nombre').value, 
                sku: document.getElementById('prod-sku').value, 
                id_categoria: document.getElementById('prod-categoria').value || null,
                id_unidad_compra: document.getElementById('prod-u-compra').value || null, 
                cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value) || 1,
                id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value || null, 
                cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value) || 1,
                id_unidad_menor: document.getElementById('prod-u-menor').value || null, 
                cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value) || 1,
                id_unidad_receta: document.getElementById('prod-u-receta').value || null, 
                tiene_receta: document.getElementById('prod-tiene-receta').checked,
                control_stock: valorControlStock
            };
            
            if(costoBorrador !== null && !isNaN(costoBorrador)) {
                payload.ultimo_costo_uc = costoBorrador;
            }
            
            let idProdActual = null;

            try {
                if (window.modoEdicion.activo && window.modoEdicion.form === 'producto') {
                    idProdActual = window.modoEdicion.id;
                    await clienteSupabase.from('productos').update(payload).eq('id', idProdActual);
                } else {
                    const { data: nuevoProd, error } = await clienteSupabase.from('productos').insert([{...payload, id_empresa: window.miEmpresaId}]).select('id').single();
                    if(error) throw error;
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
            } catch(err) {
                alert("Error al guardar: " + err.message);
            } finally {
                if(btnSubmit) { btnSubmit.innerText = textoOriginal; btnSubmit.disabled = false; }
            }
        }
    });
    window.eventosFormProductoAtados = true;
}

// ==========================================
// --- RECETAS Y BUSCADOR INTELIGENTE ---
// ==========================================
window.cargarBuscadorRecetas = async function() {
    const { data } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('tiene_receta', true).order('nombre');
    const sel = document.getElementById('buscador-recetas');
    if(!sel) return;
    
    sel.innerHTML = '<option value="">Buscar o seleccionar receta...</option>' + (data||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    if(window.productoActualParaReceta) {
        sel.value = window.productoActualParaReceta;
        window.abrirReceta(window.productoActualParaReceta, null, true);
    } else {
        document.getElementById('msj-receta-vacia').classList.remove('hidden');
        document.getElementById('panel-receta-activa').classList.add('hidden');
        document.getElementById('panel-estadisticas-receta').classList.add('hidden');
        document.getElementById('receta-unidad-base').classList.add('hidden');
        const btnImp = document.getElementById('btn-imprimir-receta');
        if(btnImp) btnImp.classList.add('hidden');
    }
}

window.seleccionarRecetaDesdeBuscador = function(id) {
    if(!id) { window.productoActualParaReceta = null; window.cargarBuscadorRecetas(); return; }
    const sel = document.getElementById('buscador-recetas');
    window.abrirReceta(id, sel.options[sel.selectedIndex].text);
};

window.abrirReceta = async function(idProducto, nombre, esRecarga = false) {
    window.productoActualParaReceta = idProducto;
    const { data: prodFinal } = await clienteSupabase.from('productos').select('rendimiento_receta, id_unidad_receta(abreviatura)').eq('id', idProducto).single();
    
    await window.actualizarSelectInsumos();
    
    const vistaRecetasActiva = document.getElementById('receta-titulo');
    if(!vistaRecetasActiva && !esRecarga) {
        await window.cambiarVista('recetas');
    }
    
    const msjVacio = document.getElementById('msj-receta-vacia');
    if(msjVacio) {
        msjVacio.classList.add('hidden');
        document.getElementById('panel-receta-activa').classList.remove('hidden');
        document.getElementById('panel-estadisticas-receta').classList.remove('hidden');
        document.getElementById('receta-unidad-base').classList.remove('hidden');
        const btnImp = document.getElementById('btn-imprimir-receta');
        if(btnImp) btnImp.classList.remove('hidden');
    }

    const abrev = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    const elUnidadBase = document.getElementById('receta-unidad-base');
    const elLabelRendimiento = document.getElementById('receta-label-rendimiento');
    const elInputRendimiento = document.getElementById('receta-rendimiento');

    if(elUnidadBase) elUnidadBase.innerText = `Unidad base: ${abrev}`;
    if(elLabelRendimiento) elLabelRendimiento.innerText = abrev;
    if(elInputRendimiento) elInputRendimiento.value = prodFinal?.rendimiento_receta || 1;
    
    window.cargarIngredientesReceta();
}

window.actualizarSelectInsumos = async function() {
    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_receta(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosParaRecetaMemoria = prods || [];
}

// NUEVA FUNCIÓN: IMPRIMIR RECETAS (COCINA Y ADMIN)
window.imprimirReceta = async function(tipo) {
    if(!window.productoActualParaReceta) return alert("Selecciona una receta primero.");

    const sel = document.getElementById('buscador-recetas');
    const nombreReceta = sel.options[sel.selectedIndex].text;
    const rendimiento = parseFloat(document.getElementById('receta-rendimiento').value) || 1;
    const unidadBase = document.getElementById('receta-label-rendimiento').innerText;
    
    const fechaHoy = new Date().toLocaleDateString('es-CL');
    const empresaActual = document.getElementById('lista-empresas-usuario')?.innerText.split('\n')[0].replace('🏢 ', '') || 'Empresa Global';

    // Buscamos los datos exactos desde la BD para imprimir
    const { data } = await clienteSupabase.from('recetas')
        .select('cantidad_neta, id_ingrediente(nombre, ultimo_costo_uc, cant_en_ua_de_uc, cant_en_um_de_ua, cant_en_ur_de_um, id_unidad_receta(abreviatura))')
        .eq('id_producto_padre', window.productoActualParaReceta);

    let costoTotalReceta = 0;
    let filasHtml = '';

    (data||[]).forEach(r => {
        const ing = r.id_ingrediente;
        const abrev = ing.id_unidad_receta?.abreviatura || '';
        const f_ua = ing.cant_en_ua_de_uc || 1;
        const f_um = ing.cant_en_um_de_ua || 1;
        const f_ur = ing.cant_en_ur_de_um || 1;
        const costo_uc = ing.ultimo_costo_uc || 0;
        const costo_ur = costo_uc / (f_ua * f_um * f_ur);
        
        // Costo Total de esa línea de ingrediente
        const costo_linea = costo_ur * r.cantidad_neta;
        const costo_linea_iva = costo_linea * 1.19;

        costoTotalReceta += costo_linea;

        if (tipo === 'cocina') {
            filasHtml += `
                <tr>
                    <td class="prod-col">${ing.nombre}</td>
                    <td class="center-col font-mono">${r.cantidad_neta}</td>
                    <td class="center-col text-gray-500">${abrev}</td>
                </tr>
            `;
        } else {
            filasHtml += `
                <tr>
                    <td class="prod-col">${ing.nombre}</td>
                    <td class="center-col font-mono">${r.cantidad_neta}</td>
                    <td class="center-col text-gray-500">${abrev}</td>
                    <td class="right-col font-mono text-emerald-700">$${costo_linea.toFixed(2)}</td>
                    <td class="right-col font-mono text-blue-700">$${costo_linea_iva.toFixed(2)}</td>
                </tr>
            `;
        }
    });

    const costoTotalRecetaIva = costoTotalReceta * 1.19;

    let tableHeaders = '';
    if (tipo === 'cocina') {
        tableHeaders = `
            <tr>
                <th>Ingrediente / Insumo</th>
                <th style="width: 120px; text-align: center;">Cantidad</th>
                <th style="width: 100px; text-align: center;">Unidad</th>
            </tr>
        `;
    } else {
        tableHeaders = `
            <tr>
                <th>Ingrediente / Insumo</th>
                <th style="width: 100px; text-align: center;">Cant.</th>
                <th style="width: 80px; text-align: center;">Unid.</th>
                <th style="width: 120px; text-align: right;">Costo Neto</th>
                <th style="width: 120px; text-align: right;">Costo (+19% IVA)</th>
            </tr>
        `;
    }

    let extraAdminInfo = '';
    if(tipo === 'admin') {
        extraAdminInfo = `
            <div class="info-item"><strong>Costo Total Receta (Neto):</strong><div style="font-size: 16px; margin-top: 4px; color: #047857; font-weight: bold;">$${costoTotalReceta.toFixed(2)}</div></div>
            <div class="info-item"><strong>Costo Total Receta (+19% IVA):</strong><div style="font-size: 16px; margin-top: 4px; color: #1d4ed8; font-weight: bold;">$${costoTotalRecetaIva.toFixed(2)}</div></div>
        `;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Ficha Técnica - ${nombreReceta}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #333; }
                .header-box { border: 2px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #fff; }
                .header-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 15px 0; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .info-grid { display: flex; flex-wrap: wrap; gap: 15px; }
                .info-item { flex: 1 1 30%; font-size: 14px; }
                .info-item strong { text-transform: uppercase; font-size: 12px; color: #555; display: block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 10px 8px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 12px; }
                thead { display: table-header-group; } 
                tr { page-break-inside: avoid; }
                .prod-col { font-weight: bold; font-size: 13px; }
                .center-col { text-align: center; font-size: 13px; }
                .right-col { text-align: right; font-size: 13px; }
                @media print { body { padding: 0; } @page { margin: 15mm; } .header-box { background-color: white !important; -webkit-print-color-adjust: exact; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">Ficha Técnica ${tipo === 'admin' ? '(Costos y Rentabilidad)' : '(Producción en Cocina)'}</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Empresa:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${empresaActual}</div></div>
                    <div class="info-item"><strong>Fecha de Emisión:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                    <div class="info-item"><strong>Receta / Producto:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px; color: #b45309;">${nombreReceta}</div></div>
                    <div class="info-item"><strong>Rendimiento:</strong><div style="font-size: 16px; margin-top: 4px;">${rendimiento} ${unidadBase}</div></div>
                    ${extraAdminInfo}
                </div>
            </div>
            <table>
                <thead>
                    ${tableHeaders}
                </thead>
                <tbody>${filasHtml}</tbody>
            </table>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

window.abrirDropdownIngrediente = function() {
    const drop = document.getElementById('dropdown-ingrediente');
    if(drop) drop.classList.remove('hidden');
    const input = document.getElementById('search-ingrediente');
    window.filtrarDropdownIngrediente(input ? input.value : '');
    if(input) input.select();
}

window.filtrarDropdownIngrediente = function(texto) {
    const term = (texto || '').toLowerCase().trim();
    let filtrados = window.productosParaRecetaMemoria || [];
    if(term) filtrados = filtrados.filter(p => (p.nombre || '').toLowerCase().includes(term));
    
    let html = filtrados.map(p => `<li class="px-3 py-2 hover:bg-emerald-50 cursor-pointer transition-colors" onclick="seleccionarIngrediente('${p.id}', '${p.nombre.replace(/'/g, "\\'")}', '${p.id_unidad_receta?.abreviatura||'-'}')">${p.nombre}</li>`).join('');
    html += `<li class="px-3 py-3 hover:bg-emerald-100 cursor-pointer font-bold text-emerald-700 bg-slate-50 border-t transition-colors" onclick="crearNuevoProductoDesdeReceta()">➕ Crear Nuevo Insumo...</li>`;
    
    const ul = document.getElementById('ul-ingrediente');
    if(ul) ul.innerHTML = html;
}

window.seleccionarIngrediente = function(id, nombre, abrev) {
    document.getElementById('hidden-ingrediente').value = id;
    document.getElementById('search-ingrediente').value = nombre;
    document.getElementById('search-ingrediente').classList.remove('border-red-300');
    document.getElementById('label-unidad-ingrediente').innerText = abrev;
    document.getElementById('dropdown-ingrediente').classList.add('hidden');
}

window.crearNuevoProductoDesdeReceta = function() {
    document.getElementById('dropdown-ingrediente').classList.add('hidden');
    const nombreSugerido = document.getElementById('search-ingrediente').value;
    window.abrirModalProducto(false, nombreSugerido);
}

window.guardarRendimiento = async function() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    window.cargarIngredientesReceta();
}

window.cargarIngredientesReceta = async function() {
    const { data } = await clienteSupabase.from('recetas')
        .select('id, id_ingrediente, cantidad_neta, id_ingrediente(id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, cant_en_um_de_ua, cant_en_ur_de_um, id_unidad_receta(abreviatura))')
        .eq('id_producto_padre', window.productoActualParaReceta);

    let costoTotalReceta = 0;

    const lista = document.getElementById('lista-ingredientes-receta');
    if(!lista) return;

    lista.innerHTML = (data||[]).map(r => {
        const ing = r.id_ingrediente;
        const f_ua = ing.cant_en_ua_de_uc || 1;
        const f_um = ing.cant_en_um_de_ua || 1;
        const f_ur = ing.cant_en_ur_de_um || 1;

        const costo_uc = ing.ultimo_costo_uc || 0;
        const costo_ur = costo_uc / (f_ua * f_um * f_ur);
        const costo_linea = costo_ur * r.cantidad_neta;

        costoTotalReceta += costo_linea;

        return `
        <tr class="border-b hover:bg-slate-50 items-center transition-colors">
            <td class="py-3 px-4 text-sm font-medium text-slate-700 w-1/2">${ing.nombre}</td>
            <td class="py-3 px-4 text-center font-bold text-slate-600 bg-slate-50 border-x border-slate-100">${r.cantidad_neta} <span class="text-xs font-normal text-slate-400">${ing.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 px-4 text-right font-mono text-emerald-700 font-bold">$${costo_linea.toFixed(2)}</td>
            <td class="py-3 px-4 text-right flex justify-end gap-3 items-center relative">
                <div class="relative group">
                    <button type="button" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110 focus:outline-none flex items-center gap-1">
                        ✏️
                        <span class="text-[10px] text-slate-400">▼</span>
                    </button>
                    <div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-50 hidden group-hover:block group-focus-within:block">
                        <ul class="py-1 text-sm text-slate-700 text-left">
                            <li>
                                <button type="button" onclick="editarIngredienteReceta('${r.id}', '${ing.id}', '${r.cantidad_neta}', '${ing.nombre.replace(/'/g, "\\'")}', '${ing.id_unidad_receta?.abreviatura || ''}')" class="block w-full px-4 py-2 hover:bg-slate-50 hover:text-blue-600 font-medium text-left">
                                    📝 Editar Línea (Cant.)
                                </button>
                            </li>
                            <li>
                                <button type="button" onclick="editarProductoFull('${ing.id}')" class="block w-full px-4 py-2 hover:bg-slate-50 hover:text-blue-600 font-medium text-left">
                                    📦 Editar Insumo Maestro
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
                <button type="button" onclick="quitarIngrediente('${r.id}')" class="text-red-400 hover:text-red-600 text-lg transition-transform hover:scale-110 ml-2">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    const elRendimiento = document.getElementById('receta-rendimiento');
    const rendimiento = elRendimiento ? (parseFloat(elRendimiento.value) || 1) : 1;
    
    const costoUnitarioNeto = costoTotalReceta / rendimiento;
    const costoUnitarioConIva = costoUnitarioNeto * 1.19;

    const elCostoUni = document.getElementById('receta-costo-unitario');
    const elCostoIva = document.getElementById('receta-costo-iva');

    if(elCostoUni) elCostoUni.innerText = `$${costoUnitarioNeto.toFixed(2)}`;
    if(elCostoIva) elCostoIva.innerText = `$${costoUnitarioConIva.toFixed(2)}`;
}

window.editarIngredienteReceta = function(idReceta, idInsumo, cantidad, nombreInsumo, abrevInsumo) {
    document.getElementById('hidden-ingrediente').value = idInsumo;
    document.getElementById('search-ingrediente').value = nombreInsumo;
    document.getElementById('label-unidad-ingrediente').innerText = abrevInsumo;
    document.getElementById('ing-cantidad').value = cantidad;
    
    window.modoEdicion = { activo: true, id: idReceta, form: 'ingrediente' };
    
    const btnSubmit = document.querySelector(`#form-ingrediente button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Actualizar';
        btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600');
    }
    const btnCancelar = document.getElementById('btn-cancelar-ingrediente');
    if(btnCancelar) btnCancelar.classList.remove('hidden');
}

window.resetearFormularioIngrediente = function() {
    const form = document.getElementById('form-ingrediente');
    if(form) form.reset();
    
    const hidden = document.getElementById('hidden-ingrediente');
    if(hidden) hidden.value = '';
    
    const labelUni = document.getElementById('label-unidad-ingrediente');
    if(labelUni) labelUni.innerText = '';
    
    window.modoEdicion = { activo: false, id: null, form: null };
    
    const btnSubmit = document.querySelector(`#form-ingrediente button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Añadir a la Receta';
        btnSubmit.classList.replace('bg-blue-600', 'bg-emerald-600');
    }
    
    const btnCancelar = document.getElementById('btn-cancelar-ingrediente');
    if(btnCancelar) btnCancelar.classList.add('hidden');
    
    const searchInput = document.getElementById('search-ingrediente');
    if(searchInput) searchInput.classList.remove('border-red-300');
}

// Delegador Global para el formulario de Recetas (Evita recarga de página)
if (!window.eventosRecetasAtados) {
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'form-ingrediente') {
            e.preventDefault();
            const idIngredienteSeleccionado = document.getElementById('hidden-ingrediente').value;
            
            if(!idIngredienteSeleccionado) {
                document.getElementById('search-ingrediente').classList.add('border-red-300');
                return alert("Debes seleccionar un insumo válido de la lista desplegable.");
            }

            const payload = { 
                id_producto_padre: window.productoActualParaReceta, 
                id_ingrediente: idIngredienteSeleccionado, 
                cantidad_neta: document.getElementById('ing-cantidad').value 
            };
            
            const btnSubmit = document.querySelector(`#form-ingrediente button[type="submit"]`);
            const textoOriginal = btnSubmit.innerText;
            btnSubmit.innerText = '⏳ Guardando...';
            btnSubmit.disabled = true;

            if(window.modoEdicion.activo && window.modoEdicion.form === 'ingrediente') {
                await clienteSupabase.from('recetas').update(payload).eq('id', window.modoEdicion.id);
            } else {
                await clienteSupabase.from('recetas').insert([{...payload, id_empresa: window.miEmpresaId}]);
            }
            
            btnSubmit.innerText = textoOriginal;
            btnSubmit.disabled = false;
            
            window.resetearFormularioIngrediente();
            window.cargarIngredientesReceta();
        }
    });
    window.eventosRecetasAtados = true;
}

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
    // Funciones mágicas para traducir IDs a Nombres reales
    const getU = (id) => window.unidadesMemoria?.find(u => u.id === id)?.nombre || "";
    const getC = (id) => window.catListMemoria?.find(c => c.id === id)?.nombre || "";

    let csvContent = "NOMBRE,CATEGORIA,COSTO NETO REF.,UNIDAD COMPRA,CONTIENE CANT. UC-UA,UNIDAD ALMACENAMIENTO,CONTIENE CANT. UA-UM,UNIDAD MENOR,CONTIENE CANT. UM-UR,UNIDAD RECETA,CANTIDAD MINIMA (UA),CANTIDAD IDEAL (UA),RECETA,RECETA CONFIDENCIAL,CONTROL STOCK\n";

    // ¿Está vacío? ¡Damos una plantilla de ejemplo!
    if (!window.productosListMemoria || window.productosListMemoria.length === 0) {
        csvContent += "Ejemplo: Pan de Hamburguesa,Panaderia,2000,Bolsa,10,Unidad,1,Unidad,1,Unidad,50,100,FALSE,FALSE,TRUE\n";
        csvContent += "Ejemplo: Tomate Rey,Verduras,1500,Cajon,15,Kilo,1000,Gramo,1,Gramo,10,30,FALSE,FALSE,TRUE\n";
        csvContent += "Ejemplo: Hamburguesa Completa,Preparaciones,0,Unidad,1,Unidad,1,Unidad,1,Unidad,0,0,TRUE,FALSE,FALSE\n";
    } else {
        // Si hay productos, los exporta normalmente
        window.productosListMemoria.forEach(p => {
            let nombre = p.nombre ? `"${p.nombre.replace(/"/g, '""')}"` : "";
            let cat = `"${getC(p.id_categoria)}"`;
            let costo = p.ultimo_costo_uc || 0;
            let uCompra = `"${getU(p.id_unidad_compra)}"`;
            let cant_ua_uc = p.cant_en_ua_de_uc || 1;
            let uAlmacen = `"${getU(p.id_unidad_almacenamiento)}"`;
            let cant_um_ua = p.cant_en_um_de_ua || 1;
            let uMenor = `"${getU(p.id_unidad_menor)}"`;
            let cant_ur_um = p.cant_en_ur_de_um || 1;
            let uReceta = `"${getU(p.id_unidad_receta)}"`;
            let min = 0; 
            let ideal = 0; 
            let receta = p.tiene_receta ? "TRUE" : "FALSE";
            let confidencial = "FALSE"; 
            let control = p.control_stock !== false ? "TRUE" : "FALSE";
            
            csvContent += `${nombre},${cat},${costo},${uCompra},${cant_ua_uc},${uAlmacen},${cant_um_ua},${uMenor},${cant_ur_um},${uReceta},${min},${ideal},${receta},${confidencial},${control}\n`;
        });
    }

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

window.importarProductosCSV = async function(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    // 1. Cargamos de la BD los catálogos más frescos para evitar errores
    const [{ data: cats }, { data: unis }] = await Promise.all([
        clienteSupabase.from('categorias').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('unidades').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);
    window.catListMemoria = cats || [];
    window.unidadesMemoria = unis || [];

    inputElement.value = '';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const filas = results.data;
            if(filas.length === 0) return alert("El archivo está vacío.");
            
            // Validar que es la plantilla nueva
            if(!filas[0].hasOwnProperty('NOMBRE') || !filas[0].hasOwnProperty('CATEGORIA')) {
                return alert("❌ Formato incorrecto. Por favor descarga la plantilla con el botón Exportar primero.");
            }

            let insertados = 0;
            let omitidosDuplicados = [];
            let categoriasFaltantes = new Set();
            let unidadesFaltantes = new Set();
            let listosParaInsertar = [];
            
            const tbody = document.getElementById('lista-productos');
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-emerald-600 font-bold animate-pulse">⏳ Leyendo y validando el archivo... No cierres esta ventana.</td></tr>`;

            // Buscadores inteligentes de texto a ID
            const getCatId = (name) => {
                if (!name || name.trim() === '') return null;
                const found = window.catListMemoria.find(c => c.nombre.toLowerCase() === name.toLowerCase().trim());
                if (found) return found.id;
                categoriasFaltantes.add(name.trim());
                return null;
            };

            const getUniId = (name) => {
                if (!name || name.trim() === '') return null;
                const found = window.unidadesMemoria.find(u => u.nombre.toLowerCase() === name.toLowerCase().trim());
                if (found) return found.id;
                unidadesFaltantes.add(name.trim());
                return null;
            };

            // 2. Filtramos la data
            for (const fila of filas) {
                const nombre = fila['NOMBRE']?.trim();
                if (!nombre) continue;
                if (nombre.toLowerCase().startsWith('ejemplo:')) continue;

                const existe = window.productosListMemoria.some(p => p.nombre.toLowerCase() === nombre.toLowerCase());
                if (existe) {
                    omitidosDuplicados.push(nombre);
                    continue; // Se salta este producto para no sobreescribir
                }

                let catRaw = fila['CATEGORIA'];
                let ucRaw = fila['UNIDAD COMPRA'];
                let uaRaw = fila['UNIDAD ALMACENAMIENTO'];
                let umRaw = fila['UNIDAD MENOR'];
                let urRaw = fila['UNIDAD RECETA'];

                let idCat = getCatId(catRaw);
                let idUC = getUniId(ucRaw);
                let idUA = getUniId(uaRaw);
                let idUM = getUniId(umRaw);
                let idUR = getUniId(urRaw);

                // Si se escribió una categoría/unidad pero no se encontró el ID, la fila es defectuosa
                let tieneErrorCatalogo = false;
                if (catRaw && !idCat) tieneErrorCatalogo = true;
                if (ucRaw && !idUC) tieneErrorCatalogo = true;
                if (uaRaw && !idUA) tieneErrorCatalogo = true;
                if (umRaw && !idUM) tieneErrorCatalogo = true;
                if (urRaw && !idUR) tieneErrorCatalogo = true;

                if (!tieneErrorCatalogo) {
                    listosParaInsertar.push({
                        fila: fila,
                        payload: {
                            id_empresa: window.miEmpresaId,
                            nombre: nombre,
                            id_categoria: idCat,
                            ultimo_costo_uc: parseFloat(fila['COSTO NETO REF.']) || 0,
                            id_unidad_compra: idUC,
                            cant_en_ua_de_uc: parseFloat(fila['CONTIENE CANT. UC-UA']) || 1,
                            id_unidad_almacenamiento: idUA,
                            cant_en_um_de_ua: parseFloat(fila['CONTIENE CANT. UA-UM']) || 1,
                            id_unidad_menor: idUM,
                            cant_en_ur_de_um: parseFloat(fila['CONTIENE CANT. UM-UR']) || 1,
                            id_unidad_receta: idUR,
                            tiene_receta: fila['RECETA']?.toUpperCase() === 'TRUE',
                            control_stock: fila['CONTROL STOCK']?.toUpperCase() !== 'FALSE'
                        }
                    });
                }
            }

            // 3. Insertamos a la base de datos los que están correctos
            const { data: sucursales } = await clienteSupabase.from('sucursales').select('id').eq('id_empresa', window.miEmpresaId);

            for (const item of listosParaInsertar) {
                const { data: newProd, error } = await clienteSupabase.from('productos').insert([item.payload]).select('id').single();
                if (!error && newProd) {
                    insertados++;
                    
                    if (item.payload.control_stock !== false) {
                        let min = parseFloat(item.fila['CANTIDAD MINIMA (UA)']) || 0;
                        let ideal = parseFloat(item.fila['CANTIDAD IDEAL (UA)']) || 0;
                        
                        if ((min > 0 || ideal > 0) && sucursales) {
                            for (const suc of sucursales) {
                                await clienteSupabase.from('reglas_stock_sucursal').insert([{ 
                                    id_empresa: window.miEmpresaId, id_producto: newProd.id, id_sucursal: suc.id, stock_minimo_ua: min, stock_ideal_ua: ideal 
                                }]);
                            }
                        }
                    }
                }
            }

            // 4. Mostramos el reporte visual y recargamos la tabla
            window.mostrarReporteImportacion(insertados, omitidosDuplicados, Array.from(categoriasFaltantes), Array.from(unidadesFaltantes));
            window.cargarProductos(); 
        },
        error: function(err) {
            alert("Error leyendo el archivo CSV: " + err.message);
        }
    });
}

// ==========================================
// NUEVO: PANEL VISUAL FIJO DE REPORTES DE IMPORTACIÓN
// ==========================================
window.mostrarReporteImportacion = function(insertados, duplicados, catFaltantes, uniFaltantes) {
    let container = document.getElementById('reporte-importacion-container');
    
    // Si no existe, lo creamos justo antes de la tabla blanca de productos
    if (!container) {
        const tableWrap = document.querySelector('#lista-productos')?.closest('.bg-white');
        if (tableWrap) {
            container = document.createElement('div');
            container.id = 'reporte-importacion-container';
            tableWrap.parentNode.insertBefore(container, tableWrap);
        } else {
            return alert(`Importación terminada. ${insertados} registrados. ${duplicados.length} duplicados.`); 
        }
    }

    let html = `
    <div class="bg-white border-2 border-slate-200 rounded-xl p-6 mb-6 shadow-sm relative">
        <button onclick="document.getElementById('reporte-importacion-container').innerHTML=''" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-2xl" title="Cerrar Reporte">&times;</button>
        <h3 class="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><span>📊</span> Reporte de Importación</h3>`;

    if (insertados > 0) {
        html += `<div class="mb-4 p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
            <p class="font-bold text-lg">✅ ¡Éxito! Se importaron ${insertados} productos correctamente.</p>
        </div>`;
    } else {
         html += `<div class="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200">
            <p class="font-bold text-lg">⚠️ Ningún producto nuevo fue importado a la base de datos.</p>
        </div>`;
    }

    if (catFaltantes.length > 0 || uniFaltantes.length > 0) {
        html += `<div class="mb-4 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
            <p class="font-bold mb-2">🛑 ¡Atención! Los siguientes nombres no existen en tu sistema. Se omitieron esos productos:</p>
            <p class="text-sm mb-3">Debes crear estos catálogos en el menú "Catálogos" antes de subir el Excel:</p>
            <ul class="list-disc pl-5 text-sm font-medium space-y-1">
                ${catFaltantes.length > 0 ? `<li><b class="text-red-900">Categorías Faltantes:</b> ${catFaltantes.join(', ')}</li>` : ''}
                ${uniFaltantes.length > 0 ? `<li><b class="text-red-900">Unidades Faltantes:</b> ${uniFaltantes.join(', ')}</li>` : ''}
            </ul>
        </div>`;
    }

    if (duplicados.length > 0) {
        html += `<div class="mb-2 p-4 bg-orange-50 text-orange-800 rounded-lg border border-orange-200">
            <p class="font-bold mb-1">⚠️ Productos Duplicados (Ya existen, no se sobreescribieron):</p>
            <p class="text-sm text-orange-700 mb-2">${duplicados.length} productos omitidos porque su nombre coincidió de forma exacta.</p>
            <div class="mt-2 text-xs text-orange-700 font-medium max-h-32 overflow-y-auto bg-orange-100/50 p-3 rounded">
                ${duplicados.join(' <span class="mx-2 text-orange-300">•</span> ')}
            </div>
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// NUEVA FUNCIÓN: IMPRIMIR CATÁLOGO CON FORMATO
window.imprimirCatalogoProductos = function() {
    let filtrados = [...window.productosListMemoria];

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
        const controlStr = p.control_stock === false ? 'Sin Control' : 'Control Stock';
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

// ==========================================
// IMPORTADOR / EXPORTADOR MASIVO DE RECETAS
// ==========================================

window.exportarPlantillaRecetasCSV = function() {
    let csvContent = "PRODUCTO A PREPARAR,INGREDIENTE,CANTIDAD NETA\n";
    csvContent += "Ejemplo: Completo Italiano,Pan de Completo,1\n";
    csvContent += "Ejemplo: Completo Italiano,Vienesa,1\n";
    csvContent += "Ejemplo: Completo Italiano,Palta Molida,60\n";
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Plantilla_Recetas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.importarRecetasCSV = async function(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    // 1. Traemos TODOS los productos a la memoria para poder emparejar nombres
    const { data: todosLosProductos } = await clienteSupabase.from('productos')
        .select('id, nombre, tiene_receta')
        .eq('id_empresa', window.miEmpresaId);
    
    const catalogo = todosLosProductos || [];
    inputElement.value = '';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const filas = results.data;
            if(filas.length === 0) return alert("El archivo está vacío.");
            
            if(!filas[0].hasOwnProperty('PRODUCTO A PREPARAR') || !filas[0].hasOwnProperty('INGREDIENTE')) {
                return alert("❌ Formato incorrecto. Por favor descarga la plantilla de Recetas primero.");
            }

            let insertados = 0;
            let productosFaltantes = new Set();
            let ingredientesFaltantes = new Set();
            let listosParaInsertar = [];
            let padresAActualizar = new Set(); // Para encenderles el "tiene_receta = true"

            const container = document.getElementById('reporte-importacion-recetas');
            if(container) container.innerHTML = `<div class="p-6 text-center text-blue-600 font-bold animate-pulse bg-white rounded-xl border border-blue-100 shadow-sm">⏳ Construyendo recetas... No cierres esta ventana.</div>`;

            // 2. Procesamos el Excel
            for (const fila of filas) {
                const nombrePadre = fila['PRODUCTO A PREPARAR']?.trim();
                const nombreIngrediente = fila['INGREDIENTE']?.trim();
                const cant = parseFloat(fila['CANTIDAD NETA']) || 0;

                // Saltamos las filas de ejemplo
                if (!nombrePadre || nombrePadre.includes("Ejemplo:")) continue;

                // Buscamos los IDs correspondientes
                const padreObj = catalogo.find(p => p.nombre.toLowerCase() === nombrePadre.toLowerCase());
                const ingreObj = catalogo.find(p => p.nombre.toLowerCase() === nombreIngrediente.toLowerCase());

                if (!padreObj) productosFaltantes.add(nombrePadre);
                if (!ingreObj) ingredientesFaltantes.add(nombreIngrediente);

                if (padreObj && ingreObj && cant > 0) {
                    listosParaInsertar.push({
                        id_empresa: window.miEmpresaId,
                        id_producto_padre: padreObj.id,
                        id_ingrediente: ingreObj.id,
                        cantidad_neta: cant
                    });
                    
                    if (!padreObj.tiene_receta) padresAActualizar.add(padreObj.id);
                }
            }

            // 3. Guardamos en la base de datos
            for (const item of listosParaInsertar) {
                // Verificamos si ya existe ese ingrediente en esa receta para no duplicarlo
                const { data: existe } = await clienteSupabase.from('recetas')
                    .select('id')
                    .eq('id_producto_padre', item.id_producto_padre)
                    .eq('id_ingrediente', item.id_ingrediente)
                    .maybeSingle();

                if (!existe) {
                    const { error } = await clienteSupabase.from('recetas').insert([item]);
                    if (!error) insertados++;
                }
            }

            // 4. Encendemos el check de "Tiene Receta" a los productos que no lo tenían
            for (const idPadre of padresAActualizar) {
                await clienteSupabase.from('productos').update({ tiene_receta: true }).eq('id', idPadre);
            }

            // 5. Mostramos el Reporte
            let htmlReporte = `
            <div class="bg-white border-2 border-blue-200 rounded-xl p-6 mt-4 shadow-sm relative">
                <button onclick="document.getElementById('reporte-importacion-recetas').innerHTML=''" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
                <h3 class="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><span>🥣</span> Reporte de Recetas</h3>`;

            if (insertados > 0) {
                htmlReporte += `<div class="mb-4 p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
                    <p class="font-bold">✅ Se conectaron ${insertados} ingredientes nuevos a sus recetas.</p>
                </div>`;
            } else {
                 htmlReporte += `<div class="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200">
                    <p class="font-bold">⚠️ No se agregaron nuevos ingredientes (Puede que ya existieran o el archivo estaba vacío).</p>
                </div>`;
            }

            if (productosFaltantes.size > 0 || ingredientesFaltantes.size > 0) {
                htmlReporte += `<div class="mb-2 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
                    <p class="font-bold mb-2">🛑 Nombres no encontrados en el Catálogo de Productos:</p>
                    <p class="text-sm mb-2">Las recetas de estos ítems fueron omitidas porque no existen en el sistema. Debes crearlos en 'Productos' primero:</p>
                    <ul class="list-disc pl-5 text-sm font-medium space-y-1">
                        ${productosFaltantes.size > 0 ? `<li><b class="text-red-900">Productos a Preparar faltantes:</b> ${Array.from(productosFaltantes).join(', ')}</li>` : ''}
                        ${ingredientesFaltantes.size > 0 ? `<li><b class="text-red-900">Ingredientes faltantes:</b> ${Array.from(ingredientesFaltantes).join(', ')}</li>` : ''}
                    </ul>
                </div>`;
            }
            htmlReporte += `</div>`;
            
            if(container) container.innerHTML = htmlReporte;
            
            // Recargamos el buscador para que aparezcan las nuevas recetas creadas
            if(window.cargarBuscadorRecetas) window.cargarBuscadorRecetas();
            if(window.productoActualParaReceta) window.cargarIngredientesReceta();
        },
        error: function(err) {
            alert("Error leyendo el archivo CSV: " + err.message);
        }
    });
}