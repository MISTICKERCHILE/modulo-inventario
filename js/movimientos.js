// --- NAVEGACIÓN DE TABS EN MOVIMIENTOS ---
window.cambiarTabMovimientos = function(tab) {
    ['pedidos', 'compras', 'ventas', 'otros'].forEach(t => {
        const el = document.getElementById(`seccion-mov-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        
        const btn = document.getElementById(`tab-mov-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });

    if(tab === 'pedidos') window.cargarPedidosPlanificados();
    if(tab === 'compras' || tab === 'otros') window.cargarSelectsMovimientosFormularios(); 
    if(tab === 'ventas') window.prepararPanelVentas();
}


// ==========================================
// --- SECCIÓN: PEDIDOS PLANIFICADOS ---
// ==========================================
window.cargarPedidosPlanificados = async function() {
    const { data: prods } = await clienteSupabase
        .from('productos')
        .select(`id, nombre, cant_en_ua_de_uc, inventario_saldos(cantidad_actual_ua), id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)`)
        .eq('id_empresa', window.miEmpresaId);

    const { data: reglas } = await clienteSupabase.from('reglas_stock_sucursal').select('id_producto, stock_minimo_ua, stock_ideal_ua').eq('id_empresa', window.miEmpresaId);

    let htmlAlertas = '';
    
    (prods || []).forEach(p => {
        const stockGlobal = p.inventario_saldos.reduce((sum, inv) => sum + Number(inv.cantidad_actual_ua), 0);
        
        const reglasProd = (reglas||[]).filter(r => r.id_producto === p.id);
        const minGlobal = reglasProd.reduce((sum, r) => sum + Number(r.stock_minimo_ua), 0);
        const idealGlobal = reglasProd.reduce((sum, r) => sum + Number(r.stock_ideal_ua), 0);

        const abrevUA = p.id_unidad_almacenamiento?.abreviatura || 'Unid.';
        const abrevUC = p.id_unidad_compra?.abreviatura || 'Unid. Compra';

        if (minGlobal > 0 && stockGlobal <= minGlobal) {
            const sugeridoUA = idealGlobal > 0 ? (idealGlobal - stockGlobal) : (minGlobal - stockGlobal + 1); 
            const sugeridoUC = p.cant_en_ua_de_uc > 0 ? (sugeridoUA / p.cant_en_ua_de_uc).toFixed(2) : sugeridoUA;
            
            htmlAlertas += `
            <tr class="hover:bg-orange-50 transition-colors border-b border-orange-100">
                <td class="px-6 py-4 font-bold text-slate-700">${p.nombre}</td>
                <td class="px-6 py-4 text-center"><span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold">${stockGlobal.toFixed(2)} ${abrevUA}</span></td>
                <td class="px-6 py-4 text-center text-orange-800 font-bold">${sugeridoUA.toFixed(2)} ${abrevUA} <br><span class="text-xs text-orange-500 font-normal">Sugerencia: pedir ${sugeridoUC} ${abrevUC}</span></td>
                <td class="px-6 py-4 text-right">
                    <button onclick="abrirModalCompra('${p.id}', ${sugeridoUC})" class="text-sm bg-orange-500 text-white px-3 py-1 rounded shadow hover:bg-orange-600 font-bold transition-transform hover:scale-105">🛒 Generar Pedido</button>
                </td>
            </tr>`;
        }
    });
    
    const containerAlertas = document.getElementById('lista-alertas-compras');
    if(containerAlertas) containerAlertas.innerHTML = htmlAlertas || '<tr><td colspan="4" class="px-6 py-8 text-center text-emerald-600 font-bold bg-emerald-50">🟢 Todo en orden. No hay productos bajo el stock mínimo.</td></tr>';

    const { data: transito } = await clienteSupabase.from('compras_detalles')
        .select(`id, cantidad_uc, precio_unitario_uc, id_producto, productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura)), compras!inner(id, fecha_compra, estado, proveedores(nombre))`)
        .eq('compras.estado', 'En Tránsito');

    const containerTransito = document.getElementById('lista-pedidos-transito');
    if(containerTransito) {
        containerTransito.innerHTML = (transito || []).map(t => {
            const abrevUC = t.productos?.id_unidad_compra?.abreviatura || 'Unidades';
            return `
            <tr class="hover:bg-blue-50 transition-colors border-b border-blue-100">
                <td class="px-6 py-4"><p class="font-bold text-slate-700">${t.compras.fecha_compra}</p><p class="text-xs text-slate-500 font-medium uppercase tracking-wide">🏢 ${t.compras.proveedores?.nombre || 'General'}</p></td>
                <td class="px-6 py-4 font-bold text-slate-700">${t.productos?.nombre}</td>
                <td class="px-6 py-4 text-center font-bold text-blue-700 bg-blue-50 rounded">${t.cantidad_uc} ${abrevUC}</td>
                <td class="px-6 py-4 text-right"><button onclick="abrirModalRecepcion('${t.compras.id}', '${t.id_producto}', '${t.productos.nombre}', ${t.cantidad_uc}, ${t.precio_unitario_uc}, ${t.productos.cant_en_ua_de_uc})" class="text-sm bg-blue-600 text-white px-3 py-2 rounded shadow hover:bg-blue-700 font-bold transition-transform hover:scale-105">✅ Recepcionar Llegada</button></td>
            </tr>`;
        }).join('') || '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No hay camiones en camino.</td></tr>';
    }
}

// ==========================================
// --- MODALES Y RECEPCIÓN ---
// ==========================================
window.abrirModalCompra = async function(idProductoSugerido = null, cantSugerida = 0) {
    const [{ data: provs }, { data: prods }] = await Promise.all([
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);
    document.getElementById('compra-proveedor').innerHTML = '<option value="">Elegir Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const selectProd = document.getElementById('compra-producto');
    selectProd.innerHTML = '<option value="">Elegir Producto...</option>' + (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    document.getElementById('form-compra').reset();
    
    if(idProductoSugerido) { selectProd.value = idProductoSugerido; document.getElementById('compra-cantidad').value = cantSugerida; }
    document.getElementById('modal-compra').classList.remove('hidden');
}

document.getElementById('form-compra')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cant = parseFloat(document.getElementById('compra-cantidad').value);
    const precio = parseFloat(document.getElementById('compra-precio').value);
    
    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ id_empresa: window.miEmpresaId, id_proveedor: document.getElementById('compra-proveedor').value, total_compra: cant * precio, estado: 'En Tránsito' }]).select('id').single();
    if(cabecera) { await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: document.getElementById('compra-producto').value, cantidad_uc: cant, precio_unitario_uc: precio, subtotal: cant * precio }]); }
    document.getElementById('modal-compra').classList.add('hidden');
    window.cargarPedidosPlanificados(); 
});

