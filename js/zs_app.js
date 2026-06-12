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
        if (vista === 'zs_acceso') {
            bindearFormulariosAcceso();
            inicializarDashboardZeus(); 
        }
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

        // 3. Validamos permiso Zeus en tabla perfiles
        const { data: perfilData, error: perfilErr } = await window.clienteSupabase
            .from('perfiles')
            .select('es_zeus')
            .eq('id_usuario', authData.user.id)
            .single();

        if (perfilErr || !perfilData || perfilData.es_zeus !== true) {
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

window.listaEmpresasGlobal = []; // Guardamos las empresas en memoria

// Esta función se llama solita cuando logras entrar al Dashboard
async function inicializarDashboardZeus() {
    const userDisplay = document.getElementById('zs-user-display');
    if (userDisplay && window.zeusUser) userDisplay.innerText = window.zeusUser.email;
    
    await cargarTablaEmpresasZeus();
}

async function cargarTablaEmpresasZeus() {
    const tbody = document.getElementById('zs-tabla-empresas');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-emerald-500 font-mono animate-pulse">Obteniendo datos...</td></tr>`;

    // Traemos las empresas desde Supabase
    const { data: empresas, error } = await window.clienteSupabase
        .from('empresas')
        .select('id, nombre, rut_o_identificacion, suscripciones')
        .order('fecha_creacion', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Error leyendo base de datos: ${error.message}</td></tr>`;
        return;
    }

    window.listaEmpresasGlobal = empresas;
    renderizarTablaEmpresas(empresas);
}

function renderizarTablaEmpresas(empresas) {
    const tbody = document.getElementById('zs-tabla-empresas');
    tbody.innerHTML = '';

    if (empresas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-500">No hay empresas registradas aún.</td></tr>`;
        return;
    }

    empresas.forEach(emp => {
        // Validamos que exista el objeto suscripciones, si no, creamos uno vacío
        const subs = emp.suscripciones || {};
        
        // Verificamos el estado de cada módulo (si no existe, es false por defecto)
        const vVentas = subs.ventas?.activo || false;
        const vInventario = subs.inventario?.activo || false;
        const vPersonas = subs.personas?.activo || false;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-700/30 transition-colors";
        
        tr.innerHTML = `
            <td class="p-4">
                <div class="font-bold text-white">${emp.nombre}</div>
                <div class="text-xs text-slate-400 font-mono mt-1">RUT: ${emp.rut_o_identificacion || 'N/A'}</div>
            </td>
            <td class="p-4 text-center">
                ${generarToggleHTML(emp.id, 'ventas', vVentas)}
            </td>
            <td class="p-4 text-center">
                ${generarToggleHTML(emp.id, 'inventario', vInventario)}
            </td>
            <td class="p-4 text-center">
                ${generarToggleHTML(emp.id, 'personas', vPersonas)}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Generador del interruptor visual (Toggle) de Tailwind
function generarToggleHTML(empresaId, modulo, estadoActual) {
    const bgClass = estadoActual ? 'bg-emerald-500' : 'bg-slate-600';
    const translateClass = estadoActual ? 'translate-x-5' : 'translate-x-1';
    
    return `
        <button onclick="cambiarEstadoModulo('${empresaId}', '${modulo}', ${!estadoActual})" 
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${bgClass}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${translateClass}"></span>
        </button>
    `;
}

// La acción que guarda en la base de datos
window.cambiarEstadoModulo = async function(empresaId, modulo, nuevoEstado) {
    // 1. Buscamos la empresa en nuestra memoria local
    const empresa = window.listaEmpresasGlobal.find(e => e.id === empresaId);
    if (!empresa) return;

    // 2. Clonamos su configuración actual para no borrarle nada
    let nuevasSuscripciones = { ...empresa.suscripciones };
    
    // 3. Aseguramos que el módulo exista en el objeto y le cambiamos el valor
    if (!nuevasSuscripciones[modulo]) nuevasSuscripciones[modulo] = {};
    nuevasSuscripciones[modulo].activo = nuevoEstado;

    // 4. Actualizamos el botón visualmente de inmediato para que se sienta rápido
    empresa.suscripciones = nuevasSuscripciones;
    renderizarTablaEmpresas(window.listaEmpresasGlobal);

    // 5. Lo guardamos en Supabase silenciosamente
    const { error } = await window.clienteSupabase
        .from('empresas')
        .update({ suscripciones: nuevasSuscripciones })
        .eq('id', empresaId);

    if (error) {
        alert("❌ Error al guardar el cambio: " + error.message);
        // Si hay error, devolvemos el estado visual a como estaba
        cargarTablaEmpresasZeus(); 
    }
}