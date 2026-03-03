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

    if(tab === 'pedidos') window.cambiarSubTabPedidos('sugerencias');
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
// --- SECCIÓN 1: PEDIDOS SUGERIDOS ---
// ==========================================
window.carritoPedidos = []; 
window.proveedoresGlobal = []; 

window.cargarPedidosPlanificados = async function() {
    const [{ data: sucursales }, { data: prods }, { data: reglas }, { data: provs }, { data: saldos }, { data: transitoGlobal }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('reglas_stock_sucursal').select('id_sucursal, id_producto, stock_minimo_ua, stock_ideal_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('inventario_saldos').select('id_sucursal, id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('compras_detalles').select('id_sucursal_destino, id_producto, cantidad_uc, productos(cant_en_ua_de_uc)').in('estado', ['En Tránsito', 'Postpuesto'])
    ]);

    window.proveedoresGlobal = provs || [];
    const optsProvs = '<option value="">Elige Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    let htmlGlobal = '';

    (sucursales||[]).forEach(suc => {
        let htmlFilasSucursal = '';
        
        (prods||[]).forEach(p => {
            const regla = (reglas||[]).find(r => r.id_sucursal === suc.id && r.id_producto === p.id);
            if(!regla || regla.stock_minimo_ua <= 0) return;

            // FÍSICO: Lo que hay en la bodega sumando todas las ubicaciones
            const stockFisico = saldos.filter(s => s.id_sucursal === suc.id && s.id_producto === p.id).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
            
            // EN CAMINO: Lo que viene en los camiones para esta sucursal (Convertido a UA)
            const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === suc.id && t.id_producto === p.id)
                                .reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);

            // VIRTUAL: Físico + En Camino
            const stockVirtual = stockFisico + incomingUA;

            // SOLO sugerimos comprar si, aun con lo que viene en camino, no llegamos al mínimo
            if (stockVirtual <= regla.stock_minimo_ua) {
                // Sugerimos pedir para llegar al Ideal.
                const sugeridoUA = regla.stock_ideal_ua > 0 ? (regla.stock_ideal_ua - stockVirtual) : (regla.stock_minimo_ua - stockVirtual + 1); 
                const sugeridoUC = p.cant_en_ua_de_uc > 0 ? (sugeridoUA / p.cant_en_ua_de_uc).toFixed(2) : sugeridoUA;
                const abrevUA = p.id_unidad_almacenamiento?.abreviatura || 'UA';
                const abrevUC = p.id_unidad_compra?.abreviatura || 'UC';
                const precioRef = p.ultimo_costo_uc || 0;

                const estaEnCarrito = window.carritoPedidos.some(item => item.idProd === p.id && item.idSuc === suc.id);
                const displayStyle = estaEnCarrito ? 'style="display: none;"' : '';
                const txtEnCamino = incomingUA > 0 ? `<br><span class="text-[9px] text-blue-500 font-bold uppercase">+ ${incomingUA.toFixed(2)} en camino</span>` : '';

                const paramsParaBoton = `'${suc.id}', '${suc.nombre}', '${p.id}', '${p.nombre.replace(/'/g, "\\'")}', ${sugeridoUC}, '${abrevUC}', ${precioRef}`;

                htmlFilasSucursal += `
                <tr id="fila-sug-${suc.id}-${p.id}" ${displayStyle} class="hover:bg-orange-50 transition-colors border-b border-orange-100">
                    <td class="px-4 py-3 font-bold text-slate-700 text-sm">${p.nombre}</td>
                    <td class="px-4 py-3 text-center leading-tight">
                        <span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-xs">${stockFisico.toFixed(2)} ${abrevUA}</span>
                        ${txtEnCamino}
                    </td>
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
                            <tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-center">Stock Físico Real</th><th class="px-4 py-2 text-center">Sugerido Pedir</th><th class="px-4 py-2 text-left w-48">Elegir Proveedor</th><th class="px-4 py-2 text-center">Últ. Precio Ref.</th><th class="px-4 py-2 text-right">Acción</th></tr>
                        </thead>
                        <tbody class="divide-y divide-orange-50 bg-white">${htmlFilasSucursal}</tbody>
                    </table>
                </div>
            </div>`;
        }
    });
    
    const containerAlertas = document.getElementById('lista-alertas-compras');
    if(containerAlertas) containerAlertas.innerHTML = htmlGlobal || '<div class="p-8 text-center bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-bold text-lg">🟢 Excelente. Todas las sucursales tienen stock (o pedidos en camino) suficientes.</div>';

    window.renderizarBandejaPedidos(); 
}

