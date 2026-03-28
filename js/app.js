window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo';
window.miRol = null;

// Variable global para atrapar la invitación
window.invitacionPendiente = null; 

// ============================================================================
// DETECTOR INTELIGENTE DE ENLACES Y SEMÁFORO
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');

    // RADAR DE RECUPERACIÓN DE CONTRASEÑA (Viene del enlace del correo)
    const hashData = window.location.hash;
    if (hashData && hashData.includes('type=recovery')) {
        setTimeout(() => {
            // Escondemos todo lo normal
            document.getElementById('dashboard-container').classList.add('hidden');
            document.getElementById('login-container').classList.remove('hidden');
            document.getElementById('auth-tabs').classList.add('hidden');
            document.getElementById('form-login-view').classList.add('hidden');
            
            // Mostramos el formulario de crear nueva contraseña
            document.getElementById('form-nueva-pass').classList.remove('hidden');
        }, 50);
        return; // Detenemos el resto de comprobaciones
    }
    
    if (urlParams.get('registro') === 'true') {
        setTimeout(() => { if (typeof window.toggleAuthMode === 'function') window.toggleAuthMode('register'); }, 50);
    }
    
    if (inviteId && inviteId !== 'true') {
        // SEMÁFORO ROJO: Ocultar Dashboard
        document.getElementById('dashboard-container').classList.add('hidden');
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('auth-tabs').classList.add('hidden');
        document.getElementById('form-login-view').classList.add('hidden');
        document.getElementById('form-register-step-1').classList.add('hidden');
        document.getElementById('form-register-step-2').classList.add('hidden');

        try {
            // Buscamos la invitación
            const { data: inv, error } = await clienteSupabase.from('invitaciones').select('*').eq('id', inviteId).single();
            if (error || !inv) throw new Error("Invitación no encontrada");
            
            if (inv.estado !== 'Pendiente') {
                const formInvite = document.getElementById('form-register-invite');
                formInvite.classList.remove('hidden');
                document.getElementById('invite-empresa-nombre').innerText = "Invitación ya usada ❌";
                document.getElementById('btn-final-inv').disabled = true;
                return;
            }

            // ¿El usuario ya existe en nuestra base de datos?
            const { data: userExists } = await clienteSupabase.from('perfiles').select('id_usuario').eq('email', inv.email_invitado).maybeSingle();

            if (userExists) {
                // SÍ EXISTE: Mostramos el Login con Banner
                document.getElementById('form-login-view').classList.remove('hidden');
                document.getElementById('login-invite-banner').classList.remove('hidden');
                document.getElementById('login-invite-empresa').innerText = inv.nombre_empresa;
                
                const inputEmail = document.getElementById('login-email');
                inputEmail.value = inv.email_invitado;
                inputEmail.readOnly = true;
                inputEmail.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');

                // Guardamos la invitación en memoria para procesarla al hacer Login
                window.invitacionPendiente = inv;

            } else {
                // NO EXISTE: Mostramos el Formulario Azul
                document.getElementById('form-register-invite').classList.remove('hidden');
                document.getElementById('invite-empresa-nombre').innerText = inv.nombre_empresa;
                document.getElementById('invite-rol-nombre').innerText = `Rol Asignado: ${inv.rol}`;
                document.getElementById('invite-empresa-id').value = inv.id_empresa;
                document.getElementById('invite-rol').value = inv.rol;
                document.getElementById('inv-user-email').value = inv.email_invitado;
                document.getElementById('invite-id-registro').value = inv.id; 
            }

        } catch (err) {
            console.error("Error invitación:", err);
            document.getElementById('form-register-invite').classList.remove('hidden');
            document.getElementById('invite-empresa-nombre').innerText = "Enlace inválido ❌";
        }
    } else if (!inviteId) {
        // SEMÁFORO VERDE: Sesión normal
        const sesion = localStorage.getItem('sesion_activa_olympia');
        if (sesion) {
            const login = document.getElementById('login-container');
            if (login) login.classList.add('hidden');
            try {
                const s = JSON.parse(sesion);
                window.iniciarSesionEmpresa(s.id, s.nombre, s.email, s.nombreUsuario, s.rol);
            } catch (e) {
                localStorage.removeItem('sesion_activa_olympia');
            }
        }
    }
});

window.toggleAuthMode = function(mode) {
    const formLogin = document.getElementById('form-login-view');
    const formReg1 = document.getElementById('form-register-step-1');
    const formReg2 = document.getElementById('form-register-step-2');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if(mode === 'login') {
        tabLogin.className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        tabRegister.className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        formLogin.classList.remove('hidden');
        formReg1.classList.add('hidden');
        formReg2.classList.add('hidden');
    } else {
        tabRegister.className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        tabLogin.className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        formLogin.classList.add('hidden');
        formReg1.classList.remove('hidden');
        formReg2.classList.add('hidden'); 
    }
}

