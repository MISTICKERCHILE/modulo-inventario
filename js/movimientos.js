// --- CLICK FUERA PARA CERRAR BUSCADORES ---
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
        document.querySelectorAll('.lista-dropdown-custom').forEach(el => {
            el.classList.add('hidden');
            const index = el.id.replace('dropdown-', '');
            const hiddenInput = document.getElementById(`hidden-prod-${index}`);
            const searchInput = document.getElementById(`search-prod-${index}`);
            if(hiddenInput && searchInput && window.productosERPGlobal) {
                const prod = window.productosERPGlobal.find(p => p.id === hiddenInput.value);
                searchInput.value = prod ? prod.nombre : '';
            }
        });
    }
});

// --- NAVEGACIÓN DE TABS EN MOVIMIENTOS ---
window.cambiarTabMovimientos = function(tab) {
    ['pedidos', 'compras', 'ventas', 'otros'].forEach(t => {
        const el = document.getElementById(`seccion-mov-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        
        const btn = document.getElementById(`tab-mov-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });

    if(tab === 'pedidos') {
        window.cambiarSubTabPedidos('sugerencias');
    }
    if(tab === 'compras' || tab === 'otros') window.cargarSelectsMovimientosFormularios(); 
    if(tab === 'ventas') window.prepararPanelVentas();
}

window.cambiarSubTabPedidos = function(subtab) {
    const btnS = document.getElementById('subtab-sugerencias');
    const btnT = document.getElementById('subtab-transito');
    const divS = document.getElementById('subvista-sugerencias');
    const divT = document.getElementById('subvista-transito');

    if(subtab === 'sugerencias') {
        btnS.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-emerald-700';
        btnT.className = 'px-4 py-2 rounded-md font-bold text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer';
        divS.classList.remove('hidden'); divT.classList.add('hidden');
        window.cargarPedidosPlanificados();
    } else {
        btnT.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-blue-700';
        btnS.className = 'px-4 py-2 rounded-md font-bold text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer';
        divT.classList.remove('hidden'); divS.classList.add('hidden');
        window.cargarPedidosEnTransito();
    }
}

// ==========================================
// --- SECCIÓN: PEDIDOS (SUGERENCIAS Y CARRITO) ---
// ==========================================

window.carritoPedidos = []; // Arreglo para guardar lo que se va a pedir
window.proveedoresGlobal = []; // Memoria de proveedores para los selects

window.cargarPedidosPlanificados = async function() {
    const [{ data: sucursales }, { data: prods }, { data: reglas }, { data: provs }, { data: saldos }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('reglas_stock_sucursal').select('id_sucursal, id_producto, stock_minimo_ua, stock_ideal_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('inventario_saldos').select('id_sucursal, id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId)
    ]);

    window.proveedoresGlobal = provs || [];
    const optsProvs = '<option value="">Elige Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    let htmlGlobal = '';

    // Agrupamos la evaluación por Sucursal
    (sucursales||[]).forEach(suc => {
        let htmlFilasSucursal = '';
        
        (prods||[]).forEach(p => {
            const regla = (reglas||[]).find(r => r.id_sucursal === suc.id && r.id_producto === p.id);
            if(!regla || regla.stock_minimo_ua <= 0) return; // Si no tiene mínimo en esta sucursal, no se evalúa.

            // Sumamos el stock de ese producto en esa sucursal (sumando todas las ubicaciones)
            const stockSucursal = saldos.filter(s => s.id_sucursal === suc.id && s.id_producto === p.id).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);

            if (stockSucursal <= regla.stock_minimo_ua) {
                const sugeridoUA = regla.stock_ideal_ua > 0 ? (regla.stock_ideal_ua - stockSucursal) : (regla.stock_minimo_ua - stockSucursal + 1); 
                const sugeridoUC = p.cant_en_ua_de_uc > 0 ? (sugeridoUA / p.cant_en_ua_de_uc).toFixed(2) : sugeridoUA;
                const abrevUA = p.id_unidad_almacenamiento?.abreviatura || 'UA';
                const abrevUC = p.id_unidad_compra?.abreviatura || 'UC';
                const precioRef = p.ultimo_costo_uc || 0;

                const paramsParaBoton = `'${suc.id}', '${suc.nombre}', '${p.id}', '${p.nombre.replace(/'/g, "\\'")}', ${sugeridoUC}, '${abrevUC}', ${precioRef}`;

                htmlFilasSucursal += `
                <tr class="hover:bg-orange-50 transition-colors border-b border-orange-100">
                    <td class="px-4 py-3 font-bold text-slate-700 text-sm">${p.nombre}</td>
                    <td class="px-4 py-3 text-center"><span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-xs">${stockSucursal.toFixed(2)} ${abrevUA}</span></td>
                    <td class="px-4 py-3 text-center text-orange-800 font-bold text-sm">${sugeridoUA.toFixed(2)} ${abrevUA} <br><span class="text-[10px] text-orange-500 font-normal uppercase">Pedir: ${sugeridoUC} ${abrevUC}</span></td>
                    <td class="px-4 py-3">
                        <select id="prov-select-${suc.id}-${p.id}" class="w-full px-2 py-1 border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-400 bg-white">
                            ${optsProvs}
                        </select>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <span class="text-sm font-bold text-slate-600">$${precioRef}</span>
                            <button onclick="abrirModalHistorialPrecios('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')" class="text-blue-500 hover:text-blue-700" title="Ver precios históricos">ℹ️</button>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="agregarPedidoAlCarrito(${paramsParaBoton}, document.getElementById('prov-select-${suc.id}-${p.id}').value)" class="text-xs bg-slate-800 text-white px-3 py-2 rounded shadow hover:bg-slate-700 font-bold transition-transform hover:scale-105">+ Añadir a Pedido</button>
                    </td>
                </tr>`;
            }
        });

        if(htmlFilasSucursal !== '') {
            htmlGlobal += `
            <div class="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden mb-6">
                <div class="bg-orange-100 px-4 py-3 border-b border-orange-200">
                    <h4 class="font-bold text-orange-900 text-lg flex items-center gap-2"><span>🏢</span> Falta Stock en: ${suc.nombre}</h4>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-orange-100">
                        <thead class="bg-orange-50 text-xs font-bold text-orange-800 uppercase">
                            <tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-center">Stock Local</th><th class="px-4 py-2 text-center">Sugerido Pedir</th><th class="px-4 py-2 text-left w-48">Elegir Proveedor</th><th class="px-4 py-2 text-center">Últ. Precio Ref.</th><th class="px-4 py-2 text-right">Acción</th></tr>
                        </thead>
                        <tbody class="divide-y divide-orange-50 bg-white">${htmlFilasSucursal}</tbody>
                    </table>
                </div>
            </div>`;
        }
    });
    
    const containerAlertas = document.getElementById('lista-alertas-compras');
    if(containerAlertas) containerAlertas.innerHTML = htmlGlobal || '<div class="p-8 text-center bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-bold text-lg">🟢 Excelente. Todas las sucursales tienen stock por encima de su nivel mínimo.</div>';
}

