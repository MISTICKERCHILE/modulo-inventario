window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo';
window.miRol = null;

// ============================================================================
// NUEVO: DETECTOR DE LANDING PAGE (Abrir Registro Automáticamente)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Si la URL trae "?registro=true", cambiamos la pestaña a Registro
    if (urlParams.get('registro') === 'true') {
        setTimeout(() => {
            if (typeof window.toggleAuthMode === 'function') {
                window.toggleAuthMode('register');
            }
        }, 50); // 50ms para asegurar que el HTML del login ya se pintó
    }
});
// ============================================================================

// --- LOGIN Y SESIÓN MULTI-EMPRESA ---
window.toggleAuthMode = function(mode) {
    document.getElementById('auth-mode').value = mode;
    const regFields = document.getElementById('register-fields');
    const regNombre = document.getElementById('reg-nombre');
    const regApellido = document.getElementById('reg-apellido');

    if(mode === 'login') {
        document.getElementById('tab-login').className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        document.getElementById('tab-register').className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        document.getElementById('auth-btn').innerText = 'Entrar al Sistema';
        regFields.classList.add('hidden');
        regNombre.removeAttribute('required'); 
        regApellido.removeAttribute('required');
    } else {
        document.getElementById('tab-register').className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        document.getElementById('tab-login').className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        document.getElementById('auth-btn').innerText = 'Crear mi Cuenta';
        regFields.classList.remove('hidden');
        regNombre.setAttribute('required', 'true'); 
        regApellido.setAttribute('required', 'true');
    }
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('email').value.trim();
    const passwordInput = document.getElementById('password').value;
    const mode = document.getElementById('auth-mode').value;

    if(mode === 'register') {
        const nombreInput = document.getElementById('reg-nombre').value.trim();
        const apellidoInput = document.getElementById('reg-apellido').value.trim();
        const telInput = document.getElementById('reg-telefono').value.trim();

        const { data, error } = await clienteSupabase.auth.signUp({ 
            email: emailInput, 
            password: passwordInput,
            options: {
                data: {
                    nombre: nombreInput,
                    apellido: apellidoInput,
                    telefono: telInput
                    // IMPORTANTE: Ya no guardamos el id_empresa aquí porque
                    // el usuario recién registrado aún NO TIENE empresa asignada.
                    // El administrador se la asignará después.
                }
            }
        });
        
        if(error) return alert("❌ Error al registrar: " + error.message);
        
        alert(`✅ Cuenta creada para ${nombreInput}. Ahora pide a tu administrador que te dé acceso a la empresa.`);
        window.toggleAuthMode('login');
        document.getElementById('password').value = '';
        return;
    }

    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    if (error) return alert("❌ Credenciales incorrectas. Verifica tu correo y contraseña.");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('nombre, apellido').eq('id_usuario', data.user.id).maybeSingle();
    const nombreReal = perfil?.nombre || emailInput.split('@')[0];

    const { data: empresasAsignadas } = await clienteSupabase.from('usuarios_empresas').select('id_empresa, nombre_empresa, rol').eq('id_usuario', data.user.id);

    if (!empresasAsignadas || empresasAsignadas.length === 0) {
        return alert("🛑 Tu cuenta existe, pero aún no tienes empresas asignadas. Contacta a tu administrador.");
    }

    document.getElementById('login-container').classList.add('hidden');

    if (empresasAsignadas.length === 1) {
        window.iniciarSesionEmpresa(empresasAsignadas[0].id_empresa, empresasAsignadas[0].nombre_empresa, emailInput, nombreReal, empresasAsignadas[0].rol);
    } else {
        document.getElementById('selector-empresa-container').classList.remove('hidden');
        document.getElementById('lista-empresas-usuario').innerHTML = empresasAsignadas.map(emp => `
            <button onclick="iniciarSesionEmpresa('${emp.id_empresa}', '${emp.nombre_empresa}', '${emailInput}', '${nombreReal}', '${emp.rol}')" class="w-full text-left px-6 py-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 transition-all font-bold text-slate-700 shadow-sm flex items-center justify-between group">
                <span>🏢 ${emp.nombre_empresa}</span>
                <span class="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">Entrar →</span>
            </button>
        `).join('');
    }
});

