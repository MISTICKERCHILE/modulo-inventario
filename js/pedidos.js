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
// --- SECCIÓN 1: PEDIDOS SUGERIDOS (INTELIGENCIA AÑADIDA) ---
// ==========================================
window.carritoPedidos = [];
window.proveedoresGlobal = [];
window.sugerenciasGlobal = []; 
window.memoriaProveedoresXProducto = {}; // 👉 NUEVO: Para auto-seleccionar proveedor

window.cargarPedidosPlanificados = async function() {
    // 1. CARGAR CARRITO
    const { data: carritoNube } = await clienteSupabase.from('carrito_pedidos')
        .select(`
            id_sucursal, id_producto, id_proveedor, cantidad_uc, precio_referencia, 
            sucursales(nombre), productos(nombre, id_unidad_compra(abreviatura)), proveedores(nombre)
        `).eq('id_empresa', window.miEmpresaId);

    window.carritoPedidos = (carritoNube || []).map(c => ({
        idSuc: c.id_sucursal, nombreSuc: c.sucursales?.nombre,
        idProd: c.id_producto, nombreProd: c.productos?.nombre,
        idProv: c.id_proveedor, nombreProv: c.proveedores?.nombre,
        cantUC: c.cantidad_uc, precioRef: c.precio_referencia, 
        abrevUC: c.productos?.id_unidad_compra?.abreviatura || 'UC' 
    }));

    if(window.actualizarBadgeCarrito) window.actualizarBadgeCarrito();

    // 1.5 OBTENER ÚLTIMO PROVEEDOR (Consulta plana, 100% segura contra errores 400)
    window.memoriaProveedoresXProducto = {};
    try {
        // A. Traemos los detalles recibidos más recientes
        const { data: ultimosDetalles } = await clienteSupabase
            .from('compras_detalles')
            .select('id_producto, id_compra')
            .eq('estado', 'Recibido')
            .order('id', { ascending: false });

        if (ultimosDetalles && ultimosDetalles.length > 0) {
            const primerasComprasPorProducto = [];
            
            // Filtramos para quedarnos solo con la compra más reciente de cada producto
            ultimosDetalles.forEach(det => {
                if (!window.memoriaProveedoresXProducto[det.id_producto] && det.id_compra) {
                    window.memoriaProveedoresXProducto[det.id_producto] = 'PENDIENTE';
                    primerasComprasPorProducto.push(det);
                }
            });

            // B. Buscamos los proveedores de esas compras específicas directamente en la tabla compras
            if (primerasComprasPorProducto.length > 0) {
                const idsCompras = primerasComprasPorProducto.map(c => c.id_compra);
                const { data: compras } = await clienteSupabase
                    .from('compras')
                    .select('id, id_proveedor')
                    .in('id', idsCompras);
                
                if (compras) {
                    primerasComprasPorProducto.forEach(det => {
                        const compra = compras.find(c => c.id === det.id_compra);
                        if (compra) window.memoriaProveedoresXProducto[det.id_producto] = compra.id_proveedor;
                    });
                }
            }
        }
    } catch (error) {
        console.error("Error cargando memoria de proveedores:", error);
    }

    // 2. CARGAR DATOS GENERALES
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
    window.memoriaProveedoresXProducto = {};
    try {
        const { data: ultimasCompras } = await clienteSupabase
            .from('compras_detalles')
            .select('id_producto, compras!inner(id_proveedor)')
            .eq('estado', 'Recibido')
            .order('id', { ascending: false });

        (ultimasCompras || []).forEach(d => {
            const idProv = Array.isArray(d.compras) ? d.compras[0]?.id_proveedor : d.compras?.id_proveedor;
            if (idProv && !window.memoriaProveedoresXProducto[d.id_producto]) {
                window.memoriaProveedoresXProducto[d.id_producto] = idProv;
            }
        });
    } catch (e) { console.warn("Memoria prov:", e); }

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

    window.filtrarSugerencias(); 
    window.renderizarBandejaPedidos();
}

