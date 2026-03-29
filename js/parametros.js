// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 2.0 - RBAC)
// ============================================================================

// Variables globales para esta pantalla
window.rolActivoId = null;

// ==========================================
// 1. CARGA INICIAL Y DIBUJO DE ROLES
// ==========================================

window.cargarParametros = async function() {
    console.log("⚙️ Cargando panel de Parámetros...");
    if (!window.miEmpresaId) {
        console.error("No hay empresa seleccionada.");
        return;
    }

    try {
        // 1. Vamos a buscar los roles de esta empresa a Supabase
        let { data: roles, error } = await clienteSupabase
            .from('roles')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // 2. Si la empresa no tiene NINGÚN rol (ej: empresa recién creada), 
        // le inyectamos los 3 roles fundacionales por defecto.
        if (!roles || roles.length === 0) {
            console.log("No se encontraron roles. Creando los 3 predeterminados...");
            const rolesBase = [
                { id_empresa: window.miEmpresaId, nombre: 'Dueño', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Admin', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Colaborador', es_predeterminado: true }
            ];
            
            const { data: nuevosRoles, error: insertError } = await clienteSupabase
                .from('roles')
                .insert(rolesBase)
                .select(); // El .select() hace que nos devuelva los IDs recién creados
                
            if (insertError) throw insertError;
            roles = nuevosRoles;
        }

        // 3. Dibujamos los roles en la lista HTML (Columna izquierda)
        dibujarListaRoles(roles);

        // 4. Por defecto, seleccionamos automáticamente el primer rol de la lista para mostrar sus permisos
        if (roles.length > 0) {
            seleccionarRol(roles[0].id, roles[0].nombre, roles[0].es_predeterminado);
        }

    } catch (err) {
        console.error("Error al cargar roles:", err.message);
        alert("Hubo un problema al cargar los roles. Revisa la consola.");
    }
};

function dibujarListaRoles(roles) {
    const listaHtml = document.getElementById('lista-roles-parametros');
    if (!listaHtml) return;

    listaHtml.innerHTML = roles.map(rol => {
        // Si es el Dueño, le ponemos un diseño especial verde. Si es otro, diseño normal gris.
        const esDueno = rol.nombre.toLowerCase() === 'dueño' || rol.nombre.toLowerCase() === 'dueno';
        const claseLi = esDueno 
            ? "p-3 bg-emerald-50 border border-emerald-300 rounded-lg cursor-pointer flex justify-between items-center shadow-sm"
            : "p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 flex justify-between items-center transition-colors";
        
        const claseTexto = esDueno ? "font-bold text-emerald-900" : "font-bold text-slate-700";
        
        const badge = esDueno 
            ? `<span class="text-[10px] bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-700 font-bold">Todo el acceso</span>`
            : `<span class="text-[10px] bg-white px-2 py-1 rounded border text-slate-500 font-bold">Ver permisos ➔</span>`;

        return `
            <li id="li-rol-${rol.id}" onclick="seleccionarRol('${rol.id}', '${rol.nombre}', ${rol.es_predeterminado})" class="${claseLi} mb-2">
                <span class="${claseTexto}">${rol.nombre}</span>
                ${badge}
            </li>
        `;
    }).join('');
}


// ==========================================
// 2. SELECCIÓN Y CARGA DE PERMISOS (TOGGLES)
// ==========================================

window.seleccionarRol = async function(idRol, nombreRol, esPredeterminado) {
    window.rolActivoId = idRol;
    
    // Cambiamos el título en la columna derecha
    const tituloDerecho = document.getElementById('nombre-rol-activo');
    if(tituloDerecho) tituloDerecho.innerText = nombreRol;

    // Resaltamos visualmente el rol seleccionado en la lista izquierda
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => {
        li.classList.remove('ring-2', 'ring-emerald-500', 'shadow-md');
    });
    const liActivo = document.getElementById(`li-rol-${idRol}`);
    if(liActivo) liActivo.classList.add('ring-2', 'ring-emerald-500', 'shadow-md');

    // ¿Es el dueño? Apagamos los botones porque el dueño siempre tiene acceso a todo.
    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';
    const toggles = document.querySelectorAll('.toggle-permiso');
    const btnGuardar = document.getElementById('btn-guardar-permisos');

    if (esDueno) {
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        if(btnGuardar) btnGuardar.disabled = true;
        if(btnGuardar) btnGuardar.classList.replace('bg-emerald-600', 'bg-slate-300');
        return; // Detenemos aquí, no necesitamos consultar la BD para el dueño.
    } else {
        toggles.forEach(t => { t.checked = false; t.disabled = false; });
        if(btnGuardar) btnGuardar.disabled = false;
        if(btnGuardar) btnGuardar.classList.replace('bg-slate-300', 'bg-emerald-600');
    }

    // ACÁ PRONTO AGREGAREMOS LA BÚSQUEDA DE PERMISOS (LOS TOGGLES)
    console.log(`Cargando toggles para el rol: ${nombreRol} (ID: ${idRol})`);
};