window.abrirModalHistorialPrecios = async function(idProd, nombreProd) {
    document.getElementById('hp-producto-nombre').innerText = nombreProd;
    document.getElementById('modal-historial-precios').classList.remove('hidden');
    
    const tbody = document.getElementById('lista-historial-precios');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500">Buscando facturas... 🕵️‍♀️</td></tr>';

    const { data: historial } = await clienteSupabase
        .from('compras_detalles')
        .select(`precio_unitario_uc, compras!inner(fecha_compra, proveedores(nombre))`)
        .eq('id_producto', idProd)
        .order('compras(fecha_compra)', { ascending: false })
        .limit(10);

    if(!historial || historial.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-400 italic">No hay compras registradas para este producto.</td></tr>';
        return;
    }

    tbody.innerHTML = historial.map(h => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-2 text-slate-500">${h.compras.fecha_compra}</td>
            <td class="px-4 py-2 font-bold text-slate-700">${h.compras.proveedores?.nombre || 'Desconocido'}</td>
            <td class="px-4 py-2 text-right font-mono font-bold text-emerald-700">$${h.precio_unitario_uc}</td>
        </tr>
    `).join('');
}

window.agregarPedidoAlCarrito = function(idSuc, nombreSuc, idProd, nombreProd, cantUC, abrevUC, precioRef, idProv) {
    if(!idProv) return alert("❌ Por favor, selecciona un proveedor en la lista antes de añadir al pedido.");
    
    const nombreProv = window.proveedoresGlobal.find(p => p.id === idProv)?.nombre || 'Desconocido';

    // Verificamos si ya está en el carrito para no duplicar, sino sumar
    const existente = window.carritoPedidos.find(item => item.idProd === idProd && item.idSuc === idSuc && item.idProv === idProv);
    if (existente) {
        existente.cantUC += Number(cantUC);
    } else {
        window.carritoPedidos.push({ idSuc, nombreSuc, idProd, nombreProd, cantUC: Number(cantUC), abrevUC, precioRef, idProv, nombreProv });
    }

    window.renderizarBandejaPedidos();
    // Animación de feedback visual
    alert(`✅ Añadido a la bandeja para ${nombreProv}`);
}

window.renderizarBandejaPedidos = function() {
    const contenedor = document.getElementById('contenedor-bandeja');
    const lista = document.getElementById('lista-carritos-proveedor');
    
    if (window.carritoPedidos.length === 0) {
        contenedor.classList.add('hidden');
        lista.innerHTML = '';
        return;
    }

    contenedor.classList.remove('hidden');

    // Agrupar carrito por Proveedor
    const agrupadoPorProveedor = {};
    window.carritoPedidos.forEach(item => {
        if(!agrupadoPorProveedor[item.idProv]) agrupadoPorProveedor[item.idProv] = { nombreProv: item.nombreProv, items: [] };
        agrupadoPorProveedor[item.idProv].items.push(item);
    });

    let html = '';
    for (const [idProv, data] of Object.entries(agrupadoPorProveedor)) {
        let totalEstimado = 0;
        const filasHTML = data.items.map(item => {
            const subtotal = item.cantUC * item.precioRef;
            totalEstimado += subtotal;
            return `
            <tr class="border-b border-slate-200 bg-white">
                <td class="px-4 py-2 font-bold text-slate-800 text-sm">🏢 ${item.nombreSuc}</td>
                <td class="px-4 py-2 font-medium text-sm">${item.nombreProd}</td>
                <td class="px-4 py-2 text-center font-bold">${item.cantUC} <span class="text-xs text-slate-500">${item.abrevUC}</span></td>
                <td class="px-4 py-2 text-right text-slate-500 font-mono text-sm">$${item.precioRef}</td>
            </tr>`;
        }).join('');

        html += `
        <div class="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden p-1">
            <div class="bg-slate-800 text-white px-4 py-3 flex justify-between items-center rounded-t-md">
                <h4 class="font-bold text-lg">🚚 Para: ${data.nombreProv}</h4>
                <span class="text-sm font-medium bg-slate-700 px-3 py-1 rounded">Total est: $${totalEstimado.toFixed(2)}</span>
            </div>
            <div class="p-4 bg-slate-50">
                <table class="min-w-full text-left mb-4 border border-slate-200 rounded-md overflow-hidden">
                    <thead class="bg-slate-200 text-xs uppercase text-slate-600">
                        <tr><th class="px-4 py-2">Sucursal de Envío</th><th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-center">Cantidad</th><th class="px-4 py-2 text-right">Precio Ref.</th></tr>
                    </thead>
                    <tbody>${filasHTML}</tbody>
                </table>
                <div class="flex justify-end">
                    <button onclick="generarPedidoTransitoMasivo('${idProv}')" class="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700 transition-colors">🚀 Pedido Generado (Pasar a Tránsito)</button>
                </div>
            </div>
        </div>`;
    }
    lista.innerHTML = html;
}

window.generarPedidoTransitoMasivo = async function(idProv) {
    const itemsDelProveedor = window.carritoPedidos.filter(i => i.idProv === idProv);
    if(itemsDelProveedor.length === 0) return;

    // 1. Calculamos el total estimado para la cabecera
    const totalEstimado = itemsDelProveedor.reduce((sum, item) => sum + (item.cantUC * item.precioRef), 0);

    // 2. Creamos la cabecera de la compra
    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ 
        id_empresa: window.miEmpresaId, 
        id_proveedor: idProv, 
        total_compra: totalEstimado, 
        estado: 'En Tránsito' 
    }]).select('id').single();

    if(cabecera) {
        // 3. Insertamos todos los detalles asociados a esta compra
        const detallesAInsertar = itemsDelProveedor.map(item => ({
            id_compra: cabecera.id,
            id_producto: item.idProd,
            cantidad_uc: item.cantUC,
            precio_unitario_uc: item.precioRef,
            subtotal: item.cantUC * item.precioRef
            // OJO: Como las compras son globales por ahora, no guardamos id_sucursal aquí, 
            // se decide a qué sucursal entra en el momento de la "Recepción".
        }));
        await clienteSupabase.from('compras_detalles').insert(detallesAInsertar);
    }

    // 4. Limpiamos esos items del carrito global
    window.carritoPedidos = window.carritoPedidos.filter(i => i.idProv !== idProv);
    window.renderizarBandejaPedidos();
    
    alert("✅ Pedido pasado a Tránsito exitosamente.");
}

// ==========================================
// --- SECCIÓN: PEDIDOS EN TRÁNSITO ---
// ==========================================

window.cargarPedidosEnTransito = async function() {
    const { data: transito } = await clienteSupabase.from('compras_detalles')
        .select(`id, cantidad_uc, precio_unitario_uc, id_producto, productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura)), compras!inner(id, fecha_compra, estado, proveedores(nombre))`)
        .eq('compras.estado', 'En Tránsito');

    const containerTransito = document.getElementById('lista-pedidos-transito');
    if(containerTransito) {
        containerTransito.innerHTML = (transito || []).map(t => {
            const abrevUC = t.productos?.id_unidad_compra?.abreviatura || 'Unidades';
            return `
            <tr class="hover:bg-blue-50 transition-colors border-b border-blue-100">
                <td class="px-6 py-4"><p class="font-bold text-slate-700">${t.compras.fecha_compra}</p><p class="text-xs text-slate-500 font-medium uppercase tracking-wide">🚚 ${t.compras.proveedores?.nombre || 'General'}</p></td>
                <td class="px-6 py-4 font-bold text-slate-700">${t.productos?.nombre}</td>
                <td class="px-6 py-4 text-center font-bold text-blue-700 bg-blue-50 rounded border border-blue-100">${t.cantidad_uc} ${abrevUC}</td>
                <td class="px-6 py-4 text-right"><button onclick="abrirModalRecepcion('${t.compras.id}', '${t.id_producto}', '${t.productos.nombre.replace(/'/g, "\\'")}', ${t.cantidad_uc}, ${t.precio_unitario_uc}, ${t.productos.cant_en_ua_de_uc})" class="text-sm bg-blue-600 text-white px-4 py-2 rounded shadow-md hover:bg-blue-700 font-bold transition-transform hover:scale-105">✅ Recepcionar Llegada</button></td>
            </tr>`;
        }).join('') || '<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No hay pedidos en tránsito. Todo está al día.</td></tr>';
    }
}


// ==========================================
// --- RECEPCIÓN Y COMPRAS DIRECTAS ---
// ==========================================

window.abrirModalRecepcion = async function(idCompra, idProd, nombreProd, cantUC, precioUC, factorConversion) {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    document.getElementById('rec-sucursal').innerHTML = '<option value="">Selecciona bodega destino...</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    
    document.getElementById('rec-id-compra').value = idCompra;
    document.getElementById('rec-id-producto').value = idProd;
    document.getElementById('rec-cantidad-uc').value = cantUC;
    document.getElementById('rec-precio-uc').value = precioUC;
    
    const entrarUA = cantUC * factorConversion;
    document.getElementById('rec-resumen-texto').innerText = `${nombreProd}: Ingresarán ${entrarUA.toFixed(2)} Unidades de Almacén.`;
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
    window.cargarPedidosEnTransito(); 
});

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
window.productosERPGlobal = [];
window.selectCSVActivoIndex = null;

window.prepararPanelVentas = async function() {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    document.getElementById('csv-sucursal').innerHTML = (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

window.procesarArchivoCSV = function() {
    const fInicio = document.getElementById('csv-fecha-inicio').value;
    const fFin = document.getElementById('csv-fecha-fin').value;
    if (!fInicio || !fFin) return alert("❌ Por favor, selecciona la Fecha de Inicio y Fecha Fin del período de ventas antes de analizar.");

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
    
    filasCSV.forEach(fila => {
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

    const [{ data: prodsERP }, { data: homologaciones }] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('homologacion_pos').select('*').eq('id_empresa', window.miEmpresaId)
    ]);

    window.productosERPGlobal = prodsERP || [];

    const tbody = document.getElementById('lista-mapeo-csv');
    tbody.innerHTML = '';

    window.datosCSVAgrupados.forEach((item, index) => {
        const match = homologaciones.find(h => h.nombre_pos === item.nombre_pos && (h.variante_pos || '') === item.variante_pos);
        const idPreseleccionado = match ? match.id_producto_erp : '';
        const prodPreseleccionado = window.productosERPGlobal.find(p => p.id === idPreseleccionado);
        const nombrePreseleccionado = prodPreseleccionado ? prodPreseleccionado.nombre : '';
        
        const colorFila = idPreseleccionado ? '' : 'bg-red-50 border-l-4 border-red-500';
        const bordeInput = idPreseleccionado ? 'border-slate-300' : 'border-red-300';

        tbody.innerHTML += `
        <tr class="${colorFila}" id="fila-csv-${index}">
            <td class="px-4 py-3 font-bold">${item.nombre_pos}</td>
            <td class="px-4 py-3 text-slate-500">${item.variante_pos || '-'}</td>
            <td class="px-4 py-3 text-center font-mono text-lg font-bold">${item.cantidad}</td>
            <td class="px-4 py-3 relative dropdown-container" data-index="${index}">
                <input type="hidden" class="selector-homologacion" id="hidden-prod-${index}" data-index="${index}" value="${idPreseleccionado}">
                
                <div class="relative">
                    <input type="text" id="search-prod-${index}" 
                        class="w-full px-3 py-2 border ${bordeInput} rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                        placeholder="-- Buscar producto --"
                        value="${nombrePreseleccionado}"
                        onfocus="abrirDropdownCSV(${index})"
                        oninput="filtrarDropdownCSV(${index}, this.value)"
                        autocomplete="off">
                    
                    <div id="dropdown-${index}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                        <ul id="ul-prod-${index}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                    </div>
                </div>
            </td>
        </tr>`;
    });

    document.getElementById('panel-mapeo-csv').classList.remove('hidden');
}

window.abrirDropdownCSV = function(index) {
    document.querySelectorAll('.lista-dropdown-custom').forEach(el => el.classList.add('hidden'));
    window.filtrarDropdownCSV(index, ''); 
    document.getElementById(`search-prod-${index}`).select();
}

window.filtrarDropdownCSV = function(index, texto) {
    const ul = document.getElementById(`ul-prod-${index}`);
    const term = texto.toLowerCase().trim();

    let filtrados = window.productosERPGlobal;
    if (term) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(term));

    let html = filtrados.map(p => `
        <li class="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors" 
            onclick="seleccionarProductoCSV(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
            ${p.nombre}
        </li>
    `).join('');

    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" 
                onclick="crearNuevoProductoCSV(${index})">
                ➕ Crear Nuevo Producto...
            </li>`;

    ul.innerHTML = html;
    document.getElementById(`dropdown-${index}`).classList.remove('hidden');
}
