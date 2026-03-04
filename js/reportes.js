window.movimientosGlobales = []; // Caché para no consultar la BD cada vez que filtramos
window.prodsGlobalesReportes = [];
window.ubisGlobalesReportes = [];

window.cargarReportes = async function() {
    window.cambiarTabReportes('valorizacion'); // Por defecto abre valorización
    
    // --- 1. CARGA DE VALORIZACIÓN ---
    // Traemos productos, saldos y ubicaciones de forma plana (sin cruces complejos)
    const [{data: prods, error: errP}, {data: saldos}, {data: ubis}] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, created_at, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('inventario_saldos').select('id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);

    if (errP) { 
        console.error(errP); 
        return alert("Error cargando productos: " + errP.message); 
    }

    // Guardamos en memoria para usarlos luego en el Kardex
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

    // Poblar el filtro del Kardex
    const selectFiltro = document.getElementById('filtro-kardex-prod');
    let opts = '<option value="TODOS">-- Mostrar todo el historial mezclado --</option>';
    window.prodsGlobalesReportes.forEach(p => opts += `<option value="${p.id}">${p.nombre}</option>`);
    selectFiltro.innerHTML = opts;
}

// --- NAVEGACIÓN ENTRE TABS ---
window.cambiarTabReportes = function(tab) {
    const btnVal = document.getElementById('tab-rep-valorizacion');
    const btnKar = document.getElementById('tab-rep-kardex');
    const secVal = document.getElementById('seccion-rep-valorizacion');
    const secKar = document.getElementById('seccion-rep-kardex');
    const kpis = document.getElementById('rep-kpis-container'); 

    if(tab === 'valorizacion') {
        btnVal.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors";
        btnKar.className = "px-6 py-3 font-medium text-slate-500 hover:text-slate-700 transition-colors";
        secVal.classList.remove('hidden'); secKar.classList.add('hidden'); kpis.classList.remove('hidden');
    } else {
        btnKar.className = "px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 transition-colors";
        btnVal.className = "px-6 py-3 font-medium text-slate-500 hover:text-slate-700 transition-colors";
        secKar.classList.remove('hidden'); secVal.classList.add('hidden'); kpis.classList.add('hidden');
        
        // Si no hemos cargado la historia aún, la traemos de la BD
        if(window.movimientosGlobales.length === 0) window.cargarKardexGlobalBD();
    }
}

// --- 2. CARGA DEL KARDEX GLOBAL DESDE LA BD ---
window.cargarKardexGlobalBD = async function() {
    const tbody = document.getElementById('lista-rep-kardex');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-16"><p class="text-3xl mb-2 animate-bounce">⏳</p><p class="text-slate-500 font-bold">Recopilando auditoría completa...</p><p class="text-xs text-slate-400">Esto puede tardar unos segundos.</p></td></tr>';

    // Petición 100% plana y segura
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
    
    // Armar el historial cruzando datos manualmente (Evita errores de Foreign Keys)
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

    // Unir "Nacimientos"
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

    // Ordenar de más nuevo a más viejo
    trazaAuditoria.sort((a, b) => b.fechaObj - a.fechaObj);
    window.movimientosGlobales = trazaAuditoria;

    // Pintar la tabla manteniendo el filtro activo
    const filtroActual = document.getElementById('filtro-kardex-prod').value;
    window.renderizarTablaKardex(filtroActual);
}

// --- 3. PINTAR TABLA Y FILTRAR ---
window.renderizarTablaKardex = function(filtroIdProd) {
    const tbody = document.getElementById('lista-rep-kardex');
    let listaFiltrada = window.movimientosGlobales;

    // Filtro inteligente
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

        // Formato visual
        let colorCant = isPositivo ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (isCero ? 'text-slate-400 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200');
        let signo = isPositivo ? '+' : '';
        let cantHtml = isCreacion ? '<span class="text-slate-300">-</span>' : `<span class="px-2 py-1 rounded font-mono font-black border ${colorCant}">${signo}${t.cantidad} <span class="text-[10px] font-bold">${t.abrev}</span></span>`;
        
        let colorFila = isCreacion ? 'bg-indigo-50/30' : 'hover:bg-slate-50';
        let icono = isCreacion ? '🐣' : (isPositivo ? '📥' : '📤');
        if(isCero && !isCreacion) icono = '🔄';

        // Formato de Fecha a prueba de fallos
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
