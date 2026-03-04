window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };

// --- LOGIN Y SESIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ 
        email: document.getElementById('email').value, 
        password: document.getElementById('password').value 
    });
    
    if (error) return alert("❌ Credenciales incorrectas");
    
    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa, nombre').eq('id_usuario', data.user.id).single();
    if (!perfil) return alert("Usuario sin empresa asignada");
    
    window.miEmpresaId = perfil.id_empresa;
    const nombreUsuario = perfil.nombre || 'Equipo';

    document.getElementById('user-email-dropdown').innerText = data.user.email;
    document.getElementById('user-name-display').innerText = nombreUsuario;

    const hora = new Date().getHours();
    let saludo = "Buenas noches";
    if (hora >= 5 && hora < 12) saludo = "Buenos días";
    else if (hora >= 12 && hora < 19) saludo = "Buenas tardes";
    document.getElementById('dash-saludo').innerText = `¡${saludo}, ${nombreUsuario}!`;

    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    window.cambiarVista('dashboard');
});

window.cerrarSesion = function() { location.reload(); }

window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar.classList.contains('w-64')) {
        sidebar.classList.remove('w-64', 'p-4'); sidebar.classList.add('w-0', 'p-0');
    } else {
        sidebar.classList.remove('w-0', 'p-0'); sidebar.classList.add('w-64', 'p-4');
    }
}

// Lógica de menús desplegables de la cabecera (Usuario y Notificaciones)
window.toggleUserMenu = function() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
    document.getElementById('panel-notificaciones').classList.add('hidden'); // Cierra el otro
}

window.toggleNotificaciones = function() {
    document.getElementById('panel-notificaciones').classList.toggle('hidden');
    document.getElementById('user-dropdown').classList.add('hidden'); // Cierra el otro
}

// Cerrar clics al hacer tap afuera
document.addEventListener('click', (e) => {
    const userDropdown = document.getElementById('user-dropdown');
    const userBtn = e.target.closest('button[onclick="toggleUserMenu()"]');
    if (!userBtn && userDropdown && !userDropdown.classList.contains('hidden') && !e.target.closest('#user-dropdown')) {
        userDropdown.classList.add('hidden');
    }

    const notifDropdown = document.getElementById('panel-notificaciones');
    const notifBtn = e.target.closest('button[onclick="toggleNotificaciones()"]');
    if (!notifBtn && notifDropdown && !notifDropdown.classList.contains('hidden') && !e.target.closest('#panel-notificaciones')) {
        notifDropdown.classList.add('hidden');
    }
});


// --- NAVEGACIÓN GLOBAL ---
window.cambiarVista = function(v) {
    if(!window.miEmpresaId) return; 
    
    // Ya no existe el botón btn-menu-dashboard, así que solo iteramos sobre los demás
    ['catalogos', 'productos', 'recetas', 'movimientos', 'inventario'].forEach(vis => {
        const el = document.getElementById(`vista-${vis}`);
        if(el) el.classList.add('hidden');
        
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors mb-1';
    });
    
    // Ocultar dashboard que no tiene botón lateral
    const dashEl = document.getElementById('vista-dashboard');
    if(dashEl) dashEl.classList.add('hidden');
    
    const activeEl = document.getElementById(`vista-${v}`);
    if(activeEl) activeEl.classList.remove('hidden');
    
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors mb-1';
    
    // Disparadores según la vista
    if(v === 'dashboard') window.cargarDashboard();
    if(v === 'catalogos') window.cambiarTab('categorias');
    if(v === 'productos') { window.cargarDatosSelects(); window.cargarProductos(); }
    if(v === 'recetas') { window.cargarBuscadorRecetas(); }
    if(v === 'movimientos') { window.cambiarTabMovimientos('pedidos'); } 
    if(v === 'inventario') { window.cargarInventario(); }
}