window.filtrarSugerencias = function() {
    const term = (document.getElementById('search-sugerencias')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('sort-sugerencias')?.value || 'urgencia';
    
    let filtradas = [...window.sugerenciasGlobal];

    if(term) {
        filtradas = filtradas.filter(s => s.nombreProd.toLowerCase().includes(term) || s.nombreSuc.toLowerCase().includes(term));
    }

    filtradas.sort((a, b) => {
        if(sort === 'nombre') return a.nombreProd.localeCompare(b.nombreProd);
        if(sort === 'precio') return b.precioRef - a.precioRef;
        if(sort === 'mayor_sugerido') return b.sugeridoUA - a.sugeridoUA;
        
        if(a.esManual !== b.esManual) return a.esManual ? -1 : 1;
        return (a.stockVirtual - a.stockMinimoEstrategico) - (b.stockVirtual - b.stockMinimoEstrategico);
    });

    window.renderizarHTMLSugerencias(filtradas);
}

window.renderizarHTMLSugerencias = function(lista) {
    const container = document.getElementById('lista-alertas-compras');
    if(!container) return;

    if(lista.length === 0) {
        container.innerHTML = '<div class="p-8 text-center bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-bold text-lg">🟢 Excelente. No hay alertas ni sugerencias pendientes.</div>';
        return;
    }

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

            // 👉 AUTO-SELECCIÓN DE PROVEEDOR (Única y definitiva)
            const ultimoProvId = window.memoriaProveedoresXProducto ? window.memoriaProveedoresXProducto[p.idProd] : null;
            const opcionesProveedor = '<option value="">Elige Proveedor...</option>' + window.proveedoresGlobal.map(prov => {
                // Forzamos que ambos sean Textos (String) para que JavaScript no se confunda
                const isSelected = String(prov.id) === String(ultimoProvId) ? 'selected' : '';
                return `<option value="${prov.id}" ${isSelected}>${prov.nombre}</option>`;
            }).join('');

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
                    <select id="prov-select-${idSuc}-${p.idProd}" class="w-full px-2 py-1 border border-orange-200 rounded text-xs outline-none bg-white">${opcionesProveedor}</select>
                </td>
                <td class="px-4 py-3 text-center font-bold text-slate-600">
                    <div class="flex items-center justify-center gap-2">
                        $${p.precioRef}
                        <button onclick="verHistorialPrecios('${p.idProd}', '${p.nombreProd.replace(/'/g, "\\'")}', ${p.precioRef})" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full w-6 h-6 flex items-center justify-center font-bold transition-colors text-xs" title="Ver historial de precios de compra">i</button>
                    </div>
                </td>
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

window.agregarPedidoAlCarrito = async function(idSuc, nombreSuc, idProd, nombreProd, cantUC, abrevUC, precioRef, idProv) {
    if(!idProv) return alert("❌ Selecciona un proveedor primero.");
    
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
    
    window.cargarPedidosPlanificados(); 
}

window.quitarDelCarrito = async function(idSuc, idProd, idProv) {
    await clienteSupabase.from('carrito_pedidos').delete().eq('id_sucursal', idSuc).eq('id_producto', idProd).eq('id_proveedor', idProv);
    window.cargarPedidosPlanificados();
}

window.actualizarCantCarrito = async function(idSuc, idProd, idProv, nuevaCant) {
    await clienteSupabase.from('carrito_pedidos').update({ cantidad_uc: parseFloat(nuevaCant) || 0 }).eq('id_sucursal', idSuc).eq('id_producto', idProd).eq('id_proveedor', idProv);
    window.cargarPedidosPlanificados();
}

// ==========================================
// 1. BANDEJA AGRUPADA POR PROVEEDOR + SUCURSAL
// ==========================================
window.renderizarBandejaPedidos = function() {
    const contenedor = document.getElementById('contenedor-bandeja');
    const lista = document.getElementById('lista-carritos-proveedor');
    if (!contenedor || !lista) return;

    if (window.carritoPedidos.length === 0) { contenedor.classList.add('hidden'); lista.innerHTML = ''; return; }
    contenedor.classList.remove('hidden');

    // 👉 NUEVO: Agrupamos usando una llave combinada de Proveedor + Sucursal
    const agrupado = {};
    window.carritoPedidos.forEach(item => {
        const key = `${item.idProv}_${item.idSuc}`;
        if(!agrupado[key]) agrupado[key] = { 
            idProv: item.idProv, nombreProv: item.nombreProv, 
            idSuc: item.idSuc, nombreSuc: item.nombreSuc, 
            items: [] 
        };
        agrupado[key].items.push(item);
    });

    let html = '';
    for (const [key, data] of Object.entries(agrupado)) {
        let totalEstimado = 0;
        const filasHTML = data.items.map(item => {
            totalEstimado += (item.cantUC * item.precioRef);
            return `
            <tr class="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2 font-bold text-slate-800 text-sm w-48">🏢 ${item.nombreSuc}</td>
                <td class="px-4 py-2 font-medium text-sm">${item.nombreProd}</td>
                <td class="px-4 py-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <input type="number" step="0.01" value="${item.cantUC}" onchange="actualizarCantCarrito('${item.idSuc}', '${item.idProd}', '${item.idProv}', this.value)" class="w-20 px-2 py-1 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-blue-700">
                        <span class="text-xs text-slate-500 font-bold">${item.abrevUC}</span>
                    </div>
                </td>
                <td class="px-4 py-2 text-right text-slate-500 font-mono text-sm w-32">$${item.precioRef}</td>
                <td class="px-2 py-2 text-center w-16"><button onclick="quitarDelCarrito('${item.idSuc}', '${item.idProd}', '${data.idProv}')" class="text-red-400 hover:text-red-600 text-lg transition-transform hover:scale-110" title="Quitar">❌</button></td>
            </tr>`;
        }).join('');

        html += `
        <div class="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden p-1 mb-4">
            <div class="bg-slate-800 text-white px-4 py-3 flex justify-between items-center rounded-t-md">
                <h4 class="font-bold text-lg">📝 Para: ${data.nombreProv} <span class="text-slate-400 text-sm font-normal">| Destino: ${data.nombreSuc}</span></h4>
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
                    <button onclick="imprimirPedido('${data.idProv}', '${data.nombreProv.replace(/'/g, "\\'")}', '${data.idSuc}', '${data.nombreSuc.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded font-bold shadow-sm hover:bg-slate-100 transition-colors">🖨️ Imprimir PDF</button>
                    <button onclick="whatsappPedido('${data.idProv}', '${data.nombreProv.replace(/'/g, "\\'")}', '${data.idSuc}', '${data.nombreSuc.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-[#25D366] text-white rounded font-bold shadow-sm hover:bg-[#1ebe5d] transition-colors">💬 WhatsApp</button>
                    <button onclick="abrirModalFechaEntrega('${data.idProv}', '${data.idSuc}', '${data.nombreSuc.replace(/'/g, "\\'")}')" class="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700 transition-transform hover:scale-105">🚀 Pedido Generado</button>
                </div>
            </div>
        </div>`;
    }
    lista.innerHTML = html;
}

// ==================================================================
// 2. IMPRIMIR PDF CON LÓGICA INTERNO/EXTERNO RAZON SOCIAL Y HORARIOS
// ==================================================================
window.imprimirPedido = async function(idProv, nombreProv, idSuc, nombreSuc) {
    const items = window.carritoPedidos.filter(i => i.idProv === idProv && i.idSuc === idSuc);
    if(items.length === 0) return alert("No hay productos en este pedido.");

    // Traemos Razón Social, Dirección y TIPO de Proveedor
    const [{ data: empData }, { data: sucData }, { data: provData }] = await Promise.all([
        clienteSupabase.from('empresas').select('nombre').eq('id', window.miEmpresaId).maybeSingle(),
        clienteSupabase.from('sucursales').select('direccion, horarios_atencion').eq('id', idSuc).maybeSingle(),
        clienteSupabase.from('proveedores').select('tipo').eq('id', idProv).maybeSingle()
    ]);

    const esInterno = provData?.tipo === 'Interno';
    const tituloDocumento = esInterno ? 'ORDEN DE PRODUCCIÓN' : 'ORDEN DE COMPRA';

    const razonSocial = empData?.nombre || 'Mi Empresa';
    const direccionStr = sucData?.direccion || 'No registrada';
    const horarioStr = sucData?.horarios_atencion || 'No registrado';
    const fechaHoy = new Date().toLocaleDateString('es-CL');

    let filasHtml = items.map(item => `<tr><td class="prod-col">${item.nombreProd}</td><td class="unit-col text-center font-mono font-bold">${item.cantUC}</td><td class="unit-col text-center font-bold text-gray-500">${item.abrevUC}</td></tr>`).join('');

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>${tituloDocumento} - ${nombreSuc}</title>
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
                .prod-col { font-weight: bold; font-size: 14px; }
                @media print { @page { margin: 15mm; } .header-box, th { background-color: white !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">${tituloDocumento}</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Facturar a (Razón Social):</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${razonSocial}</div></div>
                    <div class="info-item"><strong>Fecha de Orden:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                    <div class="info-item"><strong>Proveedor / Origen:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${nombreProv}</div></div>
                    <div class="info-item"><strong>Sucursal Destino:</strong><div style="font-size: 14px; margin-top: 4px;">${nombreSuc}</div></div>
                    <div class="info-item"><strong>Dirección de Entrega:</strong><div style="font-size: 14px; margin-top: 4px;">${direccionStr}</div></div>
                    <div class="info-item"><strong>Horario de Recepción:</strong><div style="font-size: 14px; margin-top: 4px;">${horarioStr}</div></div>
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

// ==========================================
// 3. ENVIAR WHATSAPP CON LÓGICA INTERNO/EXTERNO
// ==========================================
window.whatsappPedido = async function(idProv, nombreProv, idSuc, nombreSuc) {
    const items = window.carritoPedidos.filter(i => i.idProv === idProv && i.idSuc === idSuc);
    if(items.length === 0) return alert("No hay productos en este pedido.");

    const [{ data: empData }, { data: sucData }, { data: provData }] = await Promise.all([
        clienteSupabase.from('empresas').select('nombre').eq('id', window.miEmpresaId).maybeSingle(),
        clienteSupabase.from('sucursales').select('direccion, horarios_atencion').eq('id', idSuc).maybeSingle(),
        clienteSupabase.from('proveedores').select('whatsapp, tipo').eq('id', idProv).maybeSingle()
    ]);

    const esInterno = provData?.tipo === 'Interno';
    const tituloDocumento = esInterno ? 'ORDEN DE PRODUCCIÓN' : 'ORDEN DE COMPRA';

    let telf = provData?.whatsapp ? provData.whatsapp.replace(/\D/g,'') : '';
    const razonSocial = empData?.nombre || 'Nuestra Empresa';
    const direccionStr = sucData?.direccion || 'No registrada';
    const horarioStr = sucData?.horarios_atencion || 'No registrado';
    const fechaHoy = new Date().toLocaleDateString('es-CL');

    let texto = `*NUEVA ${tituloDocumento}* 📝\n*Fecha:* ${fechaHoy}\n*Facturar a:* ${razonSocial}\n*Proveedor / Origen:* ${nombreProv}\n\n*📍 DATOS DE DESPACHO:*\n*Destino:* Sucursal ${nombreSuc}\n*Dirección:* ${direccionStr}\n*Horario Recepción:* ${horarioStr}\n\n*📦 PRODUCTOS SOLICITADOS:*\n`;
    items.forEach(item => { texto += `▫️ ${item.cantUC} ${item.abrevUC} de ${item.nombreProd}\n`; });
    texto += `\nPor favor confirmar recepción del pedido y fecha de entrega. ¡Gracias!`;

    const url = telf ? `https://wa.me/${telf}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
}

// ==========================================
// 4 Y 5. FLUJO DE GENERACIÓN Y FECHAS BIDIRECCIONALES
// ==========================================
window.infoPedidoActual = null;

// MOTOR 1: Escribes DÍAS -> Calcula FECHA
window.sincronizarFechaDesdeDias = function() {
    const dias = parseInt(document.getElementById('input-dias-entrega').value) || 0;
    const esHabil = document.getElementById('check-dias-habiles').checked;
    
    let fecha = new Date();
    if (dias > 0) {
        if (esHabil) {
            let agregados = 0;
            while (agregados < dias) {
                fecha.setDate(fecha.getDate() + 1);
                if (fecha.getDay() !== 0 && fecha.getDay() !== 6) agregados++; // Ignora Sab/Dom
            }
        } else {
            fecha.setDate(fecha.getDate() + dias);
        }
    }
    document.getElementById('input-fecha-entrega').value = fecha.toISOString().split('T')[0];
}

// MOTOR 2: Eliges FECHA -> Calcula DÍAS
window.sincronizarDiasDesdeFecha = function() {
    // Usamos T12:00:00 para evitar que el cambio de zona horaria nos reste un día
    const fechaTarget = new Date(document.getElementById('input-fecha-entrega').value + 'T12:00:00'); 
    const esHabil = document.getElementById('check-dias-habiles').checked;
    
    let hoy = new Date();
    hoy.setHours(12, 0, 0, 0); // Emparejamos las horas
    
    // Si elige una fecha en el pasado, lo reseteamos a hoy
    if (fechaTarget < hoy) {
        document.getElementById('input-fecha-entrega').value = hoy.toISOString().split('T')[0];
        document.getElementById('input-dias-entrega').value = 0;
        return;
    }

    let dias = 0;
    let temp = new Date(hoy);
    
    while(temp < fechaTarget) {
        temp.setDate(temp.getDate() + 1);
        if (esHabil) {
            if (temp.getDay() !== 0 && temp.getDay() !== 6) dias++;
        } else {
            dias++;
        }
    }
    
    document.getElementById('input-dias-entrega').value = dias;
}

window.abrirModalFechaEntrega = function(idProv, idSuc, nombreSuc) {
    window.infoPedidoActual = { idProv, idSuc, nombreSuc };
    document.getElementById('modal-fecha-entrega').classList.remove('hidden');
    
    // Valores por defecto al abrir
    document.getElementById('input-dias-entrega').value = 2; 
    document.getElementById('check-dias-habiles').checked = true;
    window.sincronizarFechaDesdeDias(); // Auto-calcula la fecha de hoy + 2 días hábiles
    
    document.getElementById('input-dias-entrega').focus();
}

window.confirmarYGenerarPedido = async function() {
    if(!window.infoPedidoActual) return;
    const { idProv, idSuc, nombreSuc } = window.infoPedidoActual;

    const items = window.carritoPedidos.filter(i => i.idProv === idProv && i.idSuc === idSuc);
    if(items.length === 0) return;

    let tieneError = false;
    items.forEach(i => { if(i.cantUC <= 0) tieneError = true; });
    if(tieneError) return alert("❌ Tienes productos con cantidad 0. Elimínalos o arréglalos.");

    const btn = document.getElementById('btn-confirmar-fecha-oc');
    btn.innerText = "⏳ Generando..."; btn.disabled = true;

    try {
        // Consultamos si el proveedor es Interno o Externo
        const { data: provData } = await clienteSupabase.from('proveedores').select('tipo').eq('id', idProv).maybeSingle();
        const esInterno = provData?.tipo === 'Interno';
        const prefijoDoc = esInterno ? 'OP' : 'OC'; // OP = Orden de Producción, OC = Orden de Compra

        const fechaEstimadaSQL = document.getElementById('input-fecha-entrega').value;

        // GENERAMOS EL CÓDIGO INTERNO (Ej: OP-MUT-4521 o OC-MUT-4521)
        const prefijoSuc = nombreSuc.substring(0,3).toUpperCase();
        const numeroAleatorio = Math.floor(1000 + Math.random() * 9000);
        const codigoOC = `${prefijoDoc}-${prefijoSuc}-${numeroAleatorio}`;

        const totalEstimado = items.reduce((sum, item) => sum + (item.cantUC * item.precioRef), 0);

        const { data: cabecera, error: errCabecera } = await clienteSupabase.from('compras').insert([{
            id_empresa: window.miEmpresaId, 
            id_proveedor: idProv, 
            total_compra: totalEstimado, 
            estado: 'En Tránsito',
            numero_documento: codigoOC,
            fecha_entrega_esperada: fechaEstimadaSQL 
        }]).select('id').single();

        if (errCabecera) throw errCabecera;

        if(cabecera) {
            const detallesAInsertar = items.map(item => ({
                id_compra: cabecera.id, id_producto: item.idProd, id_sucursal_destino: item.idSuc,
                cantidad_uc: item.cantUC, precio_unitario_uc: item.precioRef, subtotal: item.cantUC * item.precioRef, estado: 'En Tránsito'
            }));
            await clienteSupabase.from('compras_detalles').insert(detallesAInsertar);
            
            for (const item of items) {
                const { data: reglaActual } = await clienteSupabase.from('reglas_stock_sucursal')
                    .select('id, stock_minimo_ua').eq('id_sucursal', item.idSuc).eq('id_producto', item.idProd).maybeSingle();
                
                if (reglaActual && reglaActual.stock_minimo_ua < 0) {
                    await clienteSupabase.from('reglas_stock_sucursal').update({ stock_minimo_ua: reglaActual.stock_minimo_ua * -1 }).eq('id', reglaActual.id);
                }
            }
            
            const promesasBorrado = items.map(i => clienteSupabase.from('carrito_pedidos').delete().eq('id_empresa', window.miEmpresaId).eq('id_producto', i.idProd).eq('id_sucursal', i.idSuc));
            await Promise.all(promesasBorrado);
        }

        document.getElementById('modal-fecha-entrega').classList.add('hidden');
        btn.innerText = "✅ Confirmar Fecha"; btn.disabled = false;
        
        window.cargarPedidosPlanificados(); 
        
        const fechaVisual = new Date(fechaEstimadaSQL + 'T12:00:00').toLocaleDateString('es-CL');
        const nombreDocumentoVisual = esInterno ? 'Orden de Producción' : 'Orden de Compra';
        alert(`✅ ${nombreDocumentoVisual} ${codigoOC} generada exitosamente. Se espera su llegada el ${fechaVisual}.`);

    } catch (error) {
        console.error("Error al generar pedido:", error);
        alert("❌ Error en BD: " + error.message);
        btn.innerText = "✅ Confirmar Fecha"; btn.disabled = false;
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

    const grid = document.getElementById('grid-sucursales-transito');
    grid.innerHTML = '<p class="text-slate-500 font-bold py-8 col-span-full text-center animate-pulse">⏳ Contando pedidos en camino...</p>';

    try {
        // 1. Consultas PLANAS y seguras (100% a prueba de Error 400)
        const [{ data: sucursales }, { data: detalles }] = await Promise.all([
            clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
            clienteSupabase.from('compras_detalles').select('id_sucursal_destino, id_compra').in('estado', ['En Tránsito', 'Postpuesto'])
        ]);

        // 2. Extraemos IDs de las compras y las buscamos
        const idsCompras = [...new Set((detalles || []).map(d => d.id_compra).filter(Boolean))];
        let compras = [];
        if (idsCompras.length > 0) {
            const { data: cData } = await clienteSupabase.from('compras').select('id, id_proveedor').in('id', idsCompras);
            compras = cData || [];
        }

        // 3. Extraemos IDs de los proveedores y los buscamos
        const idsProvs = [...new Set(compras.map(c => c.id_proveedor).filter(Boolean))];
        let proveedores = [];
        if (idsProvs.length > 0) {
            const { data: pData } = await clienteSupabase.from('proveedores').select('id, tipo').in('id', idsProvs);
            proveedores = pData || [];
        }

        // 4. Configuración visual según pestaña (Interno vs Externo)
        const isProd = tipoFiltro === 'Interno';
        const icon = isProd ? '🏭' : '🏢';
        const borderColor = isProd ? 'hover:border-purple-400' : 'hover:border-blue-400';
        const textColor = isProd ? 'text-purple-600' : 'text-blue-600';
        const textoPlural = isProd ? 'órdenes de producción' : 'pedidos en camino';

        // 5. Ensamblamos las tarjetas contando los pedidos
        grid.innerHTML = (sucursales || []).map(s => {
            
            // Filtramos los detalles para esta sucursal específica
            const detallesSucursal = (detalles || []).filter(d => d.id_sucursal_destino === s.id);
            
            // Usamos un Set para contar Pedidos únicos (Órdenes), no los productos individuales
            const comprasUnicas = new Set();

            detallesSucursal.forEach(det => {
                const compra = compras.find(c => c.id === det.id_compra);
                if (compra) {
                    const prov = proveedores.find(p => p.id === compra.id_proveedor);
                    const tipoProv = prov?.tipo || 'Externo'; // Por defecto es Externo si no hay tipo
                    
                    if (tipoProv === tipoFiltro) {
                        comprasUnicas.add(compra.id); // Guardamos el ID del pedido
                    }
                }
            });

            const cantidadPedidos = comprasUnicas.size;
            
            // Texto dinámico con excelente UX
            const textoMostrar = cantidadPedidos > 0 
                ? `Ver ${textoPlural}: ${cantidadPedidos} →` 
                : `Sin ${textoPlural} pendientes`;

            // Efecto UX: Opacidad un poco baja si no hay nada en camino para no distraer
            const opacity = cantidadPedidos === 0 ? 'opacity-60 hover:opacity-100' : 'opacity-100';

            return `
            <button onclick="abrirTransitoSucursal('${s.id}', '${s.nombre}')" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md ${borderColor} transition-all text-left flex flex-col items-start gap-4 cursor-pointer outline-none ${opacity}">
                <span class="text-5xl">${icon}</span>
                <div>
                    <span class="block font-bold text-xl text-slate-800">${s.nombre}</span>
                    <span class="text-sm ${textColor} font-medium mt-1">${textoMostrar}</span>
                </div>
            </button>
            `;
        }).join('');

    } catch (error) {
        console.error("Error al contar pedidos en tránsito:", error.message);
        grid.innerHTML = '<p class="text-red-500 py-8 col-span-full">Error al cargar conteos.</p>';
    }
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
    lista.innerHTML = '<p class="text-slate-500 font-bold py-8 text-center animate-pulse">⏳ Calculando línea de tiempo de llegadas...</p>';

    try {
        // 1. Buscamos TODOS los ítems en tránsito para esta sucursal (Consulta plana y segura)
        const { data: detalles } = await clienteSupabase.from('compras_detalles')
            .select('id, id_compra, id_producto')
            .eq('id_sucursal_destino', idSuc)
            .in('estado', ['En Tránsito', 'Postpuesto']);

        if (!detalles || detalles.length === 0) {
            const bg = isProd ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-blue-50 border-blue-200 text-blue-700';
            lista.innerHTML = `<div class="p-8 text-center border rounded-xl font-bold ${bg}">Todo está al día. No hay pendientes aquí.</div>`;
            return;
        }

        // 2. Extraemos las Órdenes (Compras) Padre y sus Fechas
        const idsCompras = [...new Set(detalles.map(d => d.id_compra).filter(Boolean))];
        const { data: compras } = await clienteSupabase.from('compras')
            .select('id, id_proveedor, numero_documento, fecha_entrega_esperada')
            .in('id', idsCompras);

        // 3. Extraemos los Proveedores y sus Tipos (Interno/Externo)
        const idsProvs = [...new Set((compras || []).map(c => c.id_proveedor).filter(Boolean))];
        const { data: proveedores } = await clienteSupabase.from('proveedores')
            .select('id, nombre, tipo')
            .in('id', idsProvs);

        // 4. Agrupamos por ÓRDEN DE COMPRA (No solo por proveedor), así se separan en el tiempo
        let ordenesPendientes = [];

        (compras || []).forEach(compra => {
            const prov = proveedores.find(p => p.id === compra.id_proveedor);
            const tipoProv = prov?.tipo || 'Externo';

            // Verificamos que coincida con la pestaña actual (Producción vs Tránsito)
            if (tipoProv === window.tipoVistaTransitoActiva) {
                const itemsDeEstaOrden = detalles.filter(d => d.id_compra === compra.id).length;
                if (itemsDeEstaOrden > 0) {
                    ordenesPendientes.push({
                        idCompra: compra.id,
                        idProv: compra.id_proveedor,
                        nombreProv: prov?.nombre || 'Proveedor Desconocido',
                        numeroDoc: compra.numero_documento || 'Sin OC',
                        fechaEsperada: compra.fecha_entrega_esperada || null,
                        itemsCount: itemsDeEstaOrden
                    });
                }
            }
        });

        if(ordenesPendientes.length === 0) {
            const bg = isProd ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-blue-50 border-blue-200 text-blue-700';
            lista.innerHTML = `<div class="p-8 text-center border rounded-xl font-bold ${bg}">Todo está al día en esta categoría.</div>`;
            return;
        }

        // 5. MOTOR DE TIMELINE: Cálculo de días restantes
        const hoy = new Date();
        hoy.setHours(0,0,0,0); // Seteamos a medianoche para que el cálculo de días sea exacto

        ordenesPendientes = ordenesPendientes.map(orden => {
            let diffDays = 9999; // Si no tiene fecha, lo mandamos al fondo
            let fechaObj = null;

            if (orden.fechaEsperada) {
                fechaObj = new Date(orden.fechaEsperada + 'T12:00:00'); // T12 previene saltos de zona horaria
                const targetDate = new Date(fechaObj);
                targetDate.setHours(0,0,0,0);
                
                const diffTime = targetDate - hoy;
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            return { ...orden, diffDays, fechaObj };
        });

        // 6. ORDENAR: Atrasados primero, luego los de hoy, luego los del futuro (Cronológico)
        ordenesPendientes.sort((a, b) => a.diffDays - b.diffDays);

        // 7. DIBUJAR PANTALLA
        const borderCard = isProd ? 'border-purple-200' : 'border-blue-200';
        const btnClass = isProd ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';
        const btnText = isProd ? '✅ Registrar Producción' : '✅ Recepción de Pedido';
        const iconBox = isProd ? '🧑‍🍳' : '📦';

        lista.innerHTML = ordenesPendientes.map(orden => {
            // Lógica de Etiquetas Dinámicas (Badges)
            let badgeFecha = '';
            if (orden.fechaObj) {
                const fechaStr = orden.fechaObj.toLocaleDateString('es-CL');
                if (orden.diffDays < 0) {
                    badgeFecha = `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-full text-xs shadow-sm border border-red-200 animate-pulse">🔴 Atrasado ${Math.abs(orden.diffDays)} día(s) (Debió llegar el ${fechaStr})</span>`;
                } else if (orden.diffDays === 0) {
                    badgeFecha = `<span class="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs shadow-sm border border-emerald-300">🟢 Llega HOY</span>`;
                } else if (orden.diffDays === 1) {
                    badgeFecha = `<span class="bg-yellow-100 text-yellow-800 font-bold px-3 py-1 rounded-full text-xs shadow-sm border border-yellow-300">🟡 Llega Mañana (${fechaStr})</span>`;
                } else {
                    badgeFecha = `<span class="bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full text-xs shadow-sm border border-blue-200">🔵 En ${orden.diffDays} días (${fechaStr})</span>`;
                }
            } else {
                badgeFecha = `<span class="bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-full text-xs shadow-sm border border-slate-200">⚪ Fecha sin definir</span>`;
            }

            // OJO: Le pasamos el ID de la ORDEN específica al botón de Recepción
            return `
            <div class="bg-white rounded-lg border ${borderCard} p-5 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm hover:shadow-md transition-shadow gap-4 mb-3">
                <div class="w-full">
                    <div class="flex justify-between items-start w-full mb-2">
                        <h4 class="font-bold text-lg text-slate-800 flex items-center gap-2">
                            ${iconBox} Origen: ${orden.nombreProv}
                            <span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded border font-mono">${orden.numeroDoc}</span>
                        </h4>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mt-1">
                        ${badgeFecha}
                        <p class="text-slate-500 text-sm font-medium mt-1 sm:mt-0">${orden.itemsCount} ítems en esta orden.</p>
                    </div>
                </div>
                <button onclick="abrirModalRecepcionMasiva('${idSuc}', '${nombreSuc}', '${orden.idProv}', '${orden.nombreProv}', '${orden.idCompra}')" class="px-6 py-2.5 ${btnClass} text-white rounded-md font-bold shadow transition-transform hover:scale-105 whitespace-nowrap w-full md:w-auto">${btnText}</button>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error al cargar la línea de tiempo:", error);
        lista.innerHTML = '<p class="text-red-500 font-bold py-8 text-center">❌ Ocurrió un error al consultar las recepciones.</p>';
    }
}

window.abrirModalRecepcionMasiva = async function(idSuc, nombreSuc, idProv, nombreProv, idCompraEspecifica) {
    window.recepcionActivaSuc = idSuc;
    window.recepcionActivaProv = idProv;
    const isProd = window.tipoVistaTransitoActiva === 'Interno';

    document.getElementById('rm-titulo-modal').innerText = isProd ? "🏭 Registro de Trabajo / Producción" : "📦 Recepción de Pedido Externo";
    document.getElementById('rm-titulo-estado').innerText = isProd ? "Estado del Trabajo" : "Estado de Recepción";
    document.getElementById('bloque-facturacion').classList.toggle('hidden', isProd);
    
    const colorBorde = isProd ? 'border-purple-500' : 'border-blue-500';
    const modalBox = document.getElementById('rm-borde-modal');
    modalBox.classList.remove('border-blue-500', 'border-purple-500');
    modalBox.classList.add(colorBorde);

    document.getElementById('rm-sucursal').innerText = nombreSuc;
    document.getElementById('rm-proveedor').innerText = nombreProv;
    document.getElementById('rm-fecha-hoy').innerText = new Date().toLocaleDateString('es-CL');

    // Botón de Contacto
    const { data: provInfo } = await clienteSupabase.from('proveedores').select('whatsapp, correo').eq('id', idProv).maybeSingle();
    let btnContactHTML = '';
    if(provInfo?.whatsapp) {
        const telf = provInfo.whatsapp.replace(/\D/g,'');
        btnContactHTML = `<a href="https://wa.me/${telf}" target="_blank" class="text-[10px] bg-green-500 text-white px-2 py-1 rounded-full font-bold hover:bg-green-600 transition-colors flex items-center gap-1 shadow-sm">💬 Escribir</a>`;
    }
    document.getElementById('rm-contacto-container').innerHTML = btnContactHTML;

    // Buscamos ubicaciones
    const { data: ubicaciones } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSuc);
    const optsUbi = '<option value="">-- General (Sin ubicación) --</option>' + (ubicaciones||[]).map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');

    // 👉 LA CONSULTA MAGISTRAL: Buscamos SOLAMENTE los ítems de esta orden específica
    const { data: detalles } = await clienteSupabase.from('compras_detalles')
        .select('id, id_compra, cantidad_uc, precio_unitario_uc, id_producto, estado, motivo_no_recepcion, productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura))')
        .eq('id_compra', idCompraEspecifica)
        .in('estado', ['En Tránsito', 'Postpuesto']);

    const txtRecibido = isProd ? '🟢 Producido / Finalizado' : '🟢 Sí, Recibido';
    const txtPostpuesto = isProd ? '🟡 En Proceso / Pausado' : '🟡 Postpuesto (No llegó hoy)';
    const txtNoRecibido = isProd ? '🔴 Fallido / Cancelado' : '🔴 No Recibido (Rechazado/Falta)';
    const txtCantReal = isProd ? 'Cant. Producida:' : 'Cant. Real Llegó:';
    const txtMotivo = isProd ? 'Motivo (Ej: Fallo máquina)...' : 'Motivo (Ej: Roto, Falta)...';

    const tbody = document.getElementById('rm-filas');
    tbody.innerHTML = (detalles||[]).map(d => {
        const abrev = d.productos?.id_unidad_compra?.abreviatura || 'UC';
        const isPostpuesto = d.estado === 'Postpuesto';
        const labelPost = isPostpuesto ? `<span class="block mt-1 text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded w-max">Estaba en espera</span>` : '';
        const colorInputCant = isProd ? 'text-purple-700' : 'text-emerald-700';

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

        // 👉 Pasamos el id_compra correctamente al dataset
        return `
        <tr class="fila-recepcion border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id-detalle="${d.id}" data-id-prod="${d.id_producto}" data-factor="${d.productos?.cant_en_ua_de_uc || 1}" data-id-compra="${d.id_compra}">
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
        if(!fila.querySelector('.select-estado-rec').value) return alert("❌ Selecciona un estado para todos los productos.");
        if(fila.querySelector('.select-estado-rec').value === 'No Recibido' && fila.querySelector('.input-motivo-rec').value.trim() === '') return alert("❌ Escribe el motivo de lo no recibido.");
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
            const estado = fila.querySelector('.select-estado-rec').value;

            if (estado === 'Recibido') {
                const cantUC = parseFloat(fila.querySelector('.input-cant-real').value);
                const precioRealUC = isProd ? 0 : (parseFloat(fila.querySelector('.input-precio-real').value) || 0);
                const idUbi = fila.querySelector('.select-ubi-rec').value || null;
                const cantUA = cantUC * factorConversion;

                await clienteSupabase.from('compras_detalles').update({ estado: 'Recibido', cantidad_uc: cantUC, precio_unitario_uc: precioRealUC, subtotal: cantUC * precioRealUC }).eq('id', idDetalle);

                let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', window.recepcionActivaSuc);
                if(idUbi) query = query.eq('id_ubicacion', idUbi); else query = query.is('id_ubicacion', null);

                const { data: previo } = await query.maybeSingle();
                if (previo) {
                    await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA, ultima_actualizacion: new Date() }).eq('id', previo.id);
                } else {
                    await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: window.recepcionActivaSuc, id_ubicacion: idUbi, cantidad_actual_ua: cantUA }]);
                }

                const loteInput = isProd ? fila.querySelector('.input-lote-real').value.trim() : '';
                const textoLote = loteInput ? `Lote/OT: ${loteInput}` : 'Producción Interna';
                const tipoMov = isProd ? 'INGRESO_PRODUCCION' : 'INGRESO_COMPRA';
                const refMov = isProd ? textoLote : 'Recepción Masiva de Proveedor';

                await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, tipo_movimiento: tipoMov, cantidad_movida: cantUA, costo_unitario_movimiento: precioRealUC, referencia: refMov }]);
                
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

        for(const idC of comprasAfectadas) { await clienteSupabase.from('compras').update({estado: 'Completada'}).eq('id', idC); }

        btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
        document.getElementById('modal-recepcion-masiva').classList.add('hidden');
        window.abrirTransitoSucursal(window.recepcionActivaSuc, document.getElementById('rm-sucursal').innerText.replace('🏭 En Producción para: ','').replace('🚚 En Camino a: ',''));
    } catch (error) {
        alert("Error al recepcionar: " + error.message);
        btn.innerText = "✅ Guardar Recepción"; btn.disabled = false;
    }
}