window.abrirModalHistorialPrecios = async function(idProd, nombreProd) {
    document.getElementById('hp-producto-nombre').innerText = nombreProd;
    document.getElementById('modal-historial-precios').classList.remove('hidden');
    const tbody = document.getElementById('lista-historial-precios');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500">Buscando facturas... 🕵️‍♀️</td></tr>';
    const { data: historial } = await clienteSupabase.from('compras_detalles').select(`precio_unitario_uc, compras!inner(fecha_compra, proveedores(nombre))`).eq('id_producto', idProd).order('compras(fecha_compra)', { ascending: false }).limit(10);
    if(!historial || historial.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-400 italic">No hay compras registradas.</td></tr>'; return; }
    tbody.innerHTML = historial.map(h => `<tr class="hover:bg-slate-50"><td class="px-4 py-2 text-slate-500">${h.compras.fecha_compra}</td><td class="px-4 py-2 font-bold text-slate-700">${h.compras.proveedores?.nombre || 'Desconocido'}</td><td class="px-4 py-2 text-right font-mono font-bold text-emerald-700">$${h.precio_unitario_uc}</td></tr>`).join('');
}

window.agregarPedidoAlCarrito = function(idSuc, nombreSuc, idProd, nombreProd, cantUC, abrevUC, precioRef, idProv) {
    if(!idProv) return alert("❌ Por favor, selecciona un proveedor en la lista antes de añadir al pedido.");
    const nombreProv = window.proveedoresGlobal.find(p => p.id === idProv)?.nombre || 'Desconocido';
    const existente = window.carritoPedidos.find(item => item.idProd === idProd && item.idSuc === idSuc && item.idProv === idProv);
    if (existente) existente.cantUC += Number(cantUC);
    else window.carritoPedidos.push({ idSuc, nombreSuc, idProd, nombreProd, cantUC: Number(cantUC), abrevUC, precioRef, idProv, nombreProv });
    window.renderizarBandejaPedidos();
    const fila = document.getElementById(`fila-sug-${idSuc}-${idProd}`);
    if(fila) fila.style.display = 'none';
}

window.quitarDelCarrito = function(idSuc, idProd, idProv) {
    window.carritoPedidos = window.carritoPedidos.filter(i => !(i.idSuc === idSuc && i.idProd === idProd && i.idProv === idProv));
    window.renderizarBandejaPedidos();
    const fila = document.getElementById(`fila-sug-${idSuc}-${idProd}`);
    if(fila) fila.style.display = '';
}

window.renderizarBandejaPedidos = function() {
    const contenedor = document.getElementById('contenedor-bandeja');
    const lista = document.getElementById('lista-carritos-proveedor');
    if (window.carritoPedidos.length === 0) { contenedor.classList.add('hidden'); lista.innerHTML = ''; return; }
    contenedor.classList.remove('hidden');

    const agrupadoPorProveedor = {};
    window.carritoPedidos.forEach(item => {
        if(!agrupadoPorProveedor[item.idProv]) agrupadoPorProveedor[item.idProv] = { nombreProv: item.nombreProv, items: [] };
        agrupadoPorProveedor[item.idProv].items.push(item);
    });

    let html = '';
    for (const [idProv, data] of Object.entries(agrupadoPorProveedor)) {
        let totalEstimado = 0;
        const filasHTML = data.items.map(item => {
            totalEstimado += (item.cantUC * item.precioRef);
            return `
            <tr class="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2 font-bold text-slate-800 text-sm">🏢 ${item.nombreSuc}</td>
                <td class="px-4 py-2 font-medium text-sm">${item.nombreProd}</td>
                <td class="px-4 py-2 text-center font-bold">${item.cantUC} <span class="text-xs text-slate-500">${item.abrevUC}</span></td>
                <td class="px-4 py-2 text-right text-slate-500 font-mono text-sm">$${item.precioRef}</td>
                <td class="px-2 py-2 text-center"><button onclick="quitarDelCarrito('${item.idSuc}', '${item.idProd}', '${idProv}')" class="text-red-400 hover:text-red-600 text-lg transition-transform hover:scale-110" title="Quitar de la bandeja">❌</button></td>
            </tr>`;
        }).join('');

        html += `
        <div class="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden p-1">
            <div class="bg-slate-800 text-white px-4 py-3 flex justify-between items-center rounded-t-md">
                <h4 class="font-bold text-lg">🚚 Para: ${data.nombreProv}</h4>
                <span class="text-sm font-medium bg-slate-700 px-3 py-1 rounded border border-slate-600">Total est: $${totalEstimado.toFixed(2)}</span>
            </div>
            <div class="p-4 bg-slate-50">
                <table class="min-w-full text-left mb-4 border border-slate-200 rounded-md overflow-hidden">
                    <thead class="bg-slate-200 text-xs uppercase text-slate-600">
                        <tr><th class="px-4 py-2">Sucursal de Envío</th><th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-center">Cantidad</th><th class="px-4 py-2 text-right">Precio Ref.</th><th class="px-2 py-2"></th></tr>
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

    const totalEstimado = itemsDelProveedor.reduce((sum, item) => sum + (item.cantUC * item.precioRef), 0);

    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ 
        id_empresa: window.miEmpresaId, id_proveedor: idProv, total_compra: totalEstimado, estado: 'En Tránsito' 
    }]).select('id').single();

    if(cabecera) {
        const detallesAInsertar = itemsDelProveedor.map(item => ({
            id_compra: cabecera.id,
            id_producto: item.idProd,
            id_sucursal_destino: item.idSuc, // AHORA CADA LÍNEA SABE A QUÉ SUCURSAL VA
            cantidad_uc: item.cantUC,
            precio_unitario_uc: item.precioRef,
            subtotal: item.cantUC * item.precioRef,
            estado: 'En Tránsito'
        }));
        await clienteSupabase.from('compras_detalles').insert(detallesAInsertar);
    }

    window.carritoPedidos = window.carritoPedidos.filter(i => i.idProv !== idProv);
    window.renderizarBandejaPedidos();
    window.cargarPedidosPlanificados(); // Al recargar, como ya están en tránsito, desaparecerán de las alertas.
    alert("✅ Pedido generado y enviado a Tránsito exitosamente.");
}

// ==========================================
// --- SECCIÓN 2: EN TRÁNSITO Y RECEPCIÓN MASIVA ---
// ==========================================
window.recepcionActivaSuc = null;
window.recepcionActivaProv = null;

// 1. Mostrar Cuadrícula de Sucursales
window.cargarPedidosEnTransito = async function() {
    document.getElementById('transito-vista-sucursales').classList.remove('hidden');
    document.getElementById('transito-vista-detalle').classList.add('hidden');

    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    const grid = document.getElementById('grid-sucursales-transito');
    
    grid.innerHTML = (sucursales||[]).map(s => `
        <button onclick="abrirTransitoSucursal('${s.id}', '${s.nombre}')" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all text-left flex flex-col items-start gap-4 cursor-pointer outline-none">
            <span class="text-5xl">🏢</span>
            <div>
                <span class="block font-bold text-xl text-slate-800">${s.nombre}</span>
                <span class="text-sm text-blue-600 font-medium mt-1">Ver camiones en camino →</span>
            </div>
        </button>
    `).join('');
}

window.volverGridTransito = function() {
    window.cargarPedidosEnTransito();
}

// 2. Mostrar Tarjetas por Proveedor en la Sucursal
window.abrirTransitoSucursal = async function(idSuc, nombreSuc) {
    document.getElementById('transito-titulo-sucursal').innerText = `🚚 En Camino a: ${nombreSuc}`;
    document.getElementById('transito-vista-sucursales').classList.add('hidden');
    document.getElementById('transito-vista-detalle').classList.remove('hidden');

    const lista = document.getElementById('lista-transito-proveedores');
    lista.innerHTML = '<p class="text-slate-500 font-bold py-8">⏳ Buscando camiones...</p>';

    // Buscamos todo lo que viene a esta sucursal
    const { data: transito } = await clienteSupabase.from('compras_detalles')
        .select(`id, id_producto, cantidad_uc, compras!inner(id_proveedor, proveedores(nombre))`)
        .eq('id_sucursal_destino', idSuc)
        .in('estado', ['En Tránsito', 'Postpuesto']);

    if(!transito || transito.length === 0) {
        lista.innerHTML = '<div class="p-8 text-center bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-bold">Todo está al día. No hay pedidos en tránsito para esta sucursal.</div>';
        return;
    }

    // Agrupar por proveedor
    const agrupado = {};
    transito.forEach(t => {
        const idProv = t.compras.id_proveedor;
        const nombreProv = t.compras.proveedores?.nombre || 'General';
        if(!agrupado[idProv]) agrupado[idProv] = { nombre: nombreProv, items: 0 };
        agrupado[idProv].items++;
    });

    lista.innerHTML = Object.keys(agrupado).map(idProv => `
        <div class="bg-white rounded-lg border border-blue-200 p-6 flex justify-between items-center shadow-sm">
            <div>
                <h4 class="font-bold text-xl text-slate-800">📦 Pedido de: ${agrupado[idProv].nombre}</h4>
                <p class="text-slate-500 text-sm mt-1">${agrupado[idProv].items} productos esperando recepción.</p>
            </div>
            <button onclick="abrirModalRecepcionMasiva('${idSuc}', '${nombreSuc}', '${idProv}', '${agrupado[idProv].nombre}')" class="px-6 py-3 bg-blue-600 text-white rounded-md font-bold shadow hover:bg-blue-700 transition-transform hover:scale-105">✅ Recepción de Pedido</button>
        </div>
    `).join('');
}

// 3. Abrir el Súper Modal de Recepción
window.abrirModalRecepcionMasiva = async function(idSuc, nombreSuc, idProv, nombreProv) {
    window.recepcionActivaSuc = idSuc;
    window.recepcionActivaProv = idProv;

    document.getElementById('rm-sucursal').innerText = nombreSuc;
    document.getElementById('rm-proveedor').innerText = nombreProv;
    document.getElementById('rm-fecha-hoy').innerText = new Date().toLocaleDateString();

    const { data: ubicaciones } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSuc);
    const optsUbi = '<option value="">-- General (Sin ubicación) --</option>' + (ubicaciones||[]).map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');

    const { data: detalles } = await clienteSupabase.from('compras_detalles')
        .select('id, cantidad_uc, precio_unitario_uc, id_producto, estado, motivo_no_recepcion, productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura)), compras!inner(id, id_proveedor)')
        .eq('id_sucursal_destino', idSuc)
        .eq('compras.id_proveedor', idProv)
        .in('estado', ['En Tránsito', 'Postpuesto']);

    const tbody = document.getElementById('rm-filas');
    tbody.innerHTML = detalles.map(d => {
        const abrev = d.productos?.id_unidad_compra?.abreviatura || 'UC';
        const isPostpuesto = d.estado === 'Postpuesto';
        const labelPost = isPostpuesto ? `<span class="block mt-1 text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded w-max">Estaba Postpuesto</span>` : '';

        return `
        <tr class="fila-recepcion border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id-detalle="${d.id}" data-id-prod="${d.id_producto}" data-factor="${d.productos?.cant_en_ua_de_uc || 1}" data-precio-uc="${d.precio_unitario_uc}">
            <td class="px-4 py-3 font-bold text-slate-700 text-sm">
                ${d.productos?.nombre}
                ${labelPost}
            </td>
            <td class="px-4 py-3 text-center font-mono font-bold text-blue-700 bg-blue-50/50">${d.cantidad_uc} <span class="text-xs text-slate-400">${abrev}</span></td>
            <td class="px-4 py-3">
                <select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 select-estado-rec" onchange="cambiarEstadoFilaRecepcion(this, '${d.id}')">
                    <option value="" disabled selected>👉 Selecciona Estado...</option>
                    <option value="Recibido">🟢 Sí, Recibido</option>
                    <option value="Postpuesto">🟡 Postpuesto (No llegó hoy)</option>
                    <option value="No Recibido">🔴 No Recibido (Rechazado/Falta)</option>
                </select>
            </td>
            <td class="px-4 py-3">
                <div id="zona-recibido-${d.id}" class="zona-dinamica hidden space-y-2 bg-emerald-50 p-2 rounded border border-emerald-100">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-emerald-700 font-bold w-24">Cant. Real Llegó:</span>
                        <input type="number" step="0.01" value="${d.cantidad_uc}" class="w-24 px-2 py-1 border rounded text-sm font-bold text-center input-cant-real outline-none focus:ring-1 focus:ring-emerald-500">
                        <span class="text-xs font-bold text-emerald-600">${abrev}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-emerald-700 font-bold w-24">Guardar en:</span>
                        <select class="flex-1 px-2 py-1 border rounded text-xs select-ubi-rec bg-white outline-none focus:ring-1 focus:ring-emerald-500">
                            ${optsUbi}
                        </select>
                    </div>
                </div>
                <div id="zona-no-recibido-${d.id}" class="zona-dinamica hidden bg-red-50 p-2 rounded border border-red-100">
                    <input type="text" placeholder="Escribe el motivo (Ej: Venía roto, No traía)..." value="${d.motivo_no_recepcion || ''}" class="w-full px-2 py-2 border border-red-300 rounded bg-white text-sm outline-none focus:ring-1 focus:ring-red-500 input-motivo-rec">
                </div>
            </td>
        </tr>
        `;
    }).join('');

    document.getElementById('modal-recepcion-masiva').classList.remove('hidden');
}

window.cambiarEstadoFilaRecepcion = function(selectTag, idFila) {
    const zonaRec = document.getElementById(`zona-recibido-${idFila}`);
    const zonaNoRec = document.getElementById(`zona-no-recibido-${idFila}`);
    
    // Resetear colores del select para feedback visual
    selectTag.className = "w-full px-2 py-2 border rounded text-sm font-bold outline-none focus:ring-2 select-estado-rec text-white";
    
    if (selectTag.value === 'Recibido') {
        zonaRec.classList.remove('hidden'); zonaNoRec.classList.add('hidden');
        selectTag.classList.add('bg-emerald-600', 'border-emerald-600');
    } else if (selectTag.value === 'No Recibido') {
        zonaRec.classList.add('hidden'); zonaNoRec.classList.remove('hidden');
        selectTag.classList.add('bg-red-600', 'border-red-600');
    } else {
        zonaRec.classList.add('hidden'); zonaNoRec.classList.add('hidden');
        selectTag.classList.add('bg-yellow-500', 'border-yellow-500');
    }
}

// 4. Guardar la Recepción en la BD
window.guardarRecepcionMasiva = async function() {
    const filas = document.querySelectorAll('.fila-recepcion');
    
    // Validar que todas las filas tengan un estado seleccionado
    for (const fila of filas) {
        if(!fila.querySelector('.select-estado-rec').value) {
            return alert("❌ Debes seleccionar un estado (Recibido, Postpuesto o No Recibido) para todos los productos de la lista.");
        }
        if(fila.querySelector('.select-estado-rec').value === 'No Recibido' && fila.querySelector('.input-motivo-rec').value.trim() === '') {
            return alert("❌ Debes escribir un motivo para los productos marcados como 'No Recibido'.");
        }
    }

    const btn = document.getElementById('btn-guardar-recepcion');
    btn.innerText = "⏳ Guardando Inventario..."; btn.disabled = true;
    
    for (const fila of filas) {
        const idDetalle = fila.getAttribute('data-id-detalle');
        const idProd = fila.getAttribute('data-id-prod');
        const factorConversion = parseFloat(fila.getAttribute('data-factor'));
        const precioUC = parseFloat(fila.getAttribute('data-precio-uc'));
        const estado = fila.querySelector('.select-estado-rec').value;

        if (estado === 'Recibido') {
            const cantUC = parseFloat(fila.querySelector('.input-cant-real').value);
            const idUbi = fila.querySelector('.select-ubi-rec').value || null;
            const cantUA = cantUC * factorConversion;

            await clienteSupabase.from('compras_detalles').update({estado: 'Recibido'}).eq('id', idDetalle);

            let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', window.recepcionActivaSuc);
            if(idUbi) query = query.eq('id_ubicacion', idUbi); else query = query.is('id_ubicacion', null);
            
            const { data: previo } = await query.maybeSingle();
            if (previo) {
                await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA, ultima_actualizacion: new Date() }).eq('id', previo.id);
            } else {
                await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: window.recepcionActivaSuc, id_ubicacion: idUbi, cantidad_actual_ua: cantUA }]);
            }

            await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, tipo_movimiento: 'INGRESO_COMPRA', cantidad_movida: cantUA, costo_unitario_movimiento: precioUC, referencia: 'Recepción Masiva de Proveedor' }]);
            await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);

        } else if (estado === 'No Recibido') {
            const motivo = fila.querySelector('.input-motivo-rec').value;
            // Al marcarlo como No Recibido, la consulta de "Stock Virtual" dejará de sumarlo, y volverá a salir la alerta en Sugerencias.
            await clienteSupabase.from('compras_detalles').update({estado: 'No Recibido', motivo_no_recepcion: motivo}).eq('id', idDetalle);
        } else {
            // Postpuesto: Se queda en tránsito y sigue sumando al Stock Virtual.
            await clienteSupabase.from('compras_detalles').update({estado: 'Postpuesto'}).eq('id', idDetalle);
        }
    }

    btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
    document.getElementById('modal-recepcion-masiva').classList.add('hidden');
    window.abrirTransitoSucursal(window.recepcionActivaSuc, document.getElementById('rm-sucursal').innerText); // Recarga la vista
}

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
    await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: idProd, cantidad_uc: cantUC, precio_unitario_uc: precioUC, subtotal: costoTotal, estado: 'Recibido' }]);

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

window.seleccionarProductoCSV = function(index, idProd, nombreProd) {
    document.getElementById(`hidden-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-prod-${index}`);
    searchInput.value = nombreProd;
    searchInput.classList.remove('border-red-300');
    searchInput.classList.add('border-slate-300');
    document.getElementById(`dropdown-${index}`).classList.add('hidden');
    window.quitarRojoFila(index);
}

window.crearNuevoProductoCSV = function(index) {
    document.getElementById(`dropdown-${index}`).classList.add('hidden');
    const item = window.datosCSVAgrupados[index];
    const nombreSugerido = item.variante_pos ? `${item.nombre_pos} ${item.variante_pos}` : item.nombre_pos;

    window.selectCSVActivoIndex = index; 
    window.abrirModalProducto(false, nombreSugerido);
}

window.actualizarSelectsMapeoCSV = async function(nuevoIdProducto) {
    const { data: prodsERP } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosERPGlobal = prodsERP || [];

    if (window.selectCSVActivoIndex !== null && nuevoIdProducto) {
        const nuevoProd = window.productosERPGlobal.find(p => p.id === nuevoIdProducto);
        if(nuevoProd) window.seleccionarProductoCSV(window.selectCSVActivoIndex, nuevoProd.id, nuevoProd.nombre);
        window.selectCSVActivoIndex = null; 
    }
}

window.quitarRojoFila = function(index) {
    const fila = document.getElementById(`fila-csv-${index}`);
    if(fila) fila.classList.remove('bg-red-50', 'border-l-4', 'border-red-500');
}

window.cancelarCSV = function() {
    document.getElementById('panel-mapeo-csv').classList.add('hidden');
    document.getElementById('csv-file').value = '';
    document.getElementById('csv-fecha-inicio').value = '';
    document.getElementById('csv-fecha-fin').value = '';
    window.datosCSVAgrupados = [];
}

window.confirmarDescuentoVentas = async function() {
    const idSucursal = document.getElementById('csv-sucursal').value;
    const fInicio = document.getElementById('csv-fecha-inicio').value;
    const fFin = document.getElementById('csv-fecha-fin').value;
    const periodoReferencia = `[Período: ${fInicio} al ${fFin}]`;

    const selects = document.querySelectorAll('.selector-homologacion');
    
    let todoAsociado = true;
    selects.forEach(sel => { if(!sel.value) todoAsociado = false; });
    if(!todoAsociado) return alert("❌ Debes asociar todos los productos del POS con tus productos del sistema (que no quede ninguno en rojo) antes de continuar.");

    const btn = document.getElementById('btn-procesar-ventas');
    btn.innerText = "⏳ Procesando y descontando..."; btn.disabled = true;

    const { data: catalogoCompleto } = await clienteSupabase.from('productos').select('id, tiene_receta, cant_en_um_de_ua, cant_en_ur_de_um').eq('id_empresa', window.miEmpresaId);

    for (const sel of selects) {
        const index = sel.getAttribute('data-index');
        const itemPOS = window.datosCSVAgrupados[index];
        const idProductoERP = sel.value;
        const cantidadVendida = itemPOS.cantidad;

        const { data: existeH } = await clienteSupabase.from('homologacion_pos').select('id').eq('id_empresa', window.miEmpresaId).eq('nombre_pos', itemPOS.nombre_pos).eq('variante_pos', itemPOS.variante_pos).maybeSingle();
        if(existeH) await clienteSupabase.from('homologacion_pos').update({ id_producto_erp: idProductoERP }).eq('id', existeH.id);
        else await clienteSupabase.from('homologacion_pos').insert([{ id_empresa: window.miEmpresaId, nombre_pos: itemPOS.nombre_pos, variante_pos: itemPOS.variante_pos, id_producto_erp: idProductoERP }]);

        const prodERP = catalogoCompleto.find(p => p.id === idProductoERP);

        if (prodERP.tiene_receta) {
            const { data: ingredientes } = await clienteSupabase.from('recetas').select('cantidad_neta, id_ingrediente(id, cant_en_um_de_ua, cant_en_ur_de_um)').eq('id_producto_padre', idProductoERP);
            
            for (const ing of (ingredientes||[])) {
                const infoInsumo = ing.id_ingrediente;
                const factorUM = infoInsumo.cant_en_um_de_ua || 1;
                const factorUR = infoInsumo.cant_en_ur_de_um || 1;
                const ua_a_descontar = (cantidadVendida * ing.cantidad_neta) / (factorUM * factorUR);
                
                await aplicarDescuentoInventario(infoInsumo.id, idSucursal, ua_a_descontar, `Venta POS (Receta de ${itemPOS.nombre_pos}) ${periodoReferencia}`);
            }
        } else {
            const factorUM = prodERP.cant_en_um_de_ua || 1;
            const ua_a_descontar = cantidadVendida / factorUM;
            await aplicarDescuentoInventario(idProductoERP, idSucursal, ua_a_descontar, `Venta POS Directa (${itemPOS.nombre_pos}) ${periodoReferencia}`);
        }
    }

    alert("✅ ¡Ventas importadas y stock descontado con éxito!");
    btn.innerText = "✅ Confirmar y Descontar Inventario"; btn.disabled = false;
    cancelarCSV();
}

async function aplicarDescuentoInventario(idProd, idSuc, cantidad_ua_descontar, referencia) {
    if(cantidad_ua_descontar <= 0) return;

    const { data: saldos } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).order('cantidad_actual_ua', { ascending: false });

    if(saldos && saldos.length > 0) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: saldos[0].cantidad_actual_ua - cantidad_ua_descontar, ultima_actualizacion: new Date() }).eq('id', saldos[0].id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: -cantidad_ua_descontar }]);
    }

    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: 'VENTA_POS', cantidad_movida: -cantidad_ua_descontar, referencia: referencia }]);
}
