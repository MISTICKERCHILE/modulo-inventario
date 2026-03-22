// ==========================================
// LABORATORIO DE VENTAS Y RANKING (BI)
// ==========================================

// 1. CARGA INICIAL DE FILTROS (Se ejecuta al abrir la pantalla)
window.cargarLaboratorio = async function() {
    // Cargar sucursales en el selector
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
    const selectSuc = document.getElementById('lab-sucursal');
    if(selectSuc) {
        selectSuc.innerHTML = '<option value="TODAS">Todas las Sucursales</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    }
    
    // Setear fechas por defecto: Desde el día 1 del mes actual hasta HOY
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    
    // Ajuste de zona horaria local para que los inputs tipo "date" lo lean bien
    const formatFecha = (fecha) => {
        const d = new Date(fecha.getTime() - (fecha.getTimezoneOffset() * 60000));
        return d.toISOString().split('T')[0];
    };

    document.getElementById('lab-fecha-inicio').value = formatFecha(inicioMes);
    document.getElementById('lab-fecha-fin').value = formatFecha(hoy);
    
    // Ejecutamos la búsqueda inicial
    window.ejecutarLaboratorio();
}

// 2. FUNCIÓN PARA CAMBIAR ENTRE PESTAÑAS (Productos, Sucursales, Tickets)
window.cambiarTabLab = function(tab) {
    const tabs = ['productos', 'sucursales', 'tickets'];
    
    tabs.forEach(t => {
        const tabla = document.getElementById(`tabla-lab-${t}`);
        const btn = document.getElementById(`tab-lab-${t}`);
        
        if(tabla) tabla.classList.add('hidden');
        if(btn) btn.className = 'px-6 py-3 font-medium text-slate-500 hover:text-slate-700 transition-colors whitespace-nowrap outline-none';
    });
    
    const tablaActiva = document.getElementById(`tabla-lab-${tab}`);
    const btnActivo = document.getElementById(`tab-lab-${tab}`);
    
    if(tablaActiva) tablaActiva.classList.remove('hidden');
    if(btnActivo) btnActivo.className = 'px-6 py-3 font-bold border-b-2 border-blue-600 text-blue-700 bg-white whitespace-nowrap outline-none';
}

// 3. CEREBRO PRINCIPAL: BUSCAR Y CALCULAR DATOS
window.ejecutarLaboratorio = async function() {
    // Ponemos las tablas en estado de "Cargando"
    const msjCarga = '<tr><td colspan="5" class="text-center py-16 text-blue-600 font-bold animate-pulse">⏳ Procesando millones de datos...</td></tr>';
    document.getElementById('body-lab-productos').innerHTML = msjCarga;
    document.getElementById('body-lab-sucursales').innerHTML = msjCarga;
    document.getElementById('body-lab-tickets').innerHTML = msjCarga;

    const btnAnalizar = document.querySelector('button[onclick="ejecutarLaboratorio()"]');
    if(btnAnalizar) { btnAnalizar.innerHTML = '⏳ Calculando...'; btnAnalizar.disabled = true; }

    try {
        // Leer filtros
        const fechaInicio = document.getElementById('lab-fecha-inicio').value + " 00:00:00";
        const fechaFin = document.getElementById('lab-fecha-fin').value + " 23:59:59";
        const idSucursal = document.getElementById('lab-sucursal').value;
        const origen = document.getElementById('lab-origen').value;

        // Construir consulta a la base de datos (Asume tablas: ventas y ventas_detalles)
        let queryVentas = clienteSupabase.from('ventas')
            .select('id, created_at, numero_ticket, total, origen, sucursales(nombre), ventas_detalles(cantidad, subtotal, productos(nombre))')
            .eq('id_empresa', window.miEmpresaId)
            .gte('created_at', fechaInicio)
            .lte('created_at', fechaFin);

        if(idSucursal !== 'TODAS') queryVentas = queryVentas.eq('id_sucursal', idSucursal);
        if(origen !== 'TODOS') queryVentas = queryVentas.eq('origen', origen);

        const { data: ventasData, error } = await queryVentas;
        if(error) throw error;

        // Variables para los KPIs (Tarjetas de arriba)
        let totalDinero = 0;
        let totalTickets = (ventasData || []).length;
        let totalProds = 0;

        // Variables para los rankings
        let rankingProductos = {};
        let rankingSucursales = {};

        // 🧠 PROCESAMIENTO MATEMÁTICO
        (ventasData || []).forEach(v => {
            const montoVenta = Number(v.total) || 0;
            totalDinero += montoVenta;
            
            // Agrupar por Sucursal
            const nombreSuc = v.sucursales?.nombre || 'General / Sin Sucursal';
            if(!rankingSucursales[nombreSuc]) rankingSucursales[nombreSuc] = { tickets: 0, total: 0 };
            rankingSucursales[nombreSuc].tickets += 1;
            rankingSucursales[nombreSuc].total += montoVenta;

            // Agrupar por Producto (Revisando los detalles del ticket)
            (v.ventas_detalles || []).forEach(det => {
                const cant = Number(det.cantidad) || 0;
                const subT = Number(det.subtotal) || 0;
                totalProds += cant;

                const nombreProd = det.productos?.nombre || 'Producto Eliminado/Desconocido';
                if(!rankingProductos[nombreProd]) rankingProductos[nombreProd] = { cantidad: 0, total: 0 };
                
                rankingProductos[nombreProd].cantidad += cant;
                rankingProductos[nombreProd].total += subT;
            });
        });

        // Calcular Ticket Promedio
        const ticketPromedio = totalTickets > 0 ? (totalDinero / totalTickets) : 0;

        // ACTUALIZAR KPIs EN PANTALLA
        document.getElementById('lab-total-dinero').innerText = `$${totalDinero.toLocaleString('es-CL')}`;
        document.getElementById('lab-total-tickets').innerText = totalTickets.toLocaleString('es-CL');
        document.getElementById('lab-total-prods').innerText = parseFloat(totalProds.toFixed(2)).toLocaleString('es-CL');
        document.getElementById('lab-ticket-promedio').innerText = `$${Math.round(ticketPromedio).toLocaleString('es-CL')}`;

        // 🎨 DIBUJAR TABLA 1: RANKING DE PRODUCTOS
        const arrayProductos = Object.keys(rankingProductos).map(k => ({ nombre: k, ...rankingProductos[k] }));
        arrayProductos.sort((a, b) => b.total - a.total); // Ordenar por dinero (Mayor a menor)
        
        const bodyProds = document.getElementById('body-lab-productos');
        if(arrayProductos.length === 0) {
            bodyProds.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-slate-400 font-medium">No se encontraron ventas con estos filtros.</td></tr>';
        } else {
            bodyProds.innerHTML = arrayProductos.map((p, index) => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">
                        ${index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : `<span class="text-slate-300 w-6 inline-block">${index+1}.</span>`} 
                        ${p.nombre}
                    </td>
                    <td class="px-6 py-3 text-center font-mono font-medium text-slate-600">${parseFloat(p.cantidad.toFixed(2))}</td>
                    <td class="px-6 py-3 text-right font-black text-emerald-700">$${Math.round(p.total).toLocaleString('es-CL')}</td>
                </tr>
            `).join('');
        }

        // 🎨 DIBUJAR TABLA 2: VENTAS POR SUCURSAL
        const arraySucursales = Object.keys(rankingSucursales).map(k => ({ nombre: k, ...rankingSucursales[k] }));
        arraySucursales.sort((a, b) => b.total - a.total);
        
        const bodySucs = document.getElementById('body-lab-sucursales');
        bodySucs.innerHTML = arraySucursales.length === 0 
            ? '<tr><td colspan="3" class="text-center py-8 text-slate-400">Sin datos.</td></tr>'
            : arraySucursales.map(s => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">🏢 ${s.nombre}</td>
                    <td class="px-6 py-3 text-center font-mono font-medium text-slate-600">${s.tickets}</td>
                    <td class="px-6 py-3 text-right font-black text-emerald-700">$${Math.round(s.total).toLocaleString('es-CL')}</td>
                </tr>
            `).join('');

        // 🎨 DIBUJAR TABLA 3: HISTORIAL DE TICKETS
        // Ordenamos los tickets desde el más reciente al más viejo
        const arrayTickets = [...(ventasData || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        const bodyTickets = document.getElementById('body-lab-tickets');
        bodyTickets.innerHTML = arrayTickets.length === 0
            ? '<tr><td colspan="5" class="text-center py-8 text-slate-400">Sin tickets en este periodo.</td></tr>'
            : arrayTickets.map(t => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 text-sm text-slate-500">${new Date(t.created_at).toLocaleString('es-CL')}</td>
                    <td class="px-6 py-3 text-center font-bold text-slate-700">#${t.numero_ticket || t.id.substring(0,8)}</td>
                    <td class="px-6 py-3 text-center text-xs"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold uppercase">${t.origen || 'POS'}</span></td>
                    <td class="px-6 py-3 text-sm font-medium text-slate-600">${t.sucursales?.nombre || '-'}</td>
                    <td class="px-6 py-3 text-right font-black text-blue-700">$${Math.round(t.total).toLocaleString('es-CL')}</td>
                </tr>
            `).join('');

    } catch (error) {
        console.error(error);
        alert("Error procesando los datos: " + error.message);
        document.getElementById('body-lab-productos').innerHTML = '<tr><td colspan="3" class="text-center py-8 text-red-500 font-bold">Error de conexión.</td></tr>';
    } finally {
        if(btnAnalizar) { btnAnalizar.innerHTML = '<span>⚡</span> Analizar Datos'; btnAnalizar.disabled = false; }
    }
}