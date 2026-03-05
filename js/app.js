window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo'; 

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
    window.usuarioActual = perfil.nombre || 'Equipo';

    document.getElementById('user-email-dropdown').innerText = data.user.email;
    document.getElementById('user-name-display').innerText = window.usuarioActual;

    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    window.actualizarBadgeCarrito(); // Revisa la memoria al entrar
    window.cambiarVista('dashboard');
});

window.cerrarSesion = function() { location.reload(); }

// --- FRENO DE EMERGENCIA Y MEMORIA ---
window.actualizarBadgeCarrito = function() {
    if(!window.miEmpresaId) return;
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    const badge = document.getElementById('badge-cart');
    if(badge) {
        const arr = guardado ? JSON.parse(guardado) : [];
        if(arr.length > 0) {
            badge.innerText = arr.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

window.addEventListener('beforeunload', (e) => {
    if(!window.miEmpresaId) return;
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    if (guardado && JSON.parse(guardado).length > 0) {
        e.preventDefault();
        e.returnValue = ''; // Gatilla la alerta del navegador
    }
});


// NUEVO LOGICA MENU CELULAR (DRAWER)
window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    // Si estamos en celular (ancho menor a 768px)
    if (window.innerWidth < 768) {
        sidebar.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    } else {
        // Si estamos en computadora, simplemente lo ocultamos o mostramos
        sidebar.classList.toggle('md:hidden');
    }
}

window.toggleUserMenu = function() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
    document.getElementById('panel-notificaciones').classList.add('hidden');
}
window.toggleNotificaciones = function() {
    document.getElementById('panel-notificaciones').classList.toggle('hidden');
    document.getElementById('user-dropdown').classList.add('hidden');
}

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

// --- NAVEGACIÓN GLOBAL CON CARGA DINÁMICA ---
window.cambiarVista = async function(v) {
    if(!window.miEmpresaId) return; 
    
    if (window.innerWidth < 768) {
        document.getElementById('sidebar-menu')?.classList.add('-translate-x-full');
        document.getElementById('sidebar-backdrop')?.classList.add('hidden');
    }
    
    ['dashboard', 'catalogos', 'productos', 'recetas', 'movimientos', 'inventario', 'reportes'].forEach(vis => {
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors mb-1';
    });
    
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors mb-1';
    
    document.getElementById('main-content').innerHTML = '<div class="flex justify-center items-center h-full text-slate-400 font-bold text-xl w-full">⏳ Cargando módulo...</div>';

    try {
        const response = await fetch(`vistas/${v}.html`);
        if(!response.ok) throw new Error(`No se pudo cargar la vista ${v}`);
        const html = await response.text();
        document.getElementById('main-content').innerHTML = html;

        if(v === 'dashboard') window.cargarDashboard();
        if(v === 'catalogos') window.cambiarTab('categorias');
        if(v === 'productos') { window.cargarDatosSelects(); window.cargarProductos(); }
        if(v === 'recetas') { window.cargarBuscadorRecetas(); }
        if(v === 'movimientos') { window.cambiarTabMovimientos('pedidos'); } 
        if(v === 'inventario') { window.cargarInventario(); }
        if(v === 'reportes') { window.cargarReportes(); }

    } catch (error) {
        console.error(error);
        document.getElementById('main-content').innerHTML = `<div class="p-8 text-center text-red-500 font-bold w-full">❌ Error cargando la vista: ${v}.html</div>`;
    }
}

// --- VARIABLES GLOBALES DE ESTADO ---
window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo'; 

// --- 1. LOGIN Y SESIÓN ---
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
    window.usuarioActual = perfil.nombre || 'Equipo';

    document.getElementById('user-email-dropdown').innerText = data.user.email;
    document.getElementById('user-name-display').innerText = window.usuarioActual;

    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    window.actualizarBadgeCarrito(); 
    window.cambiarVista('dashboard');
});

window.cerrarSesion = function() { location.reload(); }