window.abrirModalRecepcion = async function(idCompra, idProd, nombreProd, cantUC, precioUC, factorConversion) {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    document.getElementById('rec-sucursal').innerHTML = '<option value="">Selecciona bodega destino...</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    
    document.getElementById('rec-id-compra').value = idCompra;
    document.getElementById('rec-id-producto').value = idProd;
    document.getElementById('rec-cantidad-uc').value = cantUC;
    document.getElementById('rec-precio-uc').value = precioUC;
    
    const entrarUA = cantUC * factorConversion;
    document.getElementById('rec-resumen-texto').innerText = `${nombreProd}: Ingresarán ${entrarUA} Unidades de Almacén.`;
    document.getElementById('modal-recepcion').classList.remove('hidden');
}

window.cargarUbicacionesRecepcion = async function(idSucursal) {
    const divUbi = document.getElementById('div-rec-ubicacion');
    const selUbi = document.getElementById('rec-ubicacion');
    if(!idSucursal) { divUbi.classList.add('hidden'); selUbi.innerHTML = ''; return; }
    
    const { data: ubicaciones } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSucursal);
    if(ubicaciones && ubicaciones.length > 0) {
        selUbi.innerHTML = '<option value="">(Bodega General)</option>' + ubicaciones.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    } else { selUbi.innerHTML = '<option value="">(Sin ubicaciones creadas)</option>'; }
    divUbi.classList.remove('hidden');
}