// ============================================================================
// EVENTOS DE SUBMIT (Login, Registro y Formulario Azul)
// ============================================================================

// 1. EL LOGIN NORMAL (Y ACEPTACIÓN DE INVITACIÓN)
document.getElementById('form-login-view').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('login-email').value.trim();
    const passwordInput = document.getElementById('login-password').value;

    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    if (error) return alert("❌ Credenciales incorrectas. Verifica tu contraseña.");

    // MAGIA: Si estaba invitado a algo, lo procesamos aquí
    if (window.invitacionPendiente) {
        await clienteSupabase.from('usuarios_empresas').insert({
            id_usuario: data.user.id,
            id_empresa: window.invitacionPendiente.id_empresa,
            nombre_empresa: window.invitacionPendiente.nombre_empresa,
            rol: window.invitacionPendiente.rol
        });
        await clienteSupabase.from('invitaciones').update({estado: 'Aceptada'}).eq('id', window.invitacionPendiente.id);
        alert(`🎉 ¡Invitación aceptada! Bienvenido al equipo de ${window.invitacionPendiente.nombre_empresa}`);
    }

    const { data: perfil } = await clienteSupabase.from('perfiles').select('nombre').eq('id_usuario', data.user.id).maybeSingle();
    const nombreReal = perfil?.nombre || emailInput.split('@')[0];

    const { data: empresasAsignadas } = await clienteSupabase.from('usuarios_empresas').select('id_empresa, nombre_empresa, rol').eq('id_usuario', data.user.id);

    if (!empresasAsignadas || empresasAsignadas.length === 0) {
        return alert("🛑 Tu cuenta existe, pero aún no tienes empresas asignadas.");
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

// 2. PASO 1 DE EMPRESA NUEVA
document.getElementById('form-register-step-1').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rutInputRaw = document.getElementById('reg-rut').value;
    const rutInput = rutInputRaw.replace(/[\.\-]/g, '').trim().toUpperCase();
    const msgError = document.getElementById('msg-rut-error');
    const btnReg = document.getElementById('btn-continuar-reg');

    btnReg.innerText = "Verificando..."; btnReg.disabled = true;

    const { data, error } = await clienteSupabase.from('empresas').select('id').eq('rut_o_identificacion', rutInput).maybeSingle();
    if (data) {
        msgError.classList.remove('hidden');
        btnReg.innerHTML = `Continuar <span class="text-xl leading-none">→</span>`; btnReg.disabled = false;
        return;
    }
    msgError.classList.add('hidden');
    document.getElementById('resumen-empresa').innerText = document.getElementById('reg-razon-social').value.trim();
    document.getElementById('resumen-rut').innerText = rutInput;

    document.getElementById('form-register-step-1').classList.add('hidden');
    document.getElementById('form-register-step-2').classList.remove('hidden');
    
    btnReg.innerHTML = `Continuar <span class="text-xl leading-none">→</span>`; btnReg.disabled = false;
});

window.volverPaso1 = function() {
    document.getElementById('form-register-step-2').classList.add('hidden');
    document.getElementById('form-register-step-1').classList.remove('hidden');
}

