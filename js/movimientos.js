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
    if(tab === 'compras') { window.cargarSelectsMovimientosFormularios(); window.cargarLogsMovimientos('COMPRA_DIRECTA'); }
    if(tab === 'ventas') { window.prepararPanelVentas(); window.cargarLogsVentasPOS(); }
    if(tab === 'otros') { window.cargarSelectsMovimientosFormularios(); window.cargarLogsMovimientos('OTROS'); }
}

window.cambiarSubTabPedidos = function(subtab) {
    const btnS = document.getElementById('subtab-sugerencias');
    const btnT = document.getElementById('subtab-transito');
    const btnP = document.getElementById('subtab-produccion');
    const btnH = document.getElementById('subtab-historial');
    const divS = document.getElementById('subvista-sugerencias');
    const divT = document.getElementById('subvista-transito');
    const divH = document.getElementById('subvista-historial');

    [btnS, btnT, btnP, btnH].forEach(b => { if(b) b.className = 'px-4 py-2 rounded-md font-bold text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer outline-none whitespace-nowrap'; });
    [divS, divT, divH].forEach(d => { if(d) d.classList.add('hidden'); });

    // Actualizamos el texto del botón por si venía con el nombre viejo
    if(btnP) btnP.innerText = "Órdenes de Producción";

    if(subtab === 'sugerencias') {
        if(btnS) btnS.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-emerald-700 outline-none whitespace-nowrap';
        if(divS) divS.classList.remove('hidden'); window.cargarPedidosPlanificados();
    } else if(subtab === 'transito') {
        if(btnT) btnT.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-blue-700 outline-none whitespace-nowrap';
        if(divT) divT.classList.remove('hidden'); 
        const titulo = document.getElementById('transito-titulo-seccion');
        if(titulo) titulo.innerHTML = "🚚 Selecciona tu Sucursal para ver las <span class='text-blue-600'>Recepciones Pendientes</span>";
        window.cargarPedidosEnTransito('Externo');
    } else if(subtab === 'produccion') {
        if(btnP) btnP.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-purple-700 outline-none whitespace-nowrap';
        if(divT) divT.classList.remove('hidden'); 
        const titulo = document.getElementById('transito-titulo-seccion');
        if(titulo) titulo.innerHTML = "🏭 Selecciona tu Sucursal para ver las <span class='text-purple-600'>Órdenes de Producción</span>";
        window.cargarPedidosEnTransito('Interno');
    } else if(subtab === 'historial') {
        if(btnH) btnH.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-slate-800 outline-none whitespace-nowrap';
        if(divH) divH.classList.remove('hidden'); window.cargarHistorialOrdenes();
}

// ==========================================
// --- SECCIÓN 1: PEDIDOS SUGERIDOS Y LOCALSTORAGE ---
// ==========================================
window.carritoPedidos = []; 
window.proveedoresGlobal = []; 

// Función de Memoria (Guarda silenciosamente en el navegador)
window.guardarCarritoEnMemoria = function() {
    localStorage.setItem('carrito_pedidos_' + window.miEmpresaId, JSON.stringify(window.carritoPedidos));
    if(window.actualizarBadgeCarrito) window.actualizarBadgeCarrito();
}

window.cargarPedidosPlanificados = async function() {
    // 1. Cargar el carrito desde la memoria al entrar
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    if(guardado) {
        window.carritoPedidos = JSON.parse(guardado);
        if(window.actualizarBadgeCarrito) window.actualizarBadgeCarrito();
    } else {
        window.carritoPedidos = [];
    }

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

            const stockFisico = saldos.filter(s => s.id_sucursal === suc.id && s.id_producto === p.id).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
            const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === suc.id && t.id_producto === p.id)
                                .reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);

            const stockVirtual = stockFisico + incomingUA;

            if (stockVirtual <= regla.stock_minimo_ua) {
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
                    <td class="px-4 py-3 text-center text-orange-800 font-bold text-sm">${sugeridoUA.toFixed(2)} ${abrevUA} <br><span class="text-[10px] text-orange-500 font-normal uppercase">Pedir sugerido: ${sugeridoUC} ${abrevUC}</span></td>
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
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500">Buscando precios... 🕵️‍♀️</td></tr>';

    const { data: historialCompras } = await clienteSupabase.from('compras_detalles')
        .select(`precio_unitario_uc, compras!inner(fecha_compra, proveedores(nombre))`)
        .eq('id_producto', idProd).order('compras(fecha_compra)', { ascending: false }).limit(10);

    const { data: historialRef } = await clienteSupabase.from('proveedor_precios')
        .select(`precio_referencia, fecha_actualizacion, proveedores(nombre)`).eq('id_producto', idProd);

    let datosCombinados = [];
    if (historialCompras) historialCompras.forEach(h => datosCombinados.push({ fecha: new Date(h.compras.fecha_compra), proveedor: h.compras.proveedores?.nombre || 'Desconocido', precio: h.precio_unitario_uc, tipo: '✅ Compra Real', colorBadge: 'bg-blue-100 text-blue-700' }));
    if (historialRef) historialRef.forEach(r => datosCombinados.push({ fecha: new Date(r.fecha_actualizacion), proveedor: r.proveedores?.nombre || 'Desconocido', precio: r.precio_referencia, tipo: '📌 Ref. Catálogo', colorBadge: 'bg-emerald-100 text-emerald-700' }));
    datosCombinados.sort((a, b) => b.fecha - a.fecha);

    if (datosCombinados.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-slate-400 italic">No hay precios registrados ni compras previas para este producto.</td></tr>'; return; }
    tbody.innerHTML = datosCombinados.map(d => {
        const fechaStr = d.fecha.toISOString().split('T')[0];
        return `<tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
            <td class="px-4 py-3 text-slate-500 text-sm font-medium">${fechaStr}</td>
            <td class="px-4 py-3"><span class="font-bold text-slate-700 block">${d.proveedor}</span><span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-1 inline-block ${d.colorBadge}">${d.tipo}</span></td>
            <td class="px-4 py-3 text-right font-mono font-black text-slate-800 text-lg">$${d.precio}</td>
        </tr>`;
    }).join('');
}

window.agregarPedidoAlCarrito = function(idSuc, nombreSuc, idProd, nombreProd, cantUC, abrevUC, precioRef, idProv) {
    if(!idProv) return alert("❌ Por favor, selecciona un proveedor en la lista antes de añadir al pedido.");
    const nombreProv = window.proveedoresGlobal.find(p => p.id === idProv)?.nombre || 'Desconocido';
    const existente = window.carritoPedidos.find(item => item.idProd === idProd && item.idSuc === idSuc && item.idProv === idProv);
    if (existente) existente.cantUC += Number(cantUC);
    else window.carritoPedidos.push({ idSuc, nombreSuc, idProd, nombreProd, cantUC: Number(cantUC), abrevUC, precioRef, idProv, nombreProv });
    
    // GUARDAR EN MEMORIA CADA VEZ QUE AGREGA ALGO
    window.guardarCarritoEnMemoria();
    
    window.renderizarBandejaPedidos();
    const fila = document.getElementById(`fila-sug-${idSuc}-${idProd}`);
    if(fila) fila.style.display = 'none';
}

window.quitarDelCarrito = function(idSuc, idProd, idProv) {
    window.carritoPedidos = window.carritoPedidos.filter(i => !(i.idSuc === idSuc && i.idProd === idProd && i.idProv === idProv));
    
    // ACTUALIZAR MEMORIA AL QUITAR
    window.guardarCarritoEnMemoria();

    window.renderizarBandejaPedidos();
    const fila = document.getElementById(`fila-sug-${idSuc}-${idProd}`);
    if(fila) fila.style.display = '';
}

window.actualizarCantCarrito = function(idSuc, idProd, idProv, nuevaCant) {
    const item = window.carritoPedidos.find(i => i.idSuc === idSuc && i.idProd === idProd && i.idProv === idProv);
    if (item) {
        item.cantUC = parseFloat(nuevaCant) || 0;
        
        // ACTUALIZAR MEMORIA AL EDITAR LA CANTIDAD
        window.guardarCarritoEnMemoria();

        let totalEstimado = 0;
        window.carritoPedidos.filter(i => i.idProv === idProv).forEach(i => { totalEstimado += (i.cantUC * i.precioRef); });
        const spanTotal = document.getElementById(`total-est-${idProv}`);
        if(spanTotal) spanTotal.innerText = `Total est: $${totalEstimado.toFixed(2)}`;
    }
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
                <td class="px-4 py-2 font-bold text-slate-800 text-sm w-48">🏢 ${item.nombreSuc}</td>
                <td class="px-4 py-2 font-medium text-sm">${item.nombreProd}</td>
                <td class="px-4 py-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <input type="number" step="0.01" value="${item.cantUC}" onchange="actualizarCantCarrito('${item.idSuc}', '${item.idProd}', '${idProv}', this.value)" class="w-20 px-2 py-1 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-blue-700">
                        <span class="text-xs text-slate-500 font-bold">${item.abrevUC}</span>
                    </div>
                </td>
                <td class="px-4 py-2 text-right text-slate-500 font-mono text-sm w-32">$${item.precioRef}</td>
                <td class="px-2 py-2 text-center w-16"><button onclick="quitarDelCarrito('${item.idSuc}', '${item.idProd}', '${idProv}')" class="text-red-400 hover:text-red-600 text-lg transition-transform hover:scale-110" title="Quitar de la bandeja">❌</button></td>
            </tr>`;
        }).join('');

        html += `
        <div class="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden p-1 mb-4">
            <div class="bg-slate-800 text-white px-4 py-3 flex justify-between items-center rounded-t-md">
                <h4 class="font-bold text-lg">📝 Para: ${data.nombreProv}</h4>
                <span id="total-est-${idProv}" class="text-sm font-medium bg-slate-700 px-3 py-1 rounded border border-slate-600">Total est: $${totalEstimado.toFixed(2)}</span>
            </div>
            <div class="p-4 bg-slate-50 overflow-x-auto">
                <table class="min-w-full text-left mb-4 border border-slate-200 rounded-md overflow-hidden">
                    <thead class="bg-slate-200 text-xs uppercase text-slate-600">
                        <tr><th class="px-4 py-2">Destino</th><th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-center">Cantidad a Pedir</th><th class="px-4 py-2 text-right">Precio Ref.</th><th class="px-2 py-2"></th></tr>
                    </thead>
                    <tbody>${filasHTML}</tbody>
                </table>
                <div class="flex justify-end">
                    <button onclick="generarPedidoTransitoMasivo('${idProv}')" class="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700 transition-transform hover:scale-105">🚀 Pedido Generado</button>
                </div>
            </div>
        </div>`;
    }
    lista.innerHTML = html;
}

window.generarPedidoTransitoMasivo = async function(idProv) {
    const itemsDelProveedor = window.carritoPedidos.filter(i => i.idProv === idProv);
    if(itemsDelProveedor.length === 0) return;

    let tieneError = false;
    itemsDelProveedor.forEach(i => { if(i.cantUC <= 0) tieneError = true; });
    if(tieneError) return alert("❌ Tienes productos con cantidad 0 en la bandeja. Elimínalos o ponles una cantidad válida.");

    const totalEstimado = itemsDelProveedor.reduce((sum, item) => sum + (item.cantUC * item.precioRef), 0);

    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ 
        id_empresa: window.miEmpresaId, id_proveedor: idProv, total_compra: totalEstimado, estado: 'En Tránsito' 
    }]).select('id').single();

    if(cabecera) {
        const detallesAInsertar = itemsDelProveedor.map(item => ({
            id_compra: cabecera.id, id_producto: item.idProd, id_sucursal_destino: item.idSuc, 
            cantidad_uc: item.cantUC, precio_unitario_uc: item.precioRef, subtotal: item.cantUC * item.precioRef, estado: 'En Tránsito'
        }));
        await clienteSupabase.from('compras_detalles').insert(detallesAInsertar);
    }

    // LIMPIAR MEMORIA TRAS COMPLETAR
    window.carritoPedidos = window.carritoPedidos.filter(i => i.idProv !== idProv);
    window.guardarCarritoEnMemoria();
    
    window.renderizarBandejaPedidos();
    window.cargarPedidosPlanificados(); 
    alert("✅ Pedido/Orden generada exitosamente. Revisa las pestañas de Tránsito o Producción.");
}

// ==========================================
// --- SECCIÓN 2 y 3: EN TRÁNSITO Y PRODUCCIÓN ---
// ==========================================
window.recepcionActivaSuc = null;
window.recepcionActivaProv = null;
window.tipoVistaTransitoActiva = 'Externo'; // Puede ser 'Externo' (Tránsito) o 'Interno' (Producción)

window.cargarPedidosEnTransito = async function(tipoFiltro = 'Externo') {
    window.tipoVistaTransitoActiva = tipoFiltro;
    document.getElementById('transito-vista-sucursales').classList.remove('hidden');
    document.getElementById('transito-vista-detalle').classList.add('hidden');

    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    const grid = document.getElementById('grid-sucursales-transito');
    
    const isProd = tipoFiltro === 'Interno';
    const icon = isProd ? '🏭' : '🏢';
    const textDesc = isProd ? 'Ver tareas de producción →' : 'Ver camiones en camino →';
    const borderColor = isProd ? 'hover:border-purple-400' : 'hover:border-blue-400';
    const textColor = isProd ? 'text-purple-600' : 'text-blue-600';

    grid.innerHTML = (sucursales||[]).map(s => `
        <button onclick="abrirTransitoSucursal('${s.id}', '${s.nombre}')" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md ${borderColor} transition-all text-left flex flex-col items-start gap-4 cursor-pointer outline-none">
            <span class="text-5xl">${icon}</span>
            <div>
                <span class="block font-bold text-xl text-slate-800">${s.nombre}</span>
                <span class="text-sm ${textColor} font-medium mt-1">${textDesc}</span>
            </div>
        </button>
    `).join('');
}

window.volverGridTransito = function() {
    window.cargarPedidosEnTransito(window.tipoVistaTransitoActiva);
}

window.abrirTransitoSucursal = async function(idSuc, nombreSuc) {
    const isProd = window.tipoVistaTransitoActiva === 'Interno';
    document.getElementById('transito-titulo-sucursal').innerText = isProd ? `🏭 En Producción para: ${nombreSuc}` : `🚚 En Camino a: ${nombreSuc}`;
    document.getElementById('transito-vista-sucursales').classList.add('hidden');
    document.getElementById('transito-vista-detalle').classList.remove('hidden');

    const lista = document.getElementById('lista-transito-proveedores');
    lista.innerHTML = '<p class="text-slate-500 font-bold py-8">⏳ Buscando...</p>';

    const { data: transito } = await clienteSupabase.from('compras_detalles')
        .select(`id, id_producto, cantidad_uc, compras!inner(id_proveedor, proveedores(nombre, tipo))`)
        .eq('id_sucursal_destino', idSuc)
        .in('estado', ['En Tránsito', 'Postpuesto']);

    // Filtramos solo los que corresponden a la vista actual (Interno o Externo)
    const filtrados = (transito||[]).filter(t => (t.compras.proveedores?.tipo || 'Externo') === window.tipoVistaTransitoActiva);

    if(filtrados.length === 0) {
        const bg = isProd ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-blue-50 border-blue-200 text-blue-700';
        lista.innerHTML = `<div class="p-8 text-center border rounded-xl font-bold ${bg}">Todo está al día. No hay pendientes aquí.</div>`;
        return;
    }

    const agrupado = {};
    filtrados.forEach(t => {
        const idProv = t.compras.id_proveedor;
        const nombreProv = t.compras.proveedores?.nombre || 'General';
        if(!agrupado[idProv]) agrupado[idProv] = { nombre: nombreProv, items: 0 };
        agrupado[idProv].items++;
    });

    const borderCard = isProd ? 'border-purple-200' : 'border-blue-200';
    const btnClass = isProd ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';
    const btnText = isProd ? '✅ Registrar Producción' : '✅ Recepción de Pedido';
    const iconBox = isProd ? '🧑‍🍳' : '📦';

    lista.innerHTML = Object.keys(agrupado).map(idProv => `
        <div class="bg-white rounded-lg border ${borderCard} p-6 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
            <div>
                <h4 class="font-bold text-xl text-slate-800">${iconBox} Origen: ${agrupado[idProv].nombre}</h4>
                <p class="text-slate-500 text-sm mt-1">${agrupado[idProv].items} ítems en espera.</p>
            </div>
            <button onclick="abrirModalRecepcionMasiva('${idSuc}', '${nombreSuc}', '${idProv}', '${agrupado[idProv].nombre}')" class="px-6 py-3 ${btnClass} text-white rounded-md font-bold shadow transition-transform hover:scale-105">${btnText}</button>
        </div>
    `).join('');
}

// MODAL INTELIGENTE (Sirve para Tránsito y Producción)
window.abrirModalRecepcionMasiva = async function(idSuc, nombreSuc, idProv, nombreProv) {
    window.recepcionActivaSuc = idSuc;
    window.recepcionActivaProv = idProv;
    const isProd = window.tipoVistaTransitoActiva === 'Interno';

    // Textos dinámicos del Modal
    document.getElementById('rm-titulo-modal').innerText = isProd ? "🏭 Registro de Trabajo / Producción" : "📦 Recepción de Pedido Externo";
    document.getElementById('rm-titulo-estado').innerText = isProd ? "Estado del Trabajo" : "Estado de Recepción";
    
    // UI del modal
    const colorBorde = isProd ? 'border-purple-500' : 'border-blue-500';
    const modalBox = document.getElementById('rm-borde-modal');
    modalBox.classList.remove('border-blue-500', 'border-purple-500');
    modalBox.classList.add(colorBorde);

    document.getElementById('rm-sucursal').innerText = nombreSuc;
    document.getElementById('rm-proveedor').innerText = nombreProv;
    document.getElementById('rm-fecha-hoy').innerText = new Date().toLocaleDateString();

    // Traer info de contacto del proveedor para el botón nuevo
    const { data: provInfo } = await clienteSupabase.from('proveedores').select('whatsapp, correo').eq('id', idProv).single();
    let btnContactHTML = '';
    if(provInfo?.whatsapp) {
        const telf = provInfo.whatsapp.replace(/\D/g,''); // limpia espacios y +
        btnContactHTML = `<a href="https://wa.me/${telf}" target="_blank" class="text-[10px] bg-green-500 text-white px-2 py-1 rounded-full font-bold hover:bg-green-600 transition-colors flex items-center gap-1 shadow-sm">💬 Escribir</a>`;
    } else if (provInfo?.correo) {
        btnContactHTML = `<a href="mailto:${provInfo.correo}" target="_blank" class="text-[10px] bg-blue-500 text-white px-2 py-1 rounded-full font-bold hover:bg-blue-600 transition-colors flex items-center gap-1 shadow-sm">✉️ Correo</a>`;
    }
    document.getElementById('rm-contacto-container').innerHTML = btnContactHTML;

    // Cargar datos
    const { data: ubicaciones } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSuc);
    const optsUbi = '<option value="">-- General (Sin ubicación) --</option>' + (ubicaciones||[]).map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');

    const { data: detalles } = await clienteSupabase.from('compras_detalles')
        .select('id, cantidad_uc, precio_unitario_uc, id_producto, estado, motivo_no_recepcion, productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura)), compras!inner(id, id_proveedor)')
        .eq('id_sucursal_destino', idSuc)
        .eq('compras.id_proveedor', idProv)
        .in('estado', ['En Tránsito', 'Postpuesto']);

    const txtRecibido = isProd ? '🟢 Producido / Finalizado' : '🟢 Sí, Recibido';
    const txtPostpuesto = isProd ? '🟡 En Proceso / Pausado' : '🟡 Postpuesto (No llegó hoy)';
    const txtNoRecibido = isProd ? '🔴 Fallido / Cancelado' : '🔴 No Recibido (Rechazado/Falta)';
    const txtCantReal = isProd ? 'Cant. Producida:' : 'Cant. Real Llegó:';
    const txtMotivo = isProd ? 'Motivo (Ej: Fallo máquina, Falta insumo)...' : 'Motivo (Ej: Roto, No llegó)...';

    const tbody = document.getElementById('rm-filas');
    tbody.innerHTML = detalles.map(d => {
        const abrev = d.productos?.id_unidad_compra?.abreviatura || 'UC';
        const isPostpuesto = d.estado === 'Postpuesto';
        const labelPost = isPostpuesto ? `<span class="block mt-1 text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded w-max">Estaba en espera</span>` : '';
        const colorInputCant = isProd ? 'text-purple-700' : 'text-emerald-700';

        return `
        <tr class="fila-recepcion border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id-detalle="${d.id}" data-id-prod="${d.id_producto}" data-factor="${d.productos?.cant_en_ua_de_uc || 1}" data-precio-uc="${d.precio_unitario_uc}">
            <td class="px-4 py-3 font-bold text-slate-700 text-sm">${d.productos?.nombre} ${labelPost}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-slate-700 bg-slate-100/50">${d.cantidad_uc} <span class="text-xs text-slate-400">${abrev}</span></td>
            <td class="px-4 py-3">
                <select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 select-estado-rec" onchange="cambiarEstadoFilaRecepcion(this, '${d.id}', ${isProd})">
                    <option value="" disabled selected>👉 Selecciona Estado...</option>
                    <option value="Recibido">${txtRecibido}</option>
                    <option value="Postpuesto">${txtPostpuesto}</option>
                    <option value="No Recibido">${txtNoRecibido}</option>
                </select>
            </td>
            <td class="px-4 py-3">
                <div id="zona-recibido-${d.id}" class="zona-dinamica hidden space-y-2 bg-slate-50 p-2 rounded border border-slate-200">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500 font-bold w-24">${txtCantReal}</span>
                        <input type="number" step="0.01" value="${d.cantidad_uc}" class="w-24 px-2 py-1 border rounded text-sm font-bold text-center ${colorInputCant} outline-none focus:ring-1 focus:ring-emerald-500 input-cant-real">
                        <span class="text-xs font-bold text-slate-400">${abrev}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500 font-bold w-24">Guardar en:</span>
                        <select class="flex-1 px-2 py-1 border rounded text-xs select-ubi-rec bg-white outline-none focus:ring-1 focus:ring-emerald-500">${optsUbi}</select>
                    </div>
                </div>
                <div id="zona-no-recibido-${d.id}" class="zona-dinamica hidden bg-red-50 p-2 rounded border border-red-100">
                    <input type="text" placeholder="${txtMotivo}" value="${d.motivo_no_recepcion || ''}" class="w-full px-2 py-2 border border-red-300 rounded bg-white text-sm outline-none focus:ring-1 focus:ring-red-500 input-motivo-rec">
                </div>
            </td>
        </tr>
        `;
    }).join('');

    document.getElementById('modal-recepcion-masiva').classList.remove('hidden');
}

window.cambiarEstadoFilaRecepcion = function(selectTag, idFila, isProd) {
    const zonaRec = document.getElementById(`zona-recibido-${idFila}`);
    const zonaNoRec = document.getElementById(`zona-no-recibido-${idFila}`);
    
    selectTag.className = "w-full px-2 py-2 border rounded text-sm font-bold outline-none focus:ring-2 select-estado-rec text-white shadow-inner";
    
    if (selectTag.value === 'Recibido') {
        zonaRec.classList.remove('hidden'); zonaNoRec.classList.add('hidden');
        selectTag.classList.add(isProd ? 'bg-purple-600' : 'bg-emerald-600', isProd ? 'border-purple-600' : 'border-emerald-600');
    } else if (selectTag.value === 'No Recibido') {
        zonaRec.classList.add('hidden'); zonaNoRec.classList.remove('hidden');
        selectTag.classList.add('bg-red-600', 'border-red-600');
    } else {
        zonaRec.classList.add('hidden'); zonaNoRec.classList.add('hidden');
        selectTag.classList.add('bg-yellow-500', 'border-yellow-500');
    }
}

window.guardarRecepcionMasiva = async function() {
    const filas = document.querySelectorAll('.fila-recepcion');
    const isProd = window.tipoVistaTransitoActiva === 'Interno';
    
    for (const fila of filas) {
        if(!fila.querySelector('.select-estado-rec').value) {
            return alert("❌ Debes seleccionar un estado para todos los productos de la lista.");
        }
        if(fila.querySelector('.select-estado-rec').value === 'No Recibido' && fila.querySelector('.input-motivo-rec').value.trim() === '') {
            return alert("❌ Debes escribir un motivo para los productos marcados como fallidos o no recibidos.");
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

            const refMov = isProd ? 'Producción Interna Terminada' : 'Recepción Masiva de Proveedor';
            const tipoMov = isProd ? 'INGRESO_PRODUCCION' : 'INGRESO_COMPRA';

            await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, tipo_movimiento: tipoMov, cantidad_movida: cantUA, costo_unitario_movimiento: precioUC, referencia: refMov }]);
            if(!isProd) await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);

        } else if (estado === 'No Recibido') {
            const motivo = fila.querySelector('.input-motivo-rec').value;
            await clienteSupabase.from('compras_detalles').update({estado: 'No Recibido', motivo_no_recepcion: motivo}).eq('id', idDetalle);
        } else {
            await clienteSupabase.from('compras_detalles').update({estado: 'Postpuesto'}).eq('id', idDetalle);
        }
    }

    btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
    document.getElementById('modal-recepcion-masiva').classList.add('hidden');
    window.abrirTransitoSucursal(window.recepcionActivaSuc, document.getElementById('rm-sucursal').innerText.replace('🏭 En Producción para: ','').replace('🚚 En Camino a: ','')); 
}

// ==========================================
// --- FASE 4: COMPRAS DIRECTAS Y OTROS MOVS (GRILLAS DINÁMICAS) ---
// ==========================================
window.ubicacionesGlobalesPorSucursal = {}; 
window.productosERPGlobal = [];
window.contadorFilasCD = 0;
window.contadorFilasOM = 0;
window.selectCDActivoIndex = null;
window.selectOMActivoIndex = null;

window.cargarSelectsMovimientosFormularios = async function() {
    const [{ data: provs }, { data: prods }, { data: sucs }, { data: tipos }, { data: ubis }] = await Promise.all([
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('tipos_movimiento').select('id, nombre, operacion').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre, id_sucursal').eq('id_empresa', window.miEmpresaId)
    ]);

    window.productosERPGlobal = prods || [];

    // Agrupar ubicaciones por sucursal
    window.ubicacionesGlobalesPorSucursal = {};
    (ubis||[]).forEach(u => {
        if(!window.ubicacionesGlobalesPorSucursal[u.id_sucursal]) window.ubicacionesGlobalesPorSucursal[u.id_sucursal] = [];
        window.ubicacionesGlobalesPorSucursal[u.id_sucursal].push(u);
    });

    const optsProvs = '<option value="" disabled selected>Elegir Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const optsSucs = '<option value="" disabled selected>Elegir Sucursal...</option>' + (sucs||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    const optsTipos = '<option value="" disabled selected>Tipo de Movimiento...</option>' + (tipos||[]).map(t => `<option value="${t.id}" data-operacion="${t.operacion}">${t.nombre} (${t.operacion})</option>`).join('');

    document.getElementById('cd-proveedor').innerHTML = optsProvs; 
    document.getElementById('cd-sucursal').innerHTML = optsSucs;
    document.getElementById('om-sucursal').innerHTML = optsSucs;
    document.getElementById('om-tipo').innerHTML = optsTipos;

    // Limpiar tablas si entra por primera vez
    if(document.getElementById('cd-filas').innerHTML.trim() === '') agregarFilaCD();
    if(document.getElementById('om-filas').innerHTML.trim() === '') agregarFilaOM();
}

// -----------------------------------------
// LÓGICA COMPRAS DIRECTAS
// -----------------------------------------
window.actualizarUbicacionesCD = function() {
    const idSuc = document.getElementById('cd-sucursal').value;
    const selectsUbi = document.querySelectorAll('.cd-select-ubi');
    
    let opts = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(window.ubicacionesGlobalesPorSucursal[idSuc]) {
        opts += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }
    selectsUbi.forEach(sel => sel.innerHTML = opts);
}

window.agregarFilaCD = function() {
    window.contadorFilasCD++;
    const idx = window.contadorFilasCD;
    const tbody = document.getElementById('cd-filas');
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-200 bg-white fila-cd-item dropdown-container";
    
    const idSuc = document.getElementById('cd-sucursal').value;
    let optsUbi = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(idSuc && window.ubicacionesGlobalesPorSucursal[idSuc]) {
        optsUbi += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }

    tr.innerHTML = `
        <td class="py-3 px-4 relative">
            <input type="hidden" class="cd-id-prod" id="hidden-cd-prod-${idx}">
            <div class="relative">
                <input type="text" id="search-cd-prod-${idx}" class="w-full px-3 py-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" onfocus="abrirDropdownGeneric(${idx}, 'CD')" oninput="filtrarDropdownGeneric(${idx}, this.value, 'CD')" autocomplete="off">
                <div id="dropdown-CD-${idx}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                    <ul id="ul-cd-prod-${idx}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                </div>
            </div>
        </td>
        <td class="py-3 px-4"><select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none cd-select-ubi">${optsUbi}</select></td>
        <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
                <input type="number" step="0.01" placeholder="0" class="w-20 px-2 py-2 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 cd-input-cant">
                <span class="text-xs text-slate-400 font-bold" id="abrev-cd-prod-${idx}">UC</span>
            </div>
        </td>
        <td class="py-3 px-4 text-right"><input type="number" step="0.01" placeholder="$0.00" class="w-full px-2 py-2 border border-slate-300 rounded text-right text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cd-input-costo"></td>
        <td class="py-3 px-4 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-xl font-bold">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

window.guardarCompraDirectaMasiva = async function() {
    const idSuc = document.getElementById('cd-sucursal').value;
    const idProv = document.getElementById('cd-proveedor').value;
    if(!idSuc || !idProv) return alert("❌ Selecciona una Sucursal y un Proveedor en la cabecera.");

    const filas = document.querySelectorAll('.fila-cd-item');
    let dataValida = [];
    let totalGlobal = 0;

    for(const tr of filas) {
        const idProd = tr.querySelector('.cd-id-prod').value;
        const idUbiVal = tr.querySelector('.cd-select-ubi').value;
        const idUbicacion = idUbiVal === 'NULL_UBI' ? null : idUbiVal;
        const cantUC = parseFloat(tr.querySelector('.cd-input-cant').value);
        const costoTotal = parseFloat(tr.querySelector('.cd-input-costo').value);

        if(idProd && cantUC > 0 && costoTotal >= 0) {
            dataValida.push({ idProd, idUbicacion, cantUC, costoTotal });
            totalGlobal += costoTotal;
        }
    }

    if(dataValida.length === 0) return alert("❌ No hay productos válidos para registrar. Revisa cantidades y costos.");

    const btn = document.getElementById('btn-guardar-cd');
    btn.innerText = "⏳ Guardando..."; btn.disabled = true;

    // 1. Crear cabecera Compra
    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ 
        id_empresa: window.miEmpresaId, id_proveedor: idProv, total_compra: totalGlobal, estado: 'Completada' 
    }]).select('id').single();

    for(const item of dataValida) {
        const precioUC = item.costoTotal / item.cantUC;
        
        // 2. Detalle
        await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: item.idProd, cantidad_uc: item.cantUC, precio_unitario_uc: precioUC, subtotal: item.costoTotal, estado: 'Recibido' }]);
        
        // 3. Inventario
        const prodInfo = window.productosERPGlobal.find(p => p.id === item.idProd);
        const factor = prodInfo?.cant_en_ua_de_uc || 1;
        const cantUA_a_sumar = item.cantUC * factor;

        let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', item.idProd).eq('id_sucursal', idSuc);
        if(item.idUbicacion) query = query.eq('id_ubicacion', item.idUbicacion); else query = query.is('id_ubicacion', null);
        
        const { data: previo } = await query.maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_sucursal: idSuc, id_ubicacion: item.idUbicacion, cantidad_actual_ua: cantUA_a_sumar }]);

        // 4. Historial + Precio
        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_ubicacion: item.idUbicacion, tipo_movimiento: 'COMPRA_DIRECTA', cantidad_movida: cantUA_a_sumar, costo_unitario_movimiento: precioUC, referencia: 'Compra Directa Masiva' }]);
        await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', item.idProd);
    }

    alert("✅ Compra Directa registrada con éxito.");
    document.getElementById('cd-filas').innerHTML = ''; agregarFilaCD();
    btn.innerText = "Registrar Compra"; btn.disabled = false;
}

