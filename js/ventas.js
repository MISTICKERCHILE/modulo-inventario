let pinActual = "";
const PIN_CORRECTO = "1234"; // En el futuro lo leeremos de Supabase

// === CONTROL DE TURNOS ===
window.turnoActual = null;
window.cajeroActivo = null; // Para saber quién está operando la caja ahora mismo
window.metodosPagoMemoria = []; // Guardará las formas de pago de la empresa

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

window.validarPin = async function() {
    try {
        // PASO 1: Buscar de quién es el PIN en la tabla 'perfiles'
        const { data: perfil, error: errPerfil } = await clienteSupabase
            .from('perfiles')
            .select('id_usuario, nombre') // Si tu columna se llama distinto (ej: nombre_completo), cámbialo aquí
            .eq('pin_seguridad', pinActual)
            .maybeSingle();

        if (errPerfil || !perfil) {
            alert("❌ PIN incorrecto.");
            return errorPinAnimation();
        }

        // PASO 2: Verificar si esa persona existe en 'usuarios_empresas' para ESTA empresa
        const { data: acceso, error: errAcceso } = await clienteSupabase
            .from('usuarios_empresas')
            .select('rol')
            .eq('id_empresa', window.miEmpresaId)
            .eq('id_usuario', perfil.id_usuario)
            .maybeSingle();

        if (errAcceso || !acceso) {
            alert("❌ El usuario no tiene acceso a esta empresa.");
            return errorPinAnimation();
        }

        // PASO 3: Éxito. Guardamos al cajero en memoria y entramos al POS
        window.cajeroActivo = {
            id: perfil.id_usuario,
            nombre: perfil.nombre, 
            rol: acceso.rol
        };
        
        cargarMetodosPagoPOS();

        entrarAlPos();

    } catch (error) {
        console.error("Error validando PIN:", error);
        errorPinAnimation();
    }
}

function errorPinAnimation() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(dot => dot.classList.replace('bg-emerald-400', 'bg-red-500'));
    setTimeout(borrarTodoElPin, 500);
}

// Separé la animación de error para que quede más limpio
function errorPinAnimation() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(dot => dot.classList.replace('bg-emerald-400', 'bg-red-500'));
    setTimeout(borrarTodoElPin, 500);
}

// === NAVEGACIÓN DENTRO DEL POS Y CONTROL DE TURNOS ===
async function entrarAlPos() {
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
            mostrarDashboardPos();
        } else {
            // No hay turno, preguntar monto inicial
            abrirTurnoNuevo();
        }
    } catch (error) {
        console.error("Error verificando turnos:", error);
        alert("Hubo un error al verificar el turno. Revisa la consola.");
    }
}

// Función auxiliar para mostrar el dashboard una vez validado el turno
function mostrarDashboardPos() {
    const opcionesFecha = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('pos-fecha-actual').innerText = new Date().toLocaleDateString('es-ES', opcionesFecha);
    
    document.getElementById('pos-dashboard-screen').classList.remove('hidden');
    document.getElementById('pos-dashboard-screen').classList.add('flex');
}

// Flujo para crear un nuevo turno
async function abrirTurnoNuevo() {
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
        // AHORA USAMOS EL ID DEL CAJERO (window.cajeroActivo.id) EN LUGAR DE LA SESIÓN MAESTRA
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
        
        // Llamar a la función que muestra los 3 botones gigantes
        mostrarDashboardPos();

    } catch (error) {
        console.error("Error abriendo turno:", error);
        alert("Error al intentar abrir la caja. Revisa la consola.");
    }
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

    // (Agrega esta línea al final de iniciarNuevaVenta)
    cargarCatalogoPOS();
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
    if(confirm("⚠️ ¿Estás seguro que deseas realizar el Cierre de Caja?\n\nEsto finalizará tu turno actual y cerrará tu sesión por seguridad.")) {
        // Aquí a futuro abriremos el "Modal de Arqueo de Caja" (Contar billetes).
        // Por ahora, aplicamos la regla estricta: Se cierra la sesión.
        alert("Cierre de caja registrado. Cerrando sesión...");
        window.cerrarSesion(); 
    }
}