// 3. PASO 2 DE EMPRESA NUEVA
document.getElementById('form-register-step-2').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass1 = document.getElementById('reg-user-pass').value;
    const pass2 = document.getElementById('reg-user-pass2').value;
    if (pass1 !== pass2) return alert("❌ Las contraseñas no coinciden.");

    const btnFinal = document.getElementById('btn-final-reg');
    btnFinal.innerText = "Creando tu imperio..."; btnFinal.disabled = true;

    const emailInput = document.getElementById('reg-user-email').value.trim();
    let fechaRaw = document.getElementById('reg-user-nacimiento').value;
    let fechaLimpia = fechaRaw;
    if (fechaRaw.includes('/')) {
        let partes = fechaRaw.split('/'); fechaLimpia = `${partes[2]}-${partes[1]}-${partes[0]}`;
    } else if (fechaRaw.includes('-') && fechaRaw.split('-')[0].length <= 2) {
        let partes = fechaRaw.split('-'); fechaLimpia = `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    const rutPersonal = document.getElementById('reg-user-rut').value.replace(/[\.\-]/g, '').trim().toUpperCase();

    const datosMeta = {
        tipo_registro: 'nueva_empresa',
        pais: document.getElementById('reg-pais').value,
        rut_empresa: document.getElementById('reg-rut').value.replace(/[\.\-]/g, '').trim().toUpperCase(),
        nombre_empresa: document.getElementById('reg-razon-social').value.trim(),
        nombre_comercial: document.getElementById('reg-nombre-comercial').value.trim(),
        nombre: document.getElementById('reg-user-nombre').value.trim(),
        apellido: document.getElementById('reg-user-apellido').value.trim(),
        telefono: document.getElementById('reg-user-telefono').value.trim(),
        rut_personal: rutPersonal,
        fecha_nacimiento: fechaLimpia,
        pin_seguridad: document.getElementById('reg-user-pin').value
    };

    const { data, error } = await clienteSupabase.auth.signUp({ email: emailInput, password: pass1, options: { data: datosMeta } });
    if(error) {
        btnFinal.innerText = "Crear Empresa y Entrar 🚀"; btnFinal.disabled = false;
        return alert("❌ Error al registrar: " + error.message);
    }
    alert(`🎉 ¡Felicidades, ${datosMeta.nombre}! Tu empresa ha sido creada con éxito. Inicia sesión para comenzar.`);
    
    document.getElementById('form-register-step-1').reset();
    document.getElementById('form-register-step-2').reset();
    window.toggleAuthMode('login');
    document.getElementById('login-email').value = emailInput;
    btnFinal.innerText = "Crear Empresa y Entrar 🚀"; btnFinal.disabled = false;
});

// 4. FORMULARIO AZUL DE INVITACIÓN (REGISTRO NUEVO EMPLEADO)
document.getElementById('form-register-invite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass1 = document.getElementById('inv-user-pass').value;
    const pass2 = document.getElementById('inv-user-pass2').value;
    if (pass1 !== pass2) return alert("❌ Las contraseñas no coinciden.");

    const btnFinal = document.getElementById('btn-final-inv');
    btnFinal.innerText = "Aceptando invitación..."; btnFinal.disabled = true;

    const email = document.getElementById('inv-user-email').value;
    const nombre = document.getElementById('inv-user-nombre').value.trim();
    const apellido = document.getElementById('inv-user-apellido').value.trim();
    const rutPersonal = document.getElementById('inv-user-rut').value.replace(/[\.\-]/g, '').trim().toUpperCase();
    const pin = document.getElementById('inv-user-pin').value;
    
    const idEmpresa = document.getElementById('invite-empresa-id').value;
    const nombreEmpresa = document.getElementById('invite-empresa-nombre').innerText;
    const rol = document.getElementById('invite-rol').value;
    const idInvitacion = document.getElementById('invite-id-registro').value;

    // A. Registramos al usuario en Supabase Auth
    const { data: authData, error: authErr } = await clienteSupabase.auth.signUp({ 
        email: email, 
        password: pass1,
        options: { data: { tipo_registro: 'invitacion' } } // Ignorará nuestro trigger
    });

    if(authErr) {
        btnFinal.innerText = "Unirme al Equipo 🚀"; btnFinal.disabled = false;
        return alert("❌ Error: " + authErr.message);
    }

    const userId = authData.user.id;

    // B. Creamos su Perfil Manualmente
    await clienteSupabase.from('perfiles').insert({
        id_usuario: userId,
        id_empresa: idEmpresa,
        nombre: nombre,
        apellido: apellido,
        email: email,
        pin_seguridad: pin,
        rut_o_identificacion: rutPersonal
    });

    // C. Lo vinculamos a la empresa
    await clienteSupabase.from('usuarios_empresas').insert({
        id_usuario: userId,
        id_empresa: idEmpresa,
        nombre_empresa: nombreEmpresa,
        rol: rol
    });

    // D. Marcamos la invitación como aceptada
    await clienteSupabase.from('invitaciones').update({estado: 'Aceptada'}).eq('id', idInvitacion);

    alert(`🎉 ¡Listo, ${nombre}! Ya eres parte de ${nombreEmpresa}.`);
    
    // Lo mandamos al login para que entre directo
    window.location.href = 'app.html';
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

// --- UTILIDAD: Mostrar/Ocultar Contraseñas y PIN ---
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
    } else {
        input.type = "password";
    }
}

// --- UTILIDAD: Validación de contraseñas en tiempo real ---
window.validarPasswords = function() {
    const p1 = document.getElementById('reg-user-pass').value;
    const p2 = document.getElementById('reg-user-pass2').value;
    const msg = document.getElementById('msg-password-match');
    
    // Si no ha escrito nada en la segunda contraseña, escondemos el mensaje
    if(p2.length === 0) {
        msg.classList.add('hidden');
        return;
    }
    
    msg.classList.remove('hidden');
    
    if (p1 === p2) {
        msg.innerText = "✅ Las contraseñas coinciden";
        msg.className = "col-span-2 text-[10px] font-bold mt-0 text-emerald-600";
    } else {
        msg.innerText = "❌ Las contraseñas no coinciden";
        msg.className = "col-span-2 text-[10px] font-bold mt-0 text-red-500";
    }
}

window.validarPasswordsInv = function() {
    const p1 = document.getElementById('inv-user-pass').value;
    const p2 = document.getElementById('inv-user-pass2').value;
    const msg = document.getElementById('msg-password-match-inv');
    
    if(p2.length === 0) { msg.classList.add('hidden'); return; }
    msg.classList.remove('hidden');
    
    if (p1 === p2) {
        msg.innerText = "✅ Las contraseñas coinciden";
        msg.className = "col-span-2 text-[10px] font-bold mt-0 text-blue-600";
    } else {
        msg.innerText = "❌ Las contraseñas no coinciden";
        msg.className = "col-span-2 text-[10px] font-bold mt-0 text-red-500";
    }
}

// ============================================================================
// SISTEMA DE RECUPERACIÓN DE CONTRASEÑA
// ============================================================================

// 1. Mostrar el formulario de solicitar correo
window.mostrarOlvidePassword = function() {
    document.getElementById('auth-tabs').classList.add('hidden');
    document.getElementById('form-login-view').classList.add('hidden');
    document.getElementById('form-olvide-pass').classList.remove('hidden');
}

// Para arreglar el botón de "Entrar" y "Crear Empresa" si cancelan la recuperación
const oldToggleAuthMode = window.toggleAuthMode;
window.toggleAuthMode = function(mode) {
    document.getElementById('auth-tabs').classList.remove('hidden');
    document.getElementById('form-olvide-pass').classList.add('hidden');
    document.getElementById('form-nueva-pass').classList.add('hidden');
    oldToggleAuthMode(mode);
}

// 2. Enviar el correo a través de Supabase
document.getElementById('form-olvide-pass').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('olvide-email').value.trim();
    const btn = document.getElementById('btn-olvide-enviar');
    
    btn.innerText = "Enviando..."; btn.disabled = true;

    // Mandamos el link al correo. Redirigimos de vuelta a esta misma página.
    const { data, error } = await clienteSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
        btn.innerText = "Enviar enlace de recuperación"; btn.disabled = false;
        return alert("❌ Error: " + error.message);
    }

    alert("✅ ¡Listo! Revisa tu bandeja de entrada (o SPAM). Te enviamos un enlace seguro para recuperar tu acceso.");
    window.toggleAuthMode('login'); // Lo devolvemos al login
    btn.innerText = "Enviar enlace de recuperación"; btn.disabled = false;
});

// 3. Validador visual para la nueva contraseña
window.validarNuevaPass = function() {
    const p1 = document.getElementById('nueva-pass-1').value;
    const p2 = document.getElementById('nueva-pass-2').value;
    const msg = document.getElementById('msg-nueva-pass-match');
    
    if(p2.length === 0) { msg.classList.add('hidden'); return; }
    msg.classList.remove('hidden');
    
    if (p1 === p2) {
        msg.innerText = "✅ Las contraseñas coinciden";
        msg.className = "text-[10px] font-bold mt-1 text-emerald-600 block";
    } else {
        msg.innerText = "❌ Las contraseñas no coinciden";
        msg.className = "text-[10px] font-bold mt-1 text-red-500 block";
    }
}

// 4. Guardar la nueva contraseña en Supabase
document.getElementById('form-nueva-pass').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass1 = document.getElementById('nueva-pass-1').value;
    const pass2 = document.getElementById('nueva-pass-2').value;
    
    if (pass1 !== pass2) return alert("❌ Las contraseñas no coinciden.");

    const btn = document.getElementById('btn-guardar-nueva-pass');
    btn.innerText = "Guardando..."; btn.disabled = true;

    // Supabase actualiza al usuario que acaba de hacer clic en el link
    const { data, error } = await clienteSupabase.auth.updateUser({
        password: pass1
    });

    if (error) {
        btn.innerText = "Guardar y Entrar"; btn.disabled = false;
        return alert("❌ Error al guardar: " + error.message);
    }

    alert("🎉 ¡Tu contraseña ha sido actualizada con éxito!");
    
    // Lo mandamos al login limpiecito para que entre con su nueva clave
    window.location.hash = ''; // Borramos el token de la URL
    window.location.reload(); 
});