document.getElementById('form-recepcion')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idCompra = document.getElementById('rec-id-compra').value, idProd = document.getElementById('rec-id-producto').value, idSucursal = document.getElementById('rec-sucursal').value;
    const idUbi = document.getElementById('rec-ubicacion').value || null;
    const precioUC = parseFloat(document.getElementById('rec-precio-uc').value);
    
    const { data: prod } = await clienteSupabase.from('productos').select('cant_en_ua_de_uc').eq('id', idProd).single();
    const cantUA_a_sumar = parseFloat(document.getElementById('rec-cantidad-uc').value) * prod.cant_en_ua_de_uc;

    let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSucursal);
    if(idUbi) query = query.eq('id_ubicacion', idUbi); else query = query.is('id_ubicacion', null);
    
    const { data: previo } = await query.maybeSingle();
    if (previo) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSucursal, id_ubicacion: idUbi, cantidad_actual_ua: cantUA_a_sumar }]);
    }

    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, tipo_movimiento: 'INGRESO_COMPRA', cantidad_movida: cantUA_a_sumar, costo_unitario_movimiento: precioUC, referencia: 'Recepción de Pedido' }]);
    await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);
    await clienteSupabase.from('compras').update({ estado: 'Completada' }).eq('id', idCompra);

    document.getElementById('modal-recepcion').classList.add('hidden');
    window.cargarPedidosPlanificados(); 
});

// ==========================================
// --- COMPRAS DIRECTAS Y OTROS MOVIMIENTOS ---
// ==========================================
window.cargarSelectsMovimientosFormularios = async function() {
    const [{ data: provs }, { data: prods }, { data: sucs }, { data: tipos }] = await Promise.all([
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('tipos_movimiento').select('id, nombre, operacion').eq('id_empresa', window.miEmpresaId)
    ]);

    const optsProvs = '<option value="">Selecciona...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const optsProds = '<option value="">Selecciona Producto...</option>' + (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const optsSucs = '<option value="">Bodega...</option>' + (sucs||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    const optsTipos = '<option value="">Selecciona Tipo...</option>' + (tipos||[]).map(t => `<option value="${t.id}" data-operacion="${t.operacion}">${t.nombre} (${t.operacion})</option>`).join('');

    document.getElementById('cd-proveedor').innerHTML = optsProvs; document.getElementById('cd-producto').innerHTML = optsProds; document.getElementById('cd-sucursal').innerHTML = optsSucs;
    document.getElementById('om-tipo').innerHTML = optsTipos; document.getElementById('om-producto').innerHTML = optsProds; document.getElementById('om-sucursal').innerHTML = optsSucs;
}

document.getElementById('form-compra-directa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idProd = document.getElementById('cd-producto').value, idSuc = document.getElementById('cd-sucursal').value;
    const cantUC = parseFloat(document.getElementById('cd-cantidad').value), costoTotal = parseFloat(document.getElementById('cd-costo').value), precioUC = costoTotal / cantUC;

    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ id_empresa: window.miEmpresaId, id_proveedor: document.getElementById('cd-proveedor').value, total_compra: costoTotal, estado: 'Completada' }]).select('id').single();
    await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: idProd, cantidad_uc: cantUC, precio_unitario_uc: precioUC, subtotal: costoTotal }]);

    const { data: prod } = await clienteSupabase.from('productos').select('cant_en_ua_de_uc').eq('id', idProd).single();
    const cantUA_a_sumar = cantUC * prod.cant_en_ua_de_uc;

    const { data: previo } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).is('id_ubicacion', null).maybeSingle();
    if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
    else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: cantUA_a_sumar }]);

    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: 'COMPRA_DIRECTA', cantidad_movida: cantUA_a_sumar, costo_unitario_movimiento: precioUC, referencia: 'Compra Directa' }]);
    await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);

    alert("✅ Compra Directa registrada con éxito."); document.getElementById('form-compra-directa').reset();
});

document.getElementById('form-otro-movimiento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectTipo = document.getElementById('om-tipo');
    const operacion = selectTipo.options[selectTipo.selectedIndex].getAttribute('data-operacion');
    const idProd = document.getElementById('om-producto').value, idSuc = document.getElementById('om-sucursal').value;
    const cantidadFinalAplicada = operacion === '+' ? parseFloat(document.getElementById('om-cantidad').value) : -parseFloat(document.getElementById('om-cantidad').value);

    const { data: previo } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).is('id_ubicacion', null).maybeSingle();
    if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantidadFinalAplicada, ultima_actualizacion: new Date() }).eq('id', previo.id);
    else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: cantidadFinalAplicada }]);

    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: selectTipo.options[selectTipo.selectedIndex].text, cantidad_movida: cantidadFinalAplicada, referencia: 'Ajuste Manual' }]);
    
    alert(`✅ Movimiento aplicado.`); document.getElementById('form-otro-movimiento').reset();
});

