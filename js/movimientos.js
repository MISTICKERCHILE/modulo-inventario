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
    const btnP = document.getElementById('subtab-produccion');
    const divS = document.getElementById('subvista-sugerencias');
    const divT = document.getElementById('subvista-transito');

    [btnS, btnT, btnP].forEach(b => {
        if(b) b.className = 'px-4 py-2 rounded-md font-bold text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer outline-none';
    });

    if(subtab === 'sugerencias') {
        btnS.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-emerald-700 outline-none';
        divS.classList.remove('hidden'); divT.classList.add('hidden');
        window.cargarPedidosPlanificados();
    } else if(subtab === 'transito') {
        btnT.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-blue-700 outline-none';
        divT.classList.remove('hidden'); divS.classList.add('hidden');
        document.getElementById('transito-titulo-seccion').innerHTML = "🚚 Selecciona tu Sucursal para ver las <span class='text-blue-600'>Recepciones Pendientes</span>";
        window.cargarPedidosEnTransito('Externo');
    } else if(subtab === 'produccion') {
        btnP.className = 'px-4 py-2 rounded-md font-bold text-sm bg-white shadow-sm text-purple-700 outline-none';
        divT.classList.remove('hidden'); divS.classList.add('hidden');
        document.getElementById('transito-titulo-seccion').innerHTML = "🏭 Selecciona tu Sucursal para ver las <span class='text-purple-600'>Órdenes de Producción</span>";
        window.cargarPedidosEnTransito('Interno');
    }
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
// (El resto del código se mantiene igual... lo omito para que te quepa, puedes dejar el que ya tenías abajo)