// --- INTELIGENCIA DEL DASHBOARD ---
window.cargarDashboard = async function() {
    // 1. CÁLCULO WIDGET: Días desde último ingreso de ventas (POS)
    const { data: posMovs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .order('fecha_movimiento', { ascending: false })
        .limit(1);

    if (posMovs && posMovs.length > 0) {
        const fechaUltimaVenta = new Date(posMovs[0].fecha_movimiento);
        const diffTime = Math.abs(new Date() - fechaUltimaVenta);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        document.getElementById('widget-pos-num').innerText = diffDays;
    } else {
        document.getElementById('widget-pos-num').innerText = '-';
    }

    // 2. CÁLCULO WIDGET: Pedidos en Tránsito
    const { data: transitoData } = await clienteSupabase.from('compras_detalles')
        .select('id, compras!inner(id_empresa)')
        .eq('compras.id_empresa', window.miEmpresaId)
        .in('estado', ['En Tránsito', 'Postpuesto']);
    
    document.getElementById('widget-transito-num').innerText = transitoData ? transitoData.length : 0;

    // 3. CÁLCULO WIDGET: Alertas de Stock y Construcción de Notificaciones
    const [{ data: reglas }, { data: saldos }, { data: transitoGlobal }, {data: prods}, {data: sucursales}] = await Promise.all([
        clienteSupabase.from('reglas_stock_sucursal').select('id_sucursal, id_producto, stock_minimo_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('inventario_saldos').select('id_sucursal, id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('compras_detalles').select('id_sucursal_destino, id_producto, cantidad_uc, productos(cant_en_ua_de_uc), compras!inner(id_empresa)').eq('compras.id_empresa', window.miEmpresaId).in('estado', ['En Tránsito', 'Postpuesto']),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId)
    ]);

    let contadorAlertas = 0;
    let htmlNotificaciones = '';

    (reglas || []).forEach(r => {
        if(r.stock_minimo_ua <= 0) return;
        
        const stockFisico = saldos.filter(s => s.id_sucursal === r.id_sucursal && s.id_producto === r.id_producto).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
        const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === r.id_sucursal && t.id_producto === r.id_producto)
                        .reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);
        
        const virtual = stockFisico + incomingUA;
        
        if(virtual <= r.stock_minimo_ua) {
            contadorAlertas++;
            
            const prodName = prods.find(p => p.id === r.id_producto)?.nombre || 'Producto sin nombre';
            const sucName = sucursales.find(s => s.id === r.id_sucursal)?.nombre || 'Sucursal';
            
            htmlNotificaciones += `
            <div class="px-4 py-3 hover:bg-red-50 cursor-pointer transition-colors" onclick="irAAlertasStock(); toggleNotificaciones();">
                <p class="text-sm font-bold text-slate-700">⚠️ Bajo Stock: ${prodName}</p>
                <p class="text-xs text-slate-500 mt-0.5">Bodega: <span class="font-bold">${sucName}</span> (Tienes ${virtual.toFixed(2)} y requieres ${r.stock_minimo_ua})</p>
            </div>
            `;
        }
    });
    
    document.getElementById('widget-alertas-num').innerText = contadorAlertas;
    
    // Inyectamos las notificaciones al panel desplegable
    const panelNotif = document.getElementById('lista-notificaciones');
    if(contadorAlertas > 0) {
        panelNotif.innerHTML = htmlNotificaciones;
    } else {
        panelNotif.innerHTML = `<div class="px-4 py-8 text-center"><p class="text-3xl mb-2">🎉</p><p class="text-sm text-slate-500 font-bold">¡Todo al día!</p><p class="text-xs text-slate-400">No hay alertas de stock por ahora.</p></div>`;
    }

    // Actualizamos los circulitos rojos de la campanita
    const bell = document.getElementById('bell-indicator');
    const bellText = document.getElementById('bell-badge-text');
    if(bell) {
        if(contadorAlertas > 0) {
            bell.classList.remove('hidden');
            bell.innerText = contadorAlertas > 9 ? '+9' : contadorAlertas;
            bellText.innerText = `${contadorAlertas} Alerta(s)`;
            bellText.classList.replace('bg-slate-100', 'bg-red-100');
            bellText.classList.replace('text-slate-500', 'text-red-600');
        } else {
            bell.classList.add('hidden');
            bellText.innerText = "0 Alertas";
            bellText.classList.replace('bg-red-100', 'bg-slate-100');
            bellText.classList.replace('text-red-600', 'text-slate-500');
        }
    }
}

// Navegación rápida desde los Widgets y Notificaciones
window.irAAlertasStock = function() {
    window.cambiarVista('movimientos');
    if (typeof window.cambiarTabMovimientos === 'function') {
        window.cambiarTabMovimientos('pedidos');
        window.cambiarSubTabPedidos('sugerencias');
    }
}
window.irATransito = function() {
    window.cambiarVista('movimientos');
    if (typeof window.cambiarTabMovimientos === 'function') {
        window.cambiarTabMovimientos('pedidos');
        window.cambiarSubTabPedidos('transito');
    }
}
window.irASubirVentas = function() {
    window.cambiarVista('movimientos');
    if (typeof window.cambiarTabMovimientos === 'function') window.cambiarTabMovimientos('ventas');
}


// --- SISTEMA DE EDICIÓN GLOBAL ---
window.cancelarEdicion = function(formName) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const formEl = document.getElementById(`form-${formName}`);
    if(formEl) {
        formEl.reset();
        const btnSubmit = formEl.querySelector('button[type="submit"]');
        if(btnSubmit) { 
            btnSubmit.innerText = formName === 'producto' ? 'Guardar Producto' : 'Guardar'; 
            btnSubmit.classList.replace('bg-blue-600', formName === 'ingrediente' || formName === 'producto' ? 'bg-emerald-600' : 'bg-slate-800'); 
        }
        const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}

window.activarEdicionGlobal = function(formName, id, objJS) {
    window.modoEdicion = { activo: true, id: id, form: formName };
    for (const [inputId, valor] of Object.entries(objJS)) { document.getElementById(inputId).value = valor; }
    
    const btnSubmit = document.querySelector(`#form-${formName} button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Actualizar ✏️';
        btnSubmit.classList.replace('bg-slate-800', 'bg-blue-600');
        btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600'); 
    }
    const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
    if(btnCancel) btnCancel.classList.remove('hidden');
};

window.eliminarReg = async function(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro definitivamente? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla === 'sucursales') window.cargarSucursales(); 
        else if (tabla === 'tipos_movimiento') window.cargarTiposMovimiento();
        else window.cambiarVista(document.querySelector('.bg-emerald-600').id.replace('btn-menu-',''));
    }
}
