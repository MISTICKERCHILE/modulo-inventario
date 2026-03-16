window.cambiarSubTabPedidos = function(subtab) {
    const btnS = document.getElementById('subtab-sugerencias');
    const btnT = document.getElementById('subtab-transito');
    const btnP = document.getElementById('subtab-produccion');
    const divS = document.getElementById('subvista-sugerencias');
    const divT = document.getElementById('subvista-transito');

    [btnS, btnT, btnP].forEach(b => { if(b) b.className = 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap'; });
    [divS, divT].forEach(d => { if(d) d.classList.add('hidden'); });

    if(subtab === 'sugerencias') {
        if(btnS) btnS.className = 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 whitespace-nowrap';
        if(divS) divS.classList.remove('hidden'); window.cargarPedidosPlanificados();
    } else if(subtab === 'transito') {
        if(btnT) btnT.className = 'px-6 py-3 font-medium border-b-2 border-blue-600 text-blue-600 bg-blue-50/50 whitespace-nowrap';
        if(divT) divT.classList.remove('hidden');
        const titulo = document.getElementById('transito-titulo-seccion');
        if(titulo) titulo.innerHTML = "🚚 Selecciona tu Sucursal para ver las <span class='text-blue-600'>Recepciones Pendientes</span>";
        window.cargarPedidosEnTransito('Externo');
    } else if(subtab === 'produccion') {
        if(btnP) btnP.className = 'px-6 py-3 font-medium border-b-2 border-purple-600 text-purple-600 bg-purple-50/50 whitespace-nowrap';
        if(divT) divT.classList.remove('hidden');
        const titulo = document.getElementById('transito-titulo-seccion');
        if(titulo) titulo.innerHTML = "🏭 Selecciona tu Sucursal para ver las <span class='text-purple-600'>Órdenes de Producción</span>";
        window.cargarPedidosEnTransito('Interno');
    }
}

// ==========================================
// --- SECCIÓN 1: PEDIDOS SUGERIDOS (COLABORATIVO EN LA NUBE) ---
// ==========================================
window.carritoPedidos = [];
window.proveedoresGlobal = [];
window.sugerenciasGlobal = []; // Memoria para el buscador inteligente

window.cargarPedidosPlanificados = async function() {
    // 1. CARGAR CARRITO DESDE LA NUBE (Supabase)
    // 👉 Le pedimos a Supabase que traiga también la abreviatura de la Unidad de Compra (UC)
    const { data: carritoNube } = await clienteSupabase.from('carrito_pedidos')
        .select(`
            id_sucursal, id_producto, id_proveedor, cantidad_uc, precio_referencia, 
            sucursales(nombre), 
            productos(nombre, id_unidad_compra(abreviatura)), 
            proveedores(nombre)
        `)
        .eq('id_empresa', window.miEmpresaId);

    window.carritoPedidos = (carritoNube || []).map(c => ({
        idSuc: c.id_sucursal, nombreSuc: c.sucursales?.nombre,
        idProd: c.id_producto, nombreProd: c.productos?.nombre,
        idProv: c.id_proveedor, nombreProv: c.proveedores?.nombre,
        cantUC: c.cantidad_uc, precioRef: c.precio_referencia, 
        // 👉 Extraemos la abreviatura correcta. Si no tiene, pone 'UC'.
        abrevUC: c.productos?.id_unidad_compra?.abreviatura || 'UC' 
    }));

    if(window.actualizarBadgeCarrito) window.actualizarBadgeCarrito();

    // 2. CARGAR DATOS PARA SUGERENCIAS
    const [{ data: sucursales }, { data: prods }, { data: reglas }, { data: provs }, { data: saldos }, { data: transitoGlobal }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('reglas_stock_sucursal').select('id_sucursal, id_producto, stock_minimo_ua, stock_ideal_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('inventario_saldos').select('id_sucursal, id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('compras_detalles').select('id_sucursal_destino, id_producto, cantidad_uc, productos(cant_en_ua_de_uc)').in('estado', ['En Tránsito', 'Postpuesto'])
    ]);

    window.proveedoresGlobal = provs || [];
    window.sugerenciasGlobal = [];

    // 3. CALCULAR SUGERENCIAS
    (sucursales||[]).forEach(suc => {
        (prods||[]).forEach(p => {
            const regla = (reglas||[]).find(r => r.id_sucursal === suc.id && r.id_producto === p.id);
            if(!regla || (regla.stock_minimo_ua == 0 && regla.stock_ideal_ua == 0)) return;

            const stockFisico = (saldos||[]).filter(s => s.id_sucursal === suc.id && s.id_producto === p.id).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
            const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === suc.id && t.id_producto === p.id)
                                .reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);

            const stockVirtual = stockFisico + incomingUA;
            
            const esBanderinManual = regla.stock_minimo_ua < 0;
            const stockMinimoEstrategico = Math.abs(regla.stock_minimo_ua); 
            const stockIdealEstrategico = regla.stock_ideal_ua;

            if (stockVirtual <= stockMinimoEstrategico || esBanderinManual) {
                let sugeridoUA = 0;
                const esStockOK = stockVirtual > stockMinimoEstrategico; 

                if (esBanderinManual && esStockOK) {
                    sugeridoUA = stockFisico > 0 ? stockFisico : 1; 
                } else {
                    if(stockIdealEstrategico > 0) {
                        sugeridoUA = stockIdealEstrategico - stockVirtual;
                        if(sugeridoUA <= 0) sugeridoUA = 1; 
                    } else {
                        sugeridoUA = stockMinimoEstrategico - stockVirtual + 1;
                    }
                }

                const sugeridoUC = p.cant_en_ua_de_uc > 0 ? (sugeridoUA / p.cant_en_ua_de_uc).toFixed(2) : sugeridoUA;
                const abrevUA = p.id_unidad_almacenamiento?.abreviatura || 'UA';
                const abrevUC = p.id_unidad_compra?.abreviatura || 'UC';
                const precioRef = p.ultimo_costo_uc || 0;

                const estaEnCarrito = window.carritoPedidos.some(item => item.idProd === p.id && item.idSuc === suc.id);

                window.sugerenciasGlobal.push({
                    idSuc: suc.id, nombreSuc: suc.nombre, idProd: p.id, nombreProd: p.nombre,
                    stockFisico, incomingUA, sugeridoUA, sugeridoUC, abrevUA, abrevUC, precioRef,
                    esManual: esBanderinManual, estaEnCarrito, stockVirtual, stockMinimoEstrategico
                });
            }
        });
    });

    window.filtrarSugerencias(); // Pinta la pantalla
    window.renderizarBandejaPedidos();
}