// --- 2. GESTIÓN DE INTERFAZ Y MENÚ ---
window.actualizarBadgeCarrito = function() {
    if(!window.miEmpresaId) return;
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    const badge = document.getElementById('badge-cart');
    if(badge) {
        const arr = guardado ? JSON.parse(guardado) : [];
        if(arr.length > 0) {
            badge.innerText = arr.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    // Adaptabilidad: En móvil usa traslación, en desktop oculta/muestra
    if (window.innerWidth < 768) {
        sidebar.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    } else {
        sidebar.classList.toggle('md:hidden');
    }
}

window.toggleUserMenu = function() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
    document.getElementById('panel-notificaciones').classList.add('hidden');
}

window.toggleNotificaciones = function() {
    document.getElementById('panel-notificaciones').classList.toggle('hidden');
    document.getElementById('user-dropdown').classList.add('hidden');
}

// --- 3. NAVEGACIÓN GLOBAL (CARGA DINÁMICA) ---
window.cambiarVista = async function(v) {
    if(!window.miEmpresaId) return; 
    
    // Auto-cerrar menú en móviles al navegar
    if (window.innerWidth < 768) {
        document.getElementById('sidebar-menu')?.classList.add('-translate-x-full');
        document.getElementById('sidebar-backdrop')?.classList.add('hidden');
    }
    
    // Estilo de botones activos
    ['dashboard', 'catalogos', 'productos', 'recetas', 'movimientos', 'inventario', 'reportes'].forEach(vis => {
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors mb-1';
    });
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors mb-1';
    
    document.getElementById('main-content').innerHTML = '<div class="flex justify-center items-center h-full text-slate-400 font-bold text-xl w-full">⏳ Cargando módulo...</div>';

    try {
        const response = await fetch(`vistas/${v}.html`);
        if(!response.ok) throw new Error(`No se pudo cargar la vista ${v}`);
        const html = await response.text();
        document.getElementById('main-content').innerHTML = html;

        // Inicializadores específicos por módulo
        if(v === 'dashboard') window.cargarDashboard();
        if(v === 'catalogos') window.cambiarTab('categorias');
        if(v === 'productos') { window.cargarDatosSelects(); window.cargarProductos(); }
        if(v === 'recetas') { window.cargarBuscadorRecetas(); }
        if(v === 'movimientos') { window.cambiarTabMovimientos('pedidos'); } 
        if(v === 'inventario') { window.cargarInventario(); }
        if(v === 'reportes') { window.cargarReportes(); }

    } catch (error) {
        console.error(error);
        document.getElementById('main-content').innerHTML = `<div class="p-8 text-center text-red-500 font-bold w-full">❌ Error cargando la vista: ${v}.html</div>`;
    }
}

// --- 4. DASHBOARD: KPIs Y ATENCIONES ---
window.cargarDashboard = async function() {
    const hora = new Date().getHours();
    let saludo = "Buenas noches";
    if (hora >= 5 && hora < 12) saludo = "Buenos días";
    else if (hora >= 12 && hora < 19) saludo = "Buenas tardes";
    const elSaludo = document.getElementById('dash-saludo');
    if(elSaludo) elSaludo.innerText = `¡${saludo}, ${window.usuarioActual}!`;

    // Widget POS: Última carga y periodo
    const { data: posMovs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, referencia')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .order('fecha_movimiento', { ascending: false }).limit(1);

    if (posMovs && posMovs.length > 0) {
        const ultimaFecha = new Date(posMovs[0].fecha_movimiento);
        const diffTime = Math.abs(new Date() - ultimaFecha);
        document.getElementById('widget-pos-num').innerText = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const elFecha = document.getElementById('widget-pos-fecha');
        const elPeriodo = document.getElementById('widget-pos-periodo');
        if(elFecha) elFecha.innerText = `Cargado el: ${ultimaFecha.toLocaleDateString('es-CL')}`;
        
        const periodoMatch = posMovs[0].referencia.match(/\[Período:.*?\]/);
        if(elPeriodo) elPeriodo.innerText = periodoMatch ? periodoMatch[0] : 'Periodo: No especificado';
    } else { 
        document.getElementById('widget-pos-num').innerText = '-'; 
    }

    // Widgets de Tránsito y Alertas
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
        const stockFisico = (saldos||[]).filter(s => s.id_sucursal === r.id_sucursal && s.id_producto === r.id_producto).reduce((sum, s) => sum + Number(s.cantidad_actual_ua), 0);
        const incomingUA = (transitoGlobal||[]).filter(t => t.id_sucursal_destino === r.id_sucursal && t.id_producto === r.id_producto).reduce((sum, t) => sum + (t.cantidad_uc * (t.productos?.cant_en_ua_de_uc || 1)), 0);
        const virtual = stockFisico + incomingUA;
        if(virtual <= r.stock_minimo_ua) {
            contadorAlertas++;
            htmlNotificaciones += `<div class="px-4 py-3 hover:bg-red-50 cursor-pointer transition-colors" onclick="irAAlertasStock(); toggleNotificaciones();"><p class="text-sm font-bold text-slate-700">⚠️ Bajo Stock: ${prods.find(p => p.id === r.id_producto)?.nombre || '...'}</p><p class="text-xs text-slate-500 mt-0.5">Bodega: ${sucursales.find(s => s.id === r.id_sucursal)?.nombre || '...'}</p></div>`;
        }
    });
    
    document.getElementById('widget-alertas-num').innerText = contadorAlertas;
    const panelNotif = document.getElementById('lista-notificaciones');
    if(contadorAlertas > 0) panelNotif.innerHTML = htmlNotificaciones; else panelNotif.innerHTML = `<p class="p-8 text-center text-slate-400">🎉 Todo al día</p>`;

    const bell = document.getElementById('bell-indicator');
    if(bell) {
        if(contadorAlertas > 0) { bell.classList.remove('hidden'); bell.innerText = contadorAlertas; }
        else { bell.classList.add('hidden'); }
    }
}

