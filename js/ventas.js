let pinActual = "";
const PIN_CORRECTO = "1234"; // En el futuro lo leeremos de Supabase

// === CONTROL DE TURNOS ===
window.turnoActual = null;
window.cajeroActivo = null; // Para saber quién está operando la caja ahora mismo
window.metodosPagoMemoria = []; // Guardará las formas de pago de la empresa
window.estadoCierreActual = []; // Memoria de la calculadora

window.cargarVentas = function() {
    console.log("💰 Cargando Módulo POS...");
    
    // Ocultar el layout principal del ERP (Sidebar y Main content)
    document.getElementById('sidebar-menu').classList.add('hidden');
    document.querySelector('header').classList.add('hidden');
    document.getElementById('main-content').classList.add('p-0', 'md:p-0'); 
    
    // Mostrar el contenedor POS
    document.getElementById('pos-wrapper').classList.remove('hidden');
    document.getElementById('pos-wrapper').classList.add('flex');

    // Resetear PIN
    window.borrarTodoElPin();
}

// === NAVEGACIÓN DENTRO DEL POS Y CONTROL DE TURNOS ===
window.entrarAlPos = async function() {
    // 1. Ocultar teclado PIN
    document.getElementById('pos-pin-screen').classList.add('hidden');
    document.getElementById('pos-pin-screen').classList.remove('flex');

    // 2. Verificar estado del turno en Supabase
    try {
        const { data: turnoAbierto, error } = await clienteSupabase
            .from('pos_turnos')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .eq('estado', 'ABIERTO')
            .maybeSingle();

        if (error) throw error;

        if (turnoAbierto) {
            // Ya hay un turno abierto
            window.turnoActual = turnoAbierto;
            window.mostrarDashboardPos();
        } else {
            // No hay turno, preguntar monto inicial
            window.abrirTurnoNuevo();
        }
    } catch (error) {
        console.error("Error verificando turnos:", error);
        alert("Hubo un error al verificar el turno. Revisa la consola.");
    }
}