// ==========================================
// --- FASE 4: VENTAS POS (CSV) Y HOMOLOGACIÓN ---
// ==========================================
window.datosCSVAgrupados = [];

window.prepararPanelVentas = async function() {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    document.getElementById('csv-sucursal').innerHTML = (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

window.procesarArchivoCSV = function() {
    const fileInput = document.getElementById('csv-file');
    if (!fileInput.files.length) return alert("❌ Selecciona un archivo CSV primero.");
    
    Papa.parse(fileInput.files[0], {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            agruparYAsociarVentas(results.data);
        }
    });
}

async function agruparYAsociarVentas(filasCSV) {
    const agrupado = {};
    
    // Agrupamos sumando cantidades (busca las columnas por nombre aproximado o exacto)
    filasCSV.forEach(fila => {
        // Encontrar los nombres de las columnas que coincidan con lo que mandaste
        const keyNombre = Object.keys(fila).find(k => k.toLowerCase().includes('producto') || k.toLowerCase().includes('servicio')) || 'Producto';
        const keyVariante = Object.keys(fila).find(k => k.toLowerCase().includes('variante')) || 'Variante';
        const keyCant = Object.keys(fila).find(k => k.toLowerCase().includes('cantidad')) || 'Cantidad';

        const nombre = (fila[keyNombre] || '').trim();
        const variante = (fila[keyVariante] || '').trim();
        const cant = parseFloat(fila[keyCant]) || 0;

        if(nombre && cant > 0) {
            const clave = `${nombre}_||_${variante}`;
            if(!agrupado[clave]) agrupado[clave] = { nombre_pos: nombre, variante_pos: variante, cantidad: 0 };
            agrupado[clave].cantidad += cant;
        }
    });

    window.datosCSVAgrupados = Object.values(agrupado);

    // Buscamos productos del ERP y homologaciones previas para armar la tabla
    const [{ data: prodsERP }, { data: homologaciones }] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('homologacion_pos').select('*').eq('id_empresa', window.miEmpresaId)
    ]);

    const opcionesProductos = '<option value="">-- No Asociado (Seleccionar o Crear) --</option>' + 
        (prodsERP||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    const tbody = document.getElementById('lista-mapeo-csv');
    tbody.innerHTML = '';

    window.datosCSVAgrupados.forEach((item, index) => {
        // Buscar si ya se había asociado antes en la base de datos
        const match = homologaciones.find(h => h.nombre_pos === item.nombre_pos && (h.variante_pos || '') === item.variante_pos);
        const idPreseleccionado = match ? match.id_producto_erp : '';
        const colorFila = idPreseleccionado ? '' : 'bg-red-50 border-l-4 border-red-500';

        tbody.innerHTML += `
        <tr class="${colorFila}" id="fila-csv-${index}">
            <td class="px-4 py-3 font-bold">${item.nombre_pos}</td>
            <td class="px-4 py-3 text-slate-500">${item.variante_pos || '-'}</td>
            <td class="px-4 py-3 text-center font-mono text-lg font-bold">${item.cantidad}</td>
            <td class="px-4 py-3">
                <select class="w-full px-2 py-1 border border-slate-300 rounded bg-white selector-homologacion" data-index="${index}" onchange="quitarRojoFila(${index})">
                    ${opcionesProductos}
                </select>
            </td>
        </tr>`;

        // Preseleccionar si ya estaba homologado
        if(idPreseleccionado) {
            const select = tbody.lastElementChild.querySelector('select');
            select.value = idPreseleccionado;
        }
    });

    document.getElementById('panel-mapeo-csv').classList.remove('hidden');
}

window.quitarRojoFila = function(index) {
    document.getElementById(`fila-csv-${index}`).classList.remove('bg-red-50', 'border-l-4', 'border-red-500');
}

window.cancelarCSV = function() {
    document.getElementById('panel-mapeo-csv').classList.add('hidden');
    document.getElementById('csv-file').value = '';
    window.datosCSVAgrupados = [];
}