window.iniciarSesionEmpresa = async function(id, nombre, email, nombreUsuario, rol) {
    window.miEmpresaId = id;
    window.usuarioActual = nombreUsuario;
    window.miRol = rol; 
    
    // LA CURA DEFINITIVA: 
    // Cada vez que entras a una empresa, estampamos ese ID en tu Carnet de Seguridad (JWT)
    await clienteSupabase.auth.updateUser({ data: { id_empresa: id } });
    
    localStorage.setItem('sesion_activa_olympia', JSON.stringify({
        id: id, nombre: nombre, email: email, nombreUsuario: nombreUsuario, rol: rol
    }));

    const login = document.getElementById('login-container');
    const selector = document.getElementById('selector-empresa-container');
    const dashboard = document.getElementById('dashboard-container');
    
    if (login) login.classList.add('hidden');
    if (selector) selector.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    
    const spanUsuario = document.getElementById('user-name-display');
    if (spanUsuario) spanUsuario.innerText = nombreUsuario; 
    
    const dropEmail = document.getElementById('user-email-dropdown');
    if (dropEmail) dropEmail.innerText = email;

    if(window.actualizarTopBar) window.actualizarTopBar(nombre, rol);
    if (window.aplicarPermisosVisuales) window.aplicarPermisosVisuales();

    const urlParams = new URLSearchParams(window.location.search);
    const vistaDirecta = urlParams.get('v');
    
    if (vistaDirecta) {
        window.cambiarVista(vistaDirecta);
    } else {
        const pantallaGuardada = localStorage.getItem('pantalla_actual') || 'home';
        window.cambiarVista(pantallaGuardada);
    }
    
    if (window.cargarDatosSelects) window.cargarDatosSelects();
    if (window.cargarHome) window.cargarHome();
}

window.volverASelectorEmpresa = async function() {
    const { data: { user } } = await clienteSupabase.auth.getUser();
    if(!user) return window.cerrarSesion();

    const { data: empresasAsignadas } = await clienteSupabase.from('usuarios_empresas')
        .select('id_empresa, nombre_empresa, rol')
        .eq('id_usuario', user.id);

    const emailUsuario = document.getElementById('user-email-dropdown').innerText;
    const nombreReal = window.usuarioActual;

    document.getElementById('dashboard-container').classList.add('hidden');
    document.getElementById('selector-empresa-container').classList.remove('hidden');

    document.getElementById('lista-empresas-usuario').innerHTML = empresasAsignadas.map(emp => `
        <button onclick="iniciarSesionEmpresa('${emp.id_empresa}', '${emp.nombre_empresa}', '${emailUsuario}', '${nombreReal}', '${emp.rol}')" class="w-full text-left px-6 py-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 transition-all font-bold text-slate-700 shadow-sm flex items-center justify-between group">
            <span>🏢 ${emp.nombre_empresa}</span>
            <span class="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">Entrar →</span>
        </button>
    `).join('');
}

window.cerrarSesion = async function() {
    localStorage.removeItem('sesion_activa_olympia');
    localStorage.removeItem('pantalla_actual'); // Al salir, borramos la memoria de pantalla para empezar limpios
    
    if (clienteSupabase && clienteSupabase.auth) {
        await clienteSupabase.auth.signOut();
    }
    
    window.location.href = 'app.html'; 
}

// --- NAVEGACIÓN Y UI ---
window.toggleMenu = function() {
    const menu = document.getElementById('sidebar-menu');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    if (window.innerWidth < 768) {
        menu.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    } else {
        menu.classList.toggle('md:hidden');
    }
}

window.toggleUserMenu = function() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
}

window.toggleNotificaciones = function() {
    document.getElementById('panel-notificaciones').classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const userDropdown = document.getElementById('user-dropdown');
    const userBtn = userDropdown?.previousElementSibling;
    if (userDropdown && userBtn && !userDropdown.contains(e.target) && !userBtn.contains(e.target)) {
        userDropdown.classList.add('hidden');
    }

    const notifPanel = document.getElementById('panel-notificaciones');
    const notifBtn = notifPanel?.previousElementSibling;
    if (notifPanel && notifBtn && !notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
        notifPanel.classList.add('hidden');
    }
});