// -----------------------------------------
// LÓGICA OTROS MOVIMIENTOS
// -----------------------------------------
window.actualizarUbicacionesOM = function() {
    const idSuc = document.getElementById('om-sucursal').value;
    const selectsUbi = document.querySelectorAll('.om-select-ubi');
    
    let opts = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(window.ubicacionesGlobalesPorSucursal[idSuc]) {
        opts += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }
    selectsUbi.forEach(sel => {
        sel.innerHTML = opts;
        // Al cambiar sucursal, forzamos recálculo de stock de esa fila
        const idx = sel.getAttribute('data-idx');
        if(idx) window.verificarStockFilaOM(idx);
    });
}

window.agregarFilaOM = function() {
    window.contadorFilasOM++;
    const idx = window.contadorFilasOM;
    const tbody = document.getElementById('om-filas');
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-200 bg-white fila-om-item dropdown-container";
    
    const idSuc = document.getElementById('om-sucursal').value;
    let optsUbi = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(idSuc && window.ubicacionesGlobalesPorSucursal[idSuc]) {
        optsUbi += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }

    tr.innerHTML = `
        <td class="py-3 px-4 relative">
            <input type="hidden" class="om-id-prod" id="hidden-om-prod-${idx}">
            <div class="relative">
                <input type="text" id="search-om-prod-${idx}" class="w-full px-3 py-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-slate-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" onfocus="abrirDropdownGeneric(${idx}, 'OM')" oninput="filtrarDropdownGeneric(${idx}, this.value, 'OM')" autocomplete="off">
                <div id="dropdown-OM-${idx}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                    <ul id="ul-om-prod-${idx}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                </div>
            </div>
        </td>
        <td class="py-3 px-4">
            <select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none om-select-ubi" data-idx="${idx}" onchange="verificarStockFilaOM(${idx})">${optsUbi}</select>
            <div class="mt-1 flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded w-max border border-slate-200">
                <span class="font-bold text-slate-500">Stock Real:</span>
                <span id="stock-om-${idx}" class="font-mono font-bold text-slate-800">--</span>
            </div>
        </td>
        <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
                <input type="number" step="0.01" placeholder="0" class="w-20 px-2 py-2 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-slate-500 om-input-cant">
                <span class="text-xs text-slate-400 font-bold" id="abrev-om-prod-${idx}">UA</span>
            </div>
        </td>
        <td class="py-3 px-4 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-xl font-bold">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

// LOGICA STOCK TIEMPO REAL
window.verificarStockFilaOM = async function(idx) {
    const idProd = document.getElementById(`hidden-om-prod-${idx}`)?.value;
    const idSuc = document.getElementById('om-sucursal').value;
    const ubiSelect = document.querySelector(`.om-select-ubi[data-idx="${idx}"]`);
    const idUbiVal = ubiSelect ? ubiSelect.value : null;
    const stockBadge = document.getElementById(`stock-om-${idx}`);
    const abrevBadge = document.getElementById(`abrev-om-prod-${idx}`)?.innerText || 'UA';

    if(!idProd || !idSuc) { stockBadge.innerText = '--'; return; }

    stockBadge.innerText = '⏳...';

    let query = clienteSupabase.from('inventario_saldos').select('cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc);
    if(idUbiVal && idUbiVal !== 'NULL_UBI') query = query.eq('id_ubicacion', idUbiVal); else query = query.is('id_ubicacion', null);
    
    const { data } = await query.maybeSingle();
    
    if(data) {
        stockBadge.innerText = `${data.cantidad_actual_ua} ${abrevBadge}`;
        stockBadge.className = data.cantidad_actual_ua <= 0 ? 'font-mono font-bold text-red-600' : 'font-mono font-bold text-emerald-600';
    } else {
        stockBadge.innerText = `0 ${abrevBadge}`;
        stockBadge.className = 'font-mono font-bold text-slate-400';
    }
}

window.guardarOtrosMovimientosMasivo = async function() {
    const idSuc = document.getElementById('om-sucursal').value;
    const selTipo = document.getElementById('om-tipo');
    const idTipo = selTipo.value;
    if(!idSuc || !idTipo) return alert("❌ Selecciona una Sucursal y un Tipo de Movimiento.");
    
    const operacion = selTipo.options[selTipo.selectedIndex].getAttribute('data-operacion');
    const nombreMov = selTipo.options[selTipo.selectedIndex].text;
    const ref = document.getElementById('om-ref').value || 'Ajuste Masivo';

    const filas = document.querySelectorAll('.fila-om-item');
    let dataValida = [];

    for(const tr of filas) {
        const idProd = tr.querySelector('.om-id-prod').value;
        const idUbiVal = tr.querySelector('.om-select-ubi').value;
        const idUbicacion = idUbiVal === 'NULL_UBI' ? null : idUbiVal;
        const cantIngresada = parseFloat(tr.querySelector('.om-input-cant').value);

        if(idProd && cantIngresada > 0) {
            dataValida.push({ idProd, idUbicacion, cantAplicar: (operacion === '+' ? cantIngresada : -cantIngresada) });
        }
    }

    if(dataValida.length === 0) return alert("❌ No hay productos válidos para registrar.");

    const btn = document.getElementById('btn-guardar-om');
    btn.innerText = "⏳ Aplicando..."; btn.disabled = true;

    for(const item of dataValida) {
        let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', item.idProd).eq('id_sucursal', idSuc);
        if(item.idUbicacion) query = query.eq('id_ubicacion', item.idUbicacion); else query = query.is('id_ubicacion', null);
        
        const { data: previo } = await query.maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + item.cantAplicar, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_sucursal: idSuc, id_ubicacion: item.idUbicacion, cantidad_actual_ua: item.cantAplicar }]);

        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_ubicacion: item.idUbicacion, tipo_movimiento: nombreMov, cantidad_movida: item.cantAplicar, referencia: ref }]);
    }

    alert(`✅ Movimientos aplicados con éxito.`);
    document.getElementById('om-ref').value = '';
    document.getElementById('om-filas').innerHTML = ''; agregarFilaOM();
    btn.innerText = "Aplicar Movimientos"; btn.disabled = false;
}

// -----------------------------------------
// FUNCIONES GENÉRICAS PARA DROPDOWNS (CD y OM)
// -----------------------------------------
window.abrirDropdownGeneric = function(index, tipo) {
    document.querySelectorAll('.lista-dropdown-custom').forEach(el => el.classList.add('hidden'));
    window.filtrarDropdownGeneric(index, '', tipo); 
    document.getElementById(`search-${tipo.toLowerCase()}-prod-${index}`).select();
}

window.filtrarDropdownGeneric = function(index, texto, tipo) {
    const ul = document.getElementById(`ul-${tipo.toLowerCase()}-prod-${index}`);
    const term = texto.toLowerCase().trim();
    let filtrados = window.productosERPGlobal;
    if (term) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(term));

    let html = filtrados.map(p => {
        const abrev = tipo === 'CD' ? (p.id_unidad_compra?.abreviatura || 'UC') : (p.id_unidad_almacenamiento?.abreviatura || 'UA');
        return `<li class="px-3 py-2 hover:bg-slate-100 cursor-pointer transition-colors" onclick="seleccionarProductoGeneric(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}', '${abrev}', '${tipo}')">${p.nombre}</li>`;
    }).join('');
    
    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" onclick="crearNuevoProductoGeneric(${index}, '${tipo}')">➕ Crear Nuevo Producto...</li>`;
    ul.innerHTML = html;
    document.getElementById(`dropdown-${tipo}-${index}`).classList.remove('hidden');
}

