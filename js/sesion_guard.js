// Si el inicio de sesión real (Supabase) se vence pero el navegador aún recuerda la "sesión de empresa",
// la pantalla se abre normal y falla recién al guardar ("permission denied for function ...").
// Este guardia lo detecta al abrir y cuando el inicio de sesión se pierde con la pantalla abierta.
(function () {
    const CLAVE = 'sesion_activa_olympia';

    function avisoLogin() {
        const login = document.getElementById('login-container');
        if (!login || document.getElementById('aviso-sesion-vencida')) return;
        const d = document.createElement('div');
        d.id = 'aviso-sesion-vencida';
        d.setAttribute('role', 'alert');
        d.style.cssText = 'margin:12px auto;max-width:420px;padding:10px 14px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px;font-weight:600;text-align:center';
        d.textContent = 'Tu sesión venció por seguridad. Vuelve a iniciar sesión para continuar.';
        login.insertBefore(d, login.firstChild);
    }

    // true = hay sesión real; false = no la hay; null = no se pudo comprobar (sin red): no se saca al usuario
    window.sesionRealVigente = async function () {
        try {
            if (!window.clienteSupabase) return null;
            const { data, error } = await window.clienteSupabase.auth.getSession();
            if (error) return null;
            return !!(data && data.session);
        } catch (e) { return null; }
    };

    window.cerrarPorSesionVencida = function () {
        try { localStorage.removeItem(CLAVE); localStorage.removeItem('pantalla_actual'); } catch (e) {}
        const dash = document.getElementById('dashboard-container');
        if (dash) dash.classList.add('hidden');
        const login = document.getElementById('login-container');
        if (login) login.classList.remove('hidden');
        avisoLogin();
    };

    // Si se pierde con la pantalla abierta (otra pestaña cerró sesión, token no renovable…)
    window.vigilarSesionReal = function () {
        if (!window.clienteSupabase || window.__vigiaSesion) return;
        window.__vigiaSesion = true;
        window.clienteSupabase.auth.onAuthStateChange((evento) => {
            let hayLocal = false;
            try { hayLocal = !!localStorage.getItem(CLAVE); } catch (e) {}
            if (evento === 'SIGNED_OUT' && hayLocal) { window.cerrarPorSesionVencida(); }
        });
        // Al volver a la pestaña (típico en el celular) se revisa de nuevo
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState !== 'visible') return;
            let hayLocal = false;
            try { hayLocal = !!localStorage.getItem(CLAVE); } catch (e) {}
            if (hayLocal && (await window.sesionRealVigente()) === false) window.cerrarPorSesionVencida();
        });
    };
})();