window.confirmarDescuentoVentas = async function() {
    const idSucursal = document.getElementById('csv-sucursal').value;
    const selects = document.querySelectorAll('.selector-homologacion');
    
    // Validar que todo esté asociado
    let todoAsociado = true;
    selects.forEach(sel => { if(!sel.value) todoAsociado = false; });
    if(!todoAsociado) return alert("❌ Debes asociar todos los productos del POS con tus productos del sistema antes de continuar.");

    const btn = document.getElementById('btn-procesar-ventas');
    btn.innerText = "⏳ Procesando y descontando..."; btn.disabled = true;

    // 1. Obtener todos los productos (con su info de unidades y recetas)
    const { data: catalogoCompleto } = await clienteSupabase.from('productos').select('id, tiene_receta, cant_en_um_de_ua, cant_en_ur_de_um').eq('id_empresa', window.miEmpresaId);

    // 2. Procesar cada fila
    for (const sel of selects) {
        const index = sel.getAttribute('data-index');
        const itemPOS = window.datosCSVAgrupados[index];
        const idProductoERP = sel.value;
        const cantidadVendida = itemPOS.cantidad;

        // Guardar la homologación (upsert) para que el sistema aprenda
        const { data: existeH } = await clienteSupabase.from('homologacion_pos').select('id').eq('id_empresa', window.miEmpresaId).eq('nombre_pos', itemPOS.nombre_pos).eq('variante_pos', itemPOS.variante_pos).maybeSingle();
        if(existeH) await clienteSupabase.from('homologacion_pos').update({ id_producto_erp: idProductoERP }).eq('id', existeH.id);
        else await clienteSupabase.from('homologacion_pos').insert([{ id_empresa: window.miEmpresaId, nombre_pos: itemPOS.nombre_pos, variante_pos: itemPOS.variante_pos, id_producto_erp: idProductoERP }]);

        const prodERP = catalogoCompleto.find(p => p.id === idProductoERP);

        // EXPLOSIÓN DE MATERIALES (DESCUENTO)
        if (prodERP.tiene_receta) {
            // Descontar INGREDIENTES
            const { data: ingredientes } = await clienteSupabase.from('recetas').select('cantidad_neta, id_ingrediente(id, cant_en_um_de_ua, cant_en_ur_de_um)').eq('id_producto_padre', idProductoERP);
            
            for (const ing of (ingredientes||[])) {
                const infoInsumo = ing.id_ingrediente;
                // Calculamos cuánto descontar en UA. Fórmula: (Ventas * CantReceta) / (FactorUM * FactorUR)
                const factorUM = infoInsumo.cant_en_um_de_ua || 1;
                const factorUR = infoInsumo.cant_en_ur_de_um || 1;
                const ua_a_descontar = (cantidadVendida * ing.cantidad_neta) / (factorUM * factorUR);
                
                await aplicarDescuentoInventario(infoInsumo.id, idSucursal, ua_a_descontar, `Venta POS (Receta de ${itemPOS.nombre_pos})`);
            }
        } else {
            // Producto Simple: Descontar el producto directamente.
            // Asumimos que el POS vende la "Unidad Menor". Así que lo pasamos a UA.
            const factorUM = prodERP.cant_en_um_de_ua || 1;
            const ua_a_descontar = cantidadVendida / factorUM;
            await aplicarDescuentoInventario(idProductoERP, idSucursal, ua_a_descontar, `Venta POS Directa (${itemPOS.nombre_pos})`);
        }
    }

    alert("✅ ¡Ventas importadas y stock descontado con éxito!");
    btn.innerText = "✅ Confirmar y Descontar Inventario"; btn.disabled = false;
    cancelarCSV();
}

// Función auxiliar para restar el inventario del general de la sucursal (ubicación nula o la principal que encuentre)
async function aplicarDescuentoInventario(idProd, idSuc, cantidad_ua_descontar, referencia) {
    if(cantidad_ua_descontar <= 0) return;

    // Buscamos el saldo general (id_ubicacion es nulo) o el registro con más cantidad
    const { data: saldos } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).order('cantidad_actual_ua', { ascending: false });

    if(saldos && saldos.length > 0) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: saldos[0].cantidad_actual_ua - cantidad_ua_descontar, ultima_actualizacion: new Date() }).eq('id', saldos[0].id);
    } else {
        // Si no había registro de inventario previo, lo crea en negativo (lo normal antes de un ajuste físico)
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: -cantidad_ua_descontar }]);
    }

    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: 'VENTA_POS', cantidad_movida: -cantidad_ua_descontar, referencia: referencia }]);
}