// CARGA DINÁMICA DE VISTAS
window.cambiarVista = async function(vista) {
    // 👉 AQUÍ ANOTAMOS EN LA LIBRETA CADA VEZ QUE CAMBIA DE PANTALLA
    localStorage.setItem('pantalla_actual', vista);
    
    // Mostrar u ocultar el submenú de inventario inteligentemente
    const vistasInventario = ['dashboard', 'inventario', 'pedidos', 'movimientos', 'productos', 'recetas'];
    const submenuInv = document.getElementById('submenu-inventario');
    
    if (submenuInv) {
        // Si la vista a la que vamos pertenece a Inventario, mostramos el submenú.
        if (vistasInventario.includes(vista)) {
            submenuInv.classList.remove('hidden');
        } else {
            // Si vamos a Home, Ventas, Reportes, etc... lo escondemos.
            submenuInv.classList.add('hidden');
        }
    }

    // 👉 NUEVO: Mostrar u ocultar el submenú de Ventas inteligentemente
    const vistasVentas = ['dashboard_ventas', 'ventas', 'cuentas_cobrar', 'cotizaciones', 'ranking'];
    const submenuVen = document.getElementById('submenu-dashboard_ventas');
    
    if (submenuVen) {
        // Si la vista pertenece a Ventas, mostramos su submenú.
        if (vistasVentas.includes(vista)) {
            submenuVen.classList.remove('hidden');
        } else {
            submenuVen.classList.add('hidden');
        }
    }

    const main = document.getElementById('main-content');
    // Reemplazamos el texto aburrido por tu GIF personalizado
    main.innerHTML = `
        <div class="flex flex-col h-full items-center justify-center space-y-4 transition-opacity duration-300">
            <img src="/img/img/loading.gif" alt="Cargando módulo..." class="w-16 h-16 object-contain">
            <p class="text-emerald-600 font-bold text-xs tracking-widest animate-pulse uppercase">Cargando módulo...</p>
        </div>
    `;
    
    document.querySelectorAll('#sidebar-menu button').forEach(b => {
        b.classList.remove('bg-emerald-600', 'text-white', 'shadow-md');
        b.classList.add('hover:bg-slate-700');
    });
    
    const btnActivo = document.getElementById(`btn-menu-${vista}`);
    if (btnActivo) {
        btnActivo.classList.remove('hover:bg-slate-700');
        btnActivo.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
    }
    
    if (window.innerWidth < 768) { 
        document.getElementById('sidebar-menu').classList.add('-translate-x-full');
        document.getElementById('sidebar-backdrop').classList.add('hidden');
    }

    try {
        const response = await fetch(`vistas/${vista}.html`);
        if (!response.ok) throw new Error('Vista no encontrada');
        const html = await response.text();
        main.innerHTML = html;
        
        // AUTO-ARRANQUE DEPENDIENDO DE LA VISTA
        if(vista === 'home' && typeof window.cargarHome === 'function') window.cargarHome();
        if(vista === 'dashboard' && typeof window.cargarDashboard === 'function') window.cargarDashboard();
        if(vista === 'empresas' && typeof window.cargarEmpresas === 'function') window.cargarEmpresas();
        if(vista === 'catalogos' && typeof window.cargarCategorias === 'function') {
            window.cargarCategorias(); window.cargarUnidades(); window.cargarUbicaciones(); window.cargarProveedores(); window.cargarSucursales(); window.cargarTiposMovimiento();
        }
        if(vista === 'productos' && typeof window.cargarProductos === 'function') window.cargarProductos();
        if(vista === 'inventario' && typeof window.cargarInventario === 'function') window.cargarInventario();
        if(vista === 'recetas' && typeof window.cargarBuscadorRecetas === 'function') window.cargarBuscadorRecetas();
        if(vista === 'pedidos' && typeof window.cambiarSubTabPedidos === 'function') window.cambiarSubTabPedidos('sugerencias');
        if(vista === 'movimientos' && typeof window.cambiarTabMovimientos === 'function') window.cambiarTabMovimientos('compras');
        if(vista === 'reportes' && typeof window.cargarReportes === 'function') window.cargarReportes();
        if(vista === 'parametros') window.cargarParametros();
        if(vista === 'ventas' && typeof window.cargarVentas === 'function') window.cargarVentas();
        if(vista === 'ranking' && typeof window.cargarLaboratorio === 'function') window.cargarLaboratorio();

    } catch (error) {
        main.innerHTML = `<div class="p-8 text-center text-red-500"><p class="text-4xl mb-4">❌</p><h2 class="text-xl font-bold">Error cargando la vista: ${vista}.html</h2></div>`;
    }
}

