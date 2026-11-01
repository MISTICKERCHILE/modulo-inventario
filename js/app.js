window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo';
window.miRol = null;

// Variable global para atrapar la invitación
window.invitacionPendiente = null; 

// 🛑 TRAMPA PARA EL BOTÓN ATRÁS DEL CELULAR (Evita salidas accidentales)
history.pushState(null, null, window.location.href);
window.addEventListener('popstate', function(event) {
    history.pushState(null, null, window.location.href);
    console.log("Navegación bloqueada. Usa los botones de BuddyERP.");
});

// ============================================================================
// DETECTOR INTELIGENTE DE ENLACES Y SEMÁFORO
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');

// RADAR DE RECUPERACIÓN DE CONTRASEÑA MEJORADO
    const hashData = window.location.hash;
    if (hashData && (hashData.includes('type=recovery') || hashData.includes('access_token='))) {
        // 1. Limpiamos la URL para que el usuario no vea ese código gigante
        // Pero lo guardamos un segundo para confirmar que es recuperación
        const esRecuperacion = hashData.includes('type=recovery');

        if (esRecuperacion) {
            setTimeout(() => {
                // Escondemos preloader y login normal
                document.getElementById('dashboard-container')?.classList.add('hidden');
                document.getElementById('login-container')?.classList.remove('hidden');
                
                // Ocultamos pestañas y login, mostramos solo el de NUEVA PASS
                document.getElementById('auth-tabs')?.classList.add('hidden');
                document.getElementById('form-login-view')?.classList.add('hidden');
                document.getElementById('form-nueva-pass')?.classList.remove('hidden');
                
                console.log("🛠️ Modo recuperación activado");
            }, 100);
            return; 
        }
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
            // Buscamos la invitación (función segura: solo devuelve ESTA invitación)
            const { data: inv, error } = await clienteSupabase.rpc('ver_invitacion', { p_id: inviteId });
            if (error || !inv) throw new Error("Invitación no encontrada");
            
            if (inv.estado !== 'Pendiente') {
                const formInvite = document.getElementById('form-register-invite');
                formInvite.classList.remove('hidden');
                document.getElementById('invite-empresa-nombre').innerText = "Invitación ya usada ❌";
                document.getElementById('btn-final-inv').disabled = true;
                return;
            }

            // ¿El usuario ya tiene cuenta? (lo resuelve ver_invitacion)
            if (inv.usuario_existe) {
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
        // La base de datos valida que el correo coincida y crea la membresía en una sola operación
        const { error: errInv } = await clienteSupabase.rpc('aceptar_invitacion', { p_id: window.invitacionPendiente.id });
        if (errInv) {
            alert("⚠️ No se pudo aceptar la invitación: " + errInv.message);
        } else {
            alert(`🎉 ¡Invitación aceptada! Bienvenido al equipo de ${window.invitacionPendiente.nombre_empresa}`);
        }
        window.invitacionPendiente = null;
    }

    const { data: perfil } = await clienteSupabase.from('perfiles').select('nombre').eq('id_usuario', data.user.id).maybeSingle();
    const nombreReal = perfil?.nombre || emailInput.split('@')[0];

    // Invitaciones pendientes a su correo (por si entró sin usar el link del correo)
    await window.ofrecerInvitacionesPendientes();

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

window.ofrecerInvitacionesPendientes = async function() {
    try {
        const { data: pendientes, error } = await clienteSupabase.rpc('mis_invitaciones_pendientes');
        if (error || !pendientes || pendientes.length === 0) return;
        for (const inv of pendientes) {
            const rol = inv.rol === 'Admin' ? 'Administrador' : inv.rol;
            const quien = inv.invitado_por ? ` (te invitó ${inv.invitado_por})` : '';
            if (!confirm(`📩 Tienes una invitación para unirte a "${inv.nombre_empresa}" como ${rol}${quien}.\n\n¿Quieres aceptarla ahora?`)) continue;
            const { error: errAceptar } = await clienteSupabase.rpc('aceptar_invitacion', { p_id: inv.id });
            alert(errAceptar
                ? `⚠️ No se pudo aceptar la invitación: ${errAceptar.message}`
                : `🎉 ¡Listo! Ya eres parte de ${inv.nombre_empresa}.`);
        }
    } catch (e) {
        console.error('Error revisando invitaciones pendientes:', e);
    }
}

// 2. PASO 1 DE EMPRESA NUEVA
// Código de recomendado: viene en el link (/r/CODIGO → ?ref=) o lo escribe la persona
window.codigoReferidoValido = null;

window.mostrarCampoReferido = function() {
    document.getElementById('btn-mostrar-referido')?.classList.add('hidden');
    document.getElementById('campo-referido')?.classList.remove('hidden');
    document.getElementById('reg-codigo-referido')?.focus();
}

window.validarCodigoReferido = async function() {
    const input = document.getElementById('reg-codigo-referido');
    const estado = document.getElementById('referido-estado');
    if (!input || !estado) return;
    const codigo = input.value.trim().toUpperCase();
    window.codigoReferidoValido = null;
    if (!codigo) { estado.classList.add('hidden'); return; }

    const { data: empresa, error } = await clienteSupabase.rpc('validar_codigo_referido', { p_codigo: codigo });
    estado.classList.remove('hidden');
    if (!error && empresa) {
        window.codigoReferidoValido = codigo;
        estado.className = 'text-xs font-semibold mt-1 text-emerald-700';
        estado.innerText = `✓ Te recomendó ${empresa}: tendrás 44 días de prueba gratis.`;
    } else {
        estado.className = 'text-xs font-semibold mt-1 text-amber-700';
        estado.innerText = 'No encontramos ese código. Puedes continuar sin él.';
    }
}

;(function prepararReferido() {
    let codigo = new URLSearchParams(location.search).get('ref');
    if (!codigo) {
        try {
            const guardado = JSON.parse(localStorage.getItem('buddy_ref') || 'null');
            if (guardado && guardado.hasta > Date.now()) codigo = guardado.codigo;
        } catch (_) {}
    }
    const input = document.getElementById('reg-codigo-referido');
    if (!input) return;
    input.addEventListener('change', window.validarCodigoReferido);
    if (codigo && /^[A-Za-z0-9-]{3,20}$/.test(codigo)) {
        input.value = codigo.toUpperCase();
        window.mostrarCampoReferido();
        // Esperamos a que exista el cliente de Supabase antes de validar
        const intentar = (n) => window.clienteSupabase ? window.validarCodigoReferido() : (n > 0 && setTimeout(() => intentar(n - 1), 300));
        intentar(20);
    }
})();

// País de operación: "Otro" despliega la lista de países
window.paisSeleccionadoRegistro = function() {
    const pais = document.getElementById('reg-pais').value;
    return pais === 'Otro' ? (document.getElementById('reg-pais-otro').value || 'Otro') : pais;
}
document.getElementById('reg-pais')?.addEventListener('change', (e) => {
    const otro = document.getElementById('reg-pais-otro');
    if (!otro) return;
    const esOtro = e.target.value === 'Otro';
    otro.classList.toggle('hidden', !esOtro);
    otro.required = esOtro;
    if (esOtro) otro.focus(); else otro.value = '';
});

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
        pais: window.paisSeleccionadoRegistro(),
        rut_empresa: document.getElementById('reg-rut').value.replace(/[\.\-]/g, '').trim().toUpperCase(),
        nombre_empresa: document.getElementById('reg-razon-social').value.trim(),
        nombre_comercial: document.getElementById('reg-nombre-comercial').value.trim(),
        nombre: document.getElementById('reg-user-nombre').value.trim(),
        apellido: document.getElementById('reg-user-apellido').value.trim(),
        telefono: document.getElementById('reg-user-telefono').value.trim(),
        rut_personal: rutPersonal,
        fecha_nacimiento: fechaLimpia,
        pin_seguridad: document.getElementById('reg-user-pin').value,
        codigo_referido: window.codigoReferidoValido || undefined
    };

    const { data, error } = await clienteSupabase.auth.signUp({ email: emailInput, password: pass1, options: { data: datosMeta } });
    if(error) {
        btnFinal.innerText = "Crear Empresa y Entrar 🚀"; btnFinal.disabled = false;
        return alert("❌ Error al registrar: " + error.message);
    }
    try { localStorage.removeItem('buddy_ref'); } catch (_) {}
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
    
    const nombreEmpresa = document.getElementById('invite-empresa-nombre').innerText;
    const idInvitacion = document.getElementById('invite-id-registro').value;

    // A. Registramos al usuario en Supabase Auth
    const { data: authData, error: authErr } = await clienteSupabase.auth.signUp({ 
        email: email, 
        password: pass1,
        options: { data: { tipo_registro: 'invitacion' } } // Ignorará nuestro trigger
    });

    if(authErr) {
        btnFinal.innerText = "Unirme al Equipo 🚀"; btnFinal.disabled = false;
        // ESCUDO ANTI-FANTASMAS: Si Supabase dice que ya existe
        if (authErr.message.includes("already registered")) {
            return alert("⚠️ Detectamos que este correo ya tiene una cuenta registrada en Buddy ERP. \n\nPor favor, recarga la página, ve a la pestaña 'Entrar' e inicia sesión con tu contraseña. El sistema te vinculará a la empresa automáticamente.");
        }
        return alert("❌ Error: " + authErr.message);
    }

    if (!authData.session) {
        btnFinal.innerText = "Unirme al Equipo 🚀"; btnFinal.disabled = false;
        return alert("📧 Revisa tu correo para confirmar la cuenta. Luego vuelve a abrir el link de invitación e inicia sesión.");
    }

    // B. La base de datos crea el perfil, la membresía y cierra la invitación en una sola operación
    const { error: errAceptar } = await clienteSupabase.rpc('aceptar_invitacion', {
        p_id: idInvitacion,
        p_perfil: {
            nombre: nombre,
            apellido: apellido,
            rut: rutPersonal,
            pin: pin,
            telefono: document.getElementById('inv-user-telefono').value.trim(),
            fecha_nacimiento: document.getElementById('inv-user-nacimiento').value
        }
    });

    if (errAceptar) {
        btnFinal.innerText = "Unirme al Equipo 🚀"; btnFinal.disabled = false;
        return alert("❌ Tu cuenta fue creada, pero no se pudo aceptar la invitación: " + errAceptar.message + "\n\nInicia sesión desde el mismo link para reintentar.");
    }

    alert(`🎉 ¡Listo, ${nombre}! Ya eres parte de ${nombreEmpresa}.`);
    
    // Lo mandamos al login para que entre directo
    window.location.href = '/app';
});

