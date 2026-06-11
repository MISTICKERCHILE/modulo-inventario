// ==========================================
// --- MÓDULO: CONTROL DE ACCESO Y TURNOS POS ---
// ==========================================

window.pinActual = "";
window.motivoPinPOS = 'login'; // 'login', 'home', 'catalogos', 'parametros', 'reportes'

window.teclearPin = function(numero) {
    if(window.pinActual.length < 4) {
        window.pinActual += numero.toString();
        window.actualizarPuntosPin();
    }
    if(window.pinActual.length === 4) {
        setTimeout(() => window.validarPin(), 100);
    }
}

window.borrarPin = function() {
    window.pinActual = window.pinActual.slice(0, -1);
    window.actualizarPuntosPin();
}

window.borrarTodoElPin = function() {
    window.pinActual = "";
    window.actualizarPuntosPin();
}

window.actualizarPuntosPin = function() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if(index < window.pinActual.length) {
            dot.classList.remove('bg-slate-700', 'bg-red-500');
            dot.classList.add('bg-emerald-400');
        } else {
            dot.classList.remove('bg-emerald-400', 'bg-red-500');
            dot.classList.add('bg-slate-700');
        }
    });
}

window.errorPinAnimation = function() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(dot => {
        dot.classList.remove('bg-emerald-400', 'bg-slate-700');
        dot.classList.add('bg-red-500');
    });
    setTimeout(window.borrarTodoElPin, 500);
}

window.solicitarAccesoERP = function(destino) {
    window.motivoPinPOS = destino; 
    document.getElementById('pos-dropdown-menu').classList.add('hidden'); 
    document.getElementById('pos-dashboard-screen').classList.add('hidden'); 
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    window.borrarTodoElPin();
    document.getElementById('pos-pin-screen').classList.remove('hidden');
    document.getElementById('pos-pin-screen').classList.add('flex');
}

window.validarPin = async function() {
    try {
        const { data: perfil, error: errPerfil } = await clienteSupabase
            .from('perfiles').select('id_usuario, nombre').eq('pin_seguridad', window.pinActual).maybeSingle();

        if (errPerfil || !perfil) return window.errorPinAnimation();

        const { data: acceso, error: errAcceso } = await clienteSupabase
            .from('usuarios_empresas').select('rol').eq('id_empresa', window.miEmpresaId).eq('id_usuario', perfil.id_usuario).maybeSingle();

        if (errAcceso || !acceso) {
            alert("❌ El usuario no tiene acceso a esta empresa.");
            return window.errorPinAnimation();
        }

        const nombreRol = (acceso.rol || '').toLowerCase();
        const esAdminODueno = nombreRol.includes('admin') || nombreRol.includes('dueño') || nombreRol.includes('dueno');

        if (window.motivoPinPOS === 'login') {
            window.cajeroActivo = { id: perfil.id_usuario, nombre: perfil.nombre, rol: acceso.rol };
            document.getElementById('pos-nombre-cajero').innerText = perfil.nombre;
            if (typeof cargarMetodosPagoPOS === "function") cargarMetodosPagoPOS();
            window.entrarAlPos(); 
            return;
        }

        if (!esAdminODueno) {
            alert("🔒 Acceso Denegado: Permisos insuficientes.");
            window.motivoPinPOS = 'login';
            window.mostrarDashboardPos(); 
            return;
        }

        if (window.motivoPinPOS === 'home') {
            window.motivoPinPOS = 'login';
            window.salirDePOS(); 
        } 
        else if (window.motivoPinPOS === 'catalogos') {
            window.motivoPinPOS = 'login';
            if (typeof window.abrirPosAdminMenu === 'function') window.abrirPosAdminMenu();
        }
        else if (window.motivoPinPOS === 'parametros') {
            window.motivoPinPOS = 'login';
            if (typeof window.abrirPosAdminUsuarios === 'function') window.abrirPosAdminUsuarios();
        }
        else if (window.motivoPinPOS === 'reportes') {
            window.motivoPinPOS = 'login';
            if (typeof window.abrirPosAdminResumen === 'function') window.abrirPosAdminResumen();
        }

    } catch (error) {
        console.error("Error validando PIN:", error);
        window.errorPinAnimation();
    }
}

window.entrarAlPos = async function() {
    document.getElementById('pos-pin-screen').classList.add('hidden');
    document.getElementById('pos-pin-screen').classList.remove('flex');

    try {
        const { data: turnoAbierto, error } = await clienteSupabase
            .from('pos_turnos').select('*').eq('id_empresa', window.miEmpresaId).eq('estado', 'ABIERTO').maybeSingle();

        if (error) throw error;

        if (turnoAbierto) {
            window.turnoActual = turnoAbierto;
            window.sucursalActivaID = turnoAbierto.id_sucursal; // Rescatamos la sucursal del turno
            window.mostrarDashboardPos();
        } else {
            // No hay turno, obligamos a seleccionar la sucursal antes de abrir la caja
            window.solicitarSucursalApertura();
        }
    } catch (error) {
        console.error("Error verificando turnos:", error);
    }
}

