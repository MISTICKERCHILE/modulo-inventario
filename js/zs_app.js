// ==========================================
// CONFIGURACIÓN SUPABASE (Exclusiva para Zeus)
// ==========================================
const SUPABASE_URL = 'TU_URL_DE_SUPABASE';
const SUPABASE_KEY = 'TU_ANON_KEY_DE_SUPABASE';
const zeusSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.zeusUser = null;
let pinTemporalGenerado = null; // Guardaremos el PIN en memoria temporalmente

// Al arrancar, cargamos la vista de login
document.addEventListener('DOMContentLoaded', () => {
    cargarVistaZeus('zs_acceso');
});

// Función para inyectar vistas
async function cargarVistaZeus(vista) {
    const main = document.getElementById('zs-main-content');
    try {
        const response = await fetch(`vistas/${vista}.html`);
        if (!response.ok) throw new Error('Vista no encontrada');
        main.innerHTML = await response.text();
        
        // Si cargamos el acceso, bindeamos los formularios
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

    // FASE 1: Validar Contraseña y Rol
    formFase1.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('zs-email').value.trim();
        const password = document.getElementById('zs-password').value;
        const btn = document.getElementById('zs-btn-fase1');
        
        btn.innerText = "Verificando..."; btn.disabled = true;

        // 1. Validamos en Supabase Auth
        const { data: authData, error: authErr } = await zeusSupabase.auth.signInWithPassword({ email, password });
        
        if (authErr) {
            btn.innerText = "Verificar Credenciales"; btn.disabled = false;
            return alert("Acceso Denegado: Credenciales incorrectas.");
        }

        // 2. Aquí deberíamos verificar si este usuario TIENE EL ROL "Administrador Supremo" en la base de datos
        // (Asumimos que pasó la validación por ahora)
        window.zeusUser = authData.user;

        // 3. Generamos un PIN matemático de 6 dígitos
        pinTemporalGenerado = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 🚨 4. AQUÍ DISPARAMOS EL CORREO CON EL PIN
        await enviarCorreoPIN(window.zeusUser.email, pinTemporalGenerado);

        // Pasamos a la Fase 2 visualmente
        formFase1.classList.add('hidden');
        formFase2.classList.remove('hidden');
    });

    // FASE 2: Validar PIN
    formFase2.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputPin = document.getElementById('zs-pin').value.trim();
        const btn = document.getElementById('zs-btn-fase2');

        btn.innerText = "Desencriptando..."; btn.disabled = true;

        if (inputPin === pinTemporalGenerado) {
            // ¡ÉXITO!
            // 🚨 AQUÍ DISPARAMOS EL CORREO DE "ALERTA DE INICIO DE SESIÓN"
            await enviarAlertaIngreso(window.zeusUser.email);
            
            alert("Acceso Autorizado. Bienvenido, Zeus.");
            cargarVistaZeus('zs_dashboard'); // Cargamos tu God Mode
        } else {
            btn.innerText = "Desbloquear Terminal"; btn.disabled = false;
            alert("PIN Incorrecto. Intento registrado.");
            document.getElementById('zs-pin').value = '';
        }
    });
}

window.cancelarZeusLogin = async function() {
    await zeusSupabase.auth.signOut();
    window.location.reload();
}

// ==========================================
// FUNCIONES DE CORREO (A conectar)
// ==========================================
async function enviarCorreoPIN(email, pin) {
    console.log(`Simulando envío de correo a ${email}. Tu PIN es: ${pin}`);
    // Aquí conectaremos la tabla para enviar el correo real
}

async function enviarAlertaIngreso(email) {
    console.log(`Simulando alerta de ingreso enviada a ${email}.`);
    // Aquí conectaremos la alerta real
}