window.seleccionarProductoGeneric = function(index, idProd, nombreProd, abrev, tipo) {
    const pfx = tipo.toLowerCase();
    document.getElementById(`hidden-${pfx}-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-${pfx}-prod-${index}`);
    searchInput.value = nombreProd;
    
    const badgeAbrev = document.getElementById(`abrev-${pfx}-prod-${index}`);
    if(badgeAbrev) badgeAbrev.innerText = abrev;

    document.getElementById(`dropdown-${tipo}-${index}`).classList.add('hidden');
    
    // Si es OM, forzar chequeo de stock
    if(tipo === 'OM') window.verificarStockFilaOM(index);
}

window.crearNuevoProductoGeneric = function(index, tipo) {
    document.getElementById(`dropdown-${tipo}-${index}`).classList.add('hidden');
    const searchInput = document.getElementById(`search-${tipo.toLowerCase()}-prod-${index}`);
    
    if(tipo === 'CD') window.selectCDActivoIndex = index;
    if(tipo === 'OM') window.selectOMActivoIndex = index;
    
    window.abrirModalProducto(false, searchInput.value);
}

// -----------------------------------------
// EXTENSIÓN DE ACTUALIZAR SELECTS GLOBALES (Para que atrape lo de Ventas, CD y OM)
// -----------------------------------------
window.actualizarSelectsMapeoCSV = async function(nuevoIdProducto) {
    const { data: prodsERP } = await clienteSupabase.from('productos').select('id, nombre, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosERPGlobal = prodsERP || [];
    
    if (nuevoIdProducto) {
        const nuevoProd = window.productosERPGlobal.find(p => p.id === nuevoIdProducto);
        if(nuevoProd) {
            if (window.selectCSVActivoIndex !== null) {
                window.seleccionarProductoCSV(window.selectCSVActivoIndex, nuevoProd.id, nuevoProd.nombre);
                window.selectCSVActivoIndex = null; 
            } else if (window.selectCDActivoIndex !== null) {
                window.seleccionarProductoGeneric(window.selectCDActivoIndex, nuevoProd.id, nuevoProd.nombre, nuevoProd.id_unidad_compra?.abreviatura || 'UC', 'CD');
                window.selectCDActivoIndex = null;
            } else if (window.selectOMActivoIndex !== null) {
                window.seleccionarProductoGeneric(window.selectOMActivoIndex, nuevoProd.id, nuevoProd.nombre, nuevoProd.id_unidad_almacenamiento?.abreviatura || 'UA', 'OM');
                window.selectOMActivoIndex = null;
            }
        }
    }
}

// ==========================================
// --- FASE 5: VENTAS POS (CSV) Y HOMOLOGACIÓN ---
// ==========================================
window.datosCSVAgrupados = [];
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
        header: true, skipEmptyLines: true,
        complete: function(results) { agruparYAsociarVentas(results.data); }
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
        clienteSupabase.from('productos').select('id, nombre, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
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
                    <input type="text" id="search-prod-${index}" class="w-full px-3 py-2 border ${bordeInput} rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" value="${nombrePreseleccionado}" onfocus="abrirDropdownCSV(${index})" oninput="filtrarDropdownCSV(${index}, this.value)" autocomplete="off">
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

    let html = filtrados.map(p => `<li class="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors" onclick="seleccionarProductoCSV(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">${p.nombre}</li>`).join('');
    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" onclick="crearNuevoProductoCSV(${index})">➕ Crear Nuevo Producto...</li>`;
    ul.innerHTML = html;
    document.getElementById(`dropdown-${index}`).classList.remove('hidden');
}

window.seleccionarProductoCSV = function(index, idProd, nombreProd) {
    document.getElementById(`hidden-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-prod-${index}`);
    searchInput.value = nombreProd;
    searchInput.classList.remove('border-red-300'); searchInput.classList.add('border-slate-300');
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

window.quitarRojoFila = function(index) {
    const fila = document.getElementById(`fila-csv-${index}`);
    if(fila) fila.classList.remove('bg-red-50', 'border-l-4', 'border-red-500');
}

window.cancelarCSV = function() {
    document.getElementById('panel-mapeo-csv').classList.add('hidden');
    document.getElementById('csv-file').value = ''; document.getElementById('csv-fecha-inicio').value = ''; document.getElementById('csv-fecha-fin').value = '';
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

// ==========================================
// --- FASE 6: LOGS RECIENTES Y EXPORTACIÓN ---
// ==========================================

window.cargarLogsMovimientos = async function(tipo) {
    const isCompra = tipo === 'COMPRA_DIRECTA';
    const tbody = document.getElementById(isCompra ? 'log-compras-directas' : 'log-otros-movs');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 font-bold animate-pulse">Cargando últimos registros...</td></tr>';
    
    let query = clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false })
        .limit(20);
        
    if(isCompra) {
        query = query.eq('tipo_movimiento', 'COMPRA_DIRECTA');
    } else {
        // Excluimos compras y ventas para dejar solo las mermas, ajustes, y producciones
        query = query.not('tipo_movimiento', 'in', '("COMPRA_DIRECTA", "VENTA_POS", "INGRESO_COMPRA", "AJUSTE_CONTEO")'); 
    }

    const { data } = await query;
    
    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 italic">No hay registros recientes de este tipo.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d => {
        const fecha = new Date(d.fecha_movimiento).toLocaleString('es-CL', {dateStyle:'short', timeStyle:'short'});
        const prod = d.productos?.nombre || 'Desconocido';
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = d.ubicaciones_internas?.nombre || 'General';
        const cantColor = d.cantidad_movida > 0 ? 'text-emerald-600' : 'text-red-600';
        const signo = d.cantidad_movida > 0 ? '+' : '';
        
        if(isCompra) {
            return `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-slate-600 whitespace-nowrap">${fecha}</td>
                <td class="px-4 py-2 font-bold text-slate-800">${prod}</td>
                <td class="px-4 py-2 text-right font-mono ${cantColor} font-bold">${signo}${d.cantidad_movida} <span class="text-xs text-slate-400">${abrev}</span></td>
                <td class="px-4 py-2 text-slate-500 text-xs">📍 ${ubi}</td>
            </tr>`;
        } else {
            return `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-slate-600 whitespace-nowrap">${fecha}</td>
                <td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap border border-slate-200">${d.tipo_movimiento}</span></td>
                <td class="px-4 py-2 font-bold text-slate-800">${prod}</td>
                <td class="px-4 py-2 text-right font-mono ${cantColor} font-bold">${signo}${d.cantidad_movida} <span class="text-xs text-slate-400">${abrev}</span></td>
                <td class="px-4 py-2 text-slate-500 text-xs italic">"${d.referencia || '-'}"</td>
            </tr>`;
        }
    }).join('');
}

