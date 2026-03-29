// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 3.0 - GRANULAR & ACORDEÓN)
// ============================================================================

// Mapa maestro de permisos granulares.
// SOCIA: Aquí definimos "los cables" que conectarán tu HTML con la base de datos.
// Si mañana agregas un sub-módulo, primero lo agregas aquí y luego en el HTML.
const MAPA_PERMISOS = {
    admin: ['admin_empresa', 'admin_seguridad', 'admin_sucursales'],
    ventas: ['ventas_pos', 'ventas_descuentos', 'ventas_cierre', 'ventas_cxc', 'ventas_cotizaciones', 'ventas_ranking'],
    inventario: ['inventario_stock', 'inventario_ajustes', 'inventario_pedidos', 'inventario_movimientos', 'inventario_recetas'],
    general: ['general_reportes', 'general_catalogos']
};

window.rolActivoId = null;

// ==========================================
// 1. CARGA INICIAL Y DIBUJO DE ROLES
// ==========================================
window.cargarParametros = async function() {
    console.log("⚙️ Cargando panel de Parámetros granulares...");
    if (!window.miEmpresaId) return console.error("No hay empresa seleccionada.");

    try {
        let { data: roles, error } = await clienteSupabase.from('roles').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: true });
        if (error) throw error;

        // Si no hay roles, creamos los 3 prederminados ( Dueño, Admin, Colaborador)
        if (!roles || roles.length === 0) {
            console.log("Creando los 3 roles predeterminados...");
            const rolesBase = [
                { id_empresa: window.miEmpresaId, nombre: 'Dueño', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Admin', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Colaborador', es_predeterminado: true }
            ];
            const { data: nuevosRoles, error: insertError } = await clienteSupabase.from('roles').insert(rolesBase).select();
            if (insertError) throw insertError;
            roles = nuevosRoles;
        }

        dibujarListaRoles(roles);

        // Activamos los acordeones (el toggle para colapsar/expandir)
        activarAcordeonesPermisos();

        // Seleccionar primer rol
        if (roles.length > 0) seleccionarRol(roles[0].id, roles[0].nombre, roles[0].es_predeterminado);

    } catch (err) {
        console.error("Error cargando panel:", err.message);
    }
};

function dibujarListaRoles(roles) {
    const listaHtml = document.getElementById('lista-roles-parametros');
    if (!listaHtml) return;
    listaHtml.innerHTML = roles.map(rol => {
        const esDueno = rol.nombre.toLowerCase() === 'dueño' || rol.nombre.toLowerCase() === 'dueno';
        const claseLi = esDueno ? "p-3 bg-emerald-50 border border-emerald-300 rounded-lg cursor-pointer flex justify-between items-center shadow-sm" : "p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 flex justify-between items-center transition-colors";
        const claseTexto = esDueno ? "font-bold text-emerald-900" : "font-bold text-slate-700";
        const badge = esDueno ? `<span class="text-[10px] bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-700 font-bold">Todo el acceso</span>` : `<span class="text-[10px] bg-white px-2 py-1 rounded border text-slate-500 font-bold">Ver permisos ➔</span>`;
        return `<li id="li-rol-${rol.id}" onclick="seleccionarRol('${rol.id}', '${rol.nombre}', ${rol.es_predeterminado})" class="${claseLi} mb-2"><span class="${claseTexto}">${rol.nombre}</span>${badge}</li>`;
    }).join('');
}

// ==========================================
// 2. SELECCIÓN Y CARGA DE PERMISOS (TOGGLES)
// ==========================================
window.seleccionarRol = async function(idRol, nombreRol, esPredeterminado) {
    window.rolActivoId = idRol;
    
    // Título columna derecha
    const tituloDerecho = document.getElementById('nombre-rol-activo');
    if(tituloDerecho) tituloDerecho.innerText = nombreRol;

    // Resaltado visual de la lista
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => li.classList.remove('ring-2', 'ring-emerald-500', 'shadow-md'));
    document.getElementById(`li-rol-${idRol}`)?.classList.add('ring-2', 'ring-emerald-500', 'shadow-md');

    const toggles = document.querySelectorAll('.toggle-permiso');
    const maestros = document.querySelectorAll('.toggle-maestro');
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    
    // Reseteamos todo (apagado y desbloqueado)
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        // Bloqueamos todo para el dueño (siempre ON)
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        btnGuardar?.classList.replace('bg-emerald-600', 'bg-slate-300');
        if(btnGuardar) btnGuardar.disabled = true;
        return; 
    } else {
        btnGuardar?.classList.replace('bg-slate-300', 'bg-emerald-600');
        if(btnGuardar) btnGuardar.disabled = false;
    }

    // 🔍 MAGIA: Cargar permisos reales de Supabase
    try {
        const { data: permisos, error } = await clienteSupabase.from('permisos_roles').select('modulo, puede_ver').eq('id_rol', idRol);
        if (error) throw error;

        if (permisos && permisos.length > 0) {
            permisos.forEach(p => {
                // Buscamos si es un interruptor maestro
                const maestro = document.querySelector(`.toggle-maestro[value="${p.modulo}"]`);
                if(maestro && p.puede_ver) maestro.checked = true;

                // Buscamos si es un interruptor granular (toggle-permiso)
                const granular = document.querySelector(`.toggle-permiso[value="${p.modulo}"]`);
                if(granular && p.puede_ver) granular.checked = true;
            });
        }
        
        // Ejecutamos la inteligencia maestro-hijo para bloquear los que correspondan
        maestros.forEach(m => window.sincronizarMaestroHijo(m.value));

    } catch (err) {
        console.error("Error al cargar permisos:", err.message);
    }
};