// ==========================================
// 3. CREAR UN ROL NUEVO
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
    if (!nombreRol) {
        return alert("Por favor, ingresa un nombre para el rol.");
    }

    try {
        const { data, error } = await clienteSupabase
            .from('roles')
            .insert([{ 
                id_empresa: window.miEmpresaId, 
                nombre: nombreRol, 
                es_predeterminado: false 
            }]);

        if (error) throw error;

        // Cerramos el modal y recargamos la lista
        cerrarModalNuevoRol();
        window.cargarParametros(); // Volvemos a dibujar todo
        
    } catch (err) {
        console.error("Error al crear rol:", err.message);
        alert("Hubo un error al crear el rol.");
    }
}

// ==========================================
// 2. SELECCIÓN Y CARGA DE PERMISOS (TOGGLES)
// ==========================================

window.seleccionarRol = async function(idRol, nombreRol, esPredeterminado) {
    window.rolActivoId = idRol;
    
    // Cambiamos el título
    const tituloDerecho = document.getElementById('nombre-rol-activo');
    if(tituloDerecho) tituloDerecho.innerText = nombreRol;

    // Resaltamos visualmente
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => {
        li.classList.remove('ring-2', 'ring-emerald-500', 'shadow-md');
    });
    const liActivo = document.getElementById(`li-rol-${idRol}`);
    if(liActivo) liActivo.classList.add('ring-2', 'ring-emerald-500', 'shadow-md');

    const toggles = document.querySelectorAll('.toggle-permiso');
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    
    // Apagar todos los toggles por defecto antes de cargar
    toggles.forEach(t => { t.checked = false; t.disabled = false; });

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        if(btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.classList.replace('bg-emerald-600', 'bg-slate-300');
        }
        return; 
    } else {
        if(btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.replace('bg-slate-300', 'bg-emerald-600');
        }
    }

    // 🔍 MAGIA: Buscar los permisos guardados en Supabase
    try {
        const { data: permisos, error } = await clienteSupabase
            .from('permisos_roles')
            .select('modulo, puede_ver')
            .eq('id_rol', idRol);

        if (error) throw error;

        // Si encontramos permisos en la BD, encendemos esos interruptores
        if (permisos && permisos.length > 0) {
            permisos.forEach(p => {
                const toggle = document.querySelector(`.toggle-permiso[value="${p.modulo}"]`);
                if (toggle && p.puede_ver) toggle.checked = true;
            });
        }
    } catch (err) {
        console.error("Error al cargar los permisos de Supabase:", err.message);
    }
};

// ==========================================
// 4. GUARDAR LOS PERMISOS EN LA BASE DE DATOS
// ==========================================

window.guardarPermisosRol = async function() {
    if (!window.rolActivoId) {
        return alert("Por favor, selecciona un rol de la lista primero.");
    }

    const btnGuardar = document.getElementById('btn-guardar-permisos');
    btnGuardar.innerText = "Guardando..."; 
    btnGuardar.disabled = true;

    // Recolectar el estado de todos los interruptores
    const toggles = document.querySelectorAll('.toggle-permiso');
    const permisosToSave = [];

    toggles.forEach(toggle => {
        permisosToSave.push({
            id_rol: window.rolActivoId,
            modulo: toggle.value, // Ej: 'ventas', 'inventario'
            puede_ver: toggle.checked // true o false
        });
    });

    try {
        // Truco de base de datos: Borramos los permisos viejos de este rol y metemos los nuevos limpios
        await clienteSupabase.from('permisos_roles').delete().eq('id_rol', window.rolActivoId);
        
        if (permisosToSave.length > 0) {
            const { error } = await clienteSupabase.from('permisos_roles').insert(permisosToSave);
            if (error) throw error;
        }

        alert("✅ ¡Permisos guardados con éxito!");

    } catch (err) {
        console.error("Error al guardar permisos:", err.message);
        alert("Hubo un error al guardar los permisos.");
    } finally {
        btnGuardar.innerText = "Guardar Cambios"; 
        btnGuardar.disabled = false;
    }
};