window.cargarLogsVentasPOS = async function() {
    const tbody = document.getElementById('log-ventas-pos');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 font-bold animate-pulse">Cargando períodos procesados...</td></tr>';
    
    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, referencia')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .order('fecha_movimiento', { ascending: false })
        .limit(500);

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 italic">No hay ventas del POS importadas aún.</td></tr>';
        return;
    }

    const periodosAgrupados = [];
    data.forEach(d => {
        const match = d.referencia.match(/\[Período:.*?\]/);
        const refKey = match ? match[0] : "Período no especificado";
        
        let existe = periodosAgrupados.find(p => p.ref === refKey);
        if(!existe) {
            periodosAgrupados.push({ ref: refKey, fechaProcesado: new Date(d.fecha_movimiento), itemsAfectados: 1 });
        } else {
            existe.itemsAfectados++;
        }
    });

    tbody.innerHTML = periodosAgrupados.map(p => {
        const fechaProc = p.fechaProcesado.toLocaleString('es-CL', {dateStyle:'medium', timeStyle:'short'});
        // Escapamos las comillas por si acaso el string tiene algo raro
        const refEscapada = p.ref.replace(/'/g, "\\'");

        return `<tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-4 py-3 font-medium text-slate-600">${fechaProc}</td>
            <td class="px-4 py-3 font-bold text-blue-700"><span class="bg-blue-50 border border-blue-100 px-3 py-1 rounded-md shadow-sm">${p.ref}</span></td>
            <td class="px-4 py-3 text-center text-slate-500 font-medium text-xs">${p.itemsAfectados} líneas descontadas</td>
            <td class="px-4 py-3 text-center">
                <button onclick="abrirDetallesVentas('${refEscapada}')" class="text-slate-500 hover:text-blue-600 bg-white border border-slate-300 shadow-sm px-3 py-1 rounded font-bold transition-transform hover:scale-105">👁️ Ver</button>
            </td>
        </tr>`;
    }).join('');
}

