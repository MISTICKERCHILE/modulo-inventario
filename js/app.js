window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };
window.usuarioActual = 'Equipo'; 

// --- LOGIN Y SESIÓN MULTI-EMPRESA ---
window.toggleAuthMode = function(mode) {
    document.getElementById('auth-mode').value = mode;
    const regFields = document.getElementById('register-fields');
    const regNombre = document.getElementById('reg-nombre');
    const regApellido = document.getElementById('reg-apellido');

    if(mode === 'login') {
        document.getElementById('tab-login').className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        document.getElementById('tab-register').className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        document.getElementById('auth-btn').innerText = 'Entrar al Sistema';
        regFields.classList.add('hidden');
        regNombre.removeAttribute('required'); 
        regApellido.removeAttribute('required');
    } else {
        document.getElementById('tab-register').className = 'flex-1 pb-2 border-b-2 border-emerald-600 font-bold text-emerald-600 outline-none transition-colors';
        document.getElementById('tab-login').className = 'flex-1 pb-2 font-bold text-slate-400 outline-none hover:text-emerald-500 transition-colors';
        document.getElementById('auth-btn').innerText = 'Crear mi Cuenta';
        regFields.classList.remove('hidden');
        regNombre.setAttribute('required', 'true'); 
        regApellido.setAttribute('required', 'true');
    }
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('email').value.trim();
    const passwordInput = document.getElementById('password').value;
    const mode = document.getElementById('auth-mode').value;

    if(mode === 'register') {
        const nombreInput = document.getElementById('reg-nombre').value.trim();
        const apellidoInput = document.getElementById('reg-apellido').value.trim();
        const telInput = document.getElementById('reg-telefono').value.trim();

        const { data, error } = await clienteSupabase.auth.signUp({ 
            email: emailInput, 
            password: passwordInput,
            options: {
                data: {
                    nombre: nombreInput,
                    apellido: apellidoInput,
                    telefono: telInput
                }
            }
        });
        
        if(error) return alert("❌ Error al registrar: " + error.message);
        
        alert(`✅ Cuenta creada para ${nombreInput}. Ahora pide a tu administrador que te dé acceso a la empresa.`);
        window.toggleAuthMode('login');
        document.getElementById('password').value = '';
        return;
    }

    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    if (error) return alert("❌ Credenciales incorrectas. Verifica tu correo y contraseña.");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('nombre, apellido').eq('id_usuario', data.user.id).maybeSingle();
    
    // Solo usamos el nombre de pila para saludar
    const nombreReal = perfil?.nombre || emailInput.split('@')[0];

    const { data: empresasAsignadas } = await clienteSupabase.from('usuarios_empresas').select('id_empresa, nombre_empresa').eq('id_usuario', data.user.id);

    if (!empresasAsignadas || empresasAsignadas.length === 0) {
        return alert("🛑 Tu cuenta existe, pero aún no tienes empresas asignadas. Contacta a tu administrador.");
    }

    document.getElementById('login-container').classList.add('hidden');

    if (empresasAsignadas.length === 1) {
        window.iniciarSesionEmpresa(empresasAsignadas[0].id_empresa, empresasAsignadas[0].nombre_empresa, emailInput, nombreReal);
    } else {
        document.getElementById('selector-empresa-container').classList.remove('hidden');
        document.getElementById('lista-empresas-usuario').innerHTML = empresasAsignadas.map(emp => `
            <button onclick="iniciarSesionEmpresa('${emp.id_empresa}', '${emp.nombre_empresa}', '${emailInput}', '${nombreReal}')" class="w-full text-left px-6 py-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 transition-all font-bold text-slate-700 shadow-sm flex items-center justify-between group">
                <span>🏢 ${emp.nombre_empresa}</span>
                <span class="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">Entrar →</span>
            </button>
        `).join('');
    }
});

window.iniciarSesionEmpresa = function(idEmpresa, nombreEmpresa, emailUsuario, nombreReal) {
    window.miEmpresaId = idEmpresa;
    window.usuarioActual = nombreReal;

    const selector = document.getElementById('selector-empresa-container');
    if(selector) selector.classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');

    document.getElementById('user-email-dropdown').innerText = emailUsuario;
    document.getElementById('user-name-display').innerText = window.usuarioActual;

    window.actualizarBadgeCarrito();
    window.cambiarVista('dashboard');
};

