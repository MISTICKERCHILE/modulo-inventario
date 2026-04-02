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
    if(confirm("¿Seguro que deseas iniciar el cierre de caja?")) {
        alert("Iniciando arqueo de caja...");
        // Esto lo programaremos luego
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

window.seleccionarMetodoPago = function(metodo) {
    checkoutMetodoPago = metodo;
    document.getElementById('btn-confirmar-venta').disabled = false; // Habilitar botón de confirmar

    // Limpiar todos los botones
    const botones = document.querySelectorAll('.metodo-pago-btn');
    botones.forEach(btn => btn.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50'));
    
    // Pintar de verde el botón seleccionado
    let btnActivo;
    if(metodo === 'EFECTIVO') btnActivo = document.getElementById('btn-pago-efectivo');
    if(metodo === 'TARJETA') btnActivo = document.getElementById('btn-pago-tarjeta');
    if(metodo === 'TRANSFERENCIA') btnActivo = document.getElementById('btn-pago-transf');
    
    if(btnActivo) btnActivo.classList.add('ring-4', 'ring-emerald-400', 'bg-emerald-50');

    // Mostrar u ocultar la calculadora de vuelto
    const seccionEfectivo = document.getElementById('checkout-seccion-efectivo');
    if(metodo === 'EFECTIVO') {
        seccionEfectivo.classList.remove('hidden');
        setTimeout(() => document.getElementById('checkout-recibido').focus(), 100); // Autofocus para escribir rápido
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

window.confirmarVentaPOS = async function() {
    if(!checkoutMetodoPago) return alert("Selecciona un método de pago.");
    
    const btn = document.getElementById('btn-confirmar-venta');
    btn.innerText = "⏳ Procesando...";
    btn.disabled = true;

    try {
        // 1. Payload limpio usando tu variable global segura
        const payloadVenta = {
            id_empresa: window.miEmpresaId,
            total: checkoutTotalVenta,
            metodo_pago: checkoutMetodoPago,
            estado: 'COMPLETADA'
        };

        // 2. Guardar en la tabla
        const { data: ventaGuardada, error } = await clienteSupabase
            .from('pos_ventas')
            .insert([payloadVenta])
            .select('id')
            .single();

        if (error) throw error;

        // 3. Éxito absoluto
        alert("✅ ¡Venta registrada con éxito!");
        window.carritoPos = []; 
        renderizarCarrito();    
        cerrarCheckout();       

    } catch(error) {
        console.error("Error al registrar venta:", error);
        alert("Error al registrar venta: " + (error.message || "Desconocido"));
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
    const config = { fps: 10, qrbox: { width: 250, height: 100 } };
    
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