// ==========================================
// LÓGICA DE LA CAJA REGISTRADORA (CARRITO)
// ==========================================
window.productosPosMemoria = [];
window.carritoPos = [];

// Esta función trae los productos de la BD
async function cargarCatalogoPOS() {
    document.getElementById('pos-productos-grid').innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold mt-10 animate-pulse">Cargando catálogo...</p>';

    // Solo trae los productos de esta empresa que tienen "vender_en_pos" = true
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
    renderizarCategoriasPOS();
    renderizarProductosPOS('TODOS');
}

// Dibuja los botones de arriba (Bebidas, Postres, etc.) dinámicamente
function renderizarCategoriasPOS() {
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

// Pinta los botones gigantes de los productos
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

// Agrega items a la columna derecha (El Ticket)
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
    renderizarCarrito();
}

// Actualiza el Ticket Visualmente
function renderizarCarrito() {
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

    // Novedad: Actualizar también los números del Botón Flotante Móvil
    const cantTotalItems = window.carritoPos.reduce((acc, item) => acc + item.cantidad, 0);
    const countMobile = document.getElementById('cart-count-mobile');
    const totalMobile = document.getElementById('cart-total-mobile');
    if(countMobile) countMobile.innerText = cantTotalItems;
    if(totalMobile) totalMobile.innerText = "$" + total.toLocaleString('es-CL');
}

// Botones de + y - dentro del carrito
window.modificarCantCarrito = function(idProducto, delta) {
    const index = window.carritoPos.findIndex(item => item.id === idProducto);
    if(index > -1) {
        window.carritoPos[index].cantidad += delta;
        if(window.carritoPos[index].cantidad <= 0) {
            window.carritoPos.splice(index, 1); // Lo elimina si llega a 0
        }
        renderizarCarrito();
    }
}

// ==========================================
// BUSCADOR Y ESCÁNER DE CÓDIGO DE BARRAS
// ==========================================

window.buscarProductoPOS = function(texto) {
    const term = texto.toLowerCase().trim();
    const grid = document.getElementById('pos-productos-grid');
    
    if (term === '') {
        // Si borran el texto, volvemos a mostrar todo (o la categoría seleccionada)
        // Por ahora, para simplificar, mostramos 'TODOS'
        renderizarProductosPOS('TODOS');
        return;
    }

    // Buscamos por nombre O por código de barras exacto
    const filtrados = window.productosPosMemoria.filter(p => {
        const matchNombre = p.nombre.toLowerCase().includes(term);
        const matchCodigo = p.codigo_barras && p.codigo_barras.toLowerCase() === term;
        return matchNombre || matchCodigo;
    });

    if (filtrados.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-slate-400 font-bold py-10">No hay coincidencias.</p>';
        return;
    }

    // Si el cajero escaneó un código de barras exacto y hay SOLO 1 resultado, lo agregamos al carrito automáticamente!
    const posibleEscaneo = window.productosPosMemoria.find(p => p.codigo_barras && p.codigo_barras.toLowerCase() === term);
    
    if (posibleEscaneo && filtrados.length === 1) {
        agregarAlCarrito(posibleEscaneo.id);
        
        // Limpiamos el buscador rápido para el siguiente escaneo
        const inputBuscador = document.querySelector('input[placeholder="Buscar o escanear código de barras..."]');
        if(inputBuscador) {
            inputBuscador.value = '';
            // Le devolvemos el foco para que pueda seguir escaneando sin usar el mouse
            setTimeout(() => inputBuscador.focus(), 10); 
        }
        renderizarProductosPOS('TODOS'); // Restauramos la vista
        return; // Salimos para no dibujar la grilla filtrada
    }

    // Si es una búsqueda normal por nombre, dibujamos los resultados
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

    // 1. Calcular total actual sumando el carrito
    checkoutTotalVenta = window.carritoPos.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    document.getElementById('checkout-total').innerText = "$" + checkoutTotalVenta.toLocaleString('es-CL');
    
    // 2. Resetear el modal para que esté limpio
    checkoutMetodoPago = '';
    document.getElementById('checkout-recibido').value = '';
    document.getElementById('checkout-vuelto').innerText = '$0';
    document.getElementById('checkout-seccion-efectivo').classList.add('hidden');
    document.getElementById('btn-confirmar-venta').disabled = true;

    // Quitar color verde de los botones de pago por si había uno seleccionado antes
    const botones = document.querySelectorAll('.metodo-pago-btn');
    botones.forEach(btn => {
        btn.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50');
    });

    // 3. Mostrar el modal
    document.getElementById('pos-checkout-modal').classList.remove('hidden');
}