// NUEVO: BUSCADOR Y ORDENAMIENTO INTELIGENTE
window.filtrarSugerencias = function() {
    const term = (document.getElementById('search-sugerencias')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('sort-sugerencias')?.value || 'urgencia';
    
    let filtradas = [...window.sugerenciasGlobal];

    // 1. Filtrar
    if(term) {
        filtradas = filtradas.filter(s => s.nombreProd.toLowerCase().includes(term) || s.nombreSuc.toLowerCase().includes(term));
    }

    // 2. Ordenar
    filtradas.sort((a, b) => {
        if(sort === 'nombre') return a.nombreProd.localeCompare(b.nombreProd);
        if(sort === 'precio') return b.precioRef - a.precioRef;
        if(sort === 'mayor_sugerido') return b.sugeridoUA - a.sugeridoUA;
        // Urgencia (Por defecto): Manuales primero, luego los de menor stock virtual respecto a su mínimo
        if(a.esManual !== b.esManual) return a.esManual ? -1 : 1;
        const urgenciaA = a.stockVirtual - a.stockMinimoEstrategico;
        const urgenciaB = b.stockVirtual - b.stockMinimoEstrategico;
        return urgenciaA - urgenciaB;
    });

    window.renderizarHTMLSugerencias(filtradas);
}

// NUEVO: PINTAR HTML CON ACORDEONES PLEGABLES
window.renderizarHTMLSugerencias = function(lista) {
    const container = document.getElementById('lista-alertas-compras');
    if(!container) return;

    if(lista.length === 0) {
        container.innerHTML = '<div class="p-8 text-center bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-bold text-lg">🟢 Excelente. No hay alertas ni sugerencias pendientes.</div>';
        return;
    }

    const optsProvs = '<option value="">Elige Proveedor...</option>' + window.proveedoresGlobal.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    // Agrupamos por sucursal
    const porSucursal = {};
    lista.forEach(s => {
        if(!porSucursal[s.idSuc]) porSucursal[s.idSuc] = { nombre: s.nombreSuc, items: [] };
        porSucursal[s.idSuc].items.push(s);
    });

    let htmlGlobal = '';
    for (const [idSuc, data] of Object.entries(porSucursal)) {
        let htmlFilas = data.items.map(p => {
            const displayStyle = p.estaEnCarrito ? 'style="display: none;"' : '';
            const txtEnCamino = p.incomingUA > 0 ? `<br><span class="text-[9px] text-blue-500 font-bold uppercase">+ ${p.incomingUA.toFixed(2)} en camino</span>` : '';
            const badgeManual = p.esManual ? `<span class="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded ml-2 uppercase font-bold">Manual</span>` : '';
            const paramsParaBoton = `'${idSuc}', '${data.nombre}', '${p.idProd}', '${p.nombreProd.replace(/'/g, "\\'")}', ${p.sugeridoUC}, '${p.abrevUC}', ${p.precioRef}`;

            return `
            <tr id="fila-sug-${idSuc}-${p.idProd}" ${displayStyle} class="hover:bg-orange-50 transition-colors border-b border-orange-100">
                <td class="px-4 py-3 font-bold text-slate-700 text-sm">${p.nombreProd} ${badgeManual}</td>
                <td class="px-4 py-3 text-center leading-tight">
                    <span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-xs">${p.stockFisico.toFixed(2)} ${p.abrevUA}</span>
                    ${txtEnCamino}
                </td>
                <td class="px-4 py-3 text-center text-orange-800 font-bold text-sm">
                    ${p.sugeridoUA} ${p.abrevUA} <br><span class="text-[10px] text-orange-500 uppercase">${p.sugeridoUC} ${p.abrevUC}</span>
                </td>
                <td class="px-4 py-3">
                    <select id="prov-select-${idSuc}-${p.idProd}" class="w-full px-2 py-1 border border-orange-200 rounded text-xs outline-none bg-white">${optsProvs}</select>
                </td>
                <td class="px-4 py-3 text-center font-bold text-slate-600">$${p.precioRef}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="agregarPedidoAlCarrito(${paramsParaBoton}, document.getElementById('prov-select-${idSuc}-${p.idProd}').value)" class="text-xs bg-slate-800 text-white px-3 py-2 rounded shadow hover:bg-slate-700 font-bold">+ Añadir</button>
                </td>
            </tr>`;
        }).join('');

        htmlGlobal += `
        <div class="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
            <button onclick="document.getElementById('tabla-suc-${idSuc}').classList.toggle('hidden')" class="w-full bg-orange-100 hover:bg-orange-200 transition-colors px-4 py-3 border-b border-orange-200 flex justify-between items-center outline-none">
                <h4 class="font-bold text-orange-900 text-lg flex items-center gap-2"><span>🏢</span> ${data.nombre} <span class="text-xs bg-orange-500 text-white px-2 py-1 rounded-full ml-2">${data.items.length} sugerencias</span></h4>
                <span class="text-orange-800 text-xl">🔽</span>
            </button>
            <div id="tabla-suc-${idSuc}" class="overflow-x-auto block">
                <table class="min-w-full divide-y divide-orange-100">
                    <thead class="bg-orange-50 text-xs font-bold text-orange-800 uppercase">
                        <tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-center">Stock Real</th><th class="px-4 py-2 text-center">Sugerido</th><th class="px-4 py-2 text-left w-48">Proveedor</th><th class="px-4 py-2 text-center">Ref.</th><th class="px-4 py-2 text-right">Acción</th></tr>
                    </thead>
                    <tbody class="divide-y divide-orange-50 bg-white">${htmlFilas}</tbody>
                </table>
            </div>
        </div>`;
    }
    container.innerHTML = htmlGlobal;
}

// CARRITO EN LA NUBE: Guardar
window.agregarPedidoAlCarrito = async function(idSuc, nombreSuc, idProd, nombreProd, cantUC, abrevUC, precioRef, idProv) {
    if(!idProv) return alert("❌ Selecciona un proveedor primero.");
    
    // Guardar en Supabase
    const { data: existente } = await clienteSupabase.from('carrito_pedidos')
        .select('id, cantidad_uc').eq('id_sucursal', idSuc).eq('id_producto', idProd).eq('id_proveedor', idProv).maybeSingle();

    if(existente) {
        await clienteSupabase.from('carrito_pedidos').update({ cantidad_uc: existente.cantidad_uc + Number(cantUC) }).eq('id', existente.id);
    } else {
        await clienteSupabase.from('carrito_pedidos').insert([{
            id_empresa: window.miEmpresaId, id_sucursal: idSuc, id_producto: idProd, id_proveedor: idProv, cantidad_uc: cantUC, precio_referencia: precioRef
        }]);
    }

    const fila = document.getElementById(`fila-sug-${idSuc}-${idProd}`);
    if(fila) fila.style.display = 'none';
    
    // Recargar nube silenciosamente
    window.cargarPedidosPlanificados(); 
}

// CARRITO EN LA NUBE: Quitar
window.quitarDelCarrito = async function(idSuc, idProd, idProv) {
    await clienteSupabase.from('carrito_pedidos').delete().eq('id_sucursal', idSuc).eq('id_producto', idProd).eq('id_proveedor', idProv);
    window.cargarPedidosPlanificados();
}

// CARRITO EN LA NUBE: Actualizar Cantidad
window.actualizarCantCarrito = async function(idSuc, idProd, idProv, nuevaCant) {
    await clienteSupabase.from('carrito_pedidos').update({ cantidad_uc: parseFloat(nuevaCant) || 0 }).eq('id_sucursal', idSuc).eq('id_producto', idProd).eq('id_proveedor', idProv);
    window.cargarPedidosPlanificados();
}


window.renderizarBandejaPedidos = function() {
    const contenedor = document.getElementById('contenedor-bandeja');
    const lista = document.getElementById('lista-carritos-proveedor');
    if (!contenedor || !lista) return;

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
                <span class="text-sm font-medium bg-slate-700 px-3 py-1 rounded border border-slate-600">Total est: $${totalEstimado.toFixed(2)}</span>
            </div>
            <div class="p-4 bg-slate-50 overflow-x-auto">
                <table class="min-w-full text-left mb-4 border border-slate-200 rounded-md overflow-hidden">
                    <thead class="bg-slate-200 text-xs uppercase text-slate-600">
                        <tr><th class="px-4 py-2">Destino</th><th class="px-4 py-2">Producto</th><th class="px-4 py-2 text-center">Cantidad a Pedir</th><th class="px-4 py-2 text-right">Precio Ref.</th><th class="px-2 py-2"></th></tr>
                    </thead>
                    <tbody>${filasHTML}</tbody>
                </table>
                <div class="flex justify-end gap-3 mt-2 flex-wrap">
                    <button onclick="imprimirPedido('${idProv}', '${data.nombreProv.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded font-bold shadow-sm hover:bg-slate-100 transition-colors">🖨️ Imprimir PDF</button>
                    <button onclick="whatsappPedido('${idProv}', '${data.nombreProv.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-[#25D366] text-white rounded font-bold shadow-sm hover:bg-[#1ebe5d] transition-colors">💬 WhatsApp</button>
                    <button onclick="generarPedidoTransitoMasivo('${idProv}')" class="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700 transition-transform hover:scale-105">🚀 Pedido Generado</button>
                </div>
            </div>
        </div>`;
    }
    lista.innerHTML = html;
}

// ==========================================
// --- FUNCIONES DE IMPRESIÓN Y WHATSAPP ---
// ==========================================
window.imprimirPedido = async function(idProv, nombreProv) {
    const items = window.carritoPedidos.filter(i => i.idProv === idProv);
    if(items.length === 0) return alert("No hay productos en este pedido.");

    const idSuc = items[0].idSuc;
    const nombreSuc = items[0].nombreSuc;
    const { data: sucData } = await clienteSupabase.from('sucursales').select('direccion').eq('id', idSuc).maybeSingle();
    const direccionStr = sucData?.direccion || 'No registrada';

    const fechaHoy = new Date().toLocaleDateString('es-CL');

    let filasHtml = '';
    items.forEach(item => {
        filasHtml += `
            <tr>
                <td class="prod-col">${item.nombreProd}</td>
                <td class="unit-col text-center font-mono font-bold">${item.cantUC}</td>
                <td class="unit-col text-center font-bold text-gray-500">${item.abrevUC}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Pedido ${fechaHoy} - ${nombreSuc}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #333; }
                .header-box { border: 2px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #fff; }
                .header-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 15px 0; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .info-grid { display: flex; flex-wrap: wrap; gap: 15px; }
                .info-item { flex: 1 1 45%; font-size: 14px; }
                .info-item strong { text-transform: uppercase; font-size: 12px; color: #555; display: block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 12px 8px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 12px; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
                .prod-col { font-weight: bold; font-size: 14px; }
                .text-center { text-align: center; }
                @media print { body { padding: 0; } @page { margin: 15mm; } .header-box { background-color: white !important; -webkit-print-color-adjust: exact; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">Orden de Pedido</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Proveedor:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${nombreProv}</div></div>
                    <div class="info-item"><strong>Fecha:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                    <div class="info-item"><strong>Sucursal Destino:</strong><div style="font-size: 16px; margin-top: 4px;">${nombreSuc}</div></div>
                    <div class="info-item"><strong>Dirección de Entrega:</strong><div style="font-size: 14px; margin-top: 4px;">${direccionStr}</div></div>
                </div>
            </div>
            <table>
                <thead><tr><th>Producto / Insumo</th><th style="width: 120px; text-align: center;">Cantidad</th><th style="width: 100px; text-align: center;">Unidad</th></tr></thead>
                <tbody>${filasHtml}</tbody>
            </table>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

window.whatsappPedido = async function(idProv, nombreProv) {
    const items = window.carritoPedidos.filter(i => i.idProv === idProv);
    if(items.length === 0) return alert("No hay productos en este pedido.");

    const { data: provData } = await clienteSupabase.from('proveedores').select('whatsapp').eq('id', idProv).maybeSingle();
    let telf = provData?.whatsapp ? provData.whatsapp.replace(/\D/g,'') : '';

    const nombreSuc = items[0].nombreSuc;
    const fechaHoy = new Date().toLocaleDateString('es-CL');

    let texto = `Hola, este es nuestro pedido para el ${fechaHoy}:\n\n`;
    texto += `*Destino:* Sucursal ${nombreSuc}\n`;
    texto += `*Proveedor:* ${nombreProv}\n\n`;
    texto += `*LISTA DE PRODUCTOS:*\n`;

    items.forEach(item => {
        texto += `- ${item.cantUC} ${item.abrevUC} de ${item.nombreProd}\n`;
    });

    texto += `\nPor favor confirmar recepción. ¡Gracias!`;

    const url = telf
        ? `https://wa.me/${telf}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/?text=${encodeURIComponent(texto)}`;

    window.open(url, '_blank');
}

window.generarPedidoTransitoMasivo = async function(idProv) {
    const itemsDelProveedor = window.carritoPedidos.filter(i => i.idProv === idProv);
    if(itemsDelProveedor.length === 0) return;

    let tieneError = false;
    itemsDelProveedor.forEach(i => { if(i.cantUC <= 0) tieneError = true; });
    if(tieneError) return alert("❌ Tienes productos con cantidad 0. Elimínalos o arréglalos.");

    const totalEstimado = itemsDelProveedor.reduce((sum, item) => sum + (item.cantUC * item.precioRef), 0);

    try {
        document.body.style.cursor = 'wait';

        const { data: cabecera, error: errCabecera } = await clienteSupabase.from('compras').insert([{
            id_empresa: window.miEmpresaId, id_proveedor: idProv, total_compra: totalEstimado, estado: 'En Tránsito'
        }]).select('id').single();

        if (errCabecera) throw errCabecera;

        if(cabecera) {
            const detallesAInsertar = itemsDelProveedor.map(item => ({
                id_compra: cabecera.id, id_producto: item.idProd, id_sucursal_destino: item.idSuc,
                cantidad_uc: item.cantUC, precio_unitario_uc: item.precioRef, subtotal: item.cantUC * item.precioRef, estado: 'En Tránsito'
            }));
            await clienteSupabase.from('compras_detalles').insert(detallesAInsertar);
            
            // 👉 LIMPIANDO EL TRUCO NEGATIVO
            for (const item of itemsDelProveedor) {
                const { data: reglaActual } = await clienteSupabase.from('reglas_stock_sucursal')
                    .select('id, stock_minimo_ua').eq('id_sucursal', item.idSuc).eq('id_producto', item.idProd).maybeSingle();
                
                if (reglaActual && reglaActual.stock_minimo_ua < 0) {
                    await clienteSupabase.from('reglas_stock_sucursal')
                        .update({ stock_minimo_ua: reglaActual.stock_minimo_ua * -1 }).eq('id', reglaActual.id);
                }
            }
            
            // BORRAMOS EL CARRITO COLABORATIVO DE LA NUBE
            await clienteSupabase.from('carrito_pedidos').delete().eq('id_empresa', window.miEmpresaId).eq('id_proveedor', idProv);
        }

        window.cargarPedidosPlanificados(); // Recarga limpia
        alert("✅ Pedido/Orden generada exitosamente. Revisa las pestañas de Tránsito o Producción.");

    } catch (error) {
        console.error("Error al generar pedido:", error);
        alert("❌ Error en BD: " + error.message);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// ==========================================
// --- SECCIÓN 2 y 3: EN TRÁNSITO Y PRODUCCIÓN ---
// ==========================================
window.recepcionActivaSuc = null;
window.recepcionActivaProv = null;
window.tipoVistaTransitoActiva = 'Externo';

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
        .select(`id, id_producto, cantidad_uc, compras!inner(id, id_proveedor, proveedores(nombre, tipo))`)
        .eq('id_sucursal_destino', idSuc)
        .in('estado', ['En Tránsito', 'Postpuesto']);

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

window.abrirModalRecepcionMasiva = async function(idSuc, nombreSuc, idProv, nombreProv) {
    window.recepcionActivaSuc = idSuc;
    window.recepcionActivaProv = idProv;
    const isProd = window.tipoVistaTransitoActiva === 'Interno';

    document.getElementById('rm-titulo-modal').innerText = isProd ? "🏭 Registro de Trabajo / Producción" : "📦 Recepción de Pedido Externo";
    document.getElementById('rm-titulo-estado').innerText = isProd ? "Estado del Trabajo" : "Estado de Recepción";

    const colorBorde = isProd ? 'border-purple-500' : 'border-blue-500';
    const modalBox = document.getElementById('rm-borde-modal');
    modalBox.classList.remove('border-blue-500', 'border-purple-500');
    modalBox.classList.add(colorBorde);

    document.getElementById('rm-sucursal').innerText = nombreSuc;
    document.getElementById('rm-proveedor').innerText = nombreProv;
    document.getElementById('rm-fecha-hoy').innerText = new Date().toLocaleDateString();

    const { data: provInfo } = await clienteSupabase.from('proveedores').select('whatsapp, correo').eq('id', idProv).single();
    let btnContactHTML = '';
    if(provInfo?.whatsapp) {
        const telf = provInfo.whatsapp.replace(/\D/g,'');
        btnContactHTML = `<a href="https://wa.me/${telf}" target="_blank" class="text-[10px] bg-green-500 text-white px-2 py-1 rounded-full font-bold hover:bg-green-600 transition-colors flex items-center gap-1 shadow-sm">💬 Escribir</a>`;
    } else if (provInfo?.correo) {
        btnContactHTML = `<a href="mailto:${provInfo.correo}" target="_blank" class="text-[10px] bg-blue-500 text-white px-2 py-1 rounded-full font-bold hover:bg-blue-600 transition-colors flex items-center gap-1 shadow-sm">✉️ Correo</a>`;
    }
    document.getElementById('rm-contacto-container').innerHTML = btnContactHTML;

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

// Condición clave: Si es Producción (isProd), el bloque de costo queda vacío. Si no, dibuja el input.
// Condición clave: Si es Producción, muestra LOTE. Si es externo, muestra COSTO NETO.
        const bloqueExtra = isProd ? `
            <div class="flex items-center gap-2 mt-2 border-t pt-2 border-slate-100">
                <span class="text-xs text-slate-500 font-bold w-24">Lote / OT:</span>
                <input type="text" placeholder="Ej: L-1029" class="w-full px-2 py-1 border border-slate-300 rounded text-sm font-bold text-slate-700 outline-none focus:ring-1 focus:ring-purple-500 input-lote-real bg-white">
            </div>
        ` : `
            <div class="flex items-center gap-2">
                <span class="text-xs text-slate-500 font-bold w-24">Costo Neto (x ${abrev}):</span>
                <div class="relative w-24">
                    <span class="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-500 text-xs">$</span>
                    <input type="number" step="0.01" value="${d.precio_unitario_uc || 0}" class="w-full pl-5 pr-2 py-1 border border-slate-300 rounded text-sm font-bold text-center text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 input-precio-real">
                </div>
            </div>
        `;

        return `
        <tr class="fila-recepcion border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id-detalle="${d.id}" data-id-prod="${d.id_producto}" data-factor="${d.productos?.cant_en_ua_de_uc || 1}" data-id-compra="${d.compras.id}">
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
                    
                    ${bloqueExtra}
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

    const comprasAfectadas = new Set();

    try {
        for (const fila of filas) {
            const idDetalle = fila.getAttribute('data-id-detalle');
            const idProd = fila.getAttribute('data-id-prod');
            const idCompraPadre = fila.getAttribute('data-id-compra');
            const factorConversion = parseFloat(fila.getAttribute('data-factor'));
            const precioUC = parseFloat(fila.getAttribute('data-precio-uc'));
            const estado = fila.querySelector('.select-estado-rec').value;

            if (estado === 'Recibido') {
                const cantUC = parseFloat(fila.querySelector('.input-cant-real').value);
                
                // 👉 EL CAMBIO: Si es producción el precio es 0, si no, lo lee del input
                const precioRealUC = isProd ? 0 : (parseFloat(fila.querySelector('.input-precio-real').value) || 0);
                
                const idUbi = fila.querySelector('.select-ubi-rec').value || null;
                const cantUA = cantUC * factorConversion;

                // Actualizamos que se recibió, ajustamos la cantidad real que llegó y el PRECIO REAL pagado
                await clienteSupabase.from('compras_detalles')
                    .update({
                        estado: 'Recibido', 
                        cantidad_uc: cantUC, 
                        precio_unitario_uc: precioRealUC, 
                        subtotal: cantUC * precioRealUC
                    })
                    .eq('id', idDetalle);

                let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', window.recepcionActivaSuc);
                if(idUbi) query = query.eq('id_ubicacion', idUbi); else query = query.is('id_ubicacion', null);

                const { data: previo } = await query.maybeSingle();
                if (previo) {
                    await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA, ultima_actualizacion: new Date() }).eq('id', previo.id);
                } else {
                    await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: window.recepcionActivaSuc, id_ubicacion: idUbi, cantidad_actual_ua: cantUA }]);
                }

                // 👉 LEYENDO EL LOTE
                const loteInput = isProd ? fila.querySelector('.input-lote-real').value.trim() : '';
                const textoLote = loteInput ? `Lote/OT: ${loteInput}` : 'Producción Interna';
                
                // Tipo de movimiento OFICIAL (Para los filtros de la BD)
                const tipoMov = isProd ? 'INGRESO_PRODUCCION' : 'INGRESO_COMPRA';
                
                // Texto de referencia para el usuario (Kardex)
                const refMov = isProd ? textoLote : 'Recepción Masiva de Proveedor';

                // Guardamos el movimiento
                await clienteSupabase.from('movimientos_inventario').insert([{ 
                    id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, 
                    tipo_movimiento: tipoMov, cantidad_movida: cantUA, costo_unitario_movimiento: precioRealUC, referencia: refMov 
                }]);

                // Guardamos el movimiento en el historial con el nuevo costo unitario
                await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, tipo_movimiento: tipoMov, cantidad_movida: cantUA, costo_unitario_movimiento: precioRealUC, referencia: refMov }]);
                
                // Actualizamos el "último costo" en el maestro de productos para futuras sugerencias
                if(!isProd) await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioRealUC }).eq('id', idProd);

                if(idCompraPadre) comprasAfectadas.add(idCompraPadre);

            } else if (estado === 'No Recibido') {
                const motivo = fila.querySelector('.input-motivo-rec').value;
                await clienteSupabase.from('compras_detalles').update({estado: 'No Recibido', motivo_no_recepcion: motivo}).eq('id', idDetalle);

                if(idCompraPadre) comprasAfectadas.add(idCompraPadre);
            } else {
                await clienteSupabase.from('compras_detalles').update({estado: 'Postpuesto'}).eq('id', idDetalle);
            }
        }

        for(const idC of comprasAfectadas) {
            await clienteSupabase.from('compras').update({estado: 'Completada'}).eq('id', idC);
        }

        btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
        document.getElementById('modal-recepcion-masiva').classList.add('hidden');
        window.abrirTransitoSucursal(window.recepcionActivaSuc, document.getElementById('rm-sucursal').innerText.replace('🏭 En Producción para: ','').replace('🚚 En Camino a: ',''));
    } catch (error) {
        alert("Error al recepcionar: " + error.message);
        btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
    }
}