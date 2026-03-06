// --- ESTADO GLOBAL VALORIZACIÓN ---
window.repValData = [];
window.repValSearch = '';
window.repValCatFiltro = 'TODOS';
window.repValSortCol = 'nombre';
window.repValSortAsc = true;
window.repValPag = 1;
window.repValLimit = 50;

// --- ESTADO GLOBAL KARDEX ---
window.repKarData = [];
window.repKarSearch = '';
window.repKarFechaIn = '';
window.repKarFechaFin = '';
window.repKarSortCol = 'fechaObj';
window.repKarSortAsc = false;
window.repKarPag = 1;
window.repKarLimit = 50;

// --- ESTADO GLOBAL COMPRAS ---
window.repComData = [];
window.repComSearch = '';
window.repComFechaIn = '';
window.repComFechaFin = '';
window.repComSortCol = 'fechaObj';
window.repComSortAsc = false;
window.repComPag = 1;
window.repComLimit = 50;

window.prodsGlobalesReportes = [];
window.catGlobalesReportes = [];
window.ubisGlobalesReportes = [];
window.tabActivaReportes = 'valorizacion';

window.cargarReportes = async function() {
    window.cambiarTabReportes('valorizacion'); 
    
    // Carga masiva paralela
    const [{data: prods, error: errP}, {data: saldos}, {data: ubis}, {data: cats}] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, id_categoria, ultimo_costo_uc, cant_en_ua_de_uc, created_at, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('inventario_saldos').select('id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('categorias').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);

    if (errP) return alert("Error cargando productos: " + errP.message); 

    window.prodsGlobalesReportes = prods || [];
    window.ubisGlobalesReportes = ubis || [];
    window.catGlobalesReportes = cats || [];

    // Poblar combo de categorías
    const selCat = document.getElementById('filtro-cat-rep-val');
    if(selCat) {
        selCat.innerHTML = '<option value="TODOS">Todas las Categorías</option>' + 
            window.catGlobalesReportes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    }

    const stockPorProducto = {};
    (saldos || []).forEach(s => {
        if (!stockPorProducto[s.id_producto]) stockPorProducto[s.id_producto] = 0;
        stockPorProducto[s.id_producto] += Number(s.cantidad_actual_ua);
    });

    let valorTotalGlobal = 0, itemsConStock = 0;
    window.repValData = [];

    window.prodsGlobalesReportes.forEach(p => {
        const stockFisicoUA = stockPorProducto[p.id] || 0;
        if (stockFisicoUA > 0) {
            itemsConStock++;
            const divisor = p.cant_en_ua_de_uc > 0 ? p.cant_en_ua_de_uc : 1;
            const costoPorUA = (p.ultimo_costo_uc || 0) / divisor;
            const valorTotalProd = stockFisicoUA * costoPorUA;
            valorTotalGlobal += valorTotalProd;
            
            window.repValData.push({
                id: p.id,
                nombre: p.nombre,
                idCat: p.id_categoria,
                abrev: p.id_unidad_almacenamiento?.abreviatura || 'UA',
                stock: stockFisicoUA,
                costo: costoPorUA,
                valorTotal: valorTotalProd
            });
        }
    });

    document.getElementById('rep-kpi-valor').innerText = `$${valorTotalGlobal.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('rep-kpi-prods').innerText = window.prodsGlobalesReportes.length;
    document.getElementById('rep-kpi-stock').innerText = itemsConStock;

    window.acc_renderRepVal();
}

window.cambiarTabReportes = function(tab) {
    window.tabActivaReportes = tab;
    const btnVal = document.getElementById('tab-rep-valorizacion');
    const btnKar = document.getElementById('tab-rep-kardex');
    const btnCom = document.getElementById('tab-rep-compras');
    const secVal = document.getElementById('seccion-rep-valorizacion');
    const secKar = document.getElementById('seccion-rep-kardex');
    const secCom = document.getElementById('seccion-rep-compras');
    const kpis = document.getElementById('rep-kpis-container'); 

    [btnVal, btnKar, btnCom].forEach(b => b.className = "px-6 py-3 font-medium text-slate-500 hover:text-slate-700 transition-colors whitespace-nowrap");
    [secVal, secKar, secCom].forEach(s => s.classList.add('hidden'));

    if(tab === 'valorizacion') {
        btnVal.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors whitespace-nowrap";
        secVal.classList.remove('hidden'); kpis.classList.remove('hidden');
    } else if(tab === 'kardex') {
        btnKar.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors whitespace-nowrap";
        secKar.classList.remove('hidden'); kpis.classList.add('hidden');
        if(window.repKarData.length === 0) window.cargarKardexGlobalBD();
    } else if(tab === 'compras') {
        btnCom.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors whitespace-nowrap";
        secCom.classList.remove('hidden'); kpis.classList.add('hidden');
        if(window.repComData.length === 0) window.cargarHistorialComprasBD();
    }
}

// ================= VALORIZACION LOGIC =================
window.acc_filtrarRepVal = function() {
    window.repValSearch = document.getElementById('busqueda-rep-val').value.toLowerCase().trim();
    window.repValCatFiltro = document.getElementById('filtro-cat-rep-val').value;
    window.repValPag = 1;
    window.acc_renderRepVal();
}
window.acc_pagRepVal = function() {
    window.repValLimit = parseInt(document.getElementById('pag-size-rep-val').value);
    window.repValPag = 1;
    window.acc_renderRepVal();
}
window.acc_sortRepVal = function(col) {
    if(window.repValSortCol === col) window.repValSortAsc = !window.repValSortAsc;
    else { window.repValSortCol = col; window.repValSortAsc = true; }
    window.acc_renderRepVal();
}
window.acc_cambiarPagVal = function(dir) {
    window.repValPag += dir;
    window.acc_renderRepVal();
}
window.acc_renderRepVal = function() {
    const lista = document.getElementById('lista-rep-valorizacion');
    if(!lista) return;

    let filtrados = [...window.repValData];
    if(window.repValSearch) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(window.repValSearch));
    if(window.repValCatFiltro !== 'TODOS') filtrados = filtrados.filter(p => p.idCat === window.repValCatFiltro);

    filtrados.sort((a, b) => {
        let vA = a[window.repValSortCol]; let vB = b[window.repValSortCol];
        if(typeof vA === 'string') return window.repValSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return window.repValSortAsc ? (vA - vB) : (vB - vA);
    });

    const total = filtrados.length;
    const maxPag = Math.ceil(total / window.repValLimit) || 1;
    if(window.repValPag > maxPag) window.repValPag = maxPag;
    if(window.repValPag < 1) window.repValPag = 1;

    const inicio = (window.repValPag - 1) * window.repValLimit;
    const itemsPagina = filtrados.slice(inicio, inicio + window.repValLimit);

    if(itemsPagina.length === 0) {
        lista.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400 italic">No hay resultados.</td></tr>';
    } else {
        lista.innerHTML = itemsPagina.map(p => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-3 font-bold text-slate-700">${p.nombre}</td>
                <td class="px-6 py-3 text-center"><span class="font-mono text-lg font-bold text-slate-800">${p.stock.toFixed(2)}</span> <span class="text-xs text-slate-500">${p.abrev}</span></td>
                <td class="px-6 py-3 text-right font-mono text-slate-500">$${p.costo.toFixed(2)} <span class="text-[10px]">/ ${p.abrev}</span></td>
                <td class="px-6 py-3 text-right font-mono font-black text-emerald-700 text-lg">$${p.valorTotal.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
            </tr>
        `).join('');
    }

    document.getElementById('info-pag-rep-val').innerText = `Mostrando ${total===0?0:inicio+1} a ${Math.min(inicio+window.repValLimit, total)} de ${total}`;
    document.getElementById('btn-prev-rep-val').disabled = window.repValPag === 1;
    document.getElementById('btn-next-rep-val').disabled = window.repValPag === maxPag || total === 0;
}