// ==========================================
// HISTORIAL DE PRECIOS DE COMPRA (BOTÓN "i") - RESTAURADO Y CORREGIDO
// ==========================================
window.verHistorialPrecios = async function(idProd, nombreProd) {
    document.getElementById('hp-producto-nombre').innerText = nombreProd;
    document.getElementById('modal-historial-precios').classList.remove('hidden');
    
    const tbody = document.getElementById('lista-historial-precios');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500 font-bold animate-pulse">⏳ Buscando en el historial...</td></tr>';

    // 1. Buscamos las últimas compras. Usamos "fecha_compra" desde la tabla padre (compras) en vez de created_at
    const { data, error } = await clienteSupabase.from('compras_detalles')
        .select('precio_unitario_uc, compras!inner(fecha_compra, proveedores(nombre))')
        .eq('id_producto', idProd)
        .eq('estado', 'Recibido')
        .order('id', { ascending: false }) // Ordenamos por el ID del detalle en vez de la fecha inexistente
        .limit(10);

    // 2. Dibujamos los resultados
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-slate-500">No hay compras anteriores registradas para este producto.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d => {
        // Extraemos la fecha desde la tabla compras de forma segura
        const fechaCruda = d.compras?.fecha_compra;
        const fechaAmigable = fechaCruda ? new Date(fechaCruda + 'T00:00:00').toLocaleDateString('es-CL') : 'Sin fecha';
        
        // Extraemos el nombre del proveedor
        let nombreProv = 'Proveedor Desconocido';
        if (d.compras && d.compras.proveedores) {
            nombreProv = Array.isArray(d.compras.proveedores) ? d.compras.proveedores[0]?.nombre : d.compras.proveedores.nombre;
        }

        return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-4 py-3 font-medium text-slate-600">${fechaAmigable}</td>
            <td class="px-4 py-3 font-bold text-slate-800">${nombreProv}</td>
            <td class="px-4 py-3 text-right font-bold text-emerald-700 font-mono">$${d.precio_unitario_uc}</td>
        </tr>
        `;
    }).join('');
}