// ==========================================
// ATAJOS DE NAVEGACIÓN RECALIBRADOS 🚀
// ==========================================

// 1. Alerta de Stock -> Sugerencia de Pedidos
window.irAAlertasStock = function() { 
    window.cambiarVista('pedidos'); 
    setTimeout(() => { 
        if(window.cambiarSubTabPedidos) window.cambiarSubTabPedidos('sugerencias'); 
    }, 300); 
}

// 2. En Tránsito -> Pedidos en Tránsito
window.irATransito = function() { 
    window.cambiarVista('pedidos'); 
    setTimeout(() => { 
        if(window.cambiarSubTabPedidos) window.cambiarSubTabPedidos('transito'); 
    }, 300); 
}

// 3. Recepción de Pedidos -> Pedidos en Tránsito (donde se recibe)
window.irARecepcionPedidos = function() { 
    window.cambiarVista('pedidos'); 
    setTimeout(() => { 
        if(window.cambiarSubTabPedidos) window.cambiarSubTabPedidos('transito'); 
    }, 300); 
}

// 4. Orden de Producción -> Órdenes de Producción
window.irAOrdenesProduccion = function() { 
    window.cambiarVista('pedidos'); 
    setTimeout(() => { 
        if(window.cambiarSubTabPedidos) window.cambiarSubTabPedidos('produccion'); 
    }, 300); 
}

// -- Mantengo estos por si los usas en otros botones del dash --
window.irACargarVentas = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('ventas'), 300); }
window.irAComprasDirectas = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('compras'), 300); }
window.irAOtrosMovimientos = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('otros'), 300); }