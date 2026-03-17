let pinActual = "";
const PIN_CORRECTO = "1234"; // En el futuro lo leeremos de Supabase

window.cargarVentas = function() {
    console.log("💰 Cargando Módulo POS...");
    
    // Ocultar el layout principal del ERP (Sidebar y Main content)
    document.getElementById('sidebar-menu').classList.add('hidden');
    document.querySelector('header').classList.add('hidden');
    document.getElementById('main-content').classList.add('p-0', 'md:p-0'); // Quitar padding para que ocupe todo
    
    // Mostrar el contenedor POS
    document.getElementById('pos-wrapper').classList.remove('hidden');
    document.getElementById('pos-wrapper').classList.add('flex');

    // Resetear PIN
    borrarTodoElPin();
}

// === LÓGICA DEL TECLADO PIN ===
window.teclearPin = function(numero) {
    if(pinActual.length < 4) {
        pinActual += numero.toString();
        actualizarPuntosPin();
    }
    
    if(pinActual.length === 4) {
        validarPin();
    }
}

window.borrarPin = function() {
    pinActual = pinActual.slice(0, -1);
    actualizarPuntosPin();
}

window.borrarTodoElPin = function() {
    pinActual = "";
    actualizarPuntosPin();
}

function actualizarPuntosPin() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if(index < pinActual.length) {
            dot.classList.replace('bg-slate-700', 'bg-emerald-400');
        } else {
            dot.classList.replace('bg-emerald-400', 'bg-slate-700');
            dot.classList.replace('bg-red-500', 'bg-slate-700'); // Por si estaba en rojo de error
        }
    });
}

function validarPin() {
    // Aquí luego cruzaremos con Supabase. Por ahora usamos el 1234.
    if(pinActual === PIN_CORRECTO) {
        entrarAlPos();
    } else {
        // PIN Incorrecto: Animación roja
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach(dot => dot.classList.replace('bg-emerald-400', 'bg-red-500'));
        setTimeout(borrarTodoElPin, 500);
    }
}

// === NAVEGACIÓN DENTRO DEL POS ===
function entrarAlPos() {
    // Fecha actual
    const opcionesFecha = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('pos-fecha-actual').innerText = new Date().toLocaleDateString('es-ES', opcionesFecha);
    
    // Cambiar pantallas
    document.getElementById('pos-pin-screen').classList.add('hidden');
    document.getElementById('pos-pin-screen').classList.remove('flex');
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

window.salirDePOS = function() {
    // Restaurar layout ERP
    document.getElementById('pos-wrapper').classList.add('hidden');
    document.getElementById('pos-wrapper').classList.remove('flex');
    
    document.getElementById('sidebar-menu').classList.remove('hidden');
    document.querySelector('header').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('p-0', 'md:p-0');

    // Volver a la vista Home del ERP
    window.cambiarVista('home');
}

// === MENÚ DE 3 PUNTITOS ===
window.togglePosMenu = function() {
    document.getElementById('pos-dropdown-menu').classList.toggle('hidden');
}

// Entrar a la caja registradora
window.iniciarNuevaVenta = function() {
    // Ocultar el dashboard del POS
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    // Mostrar la pantalla de Nueva Venta (Caja)
    document.getElementById('pos-nueva-venta-screen').classList.remove('hidden');
    document.getElementById('pos-nueva-venta-screen').classList.add('flex');
}

// Volver al dashboard del POS
window.volverAlPosDashboard = function() {
    // Ocultar la Caja
    document.getElementById('pos-nueva-venta-screen').classList.add('hidden');
    document.getElementById('pos-nueva-venta-screen').classList.remove('flex');
    
    // Mostrar el dashboard
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

window.cerrarTurno = function() {
    if(confirm("¿Seguro que deseas iniciar el cierre de caja?")) {
        alert("Iniciando arqueo de caja...");
        // Esto lo programaremos luego
    }
}