// NUEVA FUNCIÓN: Lista las sucursales en la ventana emergente
window.solicitarSucursalApertura = async function() {
    const listaDiv = document.getElementById('lista-sucursales-pos');
    listaDiv.innerHTML = '<p class="text-slate-400 font-bold animate-pulse">Cargando locales...</p>';
    document.getElementById('modal-seleccionar-sucursal-pos').classList.remove('hidden');

    try {
        const { data: sucursales, error } = await clienteSupabase
            .from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');

        if (error) throw error;

        if (!sucursales || sucursales.length === 0) {
            listaDiv.innerHTML = '<p class="text-xs text-red-500 font-bold">No tienes sucursales creadas en el ERP.</p>';
            return;
        }

        listaDiv.innerHTML = sucursales.map(s => `
            <button onclick="window.confirmarSucursalApertura('${s.id}')" class="w-full text-left p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 font-bold text-slate-700 hover:text-emerald-800 transition-colors rounded-xl flex justify-between items-center group">
                <span>🏢 ${s.nombre}</span>
                <span class="opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity">Seleccionar →</span>
            </button>
        `).join('');

    } catch (err) {
        console.error(err);
        listaDiv.innerHTML = '<p class="text-xs text-red-500 font-bold">Error cargando sucursales.</p>';
    }
}

window.confirmarSucursalApertura = function(idSucursal) {
    window.sucursalActivaID = idSucursal;
    document.getElementById('modal-seleccionar-sucursal-pos').classList.add('hidden');
    window.abrirTurnoNuevo();
}

window.abrirTurnoNuevo = async function() {
    const montoInicial = prompt(`💵 Apertura de Caja (${window.cajeroActivo.nombre})\n\nIngresa el monto de efectivo inicial (Sencillo):`, "0");
    
    if (montoInicial === null) {
        document.getElementById('pos-pin-screen').remove('hidden');
        document.getElementById('pos-pin-screen').classList.add('flex');
        window.borrarTodoElPin();
        return;
    }

    const fondoCaja = parseFloat(montoInicial) || 0;

    try {
        const payloadTurno = {
            id_empresa: window.miEmpresaId,
            id_sucursal: window.sucursalActivaID, // Vinculado a la sucursal seleccionada
            abierto_por: window.cajeroActivo.id, 
            monto_inicial_efectivo: fondoCaja,
            estado: 'ABIERTO'
        };

        const { data: nuevoTurno, error } = await clienteSupabase.from('pos_turnos').insert([payloadTurno]).select().single();
        if (error) throw error;

        window.turnoActual = nuevoTurno;
        window.mostrarDashboardPos();

    } catch (error) {
        console.error("Error abriendo turno:", error);
    }
}