// NUEVA FUNCIÓN PARA ABRIR EL DESGLOSE DE LAS VENTAS
window.abrirDetallesVentas = async function(periodoRef) {
    document.getElementById('dv-periodo').innerText = periodoRef;
    const tbody = document.getElementById('dv-filas');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8">⏳ Buscando líneas descontadas...</td></tr>';
    document.getElementById('modal-detalles-ventas').classList.remove('hidden');

    // Buscamos todos los movimientos de venta que contengan este string exacto en su referencia
    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .like('referencia', `%${periodoRef}%`)
        .order('fecha_movimiento', { ascending: false });

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">No se encontraron detalles.</td></tr>'; return;
    }

    tbody.innerHTML = data.map(d => {
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = d.ubicaciones_internas?.nombre || 'Bodega General';
        // Usamos Math.abs para mostrar la cantidad en positivo visualmente (ej: -5 se ve como 5 con un menos adelante)
        const cant = Math.abs(d.cantidad_movida);

        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-bold text-slate-700 text-sm whitespace-nowrap">${d.productos?.nombre || 'Desconocido'}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-red-600 bg-red-50/50">-${cant} <span class="text-[10px] text-slate-400">${abrev}</span></td>
            <td class="px-4 py-3 text-sm text-slate-500">📍 ${ubi}</td>
            <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[250px] truncate" title="${d.referencia}">"${d.referencia}"</td>
        </tr>`;
    }).join('');
}

// Auto-recarga al guardar exitosamente
const oldGuardarCD = window.guardarCompraDirectaMasiva;
window.guardarCompraDirectaMasiva = async function() { await oldGuardarCD(); window.cargarLogsMovimientos('COMPRA_DIRECTA'); }

const oldGuardarOM = window.guardarOtrosMovimientosMasivo;
window.guardarOtrosMovimientosMasivo = async function() { await oldGuardarOM(); window.cargarLogsMovimientos('OTROS'); }

const oldConfirmarVentas = window.confirmarDescuentoVentas;
window.confirmarDescuentoVentas = async function() { await oldConfirmarVentas(); window.cargarLogsVentasPOS(); }

// FUNCIÓN DE EXPORTACIÓN EXCEL
window.exportarMovimientosCSV = async function() {
    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false })
        .limit(1000); // Exportamos los últimos 1000 por seguridad de rendimiento
    
    if(!data || data.length === 0) return alert("No hay movimientos registrados para exportar.");

    let csv = "Fecha,Hora,Producto,Accion,Cantidad,Unidad,Ubicacion,Referencia\n";
    data.forEach(d => {
        const f = new Date(d.fecha_movimiento);
        const fecha = f.toLocaleDateString('es-CL');
        const hora = f.toLocaleTimeString('es-CL');
        const prod = `"${(d.productos?.nombre || '').replace(/"/g, '""')}"`;
        const accion = `"${d.tipo_movimiento}"`;
        const cant = d.cantidad_movida;
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = `"${d.ubicaciones_internas?.nombre || 'General'}"`;
        const ref = `"${(d.referencia || '').replace(/"/g, '""')}"`;
        
        csv += `${fecha},${hora},${prod},${accion},${cant},${abrev},${ubi},${ref}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Log_Movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// --- HISTORIAL DE ÓRDENES Y DETALLES ---
// ==========================================
window.cargarHistorialOrdenes = async function() {
    const tbody = document.getElementById('lista-historial-ordenes');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8">⏳ Buscando en el archivo...</td></tr>';
    
    // Traemos las compras recientes (últimas 100)
    const { data } = await clienteSupabase.from('compras')
        .select('id, created_at, total_compra, estado, proveedores(nombre, tipo)')
        .eq('id_empresa', window.miEmpresaId)
        .order('created_at', {ascending: false})
        .limit(100);

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500 italic">No hay órdenes registradas.</td></tr>'; return;
    }

    tbody.innerHTML = data.map(c => {
        const isProd = c.proveedores?.tipo === 'Interno';
        const tipoStr = isProd ? '<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">🏭 Producción</span>' : '<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">🚚 Compra</span>';
        
        // CORRECCIÓN: Separamos Fecha y Hora de manera segura para todos los navegadores
        const f = new Date(c.created_at);
        const fecha = f.toLocaleDateString('es-CL') + ' ' + f.toLocaleTimeString('es-CL', {hour: '2-digit', minute: '2-digit'});
        
        let estadoStr = `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">${c.estado}</span>`;
        if (c.estado === 'Completada') estadoStr = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">✅ Ingresada</span>`;
        
        return `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="px-4 py-3 text-slate-600 font-medium text-sm whitespace-nowrap">${fecha}</td>
            <td class="px-4 py-3">${tipoStr}</td>
            <td class="px-4 py-3 font-bold text-slate-800">${c.proveedores?.nombre || 'General'}</td>
            <td class="px-4 py-3 text-right font-mono text-slate-600 font-bold">$${c.total_compra}</td>
            <td class="px-4 py-3 text-center">${estadoStr}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="abrirDetallesOrden('${c.id}', '${(c.proveedores?.nombre || '').replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-slate-800 bg-white border border-slate-300 shadow-sm px-3 py-1 rounded font-bold transition-transform hover:scale-105">👁️ Ver</button>
            </td>
        </tr>`;
    }).join('');
}