// ==========================================
// 3. INTELIGENCIA DE ACORDEONES Y MAESTROS
// ==========================================

// Cableado para expandir/colapsar al hacer clic en el título de la categoría
function activarAcordeonesPermisos() {
    document.querySelectorAll('.btn-acordeon').forEach(boton => {
        boton.onclick = function() {
            const containerHijos = document.getElementById(`conteo-${this.dataset.categoria}`);
            const icono = this.querySelector('.icono-flecha');
            
            // Togleamos la visibilidad (hidden de Tailwind)
            containerHijos.classList.toggle('hidden');
            
            // Rotamos la flecha
            if (containerHijos.classList.contains('hidden')) {
                icono.innerText = '+';
            } else {
                icono.innerText = '-';
            }
        }
    });
}

// Inteligencia: Si apagas el maestro, apagas y bloqueas los hijos.
window.sincronizarMaestroHijo = function(categoriaMaster) {
    const interruptorMaestro = document.querySelector(`.toggle-maestro[value="${categoriaMaster}"]`);
    if (!interruptorMaestro) return;

    // Buscamos la lista de cables granulares asociados a esta categoría master
    const permisosHijosIds = MAPA_PERMISOS[categoriaMaster] || [];
    const maestroEncendido = interruptorMaestro.checked;

    permisosHijosIds.forEach(idHijo => {
        const inputHijo = document.querySelector(`.toggle-permiso[value="${idHijo}"]`);
        if(inputHijo) {
            // Si el maestro está apagado, apagamos y bloqueamos el hijo
            if (!maestroEncendido) {
                inputHijo.checked = false;
                inputHijo.disabled = true;
                // Le damos un aspecto visual de bloqueado a la cajita
                inputHijo.closest('.permiso-label')?.classList.add('opacity-50', 'bg-slate-50', 'cursor-not-allowed');
                inputHijo.closest('.permiso-label')?.classList.remove('cursor-pointer', 'bg-white');
            } else {
                // Si el maestro está encendido, habilitamos el hijo para que el dueño decida
                inputHijo.disabled = false;
                 inputHijo.closest('.permiso-label')?.classList.remove('opacity-50', 'bg-slate-50', 'cursor-not-allowed');
                 inputHijo.closest('.permiso-label')?.classList.add('cursor-pointer', 'bg-white');
            }
        }
    });
}

// ==========================================
// 4. GUARDAR LOS PERMISOS GRANULARES
// ==========================================
window.guardarPermisosRol = async function() {
    if (!window.rolActivoId) return alert("Por favor, selecciona un rol.");

    const btnGuardar = document.getElementById('btn-guardar-permisos');
    btnGuardar.innerText = "Guardando..."; 
    btnGuardar.disabled = true;

    // Recolectar interruptores maestros
    const maestros = document.querySelectorAll('.toggle-maestro');
    // Recolectar interruptores granulares
    const toggles = document.querySelectorAll('.toggle-permiso');
    const permisosToSave = [];

    // Empaquetar maestros
    maestros.forEach(t => permisosToSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));
    // Empaquetar granulares
    toggles.forEach(t => permisosToSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));

    try {
        // Truco: Borrar lo viejo de este rol y meter lo nuevo limpio
        await clienteSupabase.from('permisos_roles').delete().eq('id_rol', window.rolActivoId);
        
        if (permisosToSave.length > 0) {
            const { error } = await clienteSupabase.from('permisos_roles').insert(permisosToSave);
            if (error) throw error;
        }
        alert("✅ ¡Permisos granulares guardados con éxito!");
    } catch (err) {
        console.error("Error guardando permisos:", err.message);
        alert("Hubo un error al guardar.");
    } finally {
        btnGuardar.innerText = "Guardar Cambios"; 
        btnGuardar.disabled = false;
    }
};

// ==========================================
// 5. CREAR UN ROL NUEVO
// ==========================================
window.abrirModalNuevoRol = function() {
    document.getElementById('input-nombre-rol').value = '';
    document.getElementById('modal-nuevo-rol').classList.remove('hidden');
}
window.cerrarModalNuevoRol = function() {
    document.getElementById('modal-nuevo-rol').classList.add('hidden');
}
window.guardarNuevoRol = async function() {
    const nombreRol = document.getElementById('input-nombre-rol').value.trim();
    if (!nombreRol) return alert("Por favor, ingresa un nombre para el rol.");
    try {
        const { data, error } = await clienteSupabase.from('roles').insert([{ id_empresa: window.miEmpresaId, nombre: nombreRol, es_predeterminado: false }]);
        if (error) throw error;
        cerrarModalNuevoRol();
        window.cargarParametros(); 
    } catch (err) {
        console.error("Error creando rol:", err.message);
        alert("Hubo un error.");
    }
}