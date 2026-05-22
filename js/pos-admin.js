// ==========================================
// ADMINISTRACIÓN DEL POS (MENÚ, USUARIOS, REPORTES Z)
// ==========================================
window.categoriasMenuMemoria = [];

window.abrirPosAdminMenu = async function() {
    // 1. Ocultar el dashboard y mostrar esta pantalla
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    
    document.getElementById('pos-admin-menu-screen').classList.remove('hidden');
    document.getElementById('pos-admin-menu-screen').classList.add('flex');

    // 2. Cargar las categorías
    await cargarCategoriasParaAdmin();
}

window.cerrarPosAdminMenu = function() {
    document.getElementById('pos-admin-menu-screen').classList.add('hidden');
    document.getElementById('pos-admin-menu-screen').classList.remove('flex');
    window.abrirDashboardPOS(); // Te devuelve al inicio
}

async function cargarCategoriasParaAdmin() {
    const lista = document.getElementById('lista-admin-categorias');
    try {
        const { data, error } = await clienteSupabase
            .from('categorias')
            .select('id, nombre') // Si tienes columna 'orden', agrégala aquí
            .eq('id_empresa', window.miEmpresaId)
            .order('nombre'); // Temporalmente ordenado alfabéticamente

        if (error) throw error;
        
        window.categoriasMenuMemoria = data || [];
        renderizarListaCategoriasAdmin();
        
    } catch (err) {
        console.error("Error:", err);
        lista.innerHTML = '<p class="text-red-500 font-bold text-center">❌ Error al cargar categorías.</p>';
    }
}

