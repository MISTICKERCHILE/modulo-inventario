window.cargarDashboard = async function() {
    const hora = new Date().getHours();
    let saludo = "Buenas noches";
    if (hora >= 5 && hora < 12) saludo = "Buenos días";
    else if (hora >= 12 && hora < 19) saludo = "Buenas tardes";
    const elSaludo = document.getElementById('dash-saludo');
    if(elSaludo) elSaludo.innerText = `¡${saludo}, ${window.usuarioActual}!`;

    const { data: posMovs } = await clienteSupabase.from('movimientos_inventario').select('fecha_movimiento').eq('id_empresa', window.miEmpresaId).eq('tipo_movimiento', 'VENTA_POS').order('fecha_movimiento', { ascending: false }).limit(1);
    if (posMovs && posMovs.length > 0) {
        const diffTime = Math.abs(new Date() - new Date(posMovs[0].fecha_movimiento));
        document.getElementById('widget-pos-num').innerText = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else { document.getElementById('widget-pos-num').innerText = '-'; }

    const { data: transitoData } = await clienteSupabase.from('compras_detalles').select('id, compras!inner(id_empresa)').eq('compras.id_empresa', window.miEmpresaId).in('estado', ['En Tránsito', 'Postpuesto']);
    document.getElementById('widget-transito-num').innerText = transitoData ? transitoData.length : 0;

    const [{ data: reglas }, { data: saldos }, { data: transitoGlobal }, {data: prods}, {data: sucursales}] = await Promise.all([
        clienteSupabase.from('reglas_stock_sucursal').select('id_sucursal, id_producto, stock_minimo_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('inventario_saldos').select('id_sucursal, id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('compras_detalles').select('id_sucursal_destino, id_producto, cantidad_uc, productos(cant_en_ua_de_uc), compras!inner(id_empresa)').eq('compras.id_empresa', window.miEmpresaId).in('estado', ['En Tránsito', 'Postpuesto']),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);

    let contadorAlertas = 0; let htmlNotificaciones = '';
    (reglas || []).forEach(r => {
        if(r.stock_minimo_ua <= 0) return;
        const stockFisico = saldos.filter(s => s.id_sucursal === r.id_sucursal && s.id_producto === r.id_producto).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
        const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === r.id_sucursal && t.id_producto === r.id_producto).reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);
        const virtual = stockFisico + incomingUA;
        if(virtual <= r.stock_minimo_ua) {
            contadorAlertas++;
            htmlNotificaciones += `<div class="px-4 py-3 hover:bg-red-50 cursor-pointer transition-colors" onclick="irAAlertasStock(); toggleNotificaciones();"><p class="text-sm font-bold text-slate-700">⚠️ Bajo Stock: ${prods.find(p => p.id === r.id_producto)?.nombre || '...'}</p><p class="text-xs text-slate-500 mt-0.5">Bodega: <span class="font-bold">${sucursales.find(s => s.id === r.id_sucursal)?.nombre || '...'}</span> (Tienes ${virtual.toFixed(2)} y requieres ${r.stock_minimo_ua})</p></div>`;
        }
    });
    
    document.getElementById('widget-alertas-num').innerText = contadorAlertas;
    const panelNotif = document.getElementById('lista-notificaciones');
    if(contadorAlertas > 0) panelNotif.innerHTML = htmlNotificaciones; else panelNotif.innerHTML = `<div class="px-4 py-8 text-center"><p class="text-3xl mb-2">🎉</p><p class="text-sm text-slate-500 font-bold">¡Todo al día!</p><p class="text-xs text-slate-400">No hay alertas.</p></div>`;

    const bell = document.getElementById('bell-indicator'), bellText = document.getElementById('bell-badge-text');
    if(bell) {
        if(contadorAlertas > 0) {
            bell.classList.remove('hidden'); bell.innerText = contadorAlertas > 9 ? '+9' : contadorAlertas;
            bellText.innerText = `${contadorAlertas} Alerta(s)`; bellText.classList.replace('bg-slate-100', 'bg-red-100'); bellText.classList.replace('text-slate-500', 'text-red-600');
        } else {
            bell.classList.add('hidden'); bellText.innerText = "0 Alertas"; bellText.classList.replace('bg-red-100', 'bg-slate-100'); bellText.classList.replace('text-red-600', 'text-slate-500');
        }
    }
}

// ATAJOS DEL DASHBOARD Y NOTIFICACIONES
window.irAAlertasStock = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('sugerencias'); }, 100); }
window.irATransito = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('transito'); }, 100); }
window.irASubirVentas = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('ventas'), 100); }
window.irAComprasDirectas = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('compras'), 100); }
window.irARecepcionPedidos = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('transito'); }, 100); }
window.irAOrdenesProduccion = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('produccion'); }, 100); }
window.irAOtrosMovimientos = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('otros'), 100); }

