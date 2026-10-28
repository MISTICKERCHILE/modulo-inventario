// ==========================================
// CEREBRO ZEUS (GOD MODE) - BLINDADO
// ==========================================

window.zeusUser = null;
let pinTemporalGenerado = null; 

// 1. EL RADAR: Esperamos a Vercel y tu archivo supabase.js
async function esperarConexionSegura() {
    return new Promise((resolve) => {
        // Si ya conectó instantáneamente, pasamos
        if (window.clienteSupabase) return resolve();
        
        console.log("⏳ [ZEUS] Esperando inyección de seguridad de Vercel...");
        
        // Si no, revisamos cada 100ms hasta que exista
        const intervalo = setInterval(() => {
            if (window.clienteSupabase) {
                clearInterval(intervalo);
                console.log("✅ [ZEUS] Conexión segura establecida.");
                resolve();
            }
        }, 100);
    });
}

// Arrancamos solo cuando la conexión segura esté garantizada
document.addEventListener('DOMContentLoaded', async () => {
    await esperarConexionSegura();
    cargarVistaZeus('zs_acceso');
});

// Función para inyectar vistas
async function cargarVistaZeus(vista) {
    const main = document.getElementById('zs-main-content');
    try {
        const response = await fetch(`vistas/${vista}.html`);
        if (!response.ok) throw new Error('Vista no encontrada');
        main.innerHTML = await response.text();
        if (vista === 'zs_acceso') bindearFormulariosAcceso();
        if (vista === 'zs_dashboard') inicializarDashboardZeus();
    } catch (error) {
        main.innerHTML = `<div class="p-8 text-center text-red-500 font-mono">Error System: ${vista} not found</div>`;
    }
}

// ==========================================
// LÓGICA DE FASE 1 Y FASE 2
// ==========================================
function bindearFormulariosAcceso() {
    const formFase1 = document.getElementById('zs-form-fase1');
    const formFase2 = document.getElementById('zs-form-fase2');

    formFase1.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('zs-email').value.trim();
        const password = document.getElementById('zs-password').value;
        const btn = document.getElementById('zs-btn-fase1');
        
        btn.innerText = "Verificando..."; btn.disabled = true;

        // 2. Usamos tu cliente global blindado
        const { data: authData, error: authErr } = await window.clienteSupabase.auth.signInWithPassword({ email, password });
        
        if (authErr) {
            btn.innerText = "Verificar Credenciales"; btn.disabled = false;
            return alert("Acceso Denegado: Credenciales incorrectas.");
        }

        // 3. Validamos permiso Zeus EN LA BASE DE DATOS (no se puede falsificar desde el navegador)
        const { data: esZeus, error: zeusErr } = await window.clienteSupabase.rpc('soy_zeus');

        if (zeusErr || esZeus !== true) {
            await window.clienteSupabase.auth.signOut(); 
            btn.innerText = "Verificar Credenciales"; btn.disabled = false;
            return alert("🛑 ALERTA DE INTRUSIÓN: No posees autorización nivel Zeus.");
        }

        window.zeusUser = authData.user;
        pinTemporalGenerado = Math.floor(100000 + Math.random() * 900000).toString();
        
        await enviarCorreoPIN(window.zeusUser.email, pinTemporalGenerado);

        formFase1.classList.add('hidden');
        formFase2.classList.remove('hidden');
    });

    formFase2.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputPin = document.getElementById('zs-pin').value.trim();
        const btn = document.getElementById('zs-btn-fase2');

        btn.innerText = "Desencriptando..."; btn.disabled = true;

        if (inputPin === pinTemporalGenerado) {
            await enviarAlertaIngreso(window.zeusUser.email);
            cargarVistaZeus('zs_dashboard'); 
        } else {
            btn.innerText = "Desbloquear Terminal"; btn.disabled = false;
            alert("PIN Incorrecto. Intento registrado.");
            document.getElementById('zs-pin').value = '';
        }
    });
}

window.cancelarZeusLogin = async function() {
    if (window.clienteSupabase) await window.clienteSupabase.auth.signOut();
    window.location.reload();
}

async function enviarCorreoPIN(email, pin) {
    console.log(`%c[ZEUS SECURITY] %cSimulando envío a ${email}. Tu PIN es: %c${pin}`, 'color: #10b981; font-weight: bold;', 'color: white;', 'color: #fbbf24; font-size: 16px; font-weight: bold;');
}

async function enviarAlertaIngreso(email) {
    console.log(`%c[ZEUS SECURITY] %cAlerta enviada a ${email}: Nuevo ingreso detectado.`, 'color: #ef4444; font-weight: bold;', 'color: white;');
}

// ==========================================
// MÓDULO: CONTROL DE EMPRESAS Y SUSCRIPCIONES
// ==========================================