// ================= KARDEX LOGIC =================
window.cargarKardexGlobalBD = async function() {
    const tbody = document.getElementById('lista-rep-kardex');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-16 animate-pulse text-slate-500 font-bold">⏳ Recopilando auditoría completa...</td></tr>';

    const { data: movs, error: errMovs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, id_producto, id_ubicacion')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false });

    if (errMovs) return tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold">❌ Error BD: ${errMovs.message}</td></tr>`;

    let trazaAuditoria = [];
    (movs || []).forEach(m => {
        const prodInfo = window.prodsGlobalesReportes.find(p => p.id === m.id_producto);
        const ubiInfo = window.ubisGlobalesReportes.find(u => u.id === m.id_ubicacion);

        trazaAuditoria.push({
            fechaObj: new Date(m.fecha_movimiento),
            idProd: m.id_producto,
            nombreProd: prodInfo ? prodInfo.nombre : 'Desconocido',
            abrev: prodInfo?.id_unidad_almacenamiento?.abreviatura || 'UA',
            accion: m.tipo_movimiento,
            ubicacion: ubiInfo ? ubiInfo.nombre : 'Bodega General',
            cantidad: m.cantidad_movida,
            ref: m.referencia || '-',
            responsable: 'Admin / Sistema' // Placeholder visual
        });
    });

    window.prodsGlobalesReportes.forEach(p => {
        trazaAuditoria.push({
            fechaObj: p.created_at ? new Date(p.created_at) : new Date(),
            idProd: p.id,
            nombreProd: p.nombre,
            abrev: p.id_unidad_almacenamiento?.abreviatura || 'UA',
            accion: '✨ CREACIÓN',
            ubicacion: '-',
            cantidad: 0,
            ref: 'Creación de Ficha',
            responsable: 'Admin / Sistema'
        });
    });

    window.repKarData = trazaAuditoria;
    window.acc_renderRepKar();
}

window.acc_filtrarRepKar = function() {
    window.repKarSearch = document.getElementById('busqueda-rep-kar').value.toLowerCase().trim();
    window.repKarFechaIn = document.getElementById('fecha-inicio-kar').value;
    window.repKarFechaFin = document.getElementById('fecha-fin-kar').value;
    window.repKarPag = 1;
    window.acc_renderRepKar();
}
window.acc_pagRepKar = function() {
    window.repKarLimit = parseInt(document.getElementById('pag-size-rep-kar').value);
    window.repKarPag = 1;
    window.acc_renderRepKar();
}
window.acc_sortRepKar = function(col) {
    if(window.repKarSortCol === col) window.repKarSortAsc = !window.repKarSortAsc;
    else { window.repKarSortCol = col; window.repKarSortAsc = true; }
    window.acc_renderRepKar();
}
window.acc_cambiarPagKar = function(dir) {
    window.repKarPag += dir;
    window.acc_renderRepKar();
}
window.acc_renderRepKar = function() {
    const lista = document.getElementById('lista-rep-kardex');
    if(!lista) return;

    let filtrados = [...window.repKarData];
    
    if(window.repKarSearch) filtrados = filtrados.filter(t => t.nombreProd.toLowerCase().includes(window.repKarSearch) || t.ref.toLowerCase().includes(window.repKarSearch));
    if(window.repKarFechaIn) {
        const dIn = new Date(window.repKarFechaIn); dIn.setHours(0,0,0,0);
        filtrados = filtrados.filter(t => t.fechaObj >= dIn);
    }
    if(window.repKarFechaFin) {
        const dFin = new Date(window.repKarFechaFin); dFin.setHours(23,59,59,999);
        filtrados = filtrados.filter(t => t.fechaObj <= dFin);
    }

    filtrados.sort((a, b) => {
        let vA = a[window.repKarSortCol]; let vB = b[window.repKarSortCol];
        if(typeof vA === 'string') return window.repKarSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return window.repKarSortAsc ? (vA - vB) : (vB - vA);
    });

    const total = filtrados.length;
    const maxPag = Math.ceil(total / window.repKarLimit) || 1;
    if(window.repKarPag > maxPag) window.repKarPag = maxPag;
    if(window.repKarPag < 1) window.repKarPag = 1;

    const inicio = (window.repKarPag - 1) * window.repKarLimit;
    const itemsPagina = filtrados.slice(inicio, inicio + window.repKarLimit);

    if(itemsPagina.length === 0) {
        lista.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">No hay historial registrado con estos filtros.</td></tr>';
    } else {
        lista.innerHTML = itemsPagina.map(t => {
            const isPos = t.cantidad > 0;
            const isCero = t.cantidad === 0;
            const isCrea = t.accion.includes('CREACIÓN');

            let colorCant = isPos ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (isCero ? 'text-slate-400 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200');
            let cantHtml = isCrea ? '<span class="text-slate-300">-</span>' : `<span class="px-2 py-1 rounded font-mono font-black border ${colorCant}">${isPos?'+':''}${t.cantidad} <span class="text-[10px] font-bold">${t.abrev}</span></span>`;
            let icono = isCrea ? '🐣' : (isPos ? '📥' : '📤'); if(isCero && !isCrea) icono = '🔄';

            let fStr = t.fechaObj && !isNaN(t.fechaObj.getTime()) ? t.fechaObj.toLocaleDateString('es-CL') : '-';
            let hStr = t.fechaObj && !isNaN(t.fechaObj.getTime()) ? t.fechaObj.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'}) : '-';

            return `
            <tr class="${isCrea ? 'bg-indigo-50/30' : 'hover:bg-slate-50'} transition-colors border-b border-slate-100">
                <td class="px-4 py-3"><span class="block text-slate-600 font-bold">${fStr}</span><span class="block text-xs text-slate-400 font-mono">${hStr}</span></td>
                <td class="px-4 py-3 font-bold text-slate-800">${t.nombreProd}</td>
                <td class="px-4 py-3 text-slate-600 text-xs flex items-center gap-1 mt-1"><span>${icono}</span> <span class="font-bold">${t.accion}</span></td>
                <td class="px-4 py-3 text-right">${cantHtml}</td>
                <td class="px-4 py-3 text-slate-500 font-medium text-xs">📍 ${t.ubicacion}</td>
                <td class="px-4 py-3 text-slate-500 text-xs font-bold">${t.responsable}</td>
                <td class="px-4 py-3 text-slate-500 text-xs italic">"${t.ref}"</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('info-pag-rep-kar').innerText = `Mostrando ${total===0?0:inicio+1} a ${Math.min(inicio+window.repKarLimit, total)} de ${total}`;
    document.getElementById('btn-prev-rep-kar').disabled = window.repKarPag === 1;
    document.getElementById('btn-next-rep-kar').disabled = window.repKarPag === maxPag || total === 0;
}

// ================= COMPRAS LOGIC =================
window.cargarHistorialComprasBD = async function() {
    const tbody = document.getElementById('lista-historial-compras');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-16 animate-pulse text-slate-500 font-bold">⏳ Buscando en el archivo...</td></tr>';
    
    const { data } = await clienteSupabase.from('compras')
        .select('id, created_at, total_compra, estado, proveedores(nombre, tipo)')
        .eq('id_empresa', window.miEmpresaId)
        .order('created_at', {ascending: false});

    window.repComData = (data||[]).map(c => ({
        id: c.id,
        fechaObj: new Date(c.created_at),
        tipoStr: c.proveedores?.tipo === 'Interno' ? 'Producción' : 'Compra',
        proveedor: c.proveedores?.nombre || 'General',
        total: c.total_compra || 0,
        estado: c.estado || 'Desconocido',
        responsable: 'Admin / Sistema' // Placeholder
    }));
    
    window.acc_renderRepCom();
}

window.acc_filtrarRepCom = function() {
    window.repComSearch = document.getElementById('busqueda-rep-com').value.toLowerCase().trim();
    window.repComFechaIn = document.getElementById('fecha-inicio-com').value;
    window.repComFechaFin = document.getElementById('fecha-fin-com').value;
    window.repComPag = 1;
    window.acc_renderRepCom();
}
window.acc_pagRepCom = function() {
    window.repComLimit = parseInt(document.getElementById('pag-size-rep-com').value);
    window.repComPag = 1;
    window.acc_renderRepCom();
}
window.acc_sortRepCom = function(col) {
    if(window.repComSortCol === col) window.repComSortAsc = !window.repComSortAsc;
    else { window.repComSortCol = col; window.repComSortAsc = true; }
    window.acc_renderRepCom();
}
window.acc_cambiarPagCom = function(dir) {
    window.repComPag += dir;
    window.acc_renderRepCom();
}
window.acc_renderRepCom = function() {
    const lista = document.getElementById('lista-historial-compras');
    if(!lista) return;

    let filtrados = [...window.repComData];
    
    if(window.repComSearch) filtrados = filtrados.filter(t => t.proveedor.toLowerCase().includes(window.repComSearch));
    if(window.repComFechaIn) {
        const dIn = new Date(window.repComFechaIn); dIn.setHours(0,0,0,0);
        filtrados = filtrados.filter(t => t.fechaObj >= dIn);
    }
    if(window.repComFechaFin) {
        const dFin = new Date(window.repComFechaFin); dFin.setHours(23,59,59,999);
        filtrados = filtrados.filter(t => t.fechaObj <= dFin);
    }

    filtrados.sort((a, b) => {
        let vA = a[window.repComSortCol]; let vB = b[window.repComSortCol];
        if(typeof vA === 'string') return window.repComSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return window.repComSortAsc ? (vA - vB) : (vB - vA);
    });

    const total = filtrados.length;
    const maxPag = Math.ceil(total / window.repComLimit) || 1;
    if(window.repComPag > maxPag) window.repComPag = maxPag;
    if(window.repComPag < 1) window.repComPag = 1;

    const inicio = (window.repComPag - 1) * window.repComLimit;
    const itemsPagina = filtrados.slice(inicio, inicio + window.repComLimit);

    if(itemsPagina.length === 0) {
        lista.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">No hay órdenes registradas con estos filtros.</td></tr>';
    } else {
        lista.innerHTML = itemsPagina.map(c => {
            const isProd = c.tipoStr === 'Producción';
            const badgeTipo = isProd ? '<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold">🏭 Producción</span>' : '<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">🚚 Compra Ext.</span>';
            const fStr = c.fechaObj && !isNaN(c.fechaObj.getTime()) ? c.fechaObj.toLocaleDateString('es-CL') + ' ' + c.fechaObj.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'}) : '-';
            
            let estColor = c.estado === 'Completada' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
            let estBadge = `<span class="${estColor} px-2 py-1 rounded text-xs font-bold">${c.estado === 'Completada' ? '✅ Ingresada' : c.estado}</span>`;

            return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-3 text-slate-600 font-medium text-sm whitespace-nowrap">${fStr}</td>
                <td class="px-6 py-3">${badgeTipo}</td>
                <td class="px-6 py-3 font-bold text-slate-800">${c.proveedor}</td>
                <td class="px-6 py-3 text-slate-500 text-xs font-bold">${c.responsable}</td>
                <td class="px-6 py-3 text-right font-mono text-slate-600 font-bold">$${c.total}</td>
                <td class="px-6 py-3 text-center">${estBadge}</td>
                <td class="px-6 py-3 text-center"><button onclick="abrirDetallesOrdenGlobal('${c.id}', '${c.proveedor.replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-slate-800 bg-white border border-slate-300 shadow-sm px-3 py-1 rounded font-bold transition-transform hover:scale-105">👁️ Ver</button></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('info-pag-rep-com').innerText = `Mostrando ${total===0?0:inicio+1} a ${Math.min(inicio+window.repComLimit, total)} de ${total}`;
    document.getElementById('btn-prev-rep-com').disabled = window.repComPag === 1;
    document.getElementById('btn-next-rep-com').disabled = window.repComPag === maxPag || total === 0;
}

// ================= MOTOR DE IMPRESIÓN GLOBAL =================
window.imprimirReporteActual = function() {
    const fechaHoy = new Date().toLocaleDateString('es-CL');
    const empresaActual = document.getElementById('lista-empresas-usuario')?.innerText.split('\n')[0].replace('🏢 ', '') || 'Empresa Global';
    
    let tituloRep = ""; let infoFiltros = ""; let tablaHtml = "";

    if (window.tabActivaReportes === 'valorizacion') {
        tituloRep = "Valorización de Inventario";
        infoFiltros = `<div class="info-item"><strong>Categoría:</strong><div>${document.getElementById('filtro-cat-rep-val').options[document.getElementById('filtro-cat-rep-val').selectedIndex].text}</div></div>`;
        
        let filtrados = [...window.repValData];
        if(window.repValSearch) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(window.repValSearch));
        if(window.repValCatFiltro !== 'TODOS') filtrados = filtrados.filter(p => p.idCat === window.repValCatFiltro);
        filtrados.sort((a, b) => {
            let vA = a[window.repValSortCol]; let vB = b[window.repValSortCol];
            if(typeof vA === 'string') return window.repValSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
            return window.repValSortAsc ? (vA - vB) : (vB - vA);
        });

        tablaHtml += `<thead><tr><th>Producto</th><th style="text-align: center;">Stock</th><th style="text-align: right;">Costo (UA)</th><th style="text-align: right;">Total Valorizado</th></tr></thead><tbody>`;
        filtrados.forEach(p => {
            tablaHtml += `<tr><td class="prod-col">${p.nombre}</td><td style="text-align: center;">${p.stock.toFixed(2)} ${p.abrev}</td><td style="text-align: right;">$${p.costo.toFixed(2)}</td><td style="text-align: right; font-weight: bold;">$${p.valorTotal.toLocaleString('es-CL')}</td></tr>`;
        });
        tablaHtml += `</tbody>`;

    } else if (window.tabActivaReportes === 'kardex') {
        tituloRep = "Auditoría Global (Kardex)";
        const dIn = document.getElementById('fecha-inicio-kar').value || 'Inicio';
        const dFin = document.getElementById('fecha-fin-kar').value || 'Hoy';
        infoFiltros = `<div class="info-item"><strong>Período:</strong><div>Del ${dIn} al ${dFin}</div></div>`;

        let filtrados = [...window.repKarData];
        if(window.repKarSearch) filtrados = filtrados.filter(t => t.nombreProd.toLowerCase().includes(window.repKarSearch) || t.ref.toLowerCase().includes(window.repKarSearch));
        if(document.getElementById('fecha-inicio-kar').value) { const d1 = new Date(document.getElementById('fecha-inicio-kar').value); d1.setHours(0,0,0,0); filtrados = filtrados.filter(t => t.fechaObj >= d1); }
        if(document.getElementById('fecha-fin-kar').value) { const d2 = new Date(document.getElementById('fecha-fin-kar').value); d2.setHours(23,59,59,999); filtrados = filtrados.filter(t => t.fechaObj <= d2); }
        
        filtrados.sort((a, b) => {
            let vA = a[window.repKarSortCol]; let vB = b[window.repKarSortCol];
            if(typeof vA === 'string') return window.repKarSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
            return window.repKarSortAsc ? (vA - vB) : (vB - vA);
        });

        tablaHtml += `<thead><tr><th>Fecha y Hora</th><th>Producto</th><th>Acción</th><th style="text-align: right;">Cant.</th><th>Ubicación</th><th>Responsable</th><th>Referencia</th></tr></thead><tbody>`;
        filtrados.forEach(t => {
            const fStr = t.fechaObj && !isNaN(t.fechaObj.getTime()) ? t.fechaObj.toLocaleDateString('es-CL') + ' ' + t.fechaObj.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'}) : '-';
            const cantStr = `${t.cantidad > 0 ? '+' : ''}${t.cantidad} ${t.abrev}`;
            tablaHtml += `<tr><td>${fStr}</td><td class="prod-col">${t.nombreProd}</td><td>${t.accion}</td><td style="text-align: right; font-weight:bold;">${cantStr}</td><td>${t.ubicacion}</td><td>${t.responsable}</td><td style="font-size:10px;">${t.ref}</td></tr>`;
        });
        tablaHtml += `</tbody>`;

    } else if (window.tabActivaReportes === 'compras') {
        tituloRep = "Historial Compras y Producción";
        const dIn = document.getElementById('fecha-inicio-com').value || 'Inicio';
        const dFin = document.getElementById('fecha-fin-com').value || 'Hoy';
        infoFiltros = `<div class="info-item"><strong>Período:</strong><div>Del ${dIn} al ${dFin}</div></div>`;

        let filtrados = [...window.repComData];
        if(window.repComSearch) filtrados = filtrados.filter(t => t.proveedor.toLowerCase().includes(window.repComSearch));
        if(document.getElementById('fecha-inicio-com').value) { const d1 = new Date(document.getElementById('fecha-inicio-com').value); d1.setHours(0,0,0,0); filtrados = filtrados.filter(t => t.fechaObj >= d1); }
        if(document.getElementById('fecha-fin-com').value) { const d2 = new Date(document.getElementById('fecha-fin-com').value); d2.setHours(23,59,59,999); filtrados = filtrados.filter(t => t.fechaObj <= d2); }
        
        filtrados.sort((a, b) => {
            let vA = a[window.repComSortCol]; let vB = b[window.repComSortCol];
            if(typeof vA === 'string') return window.repComSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
            return window.repComSortAsc ? (vA - vB) : (vB - vA);
        });

        tablaHtml += `<thead><tr><th>Fecha Ingreso</th><th>Tipo</th><th>Origen / Proveedor</th><th>Responsable</th><th style="text-align: right;">Total Estimado</th><th style="text-align: center;">Estado</th></tr></thead><tbody>`;
        filtrados.forEach(c => {
            const fStr = c.fechaObj && !isNaN(c.fechaObj.getTime()) ? c.fechaObj.toLocaleDateString('es-CL') + ' ' + c.fechaObj.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'}) : '-';
            const estStr = c.estado === 'Completada' ? 'Ingresada' : c.estado;
            tablaHtml += `<tr><td>${fStr}</td><td>${c.tipoStr}</td><td class="prod-col">${c.proveedor}</td><td>${c.responsable}</td><td style="text-align: right;">$${c.total.toLocaleString('es-CL')}</td><td style="text-align: center; font-weight:bold;">${estStr}</td></tr>`;
        });
        tablaHtml += `</tbody>`;
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>${tituloRep}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #333; }
                .header-box { border: 2px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #fff; }
                .header-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 15px 0; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .info-grid { display: flex; flex-wrap: wrap; gap: 15px; }
                .info-item { flex: 1 1 30%; font-size: 14px; }
                .info-item strong { text-transform: uppercase; font-size: 12px; color: #555; display: block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                th, td { border: 1px solid #000; padding: 8px 6px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; }
                thead { display: table-header-group; } 
                tr { page-break-inside: avoid; }
                .prod-col { font-weight: bold; }
                @media print { body { padding: 0; } @page { margin: 15mm; size: landscape; } .header-box { background-color: white !important; -webkit-print-color-adjust: exact; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">${tituloRep}</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Empresa:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${empresaActual}</div></div>
                    <div class="info-item"><strong>Fecha de Emisión:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                    ${infoFiltros}
                </div>
            </div>
            <table>${tablaHtml}</table>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}