window.mostrarDashboardPos = function() {
    const opcionesFecha = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('pos-fecha-actual').innerText = new Date().toLocaleDateString('es-ES', opcionesFecha).toUpperCase();
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

window.pausarTurno = function() {
    document.getElementById('modal-salida-pos').classList.add('hidden');
    alert("☕ Pausa registrada. La caja se bloqueará.");
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    document.getElementById('pos-pin-screen').classList.remove('hidden');
    document.getElementById('pos-pin-screen').classList.add('flex');
    window.borrarTodoElPin();
}

window.iniciarCierreDeCaja = async function() {
    if (!window.turnoActual) return alert("❌ No hay un turno activo para cerrar.");
    document.getElementById('modal-salida-pos').classList.add('hidden');

    try {
        const { count } = await clienteSupabase.from('pos_cuentas_abiertas').select('*', { count: 'exact', head: true }).eq('id_empresa', window.miEmpresaId);
        if (count > 0) {
            const confirmar = confirm(`⚠️ Cuentas en espera activas.\n¿Deseas cerrar tu caja de todas formas?`);
            if (!confirmar) { document.getElementById('modal-salida-pos').classList.remove('hidden'); return; }
        }
    } catch (error) { console.error(error); }

    document.getElementById('cierre-cajero-nombre').innerText = window.cajeroActivo ? window.cajeroActivo.nombre : 'Cajero';

    try {
        const { data: ventasTurno, error } = await clienteSupabase.from('ventas').select('total, metodo_pago').eq('id_empresa', window.miEmpresaId).gte('created_at', window.turnoActual.fecha_apertura).in('estado', ['COMPLETADA']);
        if (error) throw error;

        window.estadoCierreActual = window.metodosPagoMemoria.map(mp => {
            const totalEsperado = (ventasTurno || []).filter(v => v.metodo_pago === mp.nombre).reduce((sum, v) => sum + Number(v.total), 0);
            let fondoCaja = mp.tipo === 'EFECTIVO' ? (Number(window.turnoActual.monto_inicial_efectivo) || 0) : 0;
            return { id: mp.id, nombre: mp.nombre, tipo: mp.tipo, esperado: totalEsperado + fondoCaja, real: 0, diferencia: 0 };
        });

        window.renderizarCalculadoraCierre();
        document.getElementById('modal-cierre-caja').classList.remove('hidden');
    } catch (error) {
        console.error(error);
    }
}

window.renderizarCalculadoraCierre = function() {
    const container = document.getElementById('cierre-dinamico-container');
    container.innerHTML = window.estadoCierreActual.map(item => {
        let color = 'slate'; let icono = '🪙';
        if (item.tipo === 'EFECTIVO') { color = 'emerald'; icono = '💵'; }
        if (item.tipo === 'TARJETA') { color = 'blue'; icono = '💳'; }
        if (item.tipo === 'TRANSFERENCIA') { color = 'purple'; icono = '📱'; }

        return `
        <div class="bg-${color}-50 rounded-2xl p-4 border border-${color}-100 relative">
            <div class="absolute -top-3 left-4 bg-${color}-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm">${icono} ${item.nombre}</div>
            <div class="flex justify-between items-end mt-2 mb-3">
                <p class="text-sm font-bold text-${color}-700">El sistema calculó:</p>
                <p class="text-xl font-black text-${color}-900">$${item.esperado.toLocaleString('es-CL')}</p>
            </div>
            <div class="bg-white p-3 rounded-xl shadow-inner border border-${color}-200">
                <input type="number" id="cierre-real-${item.id}" oninput="calcularDiferenciaCaja()" placeholder="0" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-2xl font-black text-slate-800 outline-none">
            </div>
        </div>`;
    }).join('');
    window.calcularDiferenciaCaja(); 
}

window.calcularDiferenciaCaja = function() {
    let totalDiferencia = 0;
    window.estadoCierreActual.forEach(item => {
        const inputReal = document.getElementById(`cierre-real-${item.id}`);
        const valorReal = inputReal ? Number(inputReal.value) || 0 : 0;
        item.real = valorReal; item.diferencia = valorReal - item.esperado;
        totalDiferencia += item.diferencia;
    });

    const panel = document.getElementById('cierre-resultado-panel');
    const montoTexto = document.getElementById('cierre-diferencia-monto');
    const descTexto = document.getElementById('cierre-diferencia-texto');

    montoTexto.innerText = `$${Math.abs(totalDiferencia).toLocaleString('es-CL')}`;
    panel.classList.remove('border-emerald-400', 'bg-emerald-50', 'border-red-400', 'bg-red-50', 'border-slate-200', 'bg-slate-50');

    if (totalDiferencia === 0) {
        panel.classList.add('border-emerald-400', 'bg-emerald-50'); descTexto.innerText = "✅ Caja Cuadrada Perfectamente";
    } else if (totalDiferencia > 0) {
        panel.classList.add('border-slate-200', 'bg-slate-50'); descTexto.innerText = "⚠️ Sobra dinero en caja";
    } else if (totalDiferencia < 0) {
        panel.classList.add('border-red-400', 'bg-red-50'); descTexto.innerText = "❌ Falta dinero (Descuadre)";
    }
}

window.confirmarCierreCaja = async function() {
    if (!window.turnoActual) return alert("❌ No hay un turno activo para cerrar.");
    const btn = document.getElementById('btn-finalizar-cierre');
    if (btn) { btn.innerText = "⏳ Cerrando..."; btn.disabled = true; }

    try {
        const { error } = await clienteSupabase.from('pos_turnos').update({
            fecha_cierre: new Date().toISOString(), cerrado_por: window.cajeroActivo.id, desglose_cierre: window.estadoCierreActual, estado: 'CERRADO'
        }).eq('id', window.turnoActual.id);
        if (error) throw error;

        window.turnoActual = null; window.cajeroActivo = null; window.sucursalActivaID = null;
        alert("🔒 Turno cerrado exitosamente.");

        document.getElementById('modal-cierre-caja').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.remove('flex');
        document.getElementById('pos-pin-screen').classList.remove('hidden');
        document.getElementById('pos-pin-screen').classList.add('flex');
        window.borrarTodoElPin();
    } catch (error) {
        console.error(error);
    } finally {
        if (btn) { btn.innerText = "🔒 Cerrar Turno"; btn.disabled = false; }
    }
}

window.salirDePOS = function() {
    document.getElementById('pos-wrapper').classList.add('hidden');
    document.getElementById('pos-wrapper').classList.remove('flex');
    const sidebar = document.getElementById('sidebar-menu');
    const header = document.querySelector('header');
    const main = document.getElementById('main-content');
    
    if(sidebar) sidebar.classList.remove('hidden');
    if(header) header.classList.remove('hidden');
    if(main) main.classList.remove('p-0', 'md:p-0');

    window.cambiarVista('home');
}

window.abrirModalSalidaPOS = function() {
    document.getElementById('pos-dropdown-menu').classList.add('hidden');
    document.getElementById('modal-salida-pos').classList.remove('hidden');
}