window.iniciarSesionEmpresa = async function(id, nombre, email, nombreUsuario, rol) {
    window.miEmpresaId = id;
    window.usuarioActual = nombreUsuario;
    window.miRol = rol; 
    // Nota de seguridad: el acceso por empresa lo valida la base de datos (RLS con
    // tiene_acceso_a_empresa sobre usuarios_empresas). Ya no se usa user_metadata.

    localStorage.setItem('sesion_activa_olympia', JSON.stringify({
        id: id, nombre: nombre, email: email, nombreUsuario: nombreUsuario, rol: rol
    }));

    // Suscripción: la base de datos calcula qué módulos puede usar la empresa
    // (contratados por Zeus o en prueba gratuita vigente) y los días de prueba.
    await window.cargarEstadoSuscripcion(id);

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
    if (window.revisarPerfilCompleto) window.revisarPerfilCompleto(); // sin await: no bloquea la carga
    // "Recomienda y gana" solo para el Dueño de la empresa
    document.getElementById('btn-menu-recomienda')?.classList.toggle('hidden', rol !== 'Dueño');

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
    
    window.location.href = '/app'; 
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
    localStorage.setItem('pantalla_actual', vista);
    
    // 1. Mostrar u ocultar submenús inteligentemente (Lo que ya tenías)
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
    const vistasPersonas = ['dashboard_personas', 'hr_calendario', 'hr_colaboradores', 'hr_documentos', 'hr_formacion', 'hr_solicitudes'];
    const submenuPersonas = document.getElementById('submenu-dashboard_personas');
    
    if (submenuPersonas) {
        if (vistasPersonas.includes(vista)) {
            submenuPersonas.classList.remove('hidden');
        } else {
            submenuPersonas.classList.add('hidden');
        }
    }
    const main = document.getElementById('main-content');
    
    // 👇 NUEVO: EL GUARDIA DE LA PUERTA (Validación de Suscripciones)
    let moduloRequerido = null;
    let nombreModulo = "";
    
    if (vistasVentas.includes(vista)) { moduloRequerido = 'ventas'; nombreModulo = "Ventas"; }
    else if (vistasInventario.includes(vista)) { moduloRequerido = 'inventario'; nombreModulo = "Inventario"; }
    else if (vistasPersonas.includes(vista)) { moduloRequerido = 'personas'; nombreModulo = "Personas y RRHH"; }

    // Verificamos si la suscripción existe y está inactiva
    if (moduloRequerido && window.suscripcionesEmpresa[moduloRequerido] && window.suscripcionesEmpresa[moduloRequerido].activo === false) {
        
        document.querySelectorAll('#sidebar-menu button').forEach(b => {
            b.classList.remove('bg-emerald-600', 'text-white', 'shadow-md');
            b.classList.add('hover:bg-slate-700');
        });

        // Mostramos el aviso de módulo bloqueado dependiendo del Rol
        const esAdmin = ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
        const pruebaVencida = window.estadoSuscripcion?.prueba_vencida === true;

        main.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center space-y-6 px-4">
                <div class="text-6xl">🔒</div>
                <h2 class="text-3xl font-bold text-slate-800">Módulo bloqueado</h2>
                <p class="text-slate-600 max-w-md">${pruebaVencida
                    ? `Tu prueba gratuita terminó. El módulo de <strong>${nombreModulo}</strong> está en pausa, pero <strong>tu información sigue guardada</strong>.`
                    : `El módulo de <strong>${nombreModulo}</strong> no está activo en tu plan actual.`}</p>
                ${esAdmin
                    ? `<a href="/contacto?asunto=planes" target="_blank" rel="noopener" class="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-emerald-700 transition-colors">Activar ${nombreModulo}</a>
                       <a href="/planes" target="_blank" rel="noopener" class="text-sm font-semibold text-emerald-700 underline underline-offset-2">Ver planes y precios</a>`
                    : `<p class="bg-orange-100 text-orange-800 px-6 py-3 rounded-lg font-medium border border-orange-200">Contacta al Dueño o Administrador de tu empresa para activar este módulo.</p>`}
            </div>
        `;
        return; // Detenemos la función aquí, NO CARGA LA VISTA
    }
    // 👆 FIN DEL GUARDIA

    // Si pasó el peaje, ponemos el loader y cargamos la vista normal
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
        const response = await fetch(`/vistas/${vista}`);
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
        if(vista === 'hr_colaboradores' && typeof window.cargarFichasLaborales === 'function') window.cargarFichasLaborales();
        if(vista === 'hr_colaboradores' && typeof window.cambiarTabHR === 'function') window.cambiarTabHR('fichas');
        if(vista === 'hr_calendario' && typeof window.toggleConfiguracionHR === 'function') window.toggleConfiguracionHR(false);

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
        mainTitle.innerText = `Buddy - ${nombreEmpresa}`;
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

// --- UTILIDAD: Mostrar/Ocultar Contraseñas y PIN ---
window.togglePasswordVisibility = function(inputId, boton) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";

    // Ícono: ojo abierto = "mostrar"; ojo tachado = "ocultar"
    const icono = boton?.querySelector('img');
    if (icono) icono.src = mostrar ? '/img/iconos/ojo-ocultar.svg' : '/img/iconos/ojo-mostrar.svg';
    if (boton) {
        const texto = mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña';
        boton.setAttribute('aria-label', texto);
        boton.setAttribute('title', texto);
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
// SUSCRIPCIÓN Y PRUEBA GRATUITA
// ============================================================================

window.estadoSuscripcion = null;

window.cargarEstadoSuscripcion = async function(idEmpresa) {
    window.suscripcionesEmpresa = {};
    window.estadoSuscripcion = null;
    try {
        const { data, error } = await clienteSupabase.rpc('estado_suscripcion', { p_id_empresa: idEmpresa });
        if (error) throw error;
        window.estadoSuscripcion = data;
        // Mismo formato que usa el control de acceso de cambiarVista()
        Object.entries(data?.modulos || {}).forEach(([modulo, disponible]) => {
            window.suscripcionesEmpresa[modulo] = { activo: disponible === true };
        });
    } catch (e) {
        console.error("Error obteniendo la suscripción:", e);
    }
    window.mostrarBarraPrueba();
}

window.mostrarBarraPrueba = function() {
    const barra = document.getElementById('barra-prueba');
    const texto = document.getElementById('barra-prueba-texto');
    const cta = document.getElementById('barra-prueba-cta');
    const est = window.estadoSuscripcion;
    if (!barra || !texto || !est) return;

    let oculta = false;
    try { oculta = sessionStorage.getItem('barra_prueba_oculta') === window.miEmpresaId; } catch (_) {}

    const esAdmin = ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
    const algunoContratado = Object.values(est.contratados || {}).some(Boolean);
    barra.className = 'hidden shrink-0 px-4 md:px-6 py-2 text-sm flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center border-b';

    if (est.en_prueba && !algunoContratado && !oculta) {
        const d = est.dias_restantes;
        texto.innerHTML = d <= 3
            ? `⏳ <strong>Tu prueba gratuita termina ${d === 1 ? 'mañana' : 'en ' + d + ' días'}.</strong>`
            : `🎁 Estás en tu prueba gratuita: te quedan <strong>${d} días</strong> con todos los módulos.`;
        barra.classList.remove('hidden');
        barra.classList.add(...(d <= 3 ? ['bg-amber-50', 'text-amber-900', 'border-amber-200'] : ['bg-emerald-50', 'text-emerald-900', 'border-emerald-200']));
        cta.classList.toggle('hidden', !esAdmin);
    } else if (est.prueba_vencida && !algunoContratado) {
        texto.innerHTML = '🔒 <strong>Tu prueba gratuita terminó.</strong> Tus datos están guardados: elige tu plan para seguir usando Buddy.';
        barra.classList.remove('hidden');
        barra.classList.add('bg-slate-800', 'text-white', 'border-slate-700');
        cta.classList.toggle('hidden', !esAdmin);
    }
}

window.cerrarBarraPrueba = function() {
    document.getElementById('barra-prueba')?.classList.add('hidden');
    try { sessionStorage.setItem('barra_prueba_oculta', window.miEmpresaId); } catch (_) {}
}

// ============================================================================
// RECOMIENDA Y GANA (solo Dueño)
// ============================================================================

window.abrirRecomiendaYGana = async function() {
    const modal = document.getElementById('modal-recomienda');
    const lista = document.getElementById('rec-lista');
    lista.innerHTML = '<li class="p-4 text-sm text-slate-400 animate-pulse">Cargando...</li>';
    modal.classList.remove('hidden');

    const { data, error } = await clienteSupabase.rpc('mi_programa_referidos', { p_id_empresa: window.miEmpresaId });
    if (error) {
        lista.innerHTML = `<li class="p-4 text-sm text-red-600">${error.message}</li>`;
        return;
    }

    const link = `${window.location.origin}/r/${data.codigo}`;
    document.getElementById('rec-link').value = link;
    document.getElementById('rec-codigo').innerText = data.codigo;
    document.getElementById('rec-meses').innerText = data.meses_ganados;

    const mensaje = `¡Hola! Uso Buddy ERP para administrar mi negocio y me ha servido mucho. Si te registras con mi link tienes 44 días de prueba gratis: ${link}`;
    document.getElementById('rec-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(mensaje);

    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const etiquetas = {
        cliente:   '<span class="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Cliente · ganaste 1 mes</span>',
        en_prueba: '<span class="text-[11px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">En prueba</span>',
        sin_plan:  '<span class="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Aún no es cliente</span>'
    };
    lista.innerHTML = data.referidos.length === 0
        ? '<li class="p-4 text-sm text-slate-500">Aún no has recomendado a ninguna empresa. ¡Comparte tu link!</li>'
        : data.referidos.map(r => `
            <li class="p-4 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="font-bold text-slate-800 truncate">${esc(r.empresa)}</p>
                    <p class="text-xs text-slate-400">Desde ${new Date(r.desde).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                ${etiquetas[r.estado] || ''}
            </li>`).join('');
}

window.cerrarRecomiendaYGana = function() {
    document.getElementById('modal-recomienda').classList.add('hidden');
}

window.copiarLinkRecomendado = function() {
    const link = document.getElementById('rec-link').value;
    navigator.clipboard.writeText(link)
        .then(() => alert('✅ Link copiado. ¡Compártelo con otros negocios!'))
        .catch(() => alert('Copia el link manualmente: ' + link));
}

// ============================================================================
// MI PERFIL (completar o editar los datos del usuario)
// ============================================================================

window.abrirMiPerfil = async function(obligatorio = false) {
    const { data: { user } } = await clienteSupabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await clienteSupabase.from('perfiles')
        .select('nombre, apellido, email, telefono, fecha_nacimiento, rut_o_identificacion')
        .eq('id_usuario', user.id).maybeSingle();

    const email = perfil?.email || user.email || '';
    // Si el nombre es solo la primera parte del correo, lo dejamos vacío para que lo escriba
    const nombre = perfil?.nombre && perfil.nombre.toLowerCase() !== email.split('@')[0].toLowerCase() ? perfil.nombre : '';

    document.getElementById('perfil-nombre').value = nombre;
    document.getElementById('perfil-apellido').value = perfil?.apellido || '';
    document.getElementById('perfil-rut').value = perfil?.rut_o_identificacion || '';
    document.getElementById('perfil-telefono').value = perfil?.telefono || '';
    document.getElementById('perfil-nacimiento').value = perfil?.fecha_nacimiento || '';
    document.getElementById('perfil-email').value = email;
    document.getElementById('perfil-error').classList.add('hidden');

    document.getElementById('perfil-titulo').innerText = obligatorio ? 'Completa tu perfil' : 'Mi perfil';
    document.getElementById('perfil-subtitulo').innerText = obligatorio
        ? 'Nos faltan algunos datos tuyos. Así tu equipo te reconoce y podemos ayudarte mejor.'
        : 'Actualiza tus datos personales.';
    document.getElementById('btn-perfil-despues').innerText = obligatorio ? 'Más tarde' : 'Cancelar';

    document.getElementById('modal-mi-perfil').classList.remove('hidden');
    document.getElementById('perfil-nombre').focus();
}

window.cerrarMiPerfil = function(pospuesto = false) {
    document.getElementById('modal-mi-perfil').classList.add('hidden');
    // "Más tarde": no volvemos a preguntar durante esta sesión del navegador
    if (pospuesto) { try { sessionStorage.setItem('perfil_pospuesto', '1'); } catch (_) {} }
}

window.revisarPerfilCompleto = async function() {
    try { if (sessionStorage.getItem('perfil_pospuesto') === '1') return; } catch (_) {}
    const { data: incompleto, error } = await clienteSupabase.rpc('perfil_incompleto');
    if (!error && incompleto === true) window.abrirMiPerfil(true);
}

document.getElementById('form-mi-perfil')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-perfil-guardar');
    const errorEl = document.getElementById('perfil-error');
    btn.disabled = true; btn.innerText = 'Guardando...';

    const datos = {
        nombre: document.getElementById('perfil-nombre').value.trim(),
        apellido: document.getElementById('perfil-apellido').value.trim(),
        rut: document.getElementById('perfil-rut').value.trim(),
        telefono: document.getElementById('perfil-telefono').value.trim(),
        fecha_nacimiento: document.getElementById('perfil-nacimiento').value
    };

    const { error } = await clienteSupabase.rpc('actualizar_mi_perfil', { p_datos: datos });
    btn.disabled = false; btn.innerText = 'Guardar';

    if (error) {
        errorEl.innerText = '❌ ' + error.message;
        errorEl.classList.remove('hidden');
        return;
    }

    window.cerrarMiPerfil(false);
    const spanUsuario = document.getElementById('user-name-display');
    if (spanUsuario) spanUsuario.innerText = datos.nombre;
    window.usuarioActual = datos.nombre;
});

// ============================================================================
// PIN DEL POS (asignación sin necesidad de entrar al POS)
// ============================================================================

// Pide un PIN nuevo dos veces y devuelve el PIN válido, o null si se cancela.
window.pedirPinNuevo = function(paraQuien) {
    const pin1 = prompt(`🔑 Nuevo PIN de 4 dígitos para ${paraQuien}:`);
    if (pin1 === null) return null;
    if (!/^\d{4}$/.test(pin1.trim())) { alert("❌ El PIN debe tener exactamente 4 números."); return null; }
    const pin2 = prompt("🔁 Repite el PIN para confirmar:");
    if (pin2 === null) return null;
    if (pin1.trim() !== pin2.trim()) { alert("❌ Los PIN no coinciden."); return null; }
    return pin1.trim();
}

// Asigna un PIN a un miembro de la empresa. La base valida permisos
// (el propio usuario, o un Dueño/Admin) y que no se repita dentro de la empresa.
window.asignarPinMiembro = async function(idEmpresa, idUsuario, nombre) {
    const pin = window.pedirPinNuevo(nombre);
    if (!pin) return;

    const { error } = await clienteSupabase.rpc('asignar_pin', {
        p_id_empresa: idEmpresa,
        p_id_usuario: idUsuario,
        p_pin: pin
    });
    if (error) return alert("❌ No se pudo guardar el PIN: " + error.message);
    alert(`✅ PIN guardado para ${nombre}.`);
}

window.cambiarMiPin = async function() {
    if (!window.miEmpresaId) return alert("⚠️ Primero entra a una empresa.");
    const { data: { user } } = await clienteSupabase.auth.getUser();
    if (!user) return;
    await window.asignarPinMiembro(window.miEmpresaId, user.id, 'ti');
}

// ============================================================================
// SISTEMA DE PERMISOS VISUALES (SIDEBAR Y MENÚS)
// ============================================================================
window.aplicarPermisosVisuales = async function() {
    // 1. Si es el Dueño, encendemos todos los botones del menú y terminamos.
    if (window.miRol === 'Dueño' || window.miRol === 'Administrador Supremo') {
        document.querySelectorAll('aside button, aside a').forEach(btn => btn.classList.remove('hidden'));
        return;
    }
    
    // 2. Si no es el dueño, ocultamos TODOS los módulos operativos por defecto por seguridad.
    const modulosOcultables = [
        'btn-menu-dashboard_ventas', 'submenu-dashboard_ventas',
        'btn-menu-dashboard', 'submenu-inventario',
        'btn-menu-reportes', 'btn-menu-catalogos', 'btn-menu-parametros'
    ];
    modulosOcultables.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 3. Vamos a buscar a Supabase qué SÍ puede ver este usuario según su Rol
    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        if (!user) return;

        // Primero buscamos el ID del rol de este usuario en esta empresa
        const { data: userData } = await clienteSupabase.from('usuarios_empresas')
            .select('id_rol')
            .eq('id_usuario', user.id)
            .eq('id_empresa', window.miEmpresaId)
            .single();

        if (!userData || !userData.id_rol) return; // Si no tiene rol configurado, se queda con todo oculto

        // Luego buscamos sus permisos exactos
        const { data: permisos } = await clienteSupabase.from('permisos_roles')
            .select('modulo')
            .eq('id_rol', userData.id_rol)
            .eq('puede_ver', true);

        if (!permisos) return;

        // 4. Encendemos los botones del menú lateral según lo que haya en la base de datos
        permisos.forEach(p => {
            // Reglas de mapeo: si tiene el permiso maestro, le mostramos el botón en el menú izquierdo
            if (p.modulo === 'ventas') document.getElementById('btn-menu-dashboard_ventas')?.classList.remove('hidden');
            if (p.modulo === 'inventario') document.getElementById('btn-menu-dashboard')?.classList.remove('hidden');
            if (p.modulo === 'reportes') document.getElementById('btn-menu-reportes')?.classList.remove('hidden');
            if (p.modulo === 'catalogos') document.getElementById('btn-menu-catalogos')?.classList.remove('hidden');
            if (p.modulo === 'admin') document.getElementById('btn-menu-parametros')?.classList.remove('hidden');
        });

    } catch (error) {
        console.error("Error aplicando permisos visuales:", error);
    }
};

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
    
    // ESTO ES LO NUEVO: Limpia la URL de basura y recarga para entrar
    window.location.href = window.location.pathname; 
});

// ============================================================================
// SISTEMA GLOBAL DE CÁMARA Y CÓDIGOS DE BARRAS
// ============================================================================
window.html5QrCode = null;

window.abrirEscanerCamara = function(contexto) {
    const modal = document.getElementById('modal-escaner');
    if (!modal) return alert("Falta el modal del escáner en el HTML.");
    
    modal.classList.remove('hidden');

    if (window.html5QrCode) {
        window.html5QrCode.clear();
    }

    window.html5QrCode = new Html5Qrcode("lector-codigo-barras");

    const anchoPantalla = window.innerWidth;
    const boxWidth = anchoPantalla < 500 ? 250 : 300;
    
    const config = { 
        fps: 15, 
        qrbox: { width: boxWidth, height: 120 },
        aspectRatio: 1.0,
        formatsToSupport: [ 
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE
        ]
    };

    window.html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
            sonidoBeep();
            window.cerrarEscaner();

            if (contexto === 'PRODUCTO') {
                const inputCodigo = document.getElementById('prod-codigo-barras');
                if (inputCodigo) {
                    inputCodigo.value = decodedText;
                    inputCodigo.classList.add('ring-4', 'ring-emerald-500', 'bg-emerald-50');
                    setTimeout(() => inputCodigo.classList.remove('ring-4', 'ring-emerald-500', 'bg-emerald-50'), 800);
                }
            } else if (contexto === 'INVENTARIO') {
                const buscadorInv = document.getElementById('cm-buscador-productos');
                if (buscadorInv) {
                    buscadorInv.value = decodedText;
                    if (typeof window.filtrarProductosConteo === 'function') window.filtrarProductosConteo();
                }
            } else if (contexto === 'POS') {
                const buscadorPOS = document.getElementById('pos-input-buscador');
                if (buscadorPOS) {
                    buscadorPOS.value = decodedText;
                    if (typeof window.buscarProductoPOS === 'function') {
                        window.buscarProductoPOS(decodedText);
                    }
                }
            }
        },
        (errorMessage) => { /* Ignoramos errores visuales menores */ }
    ).catch((err) => {
        console.error(err);
        alert("❌ Error al iniciar la cámara. Verifica los permisos.");
        window.cerrarEscaner();
    });
}; // <---- ESTA ES LA LLAVE MÁGICA QUE REVIVIRÁ TU APP 🪄

window.cerrarEscaner = function() {
    document.getElementById('modal-escaner').classList.add('hidden');
    if (window.html5QrCode) {
        window.html5QrCode.stop().then(() => {
            window.html5QrCode.clear();
        }).catch((err) => {
            console.log("Error apagando la cámara", err);
        });
    }
};

function sonidoBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        setTimeout(() => oscillator.stop(), 100); 
    } catch(e) { console.log("Audio no soportado"); }
}