// Función auxiliar para mostrar el dashboard una vez validado el turno
window.mostrarDashboardPos = function() {
    // Esconder PIN si estuviera visible
    document.getElementById('pos-pin-screen').classList.add('hidden');
    document.getElementById('pos-pin-screen').classList.remove('flex');

    // Imprimir la fecha actual arriba
    const opcionesFecha = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('pos-fecha-actual').innerText = new Date().toLocaleDateString('es-ES', opcionesFecha).toUpperCase();
    
    // Mostrar Dashboard
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

// Flujo para crear un nuevo turno
window.abrirTurnoNuevo = async function() {
    const montoInicial = prompt(`💵 Apertura de Caja (${window.cajeroActivo.nombre})\n\nIngresa el monto de efectivo inicial (Sencillo/Fondo de caja). Deja en 0 si la caja está vacía:`, "0");
    
    if (montoInicial === null) {
        // Canceló, volver a pedir PIN
        document.getElementById('pos-pin-screen').classList.remove('hidden');
        document.getElementById('pos-pin-screen').classList.add('flex');
        window.borrarTodoElPin();
        return;
    }

    const fondoCaja = parseFloat(montoInicial) || 0;

    try {
        const payloadTurno = {
            id_empresa: window.miEmpresaId,
            abierto_por: window.cajeroActivo.id, 
            monto_inicial_efectivo: fondoCaja,
            estado: 'ABIERTO'
        };

        const { data: nuevoTurno, error } = await clienteSupabase
            .from('pos_turnos')
            .insert([payloadTurno])
            .select()
            .single();

        if (error) throw error;

        window.turnoActual = nuevoTurno;
        alert(`✅ Turno abierto por ${window.cajeroActivo.nombre} con fondo de: $${fondoCaja.toLocaleString('es-CL')}`);
        
        window.mostrarDashboardPos();

    } catch (error) {
        console.error("Error abriendo turno:", error);
        alert("Error al intentar abrir la caja. Revisa la consola.");
    }
}

// ==========================================
// 1. LÓGICA DEL PIN Y ADUANA DE SEGURIDAD
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

// ⚡ PREPARAR LA ADUANA (Cuando hacen clic en el menú)
window.solicitarAccesoERP = function(destino) {
    window.motivoPinPOS = destino; 
    document.getElementById('pos-dropdown-menu').classList.add('hidden'); 
    
    document.getElementById('pos-dashboard-screen').classList.add('hidden'); 
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    window.borrarTodoElPin();
    
    document.getElementById('pos-pin-screen').classList.remove('hidden');
    document.getElementById('pos-pin-screen').classList.add('flex');
}

// ⚡ EL CEREBRO: VALIDA EN TU BD REAL Y REDIRIGE
window.validarPin = async function() {
    try {
        const { data: perfil, error: errPerfil } = await clienteSupabase
            .from('perfiles')
            .select('id_usuario, nombre') 
            .eq('pin_seguridad', window.pinActual)
            .maybeSingle();

        if (errPerfil || !perfil) return window.errorPinAnimation();

        const { data: acceso, error: errAcceso } = await clienteSupabase
            .from('usuarios_empresas')
            .select('rol')
            .eq('id_empresa', window.miEmpresaId)
            .eq('id_usuario', perfil.id_usuario)
            .maybeSingle();

        if (errAcceso || !acceso) {
            alert("❌ El usuario no tiene acceso a esta empresa.");
            return window.errorPinAnimation();
        }

        const nombreRol = (acceso.rol || '').toLowerCase();
        const esAdminODueno = nombreRol.includes('admin') || nombreRol.includes('dueño') || nombreRol.includes('dueno');

        // ESCENARIO 1: Solo quería Iniciar su Turno de Caja
        if (window.motivoPinPOS === 'login') {
            window.cajeroActivo = {
                id: perfil.id_usuario,
                nombre: perfil.nombre, 
                rol: acceso.rol
            };
            document.getElementById('pos-nombre-cajero').innerText = perfil.nombre;
            
            if (typeof cargarMetodosPagoPOS === "function") cargarMetodosPagoPOS();
            
            window.entrarAlPos(); 
            return;
        }

        // ESCENARIO 2: Funciones Administrativas (Requiere Rol Admin/Dueño)
        if (!esAdminODueno) {
            alert("🔒 Acceso Denegado: Necesitas permisos de Administrador para salir de la caja o modificar configuración.");
            window.motivoPinPOS = 'login';
            window.mostrarDashboardPos(); // Lo devuelve al dashboard de la caja
            return;
        }

        // ESCENARIO 3: Es Admin y pasó la aduana. ¿A dónde iba?
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

// Botón "CERRAR" en la pantalla del PIN (Cierra el POS y vuelve al ERP)
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

// === MENÚ DE 3 PUNTITOS (RESTAURADO) ===
window.togglePosMenu = function() {
    document.getElementById('pos-dropdown-menu').classList.toggle('hidden');
}

// ==========================================
// 2. NAVEGACIÓN DE CAJA Y CATÁLOGO
// ==========================================

window.iniciarNuevaVenta = function() {
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    document.getElementById('pos-nueva-venta-screen').classList.remove('hidden');
    document.getElementById('pos-nueva-venta-screen').classList.add('flex');

    window.cargarCatalogoPOS();
}

window.volverAlPosDashboard = function() {
    document.getElementById('pos-nueva-venta-screen').classList.add('hidden');
    document.getElementById('pos-nueva-venta-screen').classList.remove('flex');
    
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

window.productosPosMemoria = [];
window.carritoPos = [];

window.cargarCatalogoPOS = async function() {
    document.getElementById('pos-productos-grid').innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold mt-10 animate-pulse">Cargando catálogo...</p>';

    const { data: prods, error } = await clienteSupabase
        .from('productos')
        .select('*, categorias(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .eq('vender_en_pos', true)
        .order('nombre');

    if (error) {
        console.error("Error cargando catálogo POS:", error);
        return;
    }

    window.productosPosMemoria = prods || [];
    window.renderizarCategoriasPOS();
    window.renderizarProductosPOS('TODOS');
}

window.renderizarCategoriasPOS = function() {
    const catMap = new Map();
    window.productosPosMemoria.forEach(p => {
        if (p.id_categoria && p.categorias) {
            catMap.set(p.id_categoria, p.categorias.nombre);
        }
    });

    const contenedor = document.getElementById('pos-categorias-container');
    if(!contenedor) return;

    let html = `<button onclick="renderizarProductosPOS('TODOS')" class="px-5 py-2 bg-emerald-100 text-emerald-800 font-black rounded-xl whitespace-nowrap border-2 border-emerald-200">Todas</button>`;
    
    catMap.forEach((nombre, id) => {
        html += `<button onclick="renderizarProductosPOS('${id}')" class="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl whitespace-nowrap transition-colors border-2 border-transparent">${nombre}</button>`;
    });

    contenedor.innerHTML = html;
}

window.renderizarProductosPOS = function(idCategoria) {
    let filtrados = window.productosPosMemoria;
    if (idCategoria !== 'TODOS') {
        filtrados = filtrados.filter(p => p.id_categoria === idCategoria);
    }

    const grid = document.getElementById('pos-productos-grid');
    if (filtrados.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold py-10">No hay productos disponibles.</p>';
        return;
    }

    grid.innerHTML = filtrados.map(p => `
        <div onclick="agregarAlCarrito('${p.id}')" class="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-400 border-2 border-transparent cursor-pointer transition-all flex flex-col h-36 relative group select-none overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 z-0"></div>
            <h3 class="font-bold text-slate-800 leading-tight relative z-10 line-clamp-2">${p.nombre}</h3>
            <div class="mt-auto flex justify-between items-end relative z-10">
                <span class="font-black text-emerald-600 text-lg">$${p.precio_venta_iva || 0}</span>
                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-black group-hover:bg-emerald-500 group-hover:text-white transition-colors text-xl">+</div>
            </div>
        </div>
    `).join('');
}

window.agregarAlCarrito = function(idProducto) {
    const prod = window.productosPosMemoria.find(p => p.id === idProducto);
    if(!prod) return;
    
    const itemExistente = window.carritoPos.find(item => item.id === idProducto);
    if(itemExistente) {
        itemExistente.cantidad++;
    } else {
        window.carritoPos.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: prod.precio_venta_iva || 0,
            cantidad: 1
        });
    }
    window.renderizarCarrito();
}

window.renderizarCarrito = function() {
    const list = document.getElementById('pos-cart-list');
    if (window.carritoPos.length === 0) {
        list.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-300 space-y-2">
                <span class="text-6xl mb-2">🛒</span>
                <p class="font-bold text-slate-400">Carrito vacío</p>
                <p class="text-xs text-slate-400">Escanea o selecciona productos</p>
            </div>`;
        document.getElementById('pos-total-pagar').innerText = "$0";
        return;
    }

    let total = 0;
    list.innerHTML = window.carritoPos.map(item => {
        const subtotalItem = item.precio * item.cantidad;
        total += subtotalItem;
        return `
        <div class="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-2 flex justify-between items-center">
            <div class="flex-1">
                <p class="font-bold text-slate-800 text-sm leading-tight">${item.nombre}</p>
                <p class="text-emerald-600 font-black text-xs">$${item.precio}</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center bg-slate-100 rounded-lg">
                    <button onclick="modificarCantCarrito('${item.id}', -1)" class="w-8 h-8 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-200 rounded-l-lg">-</button>
                    <span class="w-8 text-center font-bold text-sm">${item.cantidad}</span>
                    <button onclick="modificarCantCarrito('${item.id}', 1)" class="w-8 h-8 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-200 rounded-r-lg">+</button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('pos-total-pagar').innerText = "$" + total.toLocaleString('es-CL');

    const cantTotalItems = window.carritoPos.reduce((acc, item) => acc + item.cantidad, 0);
    const countMobile = document.getElementById('cart-count-mobile');
    const totalMobile = document.getElementById('cart-total-mobile');
    if(countMobile) countMobile.innerText = cantTotalItems;
    if(totalMobile) totalMobile.innerText = "$" + total.toLocaleString('es-CL');
}

window.modificarCantCarrito = function(idProducto, delta) {
    const index = window.carritoPos.findIndex(item => item.id === idProducto);
    if(index > -1) {
        window.carritoPos[index].cantidad += delta;
        if(window.carritoPos[index].cantidad <= 0) {
            window.carritoPos.splice(index, 1);
        }
        window.renderizarCarrito();
    }
}

// ==========================================
// BUSCADOR Y ESCÁNER DE CÓDIGO DE BARRAS
// ==========================================

window.buscarProductoPOS = function(texto) {
    const term = texto.toLowerCase().trim();
    const grid = document.getElementById('pos-productos-grid');
    
    if (term === '') {
        window.renderizarProductosPOS('TODOS');
        return;
    }

    const filtrados = window.productosPosMemoria.filter(p => {
        const matchNombre = p.nombre.toLowerCase().includes(term);
        const matchCodigo = p.codigo_barras && p.codigo_barras.toLowerCase() === term;
        return matchNombre || matchCodigo;
    });

    if (filtrados.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold py-10">No hay coincidencias.</p>';
        return;
    }

    const posibleEscaneo = window.productosPosMemoria.find(p => p.codigo_barras && p.codigo_barras.toLowerCase() === term);
    
    if (posibleEscaneo && filtrados.length === 1) {
        window.agregarAlCarrito(posibleEscaneo.id);
        
        const inputBuscador = document.querySelector('input[placeholder="Buscar o escanear código de barras..."]');
        if(inputBuscador) {
            inputBuscador.value = '';
            setTimeout(() => inputBuscador.focus(), 10); 
        }
        window.renderizarProductosPOS('TODOS'); 
        return; 
    }

    grid.innerHTML = filtrados.map(p => `
        <div onclick="agregarAlCarrito('${p.id}')" class="bg-white p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-400 border-2 border-transparent cursor-pointer transition-all flex flex-col h-36 relative group select-none overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 z-0"></div>
            <h3 class="font-bold text-slate-800 leading-tight relative z-10 line-clamp-2">${p.nombre}</h3>
            <div class="mt-auto flex justify-between items-end relative z-10">
                <span class="font-black text-emerald-600 text-lg">$${p.ultimo_costo_uc || 0}</span>
                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-black group-hover:bg-emerald-500 group-hover:text-white transition-colors text-xl">+</div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// LÓGICA DE CHECKOUT Y PAGOS
// ==========================================
let checkoutMetodoPago = '';
let checkoutTotalVenta = 0;

window.abrirCheckout = function() {
    if(window.carritoPos.length === 0) {
        alert("⚠️ El carrito está vacío. Agrega productos primero.");
        return;
    }

    checkoutTotalVenta = window.carritoPos.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    document.getElementById('checkout-total').innerText = "$" + checkoutTotalVenta.toLocaleString('es-CL');
    
    checkoutMetodoPago = '';
    document.getElementById('checkout-recibido').value = '';
    document.getElementById('checkout-vuelto').innerText = '$0';
    document.getElementById('checkout-seccion-efectivo').classList.add('hidden');
    document.getElementById('btn-confirmar-venta').disabled = true;

    const botones = document.querySelectorAll('.metodo-pago-btn');
    botones.forEach(btn => {
        btn.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50');
    });

    document.getElementById('pos-checkout-modal').classList.remove('hidden');
}

window.cerrarCheckout = function() {
    document.getElementById('pos-checkout-modal').classList.add('hidden');
}

window.seleccionarMetodoPago = function(idMetodo) {
    const metodoElegido = window.metodosPagoMemoria.find(m => m.id === idMetodo);
    if(!metodoElegido) return;

    if (metodoElegido.tipo === 'CREDITO' && (!window.clienteSeleccionadoPOS || window.clienteSeleccionadoPOS.id === 'anonimo')) {
        alert("⚠️ No puedes vender al Crédito/Fiado a un cliente Anónimo.\n\nPor favor, asigna o crea un cliente en el carrito primero.");
        return;
    }

    checkoutMetodoPago = metodoElegido; 
    document.getElementById('btn-confirmar-venta').disabled = false;

    const botones = document.querySelectorAll('.metodo-pago-btn');
    botones.forEach(btn => btn.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50', 'ring-blue-400', 'bg-blue-50', 'ring-purple-400', 'bg-purple-50'));
    
    const btnActivo = document.getElementById(`btn-pago-${idMetodo}`);
    if(btnActivo) {
        if(metodoElegido.tipo === 'EFECTIVO') btnActivo.classList.add('ring-4', 'ring-emerald-400', 'bg-emerald-50');
        else if(metodoElegido.tipo === 'TARJETA') btnActivo.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');
        else btnActivo.classList.add('ring-4', 'ring-purple-400', 'bg-purple-50');
    }

    const seccionEfectivo = document.getElementById('checkout-seccion-efectivo');
    if(metodoElegido.tipo === 'EFECTIVO') {
        seccionEfectivo.classList.remove('hidden');
        setTimeout(() => document.getElementById('checkout-recibido').focus(), 100); 
    } else {
        seccionEfectivo.classList.add('hidden');
    }
}

window.calcularVuelto = function() {
    const recibido = parseFloat(document.getElementById('checkout-recibido').value) || 0;
    let vuelto = recibido - checkoutTotalVenta;
    if(vuelto < 0) vuelto = 0; 
    document.getElementById('checkout-vuelto').innerText = "$" + vuelto.toLocaleString('es-CL');
}

window.confirmarVentaPOS = async function() {
    if(!checkoutMetodoPago) return alert("Selecciona un método de pago.");
    if(window.carritoPos.length === 0) return alert("El carrito está vacío.");
    
    const btn = document.getElementById('btn-confirmar-venta');
    const textoOriginal = btn.innerText; 
    btn.innerText = "⏳ Procesando...";
    btn.disabled = true;

    try {
        const estadoVenta = checkoutMetodoPago.tipo === 'CREDITO' ? 'POR_COBRAR' : 'COMPLETADA';

        const payloadVenta = {
            id_empresa: window.miEmpresaId,
            id_sucursal: null, 
            total: checkoutTotalVenta,
            metodo_pago: checkoutMetodoPago.nombre,
            estado: estadoVenta,
            cajero: window.cajeroActivo.id,
            origen: 'POS',
            id_cliente: window.clienteSeleccionadoPOS ? window.clienteSeleccionadoPOS.id : null
        };

        const { data: ventaGuardada, error: errorVenta } = await clienteSupabase
            .from('ventas')
            .insert([payloadVenta])
            .select()
            .single();

        if (errorVenta) throw errorVenta;

        if (checkoutMetodoPago.tipo === 'CREDITO') {
            const fechaVence = new Date();
            fechaVence.setDate(fechaVence.getDate() + 30);

            const payloadCuentasPorCobrar = {
                id_empresa: window.miEmpresaId,
                id_venta: ventaGuardada.id,
                id_cliente: window.clienteSeleccionadoPOS.id,
                monto_deuda: checkoutTotalVenta,
                monto_pagado: 0,
                estado: 'Pendiente',
                fecha_vencimiento: fechaVence.toISOString().split('T')[0] 
            };

            const { error: errorCxC } = await clienteSupabase
                .from('cuentas_por_cobrar')
                .insert([payloadCuentasPorCobrar]);

            if (errorCxC) {
                console.error("Error al registrar en cuentas por cobrar:", errorCxC);
                alert("⚠️ La venta se guardó, pero hubo un error al registrar la deuda en cuentas por cobrar.");
            }
        }

        window.carritoPos = [];
        window.removerClientePOS();
        window.cerrarCheckout();
        window.renderizarCarrito();
        
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        if (estadoVenta === 'POR_COBRAR') {
            alert("📓 Venta anotada en la cuenta (Crédito).");
        } else {
            alert("✅ ¡Venta registrada y pagada con éxito!");
        }

    } catch (error) {
        console.error("Error procesando la venta:", error);
        alert("❌ Error: " + (error.message || "No se pudo procesar la venta."));
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// LÓGICA DE CUENTAS GUARDADAS / MESAS
// ==========================================
window.cuentasAbiertasMemoria = []; 

window.abrirModalGuardarCuenta = function() {
    if(window.carritoPos.length === 0) {
        return alert("⚠️ El carrito está vacío. Agrega productos para guardar la cuenta.");
    }
    document.getElementById('input-nombre-cuenta').value = '';
    document.getElementById('modal-guardar-cuenta').classList.remove('hidden');
    setTimeout(() => document.getElementById('input-nombre-cuenta').focus(), 100);
}

window.confirmarGuardarCuenta = async function() {
    const nombre = document.getElementById('input-nombre-cuenta').value.trim() || 'Cuenta sin nombre';
    const totalCarrito = window.carritoPos.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    
    const btn = document.querySelector('#modal-guardar-cuenta button.bg-blue-600');
    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        const payloadCuenta = {
            id_empresa: window.miEmpresaId,
            nombre: nombre,
            carrito: window.carritoPos, 
            total: totalCarrito,
            creado_por: window.cajeroActivo.id,
            cajero_nombre: window.cajeroActivo.nombre 
        };

        const { error } = await clienteSupabase
            .from('pos_cuentas_abiertas')
            .insert([payloadCuenta]);

        if (error) throw error;
        
        document.getElementById('modal-guardar-cuenta').classList.add('hidden');
        window.carritoPos = [];
        window.renderizarCarrito();
        
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        alert(`☁️ Cuenta "${nombre}" guardada en la nube.`);

    } catch (error) {
        console.error("Error guardando cuenta:", error);
        alert("❌ Ocurrió un error guardando la cuenta.");
    } finally {
        btn.innerText = "Guardar";
        btn.disabled = false;
    }
}

window.mostrarPantallaCuentas = function() {
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    document.getElementById('pos-cuentas-screen').classList.remove('hidden');
    window.renderizarCuentasGuardadas();
}

window.renderizarCuentasGuardadas = async function() {
    const grid = document.getElementById('grid-cuentas-guardadas');
    grid.innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold py-10 animate-pulse">Cargando cuentas desde la nube...</p>';
    
    try {
        const { data, error } = await clienteSupabase
            .from('pos_cuentas_abiertas')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        window.cuentasAbiertasMemoria = data || [];

        if(window.cuentasAbiertasMemoria.length === 0) {
            grid.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center text-slate-400 mt-20"><span class="text-6xl mb-4">🍃</span><p class="font-bold text-xl">No hay cuentas en espera</p></div>';
            return;
        }
        
        grid.innerHTML = window.cuentasAbiertasMemoria.map(cta => {
            const horaStr = new Date(cta.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
            return `
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3 relative hover:shadow-md transition-shadow">
                <button onclick="eliminarCuentaGuardada('${cta.id}')" class="absolute top-3 right-3 text-slate-300 hover:text-red-500 font-bold transition-colors text-lg" title="Eliminar/Cancelar Cuenta">✕</button>
                <div class="flex items-center gap-2 text-blue-600 mb-1 pr-6">
                    <span class="text-xl">📝</span>
                    <h3 class="font-black text-lg text-slate-800 uppercase truncate">${cta.nombre}</h3>
                </div>
                <div class="flex justify-between items-center text-xs font-bold text-slate-400">
                    <p>🕒 Hora: ${horaStr}</p>
                    <p class="bg-slate-100 px-2 py-1 rounded-md text-slate-500">👤 ${cta.cajero_nombre || 'Sin registrar'}</p>
                </div>
                <p class="text-sm font-bold text-slate-600">${cta.carrito.length} tipo(s) de productos</p>
                
                <div class="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span class="font-black text-xl text-emerald-600">$${Number(cta.total).toLocaleString('es-CL')}</span>
                    <button onclick="cargarCuentaEnPOS('${cta.id}')" class="px-4 py-2 bg-blue-100 text-blue-700 font-black rounded-xl hover:bg-blue-600 hover:text-white transition-colors">
                        Cobrar →
                    </button>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error listando cuentas:", error);
        grid.innerHTML = '<p class="col-span-full text-center text-red-400 font-bold py-10">❌ Error cargando las cuentas de la nube.</p>';
    }
}

window.cargarCuentaEnPOS = async function(idCuenta) {
    const cuenta = window.cuentasAbiertasMemoria.find(c => c.id === idCuenta);
    if(!cuenta) return;
    
    try {
        window.carritoPos = cuenta.carrito;
        await clienteSupabase.from('pos_cuentas_abiertas').delete().eq('id', idCuenta);
        
        document.getElementById('pos-cuentas-screen').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.add('hidden'); 
        document.getElementById('pos-nueva-venta-screen').classList.remove('hidden');
        document.getElementById('pos-nueva-venta-screen').classList.add('flex');
        
        window.cargarCatalogoPOS();
        window.renderizarCarrito();

    } catch (error) {
        console.error("Error al cargar la cuenta:", error);
        alert("Error de conexión al intentar abrir la cuenta.");
    }
}

window.eliminarCuentaGuardada = async function(idCuenta) {
    if(confirm('🗑️ ¿Estás seguro que quieres ELIMINAR esta cuenta? Los productos no se cobrarán.')) {
        try {
            await clienteSupabase.from('pos_cuentas_abiertas').delete().eq('id', idCuenta);
            window.renderizarCuentasGuardadas(); 
        } catch (error) {
            console.error("Error eliminando cuenta:", error);
            alert("No se pudo eliminar la cuenta de la nube.");
        }
    }
}

window.volverDashboardPOS = function() {
    document.getElementById('pos-cuentas-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

window.toggleCarritoMobile = function() {
    const sidebar = document.getElementById('pos-carrito-sidebar');
    if(sidebar.classList.contains('translate-y-full')) {
        sidebar.classList.remove('translate-y-full'); 
    } else {
        sidebar.classList.add('translate-y-full'); 
    }
}

// ==========================================
// ESCÁNER DE CÓDIGO DE BARRAS POR CÁMARA
// ==========================================
let escanerCamara = null;
let modoEscanerActual = 'POS'; 

window.abrirEscanerCamara = function(modo = 'POS') {
    modoEscanerActual = modo;
    document.getElementById('modal-escaner-camara').classList.remove('hidden');
    
    if (escanerCamara) { escanerCamara.clear(); }
    
    escanerCamara = new Html5Qrcode("lector-camara-pos");
    const config = { 
        fps: 15, 
        qrbox: { width: 300, height: 120 },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE
        ]
    };
    
    escanerCamara.start({ facingMode: "environment" }, config, 
        (textoDecodificado) => {
            window.cerrarEscanerCamara();
            
            if (modoEscanerActual === 'PRODUCTO') {
                document.getElementById('prod-codigo-barras').value = textoDecodificado;
                if (navigator.vibrate) navigator.vibrate(100);
                const input = document.getElementById('prod-codigo-barras');
                input.classList.add('bg-emerald-100', 'ring-2', 'ring-emerald-500');
                setTimeout(() => input.classList.remove('bg-emerald-100', 'ring-2', 'ring-emerald-500'), 1000);
            } else {
                procesarEscaneoFisico(textoDecodificado);
            }
        },
        (mensajeError) => {
        }
    ).catch(err => {
        console.error("Error iniciando cámara:", err);
        alert("❌ No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
        window.cerrarEscanerCamara();
    });
}

window.cerrarEscanerCamara = function() {
    document.getElementById('modal-escaner-camara').classList.add('hidden');
    if (escanerCamara) {
        escanerCamara.stop().then(() => {
            escanerCamara.clear();
            escanerCamara = null;
        }).catch(err => console.error("Error al detener cámara:", err));
    }
}

// ==========================================
// SALIDA Y CIERRE DE CAJA
// ==========================================
window.abrirModalSalidaPOS = function() {
    document.getElementById('pos-dropdown-menu').classList.add('hidden');
    document.getElementById('modal-salida-pos').classList.remove('hidden');
}

window.pausarTurno = function() {
    document.getElementById('modal-salida-pos').classList.add('hidden');
    alert("☕ Pausa registrada en RRHH. La caja se bloqueará.");
    
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    document.getElementById('pos-pin-screen').classList.remove('hidden');
    document.getElementById('pos-pin-screen').classList.add('flex');
    window.borrarTodoElPin();
}

let esperadoEfectivo = 0;
let esperadoTarjetas = 0;
let esperadoTransf = 0; 

window.iniciarCierreDeCaja = async function() {
    if (!window.turnoActual) return alert("❌ No hay un turno activo para cerrar.");

    document.getElementById('modal-salida-pos').classList.add('hidden');

    try {
        const { count, error: errCuentas } = await clienteSupabase
            .from('pos_cuentas_abiertas')
            .select('*', { count: 'exact', head: true })
            .eq('id_empresa', window.miEmpresaId);

        if (errCuentas) throw errCuentas;

        if (count > 0) {
            const confirmar = confirm(`⚠️ ALERTA DE SEGURIDAD\n\nTienes ${count} cuenta(s) en espera (Mesas/Comandas sin cobrar).\n¿Estás absolutamente seguro de que deseas cerrar tu caja y dejarle esta deuda/responsabilidad al siguiente turno?`);
            if (!confirmar) {
                document.getElementById('modal-salida-pos').classList.remove('hidden');
                return; 
            }
        }
    } catch (error) {
        console.error("Error validando cuentas en espera:", error);
    }

    document.getElementById('cierre-cajero-nombre').innerText = window.cajeroActivo ? window.cajeroActivo.nombre : 'Cajero';

    try {
        const { data: ventasTurno, error } = await clienteSupabase
            .from('ventas')
            .select('total, metodo_pago')
            .eq('id_empresa', window.miEmpresaId)
            .gte('created_at', window.turnoActual.fecha_apertura)
            .in('estado', ['COMPLETADA']);

        if (error) throw error;

        window.estadoCierreActual = window.metodosPagoMemoria.map(mp => {
            const totalEsperado = (ventasTurno || [])
                .filter(v => v.metodo_pago === mp.nombre)
                .reduce((sum, v) => sum + Number(v.total), 0);

            let fondoCaja = 0;
            if (mp.tipo === 'EFECTIVO') {
                fondoCaja = Number(window.turnoActual.monto_inicial_efectivo) || 0;
            }

            return {
                id: mp.id,
                nombre: mp.nombre,
                tipo: mp.tipo,
                esperado: totalEsperado + fondoCaja,
                real: 0,
                diferencia: 0
            };
        });

        window.renderizarCalculadoraCierre();
        document.getElementById('modal-cierre-caja').classList.remove('hidden');

    } catch (error) {
        console.error("Error calculando el cierre:", error);
        alert("Hubo un error al calcular los totales de caja.");
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
                <label class="block text-xs font-bold text-slate-500 mb-1 uppercase">Suma real contada:</label>
                <div class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-lg">$</span>
                    <input type="number" id="cierre-real-${item.id}" oninput="calcularDiferenciaCaja()" placeholder="0" class="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-2xl font-black text-slate-800 focus:ring-2 focus:ring-${color}-500 outline-none transition-all">
                </div>
            </div>
        </div>
        `;
    }).join('');

    window.calcularDiferenciaCaja(); 
}

window.calcularDiferenciaCaja = function() {
    let totalDiferencia = 0;

    window.estadoCierreActual.forEach(item => {
        const inputReal = document.getElementById(`cierre-real-${item.id}`);
        const valorReal = inputReal ? Number(inputReal.value) || 0 : 0;
        item.real = valorReal;
        item.diferencia = valorReal - item.esperado;
        totalDiferencia += item.diferencia;
    });

    const panel = document.getElementById('cierre-resultado-panel');
    const montoTexto = document.getElementById('cierre-diferencia-monto');
    const descTexto = document.getElementById('cierre-diferencia-texto');

    montoTexto.innerText = `$${Math.abs(totalDiferencia).toLocaleString('es-CL')}`;
    panel.classList.remove('border-emerald-400', 'bg-emerald-50', 'border-red-400', 'bg-red-50', 'border-slate-200', 'bg-slate-50');
    montoTexto.classList.remove('text-emerald-700', 'text-red-700', 'text-slate-800');

    if (totalDiferencia === 0) {
        panel.classList.add('border-emerald-400', 'bg-emerald-50');
        montoTexto.classList.add('text-emerald-700');
        descTexto.innerText = "✅ Caja Cuadrada Perfectamente";
    } else if (totalDiferencia > 0) {
        panel.classList.add('border-slate-200', 'bg-slate-50');
        montoTexto.classList.add('text-slate-800');
        descTexto.innerText = "⚠️ Sobra dinero en caja";
    } else if (totalDiferencia < 0) {
        panel.classList.add('border-red-400', 'bg-red-50');
        montoTexto.classList.add('text-red-700');
        descTexto.innerText = "❌ Falta dinero (Descuadre)";
    }
}

window.confirmarCierreCaja = async function() {
    if (!window.turnoActual) return alert("❌ No hay un turno activo para cerrar.");

    const btn = Array.from(document.querySelectorAll('#modal-cierre-caja button')).find(b => b.textContent.includes('Cerrar'));
    const textoOriginal = btn ? btn.innerText : "Cerrar Turno";
    if (btn) { btn.innerText = "⏳ Cerrando..."; btn.disabled = true; }

    try {
        const payloadCierre = {
            fecha_cierre: new Date().toISOString(),
            cerrado_por: window.cajeroActivo.id,
            desglose_cierre: window.estadoCierreActual, 
            estado: 'CERRADO'
        };

        const { error } = await clienteSupabase
            .from('pos_turnos')
            .update(payloadCierre)
            .eq('id', window.turnoActual.id);

        if (error) throw error;

        window.turnoActual = null;
        window.cajeroActivo = null;

        alert("🔒 ¡Cierre de caja registrado exitosamente!");

        document.getElementById('modal-cierre-caja').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.remove('flex');
        document.getElementById('pos-pin-screen').classList.remove('hidden');
        document.getElementById('pos-pin-screen').classList.add('flex');
        window.borrarTodoElPin();

    } catch (error) {
        console.error("Error guardando cierre:", error);
        alert("❌ Ocurrió un error al intentar cerrar la caja.");
    } finally {
        if (btn) { btn.innerText = textoOriginal; btn.disabled = false; }
    }
}

window.cargarMetodosPagoPOS = async function() {
    try {
        const { data, error } = await clienteSupabase
            .from('metodos_pago')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .eq('activo', true)
            .order('nombre');

        if (error) throw error;
        
        window.metodosPagoMemoria = data || [];
        window.renderizarMetodosPagoPOS();
    } catch (error) {
        console.error("Error cargando métodos de pago:", error);
    }
}

window.renderizarMetodosPagoPOS = function() {
    const contenedor = document.getElementById('contenedor-metodos-pago');
    if (!contenedor) return;

    if (window.metodosPagoMemoria.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-red-500 col-span-full font-bold text-center">⚠️ No hay métodos de pago configurados.</p>';
        return;
    }

    contenedor.innerHTML = window.metodosPagoMemoria.map(mp => {
        let colorClass = 'border-slate-200 text-slate-600 hover:border-slate-500 hover:bg-slate-50';
        let icono = '🪙';
        
        if (mp.tipo === 'EFECTIVO') { colorClass = 'border-slate-200 text-slate-600 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'; icono = '💵'; }
        if (mp.tipo === 'TARJETA') { colorClass = 'border-slate-200 text-slate-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700'; icono = '💳'; }
        if (mp.tipo === 'TRANSFERENCIA') { colorClass = 'border-slate-200 text-slate-600 hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700'; icono = '📱'; }

        return `
            <button onclick="seleccionarMetodoPago('${mp.id}')" id="btn-pago-${mp.id}" class="metodo-pago-btn py-3 px-2 rounded-xl border-2 font-bold transition-all flex flex-col items-center gap-1 ${colorClass}">
                <span class="text-2xl">${icono}</span> 
                <span class="text-xs text-center leading-tight truncate w-full">${mp.nombre}</span>
                <span class="text-[9px] bg-slate-100 text-slate-400 px-2 rounded-full">${mp.moneda}</span>
            </button>
        `;
    }).join('');
}

// ==========================================
// LÓGICA DE CLIENTES EN EL POS
// ==========================================
window.clienteSeleccionadoPOS = null; 

window.abrirModalClientesPOS = function() {
    document.getElementById('modal-clientes-pos').classList.remove('hidden');
    document.getElementById('input-buscar-cliente-pos').value = '';
    setTimeout(() => document.getElementById('input-buscar-cliente-pos').focus(), 100);
    window.buscarClientePOS(''); 
}

window.cerrarModalClientesPOS = function() {
    document.getElementById('modal-clientes-pos').classList.add('hidden');
}

window.buscarClientePOS = async function(termino) {
    const lista = document.getElementById('lista-clientes-pos');
    lista.innerHTML = '<p class="text-center text-slate-400 font-bold text-sm py-8 animate-pulse">Buscando...</p>';

    try {
        let query = clienteSupabase
            .from('clientes')
            .select('id, nombre, documento')
            .eq('id_empresa', window.miEmpresaId)
            .order('nombre')
            .limit(20);
        
        if (termino.trim() !== '') {
            query = query.ilike('nombre', `%${termino}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            lista.innerHTML = '<div class="text-center py-8"><span class="text-4xl">🤷‍♂️</span><p class="text-slate-400 font-bold text-sm mt-2">No encontramos clientes con ese nombre.</p></div>';
            return;
        }

        lista.innerHTML = data.map(c => `
            <button onclick="seleccionarClientePOS('${c.id}', '${c.nombre}')" class="w-full text-left p-4 hover:bg-white border-b border-slate-200/60 flex flex-col transition-colors rounded-lg mb-1 group">
                <span class="font-black text-slate-700 text-sm group-hover:text-blue-600 transition-colors">${c.nombre}</span>
                <span class="text-xs font-bold text-slate-400 mt-0.5">RUT/DNI: ${c.documento || 'No registrado'}</span>
            </button>
        `).join('');
    } catch (error) {
        console.error("Error buscando clientes:", error);
        lista.innerHTML = '<p class="text-center text-red-400 font-bold text-sm py-4">❌ Error al buscar en la base de datos.</p>';
    }
}

window.seleccionarClientePOS = function(id, nombre) {
    window.clienteSeleccionadoPOS = { id, nombre };
    window.cerrarModalClientesPOS();
    window.actualizarUIClientePOS();
}

window.removerClientePOS = function() {
    window.clienteSeleccionadoPOS = null;
    window.actualizarUIClientePOS();
}

window.actualizarUIClientePOS = function() {
    const btnCliente = document.getElementById('btn-asignar-cliente');
    if (!btnCliente) return;

    if (window.clienteSeleccionadoPOS) {
        btnCliente.innerHTML = `
            <span class="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded shadow-sm">👤 ${window.clienteSeleccionadoPOS.nombre}</span>
            <span onclick="removerClientePOS(); event.stopPropagation();" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded text-sm transition-colors" title="Quitar cliente">✖</span>
        `;
    } else {
        btnCliente.innerHTML = `👤 Asignar Cliente (Opcional)`;
    }
}

window.abrirModalNuevoClientePOS = function() {
    document.getElementById('input-nc-nombre').value = '';
    document.getElementById('input-nc-doc').value = '';
    document.getElementById('input-nc-tel').value = '';
    document.getElementById('input-nc-correo').value = '';
    document.getElementById('input-nc-dir').value = '';
    document.getElementById('modal-nuevo-cliente-pos').classList.remove('hidden');
    setTimeout(() => document.getElementById('input-nc-nombre').focus(), 100);
}

window.cerrarModalNuevoClientePOS = function() {
    document.getElementById('modal-nuevo-cliente-pos').classList.add('hidden');
}

window.guardarNuevoClientePOS = async function() {
    const nombre = document.getElementById('input-nc-nombre').value.trim();
    const doc = document.getElementById('input-nc-doc').value.trim();
    const tel = document.getElementById('input-nc-tel').value.trim();
    const correo = document.getElementById('input-nc-correo').value.trim();
    const direccion = document.getElementById('input-nc-dir').value.trim();

    if (!nombre) return alert("⚠️ El nombre del cliente es obligatorio.");

    const btn = document.getElementById('btn-guardar-cliente-pos');
    btn.innerText = "⏳ Guardando...";
    btn.disabled = true;

    try {
        const { data, error } = await clienteSupabase
            .from('clientes')
            .insert([{
                id_empresa: window.miEmpresaId,
                nombre: nombre,
                documento: doc || null,
                telefono: tel || null,
                correo: correo || null,
                direccion: direccion || null 
            }])
            .select('id, nombre')
            .single();

        if (error) throw error;

        document.getElementById('input-nc-nombre').value = '';
        document.getElementById('input-nc-doc').value = '';
        document.getElementById('input-nc-tel').value = '';
        document.getElementById('input-nc-correo').value = '';
        document.getElementById('input-nc-dir').value = '';

        window.cerrarModalNuevoClientePOS();
        window.seleccionarClientePOS(data.id, data.nombre);
        window.buscarClientePOS('');

    } catch (error) {
        console.error("Error al crear cliente:", error);
        alert("❌ Ocurrió un error al guardar el cliente.");
    } finally {
        btn.innerText = "Guardar y Seleccionar";
        btn.disabled = false;
    }
}