window.cerrarCheckout = function() {
    document.getElementById('pos-checkout-modal').classList.add('hidden');
}

window.seleccionarMetodoPago = function(idMetodo) {
    // Buscamos el objeto completo del método seleccionado
    const metodoElegido = window.metodosPagoMemoria.find(m => m.id === idMetodo);
    if(!metodoElegido) return;

    checkoutMetodoPago = metodoElegido; // Guardamos el objeto completo, no solo el string
    document.getElementById('btn-confirmar-venta').disabled = false; 

    // Limpiar todos los botones (quitar bordes de colores)
    const botones = document.querySelectorAll('.metodo-pago-btn');
    botones.forEach(btn => btn.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50', 'ring-blue-400', 'bg-blue-50', 'ring-purple-400', 'bg-purple-50'));
    
    // Pintar de verde/azul/morado el botón seleccionado
    const btnActivo = document.getElementById(`btn-pago-${idMetodo}`);
    if(btnActivo) {
        if(metodoElegido.tipo === 'EFECTIVO') btnActivo.classList.add('ring-4', 'ring-emerald-400', 'bg-emerald-50');
        else if(metodoElegido.tipo === 'TARJETA') btnActivo.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');
        else btnActivo.classList.add('ring-4', 'ring-purple-400', 'bg-purple-50');
    }

    // Mostrar u ocultar la calculadora de vuelto SI ES EFECTIVO
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
    if(vuelto < 0) vuelto = 0; // No mostramos vueltos negativos
    document.getElementById('checkout-vuelto').innerText = "$" + vuelto.toLocaleString('es-CL');
}

// LA FUNCIÓN CONFIRMAR VENTA (¡Versión Unificada Definitiva!)
window.confirmarVentaPOS = async function() {
    if(!checkoutMetodoPago) return alert("Selecciona un método de pago.");
    if(window.carritoPos.length === 0) return alert("El carrito está vacío.");
    
    const btn = document.getElementById('btn-confirmar-venta');
    btn.innerText = "⏳ Procesando...";
    btn.disabled = true;

    try {
        const estadoVenta = checkoutMetodoPago.tipo === 'CREDITO' ? 'POR_COBRAR' : 'COMPLETADA';

        // 1. Buscamos sucursal (BLINDADO CON maybeSingle)
        const { data: sucursal } = await clienteSupabase
            .from('sucursales')
            .select('id')
            .eq('id_empresa', window.miEmpresaId)
            .limit(1)
            .maybeSingle();

        if (!sucursal) throw new Error("No tienes ninguna sucursal creada en el sistema.");

        // 2. Cabecera (Tabla: ventas)
        const payloadVenta = {
            id_empresa: window.miEmpresaId,
            id_sucursal: sucursal.id,
            total: checkoutTotalVenta,
            metodo_pago: checkoutMetodoPago.nombre,
            estado: estadoVenta,
            cajero: window.cajeroActivo.id, 
            origen: 'POS'
        };

        const { data: ventaGuardada, error: errorVenta } = await clienteSupabase
            .from('ventas')
            .insert([payloadVenta])
            .select('id')
            .single();

        if (errorVenta) throw errorVenta;

        // 3. Detalles (Tabla: ventas_detalles)
        const detallesVenta = window.carritoPos.map(item => ({
            id_venta: ventaGuardada.id,
            id_producto: item.id,
            cantidad: item.cantidad,
            precio_unitario: item.precio,
            subtotal: item.cantidad * item.precio
        }));

        const { error: errorDetalles } = await clienteSupabase.from('ventas_detalles').insert(detallesVenta);
        if (errorDetalles) throw errorDetalles;

        // 4. Bajar Stock (BLINDADO CON maybeSingle)
        for (const item of window.carritoPos) {
            const productoMemoria = window.productosPosMemoria.find(p => p.id === item.id);
            if (productoMemoria && productoMemoria.control_stock === true) {
                
                const { data: saldoActual } = await clienteSupabase
                    .from('inventario_saldos')
                    .select('id, cantidad_actual_ua')
                    .eq('id_producto', item.id)
                    .limit(1)
                    .maybeSingle();

                if (saldoActual) {
                    await clienteSupabase
                        .from('inventario_saldos')
                        .update({ 
                            cantidad_actual_ua: saldoActual.cantidad_actual_ua - item.cantidad, 
                            ultima_actualizacion: new Date().toISOString() 
                        })
                        .eq('id', saldoActual.id);
                } else {
                    console.warn(`Producto sin registro en inventario. Se vendió igual.`);
                }
            }
        }

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        if(estadoVenta === 'POR_COBRAR') alert("📓 Venta anotada en la cuenta (Crédito).");
        else alert("✅ ¡Venta registrada y pagada con éxito!");
        
        window.carritoPos = []; 
        renderizarCarrito();    
        cerrarCheckout();       

    } catch(error) {
        console.error("Error al registrar venta:", error);
        alert("❌ Error: " + (error.message || "Contacta a soporte."));
    } finally {
        btn.innerText = "CONFIRMAR PAGO";
        btn.disabled = false;
    }
}

// ==========================================
// LÓGICA DE CUENTAS GUARDADAS / MESAS
// ==========================================

window.abrirModalGuardarCuenta = function() {
    if(window.carritoPos.length === 0) {
        alert("⚠️ El carrito está vacío. Agrega productos para poder guardar la cuenta.");
        return;
    }
    document.getElementById('input-nombre-cuenta').value = '';
    document.getElementById('modal-guardar-cuenta').classList.remove('hidden');
    setTimeout(() => document.getElementById('input-nombre-cuenta').focus(), 100);
}

window.confirmarGuardarCuenta = function() {
    const nombre = document.getElementById('input-nombre-cuenta').value.trim() || 'Cuenta sin nombre';
    
    // Usamos la memoria del navegador atada a la empresa actual
    const key = `cuentas_pos_${window.miEmpresaId}`;
    let cuentasGuardadas = JSON.parse(localStorage.getItem(key)) || [];
    
    // Armamos el paquete de la cuenta
    const nuevaCuenta = {
        id: 'CTA-' + Date.now(),
        nombre: nombre,
        fecha: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        carrito: [...window.carritoPos], // Clonamos el carrito exacto
        total: checkoutTotalVenta || window.carritoPos.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
    };
    
    cuentasGuardadas.push(nuevaCuenta);
    localStorage.setItem(key, JSON.stringify(cuentasGuardadas));
    
    // Limpiamos la caja para el siguiente cliente
    document.getElementById('modal-guardar-cuenta').classList.add('hidden');
    window.carritoPos = [];
    renderizarCarrito();
    alert(`✅ La cuenta de "${nombre}" ha sido guardada en espera.`);
}

window.mostrarPantallaCuentas = function() {
    document.getElementById('pos-dashboard').classList.add('hidden');
    document.getElementById('pos-cuentas-screen').classList.remove('hidden');
    renderizarCuentasGuardadas();
}

window.renderizarCuentasGuardadas = function() {
    const key = `cuentas_pos_${window.miEmpresaId}`;
    let cuentasGuardadas = JSON.parse(localStorage.getItem(key)) || [];
    const grid = document.getElementById('grid-cuentas-guardadas');
    
    if(cuentasGuardadas.length === 0) {
        grid.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center text-slate-400 mt-20"><span class="text-6xl mb-4">🍃</span><p class="font-bold text-xl">No hay cuentas en espera</p></div>';
        return;
    }
    
    grid.innerHTML = cuentasGuardadas.map(cta => `
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3 relative hover:shadow-md transition-shadow">
            <button onclick="eliminarCuentaGuardada('${cta.id}')" class="absolute top-3 right-3 text-slate-300 hover:text-red-500 font-bold transition-colors text-lg" title="Eliminar/Cancelar Cuenta">✕</button>
            <div class="flex items-center gap-2 text-blue-600 mb-1 pr-6">
                <span class="text-xl">📝</span>
                <h3 class="font-black text-lg text-slate-800 uppercase truncate">${cta.nombre}</h3>
            </div>
            <p class="text-xs text-slate-400 font-bold">Hora: ${cta.fecha}</p>
            <p class="text-sm font-bold text-slate-600">${cta.carrito.length} tipo(s) de productos</p>
            
            <div class="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                <span class="font-black text-xl text-emerald-600">$${cta.total.toLocaleString('es-CL')}</span>
                <button onclick="cargarCuentaEnPOS('${cta.id}')" class="px-4 py-2 bg-blue-100 text-blue-700 font-black rounded-xl hover:bg-blue-600 hover:text-white transition-colors">
                    Cobrar →
                </button>
            </div>
        </div>
    `).join('');
}

window.cargarCuentaEnPOS = function(idCuenta) {
    const key = `cuentas_pos_${window.miEmpresaId}`;
    let cuentasGuardadas = JSON.parse(localStorage.getItem(key)) || [];
    const index = cuentasGuardadas.findIndex(c => c.id === idCuenta);
    
    if(index > -1) {
        // Traspasamos los productos de nuevo a la caja registradora
        window.carritoPos = cuentasGuardadas[index].carrito;
        
        // Eliminamos la cuenta de "En espera" porque ya la estamos atendiendo
        cuentasGuardadas.splice(index, 1);
        localStorage.setItem(key, JSON.stringify(cuentasGuardadas));
        
        // Cambiamos de pantalla: De Cuentas -> a Nueva Venta
        document.getElementById('pos-cuentas-screen').classList.add('hidden');
        document.getElementById('pos-nueva-venta').classList.remove('hidden');
        
        renderizarCarrito();
    }
}

window.eliminarCuentaGuardada = function(idCuenta) {
    if(confirm('🗑️ ¿Estás seguro que quieres CANCELAR esta cuenta? Los productos no se cobrarán.')) {
        const key = `cuentas_pos_${window.miEmpresaId}`;
        let cuentasGuardadas = JSON.parse(localStorage.getItem(key)) || [];
        cuentasGuardadas = cuentasGuardadas.filter(c => c.id !== idCuenta);
        localStorage.setItem(key, JSON.stringify(cuentasGuardadas));
        renderizarCuentasGuardadas();
    }
}

window.volverDashboardPOS = function() {
    // Ocultamos la pantalla de cuentas
    document.getElementById('pos-cuentas-screen').classList.add('hidden');
    
    // Mostramos el menú principal (Asegúrate de que tu menú de los 3 botones grandes tenga el id="pos-dashboard")
    const dashboard = document.getElementById('pos-dashboard');
    if(dashboard) {
        dashboard.classList.remove('hidden');
    }
}

window.volverDashboardPOS = function() {
    // 1. Ocultamos la pantalla de las cuentas
    document.getElementById('pos-cuentas-screen').classList.add('hidden');
    
    // 2. Volvemos a mostrar el menú de los 3 botones gigantes
    document.getElementById('pos-dashboard').classList.remove('hidden');
}

// Mostrar/Ocultar el carrito en modo Teléfono
window.toggleCarritoMobile = function() {
    const sidebar = document.getElementById('pos-carrito-sidebar');
    if(sidebar.classList.contains('translate-y-full')) {
        sidebar.classList.remove('translate-y-full'); // Subir carrito
    } else {
        sidebar.classList.add('translate-y-full'); // Bajar carrito
    }
}

// ==========================================
// ESCÁNER DE CÓDIGO DE BARRAS POR CÁMARA (MÓVIL)
// ==========================================
let escanerCamara = null;

window.abrirEscanerCamara = function() {
    document.getElementById('modal-escaner-camara').classList.remove('hidden');
    
    // Si ya hay una instancia, la limpiamos por precaución
    if (escanerCamara) { escanerCamara.clear(); }
    
    // Inicializamos el lector en el div que creamos
    escanerCamara = new Html5Qrcode("lector-camara-pos");
    
    // Configuramos para usar la cámara trasera y darle forma de rectángulo de código de barras
    const config = { fps: 10, qrbox: { width: 250, height: 100 } };
    
    escanerCamara.start({ facingMode: "environment" }, config, 
        (textoDecodificado) => {
            // ¡LO LEYÓ! Apagamos la cámara instantáneamente
            cerrarEscanerCamara();
            
            // Le pasamos el código exacto a nuestra función para que lo tire al carrito
            procesarEscaneoFisico(textoDecodificado);
        },
        (mensajeError) => {
            // Ignoramos los errores continuos mientras busca enfocar
        }
    ).catch(err => {
        console.error("Error iniciando cámara:", err);
        alert("❌ No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
        cerrarEscanerCamara();
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

let modoEscanerActual = 'POS'; // Para saber si estamos cobrando o creando un producto

// Le agregamos la variable "modo" (Por defecto es POS)
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
            // ¡CÓDIGO LEYÓDO! Apagamos la cámara
            cerrarEscanerCamara();
            
            // 🧠 DECISIÓN INTELIGENTE: ¿Qué hacemos con el código?
            if (modoEscanerActual === 'PRODUCTO') {
                // Si estamos creando un producto, lo pegamos en el formulario
                document.getElementById('prod-codigo-barras').value = textoDecodificado;
                if (navigator.vibrate) navigator.vibrate(100);
                
                // Efecto visual para que el usuario note que se pegó
                const input = document.getElementById('prod-codigo-barras');
                input.classList.add('bg-emerald-100', 'ring-2', 'ring-emerald-500');
                setTimeout(() => input.classList.remove('bg-emerald-100', 'ring-2', 'ring-emerald-500'), 1000);
                
            } else {
                // Si estamos en el POS, lo tiramos al carrito
                procesarEscaneoFisico(textoDecodificado);
            }
        },
        (mensajeError) => {
            // Ignoramos errores de enfoque
        }
    ).catch(err => {
        console.error("Error iniciando cámara:", err);
        alert("❌ No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
        cerrarEscanerCamara();
    });
}

// ==========================================
// CONTROL DE ACCESO ERP Y SALIDA DE CAJA
// ==========================================

// 1. Ir al ERP con contraseña de Admin (Redirección inteligente)
window.solicitarAccesoERP = async function(vistaDestino = 'home') {
    document.getElementById('pos-dropdown-menu').classList.add('hidden');
    
    const pinIngresado = prompt("🔒 Seguridad ERP: Ingresa tu PIN de Administrador/Dueño para salir del POS:");
    if (!pinIngresado) return;

    try {
        // PASO 1: Ver de quién es este PIN
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('id_usuario')
            .eq('pin_seguridad', pinIngresado)
            .maybeSingle();

        if (!perfil) {
            alert("🚨 PIN incorrecto. Cerrando sesión por seguridad...");
            return window.cerrarSesion();
        }

        // PASO 2: Ver qué rol tiene en esta empresa
        const { data: acceso } = await clienteSupabase
            .from('usuarios_empresas')
            .select('rol')
            .eq('id_empresa', window.miEmpresaId)
            .eq('id_usuario', perfil.id_usuario)
            .maybeSingle();

        // NOTA: Ajusta 'ADMIN' o 'DUEÑO' según cómo los escribas exactamente en tu base de datos
        if (acceso && (acceso.rol === 'ADMIN' || acceso.rol === 'DUEÑO' || acceso.rol === 'Administrador')) {
            alert("✅ Acceso autorizado al panel ERP.");
            window.salirDePOS(); 
            if(vistaDestino !== 'home') window.cambiarVista(vistaDestino);
        } else {
            alert("🚨 No tienes permisos para salir del POS. Cerrando sesión...");
            window.cerrarSesion();
        }
    } catch (error) {
        console.error("Error en validación de salida:", error);
        window.cerrarSesion();
    }
}

// 2. Abrir Modal de Salida
window.abrirModalSalidaPOS = function() {
    document.getElementById('pos-dropdown-menu').classList.add('hidden');
    document.getElementById('modal-salida-pos').classList.remove('hidden');
}

// 3. Tomar Descanso (Pausa)
window.pausarTurno = function() {
    document.getElementById('modal-salida-pos').classList.add('hidden');
    alert("☕ Pausa registrada en RRHH. La caja se bloqueará.");
    // Aquí bloqueamos la pantalla devolviéndolo a la pantalla del PIN inicial
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    document.getElementById('pos-pin-screen').classList.remove('hidden');
    document.getElementById('pos-pin-screen').classList.add('flex');
    window.borrarTodoElPin();
}

// Variables globales de cierre
let esperadoEfectivo = 0;
let esperadoTarjetas = 0;
let esperadoTransf = 0; // NUEVO

window.iniciarCierreDeCaja = async function() {
    if (!window.turnoActual) {
        alert("No hay un turno activo para cerrar.");
        return;
    }

    document.getElementById('modal-salida-pos').classList.add('hidden');
    document.getElementById('cierre-cajero-nombre').innerText = window.usuarioActual;

    try {
        // 1. Consultar las ventas REALES de este turno (Desde fecha_apertura hasta AHORA)
        const { data: ventasTurno, error } = await clienteSupabase
            .from('ventas')
            .select('total, metodo_pago')
            .eq('id_empresa', window.miEmpresaId)
            .gte('created_at', window.turnoActual.fecha_apertura)
            .in('estado', ['COMPLETADA']); // Solo sumamos ventas pagadas

        if (error) throw error;

        // 2. Sumarizar por método de pago
        let sumaEfectivo = 0;
        let sumaTarjetas = 0;
        let sumaTransf = 0;

        (ventasTurno || []).forEach(v => {
            if (v.metodo_pago === 'EFECTIVO') sumaEfectivo += Number(v.total);
            if (v.metodo_pago === 'TARJETA') sumaTarjetas += Number(v.total);
            if (v.metodo_pago === 'TRANSFERENCIA') sumaTransf += Number(v.total);
        });

        // 3. Asignar los valores REALES al cuadre
        // El esperado en efectivo es lo que se vendió + el monto inicial (sencillo)
        esperadoEfectivo = sumaEfectivo + Number(window.turnoActual.monto_inicial_efectivo);
        esperadoTarjetas = sumaTarjetas;
        esperadoTransf = sumaTransf;

        // 4. Mostrar en la UI
        document.getElementById('cierre-esperado-efectivo').innerText = `$${esperadoEfectivo.toLocaleString('es-CL')}`;
        document.getElementById('cierre-esperado-tarjeta').innerText = `$${esperadoTarjetas.toLocaleString('es-CL')}`;
        document.getElementById('cierre-esperado-transf').innerText = `$${esperadoTransf.toLocaleString('es-CL')}`;
        
        document.getElementById('cierre-real-efectivo').value = '';
        document.getElementById('cierre-real-tarjeta').value = '';
        document.getElementById('cierre-real-transf').value = '';
        document.getElementById('cierre-notas').value = '';
        
        calcularDiferenciaCaja(); 
        document.getElementById('modal-cierre-caja').classList.remove('hidden');

    } catch (error) {
        console.error("Error calculando el cierre:", error);
        alert("Hubo un error al calcular los totales de caja.");
    }
}

window.calcularDiferenciaCaja = function() {
    const realEf = Number(document.getElementById('cierre-real-efectivo').value) || 0;
    const realTa = Number(document.getElementById('cierre-real-tarjeta').value) || 0;
    const realTr = Number(document.getElementById('cierre-real-transf').value) || 0; // NUEVO

    const totalEsperado = esperadoEfectivo + esperadoTarjetas + esperadoTransf;
    const totalReal = realEf + realTa + realTr;
    const diferencia = totalReal - totalEsperado;

    const panel = document.getElementById('cierre-resultado-panel');
    const montoTexto = document.getElementById('cierre-diferencia-monto');
    const descTexto = document.getElementById('cierre-diferencia-texto');

    montoTexto.innerText = `$${Math.abs(diferencia).toLocaleString('es-CL')}`;
    panel.classList.remove('border-emerald-400', 'bg-emerald-50', 'border-red-400', 'bg-red-50', 'border-slate-200', 'bg-slate-50');
    montoTexto.classList.remove('text-emerald-700', 'text-red-700', 'text-slate-800');

    if (diferencia === 0 && totalEsperado > 0) {
        panel.classList.add('border-emerald-400', 'bg-emerald-50');
        montoTexto.classList.add('text-emerald-700');
        descTexto.innerText = "✅ Caja Cuadrada Perfectamente";
    } else if (diferencia > 0) {
        panel.classList.add('border-slate-200', 'bg-slate-50');
        montoTexto.classList.add('text-slate-800');
        descTexto.innerText = "⚠️ Sobra dinero en caja";
    } else if (diferencia < 0) {
        panel.classList.add('border-red-400', 'bg-red-50');
        montoTexto.classList.add('text-red-700');
        descTexto.innerText = "❌ Falta dinero (Descuadre)";
    } else {
        panel.classList.add('border-slate-200', 'bg-slate-50');
        montoTexto.classList.add('text-slate-800');
        descTexto.innerText = "Ingresa los montos contados";
    }
}

// EL BOTÓN FINAL PARA CERRAR TURNO
window.confirmarCierreCaja = async function() {
    if (!window.turnoActual) return alert("❌ No hay un turno activo para cerrar.");

    // Solución blindada: Buscamos el botón por su texto, sin importar el color
    const btn = Array.from(document.querySelectorAll('#modal-cierre-caja button')).find(b => b.textContent.includes('Cerrar'));
    const textoOriginal = btn ? btn.innerText : "Cerrar Turno";
    if (btn) {
        btn.innerText = "⏳ Cerrando...";
        btn.disabled = true;
    }

    // Tomamos lo que el cajero digitó que contó físicamente
    const realEf = Number(document.getElementById('cierre-real-efectivo').value) || 0;
    const realTa = Number(document.getElementById('cierre-real-tarjeta').value) || 0;
    
    // Calculamos diferencias finales
    const difEfectivo = realEf - esperadoEfectivo;
    const difTarjetas = realTa - esperadoTarjetas;

    try {
        // Armamos el paquete. 
        // NOTA: No estoy incluyendo las Transferencias aquí aún para que no te dé error 
        // si no has creado las columnas "ventas_transf_sistema" en Supabase.
        const payloadCierre = {
            fecha_cierre: new Date().toISOString(),
            cerrado_por: window.cajeroActivo.id,
            ventas_efectivo_sistema: esperadoEfectivo, 
            ventas_tarjetas_sistema: esperadoTarjetas, 
            efectivo_declarado: realEf, 
            tarjetas_declaradas: realTa, 
            diferencia_efectivo: difEfectivo,
            diferencia_tarjetas: difTarjetas,
            estado: 'CERRADO'
        };

        const { error } = await clienteSupabase
            .from('pos_turnos')
            .update(payloadCierre)
            .eq('id', window.turnoActual.id);

        if (error) throw error;

        // Limpiamos la memoria
        window.turnoActual = null;
        window.cajeroActivo = null;

        alert("🔒 ¡Cierre de caja registrado exitosamente!\n\nEl turno ha finalizado.");

        // Cerramos modal y bloqueamos la pantalla devolviéndolo al PIN
        document.getElementById('modal-cierre-caja').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.add('hidden');
        document.getElementById('pos-dashboard-screen').classList.remove('flex');
        
        document.getElementById('pos-pin-screen').classList.remove('hidden');
        document.getElementById('pos-pin-screen').classList.add('flex');
        window.borrarTodoElPin();

    } catch (error) {
        console.error("Error guardando cierre:", error);
        alert("❌ Ocurrió un error al intentar cerrar la caja. Revisa la consola.");
    } finally {
        if (btn) {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    }
}

// 1. Ir a buscar los métodos a Supabase
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
        renderizarMetodosPagoPOS();
    } catch (error) {
        console.error("Error cargando métodos de pago:", error);
    }
}

// 2. Dibujar los botones en el HTML con colores según su tipo
window.renderizarMetodosPagoPOS = function() {
    const contenedor = document.getElementById('contenedor-metodos-pago');
    if (!contenedor) return;

    if (window.metodosPagoMemoria.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-red-500 col-span-full font-bold text-center">⚠️ No hay métodos de pago configurados.</p>';
        return;
    }

    contenedor.innerHTML = window.metodosPagoMemoria.map(mp => {
        // Asignar colores e íconos dinámicamente según el tipo base
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