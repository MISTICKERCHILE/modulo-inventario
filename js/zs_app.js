// ==========================================
// CEREBRO ZEUS (GOD MODE)
// ==========================================

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

    // FASE 1: Validar Contraseña y Permisos Zeus
    formFase1.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('zs-email').value.trim();
        const password = document.getElementById('zs-password').value;
        const btn = document.getElementById('zs-btn-fase1');
        
        btn.innerText = "Verificando..."; btn.disabled = true;

        // 1. Validamos credenciales usando TU cliente global
        const { data: authData, error: authErr } = await window.clienteSupabase.auth.signInWithPassword({ email, password });
        
        if (authErr) {
            btn.innerText = "Verificar Credenciales"; btn.disabled = false;
            return alert("Acceso Denegado: Credenciales incorrectas.");
        }

        // 2. Validamos si este usuario tiene el permiso de Dios en la tabla perfiles
        const { data: perfilData, error: perfilErr } = await window.clienteSupabase
            .from('perfiles')
            .select('es_zeus')
            .eq('id_usuario', authData.user.id)
            .single();

        // Si no tiene el booleano en true, lo pateamos del sistema
        if (perfilErr || !perfilData || perfilData.es_zeus !== true) {
            await window.clienteSupabase.auth.signOut(); // Cerramos la sesión que se abrió
            btn.innerText = "Verificar Credenciales"; btn.disabled = false;
            return alert("🛑 ALERTA DE INTRUSIÓN: No posees autorización nivel Zeus.");
        }

        // 3. Si llegó hasta aquí, ES EL SUPER ADMIN
        window.zeusUser = authData.user;

        // 4. Generamos un PIN matemático de 6 dígitos
        pinTemporalGenerado = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 🚨 AQUÍ SIMULAMOS EL ENVÍO DEL CORREO
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
            await enviarAlertaIngreso(window.zeusUser.email);
            
            // alert("Acceso Autorizado. Bienvenido, Zeus.");
            cargarVistaZeus('zs_dashboard'); // Cargamos tu God Mode
        } else {
            btn.innerText = "Desbloquear Terminal"; btn.disabled = false;
            alert("PIN Incorrecto. Intento registrado.");
            document.getElementById('zs-pin').value = '';
        }
    });
}

window.cancelarZeusLogin = async function() {
    if (window.clienteSupabase) {
        await window.clienteSupabase.auth.signOut();
    }
    window.location.reload();
}

// ==========================================
// SIMULADORES DE CORREO (Consola)
// ==========================================
async function enviarCorreoPIN(email, pin) {
    console.log(`%c[ZEUS SECURITY] %cSimulando envío a ${email}. Tu PIN es: %c${pin}`, 'color: #10b981; font-weight: bold;', 'color: white;', 'color: #fbbf24; font-size: 16px; font-weight: bold;');
}

async function enviarAlertaIngreso(email) {
    console.log(`%c[ZEUS SECURITY] %cAlerta enviada a ${email}: Nuevo ingreso detectado.`, 'color: #ef4444; font-weight: bold;', 'color: white;');
}