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