// Todas las consultas pasan por funciones Zeus en Supabase, que verifican
// es_zeus en la base de datos. Ningún dato de clientes se lee directo de tablas.

window.listaEmpresasGlobal = [];
window.empresaZeusAbierta = null;

const MODULOS_ZEUS = [
    { clave: 'ventas',     nombre: 'Ventas' },
    { clave: 'inventario', nombre: 'Inventario' },
    { clave: 'personas',   nombre: 'Personas' }
];

function escZ(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fechaCorta(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function haceCuanto(iso) {
    if (!iso) return 'Sin ventas';
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (dias <= 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    if (dias < 30) return `Hace ${dias} días`;
    return `Hace ${Math.floor(dias / 30)} mes(es)`;
}

function pesos(monto) {
    return Number(monto || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

// Se llama al entrar al Dashboard
async function inicializarDashboardZeus() {
    const userDisplay = document.getElementById('zs-user-display');
    if (userDisplay && window.zeusUser) userDisplay.innerText = window.zeusUser.email;

    const buscador = document.getElementById('zs-buscar');
    if (buscador && !buscador.dataset.atado) {
        buscador.addEventListener('input', () => renderizarTablaEmpresas(window.listaEmpresasGlobal));
        buscador.dataset.atado = '1';
    }

    await cargarTablaEmpresasZeus();
}

async function cargarTablaEmpresasZeus() {
    const tbody = document.getElementById('zs-tabla-empresas');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-emerald-500 font-mono animate-pulse">Obteniendo datos...</td></tr>`;

    const { data: empresas, error } = await window.clienteSupabase.rpc('zeus_resumen_empresas');

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-500">Error leyendo base de datos: ${escZ(error.message)}</td></tr>`;
        return;
    }

    window.listaEmpresasGlobal = empresas || [];
    renderizarKpisZeus(window.listaEmpresasGlobal);
    renderizarTablaEmpresas(window.listaEmpresasGlobal);
}
window.cargarTablaEmpresasZeus = cargarTablaEmpresasZeus;

function renderizarKpisZeus(empresas) {
    const set = (id, valor) => { const el = document.getElementById(id); if (el) el.innerText = valor; };
    const activas = empresas.filter(e => e.ventas_30d > 0).length;
    set('zs-kpi-empresas', empresas.length);
    set('zs-kpi-usuarios', empresas.reduce((s, e) => s + (e.miembros || 0), 0));
    set('zs-kpi-activas', `${activas} / ${empresas.length}`);
    set('zs-kpi-monto', pesos(empresas.reduce((s, e) => s + Number(e.monto_30d || 0), 0)));
}

function renderizarTablaEmpresas(empresas) {
    const tbody = document.getElementById('zs-tabla-empresas');
    if (!tbody) return;

    const filtro = (document.getElementById('zs-buscar')?.value || '').trim().toLowerCase();
    const visibles = empresas.filter(e =>
        !filtro ||
        (e.nombre || '').toLowerCase().includes(filtro) ||
        (e.rut || '').toLowerCase().includes(filtro) ||
        (e.duenos || '').toLowerCase().includes(filtro)
    );

    if (visibles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">${empresas.length === 0 ? 'No hay empresas registradas aún.' : 'Ninguna empresa coincide con la búsqueda.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = visibles.map(emp => {
        const subs = emp.suscripciones || {};
        const abierta = window.empresaZeusAbierta === emp.id;
        const filaEmpresa = `
        <tr class="hover:bg-slate-700/30 transition-colors cursor-pointer" onclick="alternarEquipoZeus('${emp.id}')">
            <td class="p-4">
                <div class="font-bold text-white flex items-center gap-2">
                    <span class="text-slate-500 text-xs">${abierta ? '▼' : '▶'}</span>${escZ(emp.nombre)}
                </div>
                <div class="text-xs text-slate-400 font-mono mt-1">RUT: ${escZ(emp.rut || 'N/A')} · ${escZ(emp.pais || '—')} · desde ${fechaCorta(emp.fecha_creacion)}</div>
                <div class="text-xs text-slate-500 mt-1 truncate max-w-xs" title="${escZ(emp.duenos || '')}">Dueño: ${escZ(emp.duenos || 'sin Dueño ⚠️')}</div>
            </td>
            <td class="p-4 text-center text-slate-300">
                <div class="font-bold">${emp.miembros}</div>
                ${emp.invitaciones_pendientes > 0 ? `<div class="text-[10px] text-amber-400">${emp.invitaciones_pendientes} invitación(es)</div>` : ''}
            </td>
            <td class="p-4 text-center text-slate-300 text-xs">
                <div>${emp.sucursales} sucursal(es)</div>
                <div class="text-slate-500">${emp.productos} productos</div>
            </td>
            <td class="p-4 text-center text-xs">
                <div class="font-bold ${emp.ventas_30d > 0 ? 'text-emerald-400' : 'text-slate-500'}">${emp.ventas_30d} ventas · ${pesos(emp.monto_30d)}</div>
                <div class="text-slate-500">Última: ${haceCuanto(emp.ultima_venta)}</div>
            </td>
            ${MODULOS_ZEUS.map(m => `<td class="p-4 text-center" onclick="event.stopPropagation()">${generarToggleHTML(emp.id, m.clave, subs[m.clave]?.activo === true)}</td>`).join('')}
        </tr>`;

        const filaEquipo = abierta ? `
        <tr class="bg-slate-900/60">
            <td colspan="7" class="px-6 py-4" id="zs-equipo-${emp.id}">
                <div class="text-slate-500 font-mono text-xs animate-pulse">Cargando equipo...</div>
            </td>
        </tr>` : '';

        return filaEmpresa + filaEquipo;
    }).join('');

    if (window.empresaZeusAbierta) cargarEquipoZeus(window.empresaZeusAbierta);
}

window.alternarEquipoZeus = function(empresaId) {
    window.empresaZeusAbierta = window.empresaZeusAbierta === empresaId ? null : empresaId;
    renderizarTablaEmpresas(window.listaEmpresasGlobal);
}

async function cargarEquipoZeus(empresaId) {
    const celda = document.getElementById(`zs-equipo-${empresaId}`);
    if (!celda) return;

    const { data: equipo, error } = await window.clienteSupabase.rpc('zeus_equipo_empresa', { p_id_empresa: empresaId });
    if (error) {
        celda.innerHTML = `<div class="text-red-400 text-xs">Error: ${escZ(error.message)}</div>`;
        return;
    }
    if (!equipo || equipo.length === 0) {
        celda.innerHTML = `<div class="text-amber-400 text-xs">⚠️ Esta empresa no tiene usuarios.</div>`;
        return;
    }

    celda.innerHTML = `
        <div class="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Equipo</div>
        <table class="w-full text-xs">
            <thead class="text-slate-500">
                <tr>
                    <th class="text-left py-1">Nombre</th>
                    <th class="text-left py-1">Correo</th>
                    <th class="text-left py-1">Rol</th>
                    <th class="text-center py-1">PIN POS</th>
                    <th class="text-left py-1">Miembro desde</th>
                    <th class="text-left py-1">Último ingreso</th>
                </tr>
            </thead>
            <tbody class="text-slate-300">
                ${equipo.map(m => `
                <tr class="border-t border-slate-800">
                    <td class="py-1.5 font-bold">${escZ(m.nombre)}</td>
                    <td class="py-1.5 font-mono">${escZ(m.email)}</td>
                    <td class="py-1.5">${escZ(m.rol)}</td>
                    <td class="py-1.5 text-center">${m.tiene_pin ? '✅' : '<span class="text-amber-400">Sin PIN</span>'}</td>
                    <td class="py-1.5">${fechaCorta(m.desde)}</td>
                    <td class="py-1.5">${m.ultimo_acceso ? fechaCorta(m.ultimo_acceso) : '<span class="text-slate-500">Nunca</span>'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// Interruptor visual (Toggle)
function generarToggleHTML(empresaId, modulo, estadoActual) {
    const bgClass = estadoActual ? 'bg-emerald-500' : 'bg-slate-600';
    const translateClass = estadoActual ? 'translate-x-5' : 'translate-x-1';

    return `
        <button onclick="cambiarEstadoModulo('${empresaId}', '${modulo}', ${!estadoActual})"
                title="${estadoActual ? 'Desactivar' : 'Activar'} módulo"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${bgClass}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${translateClass}"></span>
        </button>
    `;
}

// Guarda el cambio en la base (función Zeus: valida permiso y deja registro en auditoría)
window.cambiarEstadoModulo = async function(empresaId, modulo, nuevoEstado) {
    const empresa = window.listaEmpresasGlobal.find(e => e.id === empresaId);
    if (!empresa) return;

    const nombreModulo = MODULOS_ZEUS.find(m => m.clave === modulo)?.nombre || modulo;
    const accion = nuevoEstado ? 'ACTIVAR' : 'DESACTIVAR';
    if (!confirm(`¿${accion} el módulo ${nombreModulo} para ${empresa.nombre}?`)) return;

    const { data: nuevasSuscripciones, error } = await window.clienteSupabase.rpc('zeus_cambiar_modulo', {
        p_id_empresa: empresaId,
        p_modulo: modulo,
        p_activo: nuevoEstado
    });

    if (error) {
        alert("❌ Error al guardar el cambio: " + error.message);
        return;
    }

    // Solo actualizamos la pantalla cuando la base confirmó el cambio
    empresa.suscripciones = nuevasSuscripciones;
    renderizarTablaEmpresas(window.listaEmpresasGlobal);
}
