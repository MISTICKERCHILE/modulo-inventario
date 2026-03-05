window.movimientosGlobales = []; 
window.prodsGlobalesReportes = [];
window.ubisGlobalesReportes = [];

window.cargarReportes = async function() {
    window.cambiarTabReportes('valorizacion'); 
    
    // --- 1. CARGA DE VALORIZACIÓN ---
    const [{data: prods, error: errP}, {data: saldos}, {data: ubis}] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, created_at, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('inventario_saldos').select('id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);

    if (errP) { 
        console.error(errP); 
        return alert("Error cargando productos: " + errP.message); 
    }

    window.prodsGlobalesReportes = prods || [];
    window.ubisGlobalesReportes = ubis || [];

    const stockPorProducto = {};
    (saldos || []).forEach(s => {
        if (!stockPorProducto[s.id_producto]) stockPorProducto[s.id_producto] = 0;
        stockPorProducto[s.id_producto] += Number(s.cantidad_actual_ua);
    });

    let valorTotalGlobal = 0, itemsConStock = 0, htmlFilas = '';

    window.prodsGlobalesReportes.forEach(p => {
        const stockFisicoUA = stockPorProducto[p.id] || 0;
        
        if (stockFisicoUA > 0) {
            itemsConStock++;
            const divisor = p.cant_en_ua_de_uc > 0 ? p.cant_en_ua_de_uc : 1;
            const costoPorUA = (p.ultimo_costo_uc || 0) / divisor;
            const valorTotalProd = stockFisicoUA * costoPorUA;
            valorTotalGlobal += valorTotalProd;
            const abrev = p.id_unidad_almacenamiento?.abreviatura || 'UA';

            htmlFilas += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">${p.nombre}</td>
                    <td class="px-6 py-3 text-center"><span class="font-mono text-lg font-bold text-slate-800">${stockFisicoUA.toFixed(2)}</span> <span class="text-xs text-slate-500">${abrev}</span></td>
                    <td class="px-6 py-3 text-right font-mono text-slate-500">$${costoPorUA.toFixed(2)} <span class="text-[10px]">/ ${abrev}</span></td>
                    <td class="px-6 py-3 text-right font-mono font-black text-emerald-700 text-lg">$${valorTotalProd.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                </tr>
            `;
        }
    });

    document.getElementById('lista-rep-valorizacion').innerHTML = htmlFilas || '<tr><td colspan="4" class="text-center py-8 text-slate-400 italic">No hay productos con stock para valorizar.</td></tr>';
    document.getElementById('rep-kpi-valor').innerText = `$${valorTotalGlobal.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('rep-kpi-prods').innerText = window.prodsGlobalesReportes.length;
    document.getElementById('rep-kpi-stock').innerText = itemsConStock;

    const selectFiltro = document.getElementById('filtro-kardex-prod');
    let opts = '<option value="TODOS">-- Mostrar todo el historial mezclado --</option>';
    window.prodsGlobalesReportes.forEach(p => opts += `<option value="${p.id}">${p.nombre}</option>`);
    selectFiltro.innerHTML = opts;
}

// --- NAVEGACIÓN ENTRE TABS ---
window.cambiarTabReportes = function(tab) {
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
        if(window.movimientosGlobales.length === 0) window.cargarKardexGlobalBD();
    } else if(tab === 'compras') {
        btnCom.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors whitespace-nowrap";
        secCom.classList.remove('hidden'); kpis.classList.add('hidden');
        window.cargarHistorialComprasBD();
    }
}

// --- 2. CARGA DEL KARDEX GLOBAL DESDE LA BD ---
window.cargarKardexGlobalBD = async function() {
    const tbody = document.getElementById('lista-rep-kardex');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-16"><p class="text-3xl mb-2 animate-bounce">⏳</p><p class="text-slate-500 font-bold">Recopilando auditoría completa...</p><p class="text-xs text-slate-400">Esto puede tardar unos segundos.</p></td></tr>';

    const { data: movs, error: errMovs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, id_producto, id_ubicacion')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false });

    if (errMovs) {
        console.error("Error BD:", errMovs);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500 font-bold">❌ Error en Base de Datos: ${errMovs.message}</td></tr>`;
        return;
    }

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
            ref: m.referencia || '-'
        });
    });

    window.prodsGlobalesReportes.forEach(p => {
        const fechaCreacion = p.created_at ? new Date(p.created_at) : new Date();
        trazaAuditoria.push({
            fechaObj: fechaCreacion,
            idProd: p.id,
            nombreProd: p.nombre,
            abrev: p.id_unidad_almacenamiento?.abreviatura || 'UA',
            accion: '✨ CREACIÓN EN CATÁLOGO',
            ubicacion: '-',
            cantidad: 0,
            ref: 'El producto fue registrado en el sistema por primera vez.'
        });
    });

    trazaAuditoria.sort((a, b) => b.fechaObj - a.fechaObj);
    window.movimientosGlobales = trazaAuditoria;

    const filtroActual = document.getElementById('filtro-kardex-prod').value;
    window.renderizarTablaKardex(filtroActual);
}

// --- 3. PINTAR TABLA Y FILTRAR ---
window.renderizarTablaKardex = function(filtroIdProd) {
    const tbody = document.getElementById('lista-rep-kardex');
    let listaFiltrada = window.movimientosGlobales;

    if (filtroIdProd && filtroIdProd !== 'TODOS') {
        listaFiltrada = listaFiltrada.filter(t => t.idProd === filtroIdProd);
    }

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">No hay historial registrado.</td></tr>';
        return;
    }

    tbody.innerHTML = listaFiltrada.map(t => {
        const isPositivo = t.cantidad > 0;
        const isCero = t.cantidad === 0;
        const isCreacion = t.accion.includes('CREACIÓN');

        let colorCant = isPositivo ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (isCero ? 'text-slate-400 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200');
        let signo = isPositivo ? '+' : '';
        let cantHtml = isCreacion ? '<span class="text-slate-300">-</span>' : `<span class="px-2 py-1 rounded font-mono font-black border ${colorCant}">${signo}${t.cantidad} <span class="text-[10px] font-bold">${t.abrev}</span></span>`;
        
        let colorFila = isCreacion ? 'bg-indigo-50/30' : 'hover:bg-slate-50';
        let icono = isCreacion ? '🐣' : (isPositivo ? '📥' : '📤');
        if(isCero && !isCreacion) icono = '🔄';

        let fechaFormat = '-', horaFormat = '-';
        if (t.fechaObj && !isNaN(t.fechaObj.getTime())) {
            fechaFormat = t.fechaObj.toLocaleDateString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit' });
            horaFormat = t.fechaObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        }

        return `
        <tr class="${colorFila} transition-colors border-b border-slate-100">
            <td class="px-6 py-3">
                <span class="block text-slate-600 font-bold">${fechaFormat}</span>
                <span class="block text-xs text-slate-400 font-mono">${horaFormat}</span>
            </td>
            <td class="px-6 py-3 font-bold text-slate-800">${t.nombreProd}</td>
            <td class="px-6 py-3 text-slate-600 text-sm flex items-center gap-2 mt-1"><span>${icono}</span> <span class="font-bold">${t.accion}</span></td>
            <td class="px-6 py-3 text-right">${cantHtml}</td>
            <td class="px-6 py-3 text-slate-500 font-medium text-xs">📍 ${t.ubicacion}</td>
            <td class="px-6 py-3 text-slate-500 text-xs italic">"${t.ref}"</td>
        </tr>
        `;
    }).join('');
}

window.filtrarKardexGlobal = function(idProdSeleccionado) {
    window.renderizarTablaKardex(idProdSeleccionado);
}


// --- 4. NUEVO: HISTORIAL DE COMPRAS ---
window.cargarHistorialComprasBD = async function() {
    const tbody = document.getElementById('lista-historial-compras');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8">⏳ Buscando en el archivo...</td></tr>';
    
    const { data } = await clienteSupabase.from('compras')
        .select('id, created_at, total_compra, estado, proveedores(nombre, tipo)')
        .eq('id_empresa', window.miEmpresaId)
        .order('created_at', {ascending: false})
        .limit(200);

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500 italic">No hay órdenes o compras registradas.</td></tr>'; return;
    }

    tbody.innerHTML = data.map(c => {
        const isProd = c.proveedores?.tipo === 'Interno';
        const tipoStr = isProd ? '<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">🏭 Producción</span>' : '<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">🚚 Compra Ext.</span>';
        
        const f = new Date(c.created_at);
        const fecha = f.toLocaleDateString('es-CL') + ' ' + f.toLocaleTimeString('es-CL', {hour: '2-digit', minute: '2-digit'});
        
        let estadoStr = `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">${c.estado}</span>`;
        if (c.estado === 'Completada') estadoStr = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">✅ Ingresada</span>`;
        
        return `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="px-6 py-3 text-slate-600 font-medium text-sm whitespace-nowrap">${fecha}</td>
            <td class="px-6 py-3">${tipoStr}</td>
            <td class="px-6 py-3 font-bold text-slate-800">${c.proveedores?.nombre || 'General'}</td>
            <td class="px-6 py-3 text-right font-mono text-slate-600 font-bold">$${c.total_compra}</td>
            <td class="px-6 py-3 text-center">${estadoStr}</td>
            <td class="px-6 py-3 text-center">
                <button onclick="abrirDetallesOrdenGlobal('${c.id}', '${(c.proveedores?.nombre || '').replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-slate-800 bg-white border border-slate-300 shadow-sm px-3 py-1 rounded font-bold transition-transform hover:scale-105">👁️ Ver</button>
            </td>
        </tr>`;
    }).join('');
}

window.abrirDetallesOrdenGlobal = async function(idCompra, provNombre) {
    // Reutilizamos el modal que ya existe en el HTML (está en index.html)
    const modal = document.getElementById('modal-detalles-orden');
    if(!modal) return alert("Error: El modal de detalles no está cargado.");
    
    document.getElementById('do-proveedor').innerText = provNombre;
    const tbody = document.getElementById('do-filas');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8">⏳ Desglosando pedido...</td></tr>';
    modal.classList.remove('hidden');

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