// --- FUNCIÓN PARA CAMBIAR DE EMPRESA SIN CERRAR SESIÓN ---
window.volverASelectorEmpresa = async function() {
    // 1. Buscamos al usuario logueado actualmente
    const { data: { user } } = await clienteSupabase.auth.getUser();
    if(!user) return window.cerrarSesion();

    // 2. Buscamos de nuevo sus empresas (por si le dieron acceso a otra recientemente)
    const { data: empresasAsignadas } = await clienteSupabase.from('usuarios_empresas')
        .select('id_empresa, nombre_empresa')
        .eq('id_usuario', user.id);

    // 3. Recuperamos los datos visuales
    const emailUsuario = document.getElementById('user-email-dropdown').innerText;
    const nombreReal = window.usuarioActual;

    // 4. Escondemos el Dashboard y mostramos el Selector
    document.getElementById('dashboard-container').classList.add('hidden');
    document.getElementById('selector-empresa-container').classList.remove('hidden');

    // 5. Dibujamos los botones de las empresas
    document.getElementById('lista-empresas-usuario').innerHTML = empresasAsignadas.map(emp => `
        <button onclick="iniciarSesionEmpresa('${emp.id_empresa}', '${emp.nombre_empresa}', '${emailUsuario}', '${nombreReal}')" class="w-full text-left px-6 py-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 transition-all font-bold text-slate-700 shadow-sm flex items-center justify-between group">
            <span>🏢 ${emp.nombre_empresa}</span>
            <span class="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">Entrar →</span>
        </button>
    `).join('');
}

window.cerrarSesion = function() { location.reload(); }