function renderizarListaCategoriasAdmin() {
    const lista = document.getElementById('lista-admin-categorias');
    if (window.categoriasMenuMemoria.length === 0) {
        lista.innerHTML = '<p class="text-slate-400 italic">No tienes categorías creadas.</p>';
        return;
    }

    lista.innerHTML = window.categoriasMenuMemoria.map((cat, index) => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-slate-100 transition-colors">
            <span class="font-bold text-slate-700">${cat.nombre}</span>
            <div class="flex gap-1">
                <button onclick="moverCategoriaMenu(${index}, -1)" class="w-8 h-8 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-500 hover:bg-slate-200 font-bold disabled:opacity-30" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button onclick="moverCategoriaMenu(${index}, 1)" class="w-8 h-8 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-500 hover:bg-slate-200 font-bold disabled:opacity-30" ${index === window.categoriasMenuMemoria.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        </div>
    `).join('');
}

window.moverCategoriaMenu = function(index, direccion) {
    // direccion: -1 (subir), 1 (bajar)
    const nuevoIndex = index + direccion;
    if (nuevoIndex < 0 || nuevoIndex >= window.categoriasMenuMemoria.length) return;

    // Intercambiar posiciones en el array
    const temp = window.categoriasMenuMemoria[index];
    window.categoriasMenuMemoria[index] = window.categoriasMenuMemoria[nuevoIndex];
    window.categoriasMenuMemoria[nuevoIndex] = temp;

    renderizarListaCategoriasAdmin();
}

window.guardarOrdenMenu = async function() {
    const btn = document.querySelector('#pos-admin-menu-screen button.bg-emerald-600');
    btn.innerText = "⏳ Guardando...";
    btn.disabled = true;

    try {
        // Actualizamos cada categoría con su nuevo índice (posición)
        const promesas = window.categoriasMenuMemoria.map((cat, index) => {
            return clienteSupabase.from('categorias').update({ orden: index }).eq('id', cat.id);
        });

        await Promise.all(promesas); // Esperamos a que todas se guarden
        
        alert("✅ Orden actualizado correctamente.");
        window.cerrarPosAdminMenu();
        // Recargar el menú de la caja para que los cambios se vean de inmediato
        if(typeof window.cargarCatalogoPOS === 'function') window.cargarCatalogoPOS();

    } catch (error) {
        console.error("Error guardando orden:", error);
        alert("❌ Ocurrió un error al guardar el orden.");
    } finally {
        btn.innerText = "💾 Guardar Orden";
        btn.disabled = false;
    }
}

// ==========================================
// CONFIGURACIÓN DE PINES DE USUARIOS
// ==========================================
window.abrirPosAdminUsuarios = function() {
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    document.getElementById('pos-admin-usuarios-screen').classList.remove('hidden');
    document.getElementById('pos-admin-usuarios-screen').classList.add('flex');
    cargarUsuariosPOSAdmin();
}

window.cerrarPosAdminUsuarios = function() {
    document.getElementById('pos-admin-usuarios-screen').classList.add('hidden');
    document.getElementById('pos-admin-usuarios-screen').classList.remove('flex');
    window.abrirDashboardPOS();
}

async function cargarUsuariosPOSAdmin() {
    const contenedor = document.getElementById('lista-admin-usuarios');
    try {
        // Traemos a los usuarios que pertenecen a esta empresa cruzando con sus perfiles
        const { data, error } = await clienteSupabase
            .from('usuarios_empresas')
            .select('rol, perfiles(id_usuario, nombre, pin_seguridad)')
            .eq('id_empresa', window.miEmpresaId);

        if (error) throw error;

        contenedor.innerHTML = data.map(u => {
            const perfil = u.perfiles;
            if(!perfil) return '';
            const pinVisual = perfil.pin_seguridad ? '••••' : 'SIN PIN';
            const colorPin = perfil.pin_seguridad ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';

            return `
            <div class="border border-slate-200 rounded-xl p-4 flex justify-between items-center bg-slate-50">
                <div>
                    <h4 class="font-black text-slate-800">${perfil.nombre || 'Usuario'}</h4>
                    <p class="text-xs font-bold text-slate-400 uppercase">${u.rol}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-mono font-bold px-2 py-1 rounded text-sm ${colorPin}">${pinVisual}</span>
                    <button onclick="cambiarPinUsuarioPOS('${perfil.id_usuario}')" class="text-blue-600 hover:bg-blue-100 p-2 rounded-lg transition-colors" title="Cambiar PIN">✏️</button>
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        console.error("Error cargando usuarios:", err);
        contenedor.innerHTML = '<p class="col-span-full text-red-500 font-bold text-center">Error al cargar usuarios.</p>';
    }
}

window.cambiarPinUsuarioPOS = async function(idUsuario) {
    const nuevoPin = prompt("🔑 Ingresa el nuevo PIN de 4 dígitos para este usuario:");
    if (!nuevoPin) return;
    
    if (!/^\d{4}$/.test(nuevoPin)) {
        return alert("❌ El PIN debe contener exactamente 4 números.");
    }

    try {
        const { error } = await clienteSupabase
            .from('perfiles')
            .update({ pin_seguridad: nuevoPin })
            .eq('id_usuario', idUsuario);

        if (error) throw error;
        alert("✅ PIN actualizado exitosamente.");
        cargarUsuariosPOSAdmin(); // Recargar la lista
    } catch (err) {
        console.error("Error actualizando PIN:", err);
        alert("❌ No se pudo actualizar el PIN.");
    }
}

// ==========================================
// RESUMEN DE VENTAS (TICKET Z)
// ==========================================
window.abrirPosAdminResumen = function() {
    document.getElementById('pos-dashboard-screen').classList.add('hidden');
    document.getElementById('pos-dashboard-screen').classList.remove('flex');
    document.getElementById('pos-admin-resumen-screen').classList.remove('hidden');
    document.getElementById('pos-admin-resumen-screen').classList.add('flex');
    window.cargarResumenPOS();
}

window.cerrarPosAdminResumen = function() {
    document.getElementById('pos-admin-resumen-screen').classList.add('hidden');
    document.getElementById('pos-admin-resumen-screen').classList.remove('flex');
    window.abrirDashboardPOS();
}

window.cargarResumenPOS = async function() {
    if (!window.turnoActual) {
        document.getElementById('resumen-hora-apertura').innerText = "Cerrado";
        return;
    }

    try {
        // 1. Mostrar hora de apertura
        const dApertura = new Date(window.turnoActual.fecha_apertura);
        document.getElementById('resumen-hora-apertura').innerText = dApertura.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

        // 2. Traer Ventas del Turno
        const { data: ventas, error: errVentas } = await clienteSupabase
            .from('ventas')
            .select('total, metodo_pago')
            .eq('id_empresa', window.miEmpresaId)
            .gte('created_at', window.turnoActual.fecha_apertura)
            .in('estado', ['COMPLETADA']);

        if (errVentas) throw errVentas;

        // 3. Traer Cuentas Pendientes
        const { count: cuentasPendientes } = await clienteSupabase
            .from('pos_cuentas_abiertas')
            .select('*', { count: 'exact', head: true })
            .eq('id_empresa', window.miEmpresaId);

        // 4. Calcular Totales
        let totalGeneral = 0;
        const desglose = {};

        (ventas || []).forEach(v => {
            const m = Number(v.total) || 0;
            totalGeneral += m;
            desglose[v.metodo_pago] = (desglose[v.metodo_pago] || 0) + m;
        });

        // 5. Pintar KPIs
        document.getElementById('resumen-total-monto').innerText = `$${totalGeneral.toLocaleString('es-CL')}`;
        document.getElementById('resumen-total-tickets').innerText = (ventas || []).length;
        document.getElementById('resumen-cuentas-pendientes').innerText = cuentasPendientes || 0;

        // 6. Pintar Desglose
        const listaMetodos = document.getElementById('lista-resumen-metodos');
        if (Object.keys(desglose).length === 0) {
            listaMetodos.innerHTML = '<p class="text-slate-400 italic">No hay ventas registradas en este turno aún.</p>';
        } else {
            listaMetodos.innerHTML = Object.entries(desglose).map(([metodo, monto]) => `
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="font-bold text-slate-700">${metodo}</span>
                    <span class="font-black text-emerald-600 text-lg">$${monto.toLocaleString('es-CL')}</span>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error("Error cargando resumen:", err);
    }
}