window.abrirDetallesOrden = async function(idCompra, provNombre) {
    document.getElementById('do-proveedor').innerText = provNombre;
    const tbody = document.getElementById('do-filas');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8">⏳ Desglosando pedido...</td></tr>';
    document.getElementById('modal-detalles-orden').classList.remove('hidden');

    const { data } = await clienteSupabase.from('compras_detalles')
        .select('cantidad_uc, estado, motivo_no_recepcion, productos(nombre, id_unidad_compra(abreviatura)), sucursales(nombre), ubicaciones_internas(nombre)')
        .eq('id_compra', idCompra);

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No hay detalles para mostrar.</td></tr>'; return;
    }

    tbody.innerHTML = data.map(d => {
        const abrev = d.productos?.id_unidad_compra?.abreviatura || 'UC';
        
        let estColor = 'bg-slate-100 text-slate-600 border border-slate-200';
        if(d.estado === 'Recibido') estColor = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        if(d.estado === 'No Recibido') estColor = 'bg-red-100 text-red-700 border border-red-200';
        if(d.estado === 'Postpuesto') estColor = 'bg-yellow-100 text-yellow-700 border border-yellow-200';
        
        const destino = `📍 ${d.sucursales?.nombre || 'General'}<br><span class="text-[10px] text-slate-500 font-bold bg-slate-100 px-1 rounded inline-block mt-0.5">Gaveta: ${d.ubicaciones_internas?.nombre || 'General'}</span>`;

        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-bold text-slate-700 text-sm whitespace-nowrap">${d.productos?.nombre}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-slate-800 bg-slate-50/50">${d.cantidad_uc} <span class="text-[10px] text-slate-400">${abrev}</span></td>
            <td class="px-4 py-3 text-sm">${destino}</td>
            <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider ${estColor} whitespace-nowrap">${d.estado}</span></td>
            <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[200px] truncate" title="${d.motivo_no_recepcion || ''}">"${d.motivo_no_recepcion || '-'}"</td>
        </tr>`;
    }).join('');
}