// --- FRENO DE EMERGENCIA Y MEMORIA ---
window.actualizarBadgeCarrito = function() {
    if(!window.miEmpresaId) return;
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    const badge = document.getElementById('badge-cart');
    if(badge) {
        const arr = guardado ? JSON.parse(guardado) : [];
        if(arr.length > 0) {
            badge.innerText = arr.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

window.addEventListener('beforeunload', (e) => {
    if(!window.miEmpresaId) return;
    const guardado = localStorage.getItem('carrito_pedidos_' + window.miEmpresaId);
    if (guardado && JSON.parse(guardado).length > 0) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// NUEVO LOGICA MENU CELULAR Y ESCRITORIO (DRAWER)
window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    if (window.innerWidth >= 768) {
        sidebar.classList.toggle('md:hidden');
    } else {
        sidebar.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    }
}

window.toggleUserMenu = function() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
    document.getElementById('panel-notificaciones').classList.add('hidden');
}
window.toggleNotificaciones = function() {
    document.getElementById('panel-notificaciones').classList.toggle('hidden');
    document.getElementById('user-dropdown').classList.add('hidden');
}

document.addEventListener('click', (e) => {
    const userDropdown = document.getElementById('user-dropdown');
    const userBtn = e.target.closest('button[onclick="toggleUserMenu()"]');
    if (!userBtn && userDropdown && !userDropdown.classList.contains('hidden') && !e.target.closest('#user-dropdown')) {
        userDropdown.classList.add('hidden');
    }
    const notifDropdown = document.getElementById('panel-notificaciones');
    const notifBtn = e.target.closest('button[onclick="toggleNotificaciones()"]');
    if (!notifBtn && notifDropdown && !notifDropdown.classList.contains('hidden') && !e.target.closest('#panel-notificaciones')) {
        notifDropdown.classList.add('hidden');
    }
});

// --- NAVEGACIÓN GLOBAL CON CARGA DINÁMICA ---
window.cambiarVista = async function(v) {
    if(!window.miEmpresaId) return; 
    
    if (window.innerWidth < 768) {
        document.getElementById('sidebar-menu')?.classList.add('-translate-x-full');
        document.getElementById('sidebar-backdrop')?.classList.add('hidden');
    }
    
    ['dashboard', 'catalogos', 'productos', 'recetas', 'movimientos', 'inventario', 'reportes', 'empresas'].forEach(vis => {
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors mb-1';
    });
    
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors mb-1';
    
    document.getElementById('main-content').innerHTML = '<div class="flex justify-center items-center h-full text-slate-400 font-bold text-xl w-full">⏳ Cargando módulo...</div>';

    try {
        const response = await fetch(`vistas/${v}.html`);
        if(!response.ok) throw new Error(`No se pudo cargar la vista ${v}`);
        const html = await response.text();
        document.getElementById('main-content').innerHTML = html;

        if(v === 'dashboard') window.cargarDashboard();
        if(v === 'catalogos') window.cambiarTab('categorias');
        if(v === 'productos') { window.cargarDatosSelects(); window.cargarProductos(); }
        if(v === 'recetas') { window.cargarBuscadorRecetas(); }
        if(v === 'movimientos') { window.cambiarTabMovimientos('pedidos'); } 
        if(v === 'inventario') { window.cargarInventario(); }
        if(v === 'reportes') { window.cargarReportes(); }
        if(v === 'empresas') { window.cargarVistaEmpresas(); }

    } catch (error) {
        console.error(error);
        document.getElementById('main-content').innerHTML = `<div class="p-8 text-center text-red-500 font-bold w-full">❌ Error cargando la vista: ${v}.html</div>`;
    }
}

// LÓGICA DE FORMULARIOS GLOBALES
window.cancelarEdicion = function(formName) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const formEl = document.getElementById(`form-${formName}`);
    if(formEl) {
        formEl.reset();
        const btnSubmit = formEl.querySelector('button[type="submit"]');
        if(btnSubmit) { btnSubmit.innerText = formName === 'producto' ? 'Guardar Producto' : 'Guardar'; btnSubmit.classList.replace('bg-blue-600', formName === 'ingrediente' || formName === 'producto' ? 'bg-emerald-600' : 'bg-slate-800'); }
        const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}
window.activarEdicionGlobal = function(formName, id, objJS) {
    window.modoEdicion = { activo: true, id: id, form: formName };
    for (const [inputId, valor] of Object.entries(objJS)) { document.getElementById(inputId).value = valor; }
    const btnSubmit = document.querySelector(`#form-${formName} button[type="submit"]`);
    if(btnSubmit) { btnSubmit.innerText = 'Actualizar ✏️'; btnSubmit.classList.replace('bg-slate-800', 'bg-blue-600'); btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600'); }
    const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
    if(btnCancel) btnCancel.classList.remove('hidden');
};
window.eliminarReg = async function(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro definitivamente? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla === 'sucursales') window.cargarSucursales(); else if (tabla === 'tipos_movimiento') window.cargarTiposMovimiento(); else window.cambiarVista(document.querySelector('.bg-emerald-600').id.replace('btn-menu-',''));
    }
}

document.addEventListener('submit', async (e) => {
    if (!e.target.id || !e.target.id.startsWith('form-')) return;
    if (e.target.id !== 'auth-form' && e.target.id !== 'form-producto' && e.target.id !== 'form-precio-prov' && e.target.id !== 'form-recepcion' && e.target.id !== 'form-ajuste-rapido' && e.target.id !== 'form-nueva-empresa' && e.target.id !== 'form-vincular-usuario') { e.preventDefault(); }
    
    const id = e.target.id;
    if (id === 'form-categoria') {
        const nombre = document.getElementById('nombre-categoria').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('categorias').update({nombre}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('categorias').insert([{id_empresa: window.miEmpresaId, nombre}]);
        window.cancelarEdicion('categoria'); window.cargarCategorias();
    } else if (id === 'form-unidad') {
        const nombre = document.getElementById('nombre-unidad').value, abrev = document.getElementById('abrev-unidad').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('unidades').update({nombre, abreviatura: abrev}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('unidades').insert([{id_empresa: window.miEmpresaId, nombre, abreviatura: abrev}]);
        window.cancelarEdicion('unidad'); window.cargarUnidades();
    } else if (id === 'form-proveedor') {
        const payload = { nombre: document.getElementById('nombre-proveedor').value, tipo: document.getElementById('tipo-proveedor').value, whatsapp: document.getElementById('whatsapp-proveedor').value, correo: document.getElementById('correo-proveedor').value, lapso_entrega_dias: document.getElementById('tiempo-entrega').value ? parseInt(document.getElementById('tiempo-entrega').value) : null };
        if(window.modoEdicion.activo) await clienteSupabase.from('proveedores').update(payload).eq('id', window.modoEdicion.id); else await clienteSupabase.from('proveedores').insert([{...payload, id_empresa: window.miEmpresaId}]);
        window.cancelarEdicion('proveedor'); window.cargarProveedores();
    } else if (id === 'form-sucursal') {
        const payload = { nombre: document.getElementById('nombre-sucursal').value, nombre_comercial: document.getElementById('comercial-sucursal').value, empresa_asociada: document.getElementById('empresa-sucursal').value, horarios_atencion: document.getElementById('horario-sucursal').value, direccion: document.getElementById('dir-sucursal').value };
        if(window.modoEdicion.activo) await clienteSupabase.from('sucursales').update(payload).eq('id', window.modoEdicion.id); else await clienteSupabase.from('sucursales').insert([{...payload, id_empresa: window.miEmpresaId}]);
        window.cancelarEdicion('sucursal'); window.cargarSucursales();
    } else if (id === 'form-ubicacion') {
        const nombre = document.getElementById('nombre-ubicacion').value, id_sucursal = document.getElementById('sel-sucursal-ubi').value;
        await clienteSupabase.from('ubicaciones_internas').insert([{id_empresa: window.miEmpresaId, id_sucursal, nombre}]);
        window.cancelarEdicion('ubicacion'); window.cargarUbicaciones();
    } else if (id === 'form-tipo-movimiento') {
        const nombre = document.getElementById('nombre-tipo-mov').value, operacion = document.getElementById('operacion-tipo-mov').value;
        if(window.modoEdicion.activo) await clienteSupabase.from('tipos_movimiento').update({nombre, operacion}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('tipos_movimiento').insert([{id_empresa: window.miEmpresaId, nombre, operacion}]);
        window.cancelarEdicion('tipo-movimiento'); window.cargarTiposMovimiento();
    } else if (id === 'form-ingrediente') {
        const payload = { id_producto_padre: window.productoActualParaReceta, id_ingrediente: document.getElementById('sel-ingrediente').value, cantidad_neta: document.getElementById('ing-cantidad').value };
        if(window.modoEdicion.activo) await clienteSupabase.from('recetas').update(payload).eq('id', window.modoEdicion.id); else await clienteSupabase.from('recetas').insert([{...payload, id_empresa: window.miEmpresaId}]);
        window.cancelarEdicion('ingrediente'); window.cargarIngredientesReceta();
    } else if (id === 'form-compra-directa') {
        const idProd = document.getElementById('cd-producto').value, idSuc = document.getElementById('cd-sucursal').value;
        const cantUC = parseFloat(document.getElementById('cd-cantidad').value), costoTotal = parseFloat(document.getElementById('cd-costo').value), precioUC = costoTotal / cantUC;
        const { data: cabecera } = await clienteSupabase.from('compras').insert([{ id_empresa: window.miEmpresaId, id_proveedor: document.getElementById('cd-proveedor').value, total_compra: costoTotal, estado: 'Completada' }]).select('id').single();
        await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: idProd, cantidad_uc: cantUC, precio_unitario_uc: precioUC, subtotal: costoTotal, estado: 'Recibido' }]);
        const { data: prod } = await clienteSupabase.from('productos').select('cant_en_ua_de_uc').eq('id', idProd).single();
        const cantUA_a_sumar = cantUC * prod.cant_en_ua_de_uc;
        const { data: previo } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).is('id_ubicacion', null).maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: cantUA_a_sumar }]);
        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: 'COMPRA_DIRECTA', cantidad_movida: cantUA_a_sumar, costo_unitario_movimiento: precioUC, referencia: 'Compra Directa' }]);
        await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);
        alert("✅ Compra Directa registrada con éxito."); document.getElementById('form-compra-directa').reset();
    } else if (id === 'form-otro-movimiento') {
        const selectTipo = document.getElementById('om-tipo'), operacion = selectTipo.options[selectTipo.selectedIndex].getAttribute('data-operacion');
        const idProd = document.getElementById('om-producto').value, idSuc = document.getElementById('om-sucursal').value;
        const cantidadFinalAplicada = operacion === '+' ? parseFloat(document.getElementById('om-cantidad').value) : -parseFloat(document.getElementById('om-cantidad').value);
        const { data: previo } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).is('id_ubicacion', null).maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantidadFinalAplicada, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: cantidadFinalAplicada }]);
        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: selectTipo.options[selectTipo.selectedIndex].text, cantidad_movida: cantidadFinalAplicada, referencia: 'Ajuste Manual' }]);
        alert(`✅ Movimiento aplicado.`); document.getElementById('form-otro-movimiento').reset();
    }
});