// --- UTILIDADES GLOBALES ---
window.cancelarEdicion = function(formId) {
    document.getElementById(`form-${formId}`).reset();
    window.modoEdicion = { activo: false, id: null, form: null };
    
    let titulo = "Nuevo Elemento";
    if(formId === 'producto') titulo = "Nuevo Producto / Insumo";
    const elTitulo = document.getElementById(`titulo-modal-${formId}`);
    if(elTitulo) elTitulo.innerText = titulo;
    
    const btnSubmit = document.querySelector(`#form-${formId} button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Guardar';
        btnSubmit.classList.replace('bg-blue-600', 'bg-emerald-600');
    }
}

window.eliminarReg = async function(tabla, id) {
    if(confirm('¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.')) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
    }
}

// ==========================================
// CONTROL DEL HEADER Y ROLES
// ==========================================
window.actualizarTopBar = function(nombreEmpresa, rolUsuario) {
    // 1. Actualiza el título superior izquierdo
    const mainTitle = document.getElementById('main-app-title');
    if(mainTitle && nombreEmpresa) {
        mainTitle.innerText = `Simple - ${nombreEmpresa}`;
    }

    // 2. Actualiza el nombre de la empresa al lado de la campanita
    const spanEmpresa = document.getElementById('header-nombre-empresa');
    if(spanEmpresa && nombreEmpresa) {
        spanEmpresa.innerHTML = `🏢 ${nombreEmpresa}`;
    }

    const btnParametros = document.getElementById('btn-menu-parametros');
    if(btnParametros) {
        if(rolUsuario === 'Dueño') {
            btnParametros.classList.remove('hidden');
            btnParametros.classList.add('block');
        } else {
            btnParametros.classList.add('hidden');
            btnParametros.classList.remove('block');
        }
    }
}

// ==========================================
// MÓDULO DE PARÁMETROS Y PERMISOS (JSON)
// ==========================================

window.cargarParametros = async function() {
    if (!window.miEmpresaId) return;
    try {
        const { data, error } = await clienteSupabase.from('empresas').select('configuracion').eq('id', window.miEmpresaId).single();
        if (error) throw error;
        
        const config = data.configuracion || {};
        const opPermisos = config.operador || { catalogos: true, recetas: true, reportes: true }; 
        
        document.getElementById('toggle-op-catalogos').checked = opPermisos.catalogos !== false;
        document.getElementById('toggle-op-recetas').checked = opPermisos.recetas !== false;
        document.getElementById('toggle-op-reportes').checked = opPermisos.reportes !== false;
    } catch (err) {
        console.error("Error al cargar parámetros:", err);
    }
};

window.guardarParametros = async function() {
    const configNueva = {
        operador: {
            catalogos: document.getElementById('toggle-op-catalogos').checked,
            recetas: document.getElementById('toggle-op-recetas').checked,
            reportes: document.getElementById('toggle-op-reportes').checked
        }
    };
    
    try {
        await clienteSupabase.from('empresas').update({ configuracion: configNueva }).eq('id', window.miEmpresaId);
        console.log("Parámetros guardados automáticamente");
    } catch (err) {
        alert("Error al guardar: " + err.message);
    }
};

window.aplicarPermisosVisuales = async function() {
    if (window.miRol === 'Dueño' || window.miRol === 'Admin' || window.miRol === 'Administrador') {
        ['catalogos', 'recetas', 'reportes'].forEach(modulo => {
            document.getElementById(`btn-menu-${modulo}`)?.classList.remove('hidden');
        });
        return;
    }
    
    if (window.miRol === 'Operador') {
        const { data } = await clienteSupabase.from('empresas').select('configuracion').eq('id', window.miEmpresaId).single();
        const config = data?.configuracion || {};
        const opPermisos = config.operador || { catalogos: true, recetas: true, reportes: true };
        
        const btnCat = document.getElementById('btn-menu-catalogos');
        const btnRec = document.getElementById('btn-menu-recetas');
        const btnRep = document.getElementById('btn-menu-reportes');
        
        if (btnCat) opPermisos.catalogos === false ? btnCat.classList.add('hidden') : btnCat.classList.remove('hidden');
        if (btnRec) opPermisos.recetas === false ? btnRec.classList.add('hidden') : btnRec.classList.remove('hidden');
        if (btnRep) opPermisos.reportes === false ? btnRep.classList.add('hidden') : btnRep.classList.remove('hidden');
    }
};

// ==========================================
// RESTAURACIÓN AUTOMÁTICA DE SESIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const sesion = localStorage.getItem('sesion_activa_olympia');
    
    if (sesion) {
        const login = document.getElementById('login-container');
        if (login) login.classList.add('hidden');

        try {
            const s = JSON.parse(sesion);
            window.iniciarSesionEmpresa(s.id, s.nombre, s.email, s.nombreUsuario, s.rol);
        } catch (e) {
            console.error("Error leyendo la sesión:", e);
            localStorage.removeItem('sesion_activa_olympia');
            if (login) login.classList.remove('hidden'); 
        }
    }
});