// --- 5. ATAJOS Y APOYO ---
window.irAAlertasStock = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('sugerencias'); }, 150); }
window.irATransito = function() { window.cambiarVista('movimientos'); setTimeout(() => { window.cambiarTabMovimientos('pedidos'); window.cambiarSubTabPedidos('transito'); }, 150); }
window.irASubirVentas = function() { window.cambiarVista('movimientos'); setTimeout(() => window.cambiarTabMovimientos('ventas'), 150); }

window.cancelarEdicion = function(formName) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const formEl = document.getElementById(`form-${formName}`);
    if(formEl) {
        formEl.reset();
        const btnSubmit = formEl.querySelector('button[type="submit"]');
        if(btnSubmit) { btnSubmit.innerText = 'Guardar'; btnSubmit.classList.replace('bg-blue-600', 'bg-slate-800'); }
        const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}

window.activarEdicionGlobal = function(formName, id, objJS) {
    window.modoEdicion = { activo: true, id: id, form: formName };
    for (const [inputId, valor] of Object.entries(objJS)) { 
        const el = document.getElementById(inputId);
        if(el) el.value = valor; 
    }
    const btnSubmit = document.querySelector(`#form-${formName} button[type="submit"]`);
    if(btnSubmit) { btnSubmit.innerText = 'Actualizar ✏️'; btnSubmit.classList.replace('bg-slate-800', 'bg-blue-600'); }
    const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
    if(btnCancel) btnCancel.classList.remove('hidden');
};

window.eliminarReg = async function(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        window.cambiarVista(document.querySelector('.bg-emerald-600')?.id.replace('btn-menu-','') || 'dashboard');
    }
}

// --- 6. EVENTOS DE FORMULARIOS (ENVÍOS A SUPABASE) ---
document.addEventListener('submit', async (e) => {
    if (!e.target.id || !e.target.id.startsWith('form-')) return;
    // Omitir formularios que tienen su propia lógica en otros archivos .js
    const omitir = ['login-form', 'form-producto', 'form-precio-prov', 'form-ajuste-rapido', 'form-ingrediente'];
    if (omitir.includes(e.target.id)) return;
    
    e.preventDefault();
    const id = e.target.id;

    if (id === 'form-categoria') {
        const nombre = document.getElementById('nombre-categoria').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('categorias').update({nombre}).eq('id', window.modoEdicion.id); 
        else await clienteSupabase.from('categorias').insert([{id_empresa: window.miEmpresaId, nombre}]);
        window.cancelarEdicion('categoria'); window.cargarCategorias();
    } else if (id === 'form-unidad') {
        const nombre = document.getElementById('nombre-unidad').value, abrev = document.getElementById('abrev-unidad').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('unidades').update({nombre, abreviatura: abrev}).eq('id', window.modoEdicion.id); 
        else await clienteSupabase.from('unidades').insert([{id_empresa: window.miEmpresaId, nombre, abreviatura: abrev}]);
        window.cancelarEdicion('unidad'); window.cargarUnidades();
    } else if (id === 'form-proveedor') {
        const payload = { nombre: document.getElementById('nombre-proveedor').value, tipo: document.getElementById('tipo-proveedor').value, whatsapp: document.getElementById('whatsapp-proveedor').value, correo: document.getElementById('correo-proveedor').value, lapso_entrega_dias: parseInt(document.getElementById('tiempo-entrega').value) || null };
        if(window.modoEdicion.activo) await clienteSupabase.from('proveedores').update(payload).eq('id', window.modoEdicion.id); 
        else await clienteSupabase.from('proveedores').insert([{...payload, id_empresa: window.miEmpresaId}]);
        window.cancelarEdicion('proveedor'); window.cargarProveedores();
    } else if (id === 'form-sucursal') {
        const payload = { nombre: document.getElementById('nombre-sucursal').value, nombre_comercial: document.getElementById('comercial-sucursal').value, empresa_asociada: document.getElementById('empresa-sucursal').value, horarios_atencion: document.getElementById('horario-sucursal').value, direccion: document.getElementById('dir-sucursal').value };
        if(window.modoEdicion.activo) await clienteSupabase.from('sucursales').update(payload).eq('id', window.modoEdicion.id); 
        else await clienteSupabase.from('sucursales').insert([{...payload, id_empresa: window.miEmpresaId}]);
        window.cancelarEdicion('sucursal'); window.cargarSucursales();
    } else if (id === 'form-ubicacion') {
        const nombre = document.getElementById('nombre-ubicacion').value, id_sucursal = document.getElementById('sel-sucursal-ubi').value;
        await clienteSupabase.from('ubicaciones_internas').insert([{id_empresa: window.miEmpresaId, id_sucursal, nombre}]);
        window.cancelarEdicion('ubicacion'); window.cargarUbicaciones();
    } else if (id === 'form-tipo-movimiento') {
        const nombre = document.getElementById('nombre-tipo-mov').value, operacion = document.getElementById('operacion-tipo-mov').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('tipos_movimiento').update({nombre, operacion}).eq('id', window.modoEdicion.id); 
        else await clienteSupabase.from('tipos_movimiento').insert([{id_empresa: window.miEmpresaId, nombre, operacion}]);
        window.cancelarEdicion('tipo-movimiento'); window.cargarTiposMovimiento();
    }
});
