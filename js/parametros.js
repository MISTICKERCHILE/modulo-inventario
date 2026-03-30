// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 3.2 - PLANTILLAS BASE)
// ============================================================================

const MAPA_PERMISOS = {
    admin: ['admin_empresa', 'admin_seguridad'],
    ventas: ['ventas_pos', 'ventas_descuentos', 'ventas_cierre', 'ventas_cxc', 'ventas_cotizaciones', 'ventas_ranking'],
    inventario: ['inventario_stock', 'inventario_ajustes', 'inventario_pedidos', 'inventario_movimientos', 'inventario_recetas'],
    reportes: ['reportes_valorizacion', 'reportes_kardex', 'reportes_historial'],
    catalogos: ['catalogos_productos', 'catalogos_categorias', 'catalogos_unidades', 'catalogos_proveedores', 'catalogos_tipos_mov', 'catalogos_sucursales', 'catalogos_ubicaciones', 'catalogos_clientes']
};

window.rolActivoId = null;

// ==========================================
// 1. CARGA INICIAL Y DIBUJO DE ROLES
// ==========================================
window.cargarParametros = async function() {
    if (!window.miEmpresaId) return;

    try {
        let { data: roles, error } = await clienteSupabase.from('roles').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: true });
        if (error) throw error;

        // Si la empresa es nueva y no tiene roles, creamos los 3 base con sus permisos por defecto
        if (!roles || roles.length === 0) {
            console.log("Inyectando Plantilla Base de Roles y Permisos...");
            const rolesBase = [
                { id_empresa: window.miEmpresaId, nombre: 'Dueño', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Admin', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Colaborador', es_predeterminado: true }
            ];
            
            const { data: nuevosRoles, error: insertError } = await clienteSupabase.from('roles').insert(rolesBase).select();
            if (insertError) throw insertError;
            roles = nuevosRoles;

            // PREPARAMOS LA PLANTILLA DE PERMISOS ("El Desde")
            const adminId = roles.find(r => r.nombre === 'Admin').id;
            const colabId = roles.find(r => r.nombre === 'Colaborador').id;
            let permisosDefecto = [];

            // Al ADMIN le damos todo encendido por defecto
            Object.keys(MAPA_PERMISOS).forEach(master => {
                permisosDefecto.push({ id_rol: adminId, modulo: master, puede_ver: true });
                MAPA_PERMISOS[master].forEach(hijo => permisosDefecto.push({ id_rol: adminId, modulo: hijo, puede_ver: true }));
            });

            // Al COLABORADOR le damos solo lo básico (Ventas POS y Ver Stock)
            permisosDefecto.push({ id_rol: colabId, modulo: 'ventas', puede_ver: true });
            permisosDefecto.push({ id_rol: colabId, modulo: 'ventas_pos', puede_ver: true });
            permisosDefecto.push({ id_rol: colabId, modulo: 'inventario', puede_ver: true });
            permisosDefecto.push({ id_rol: colabId, modulo: 'inventario_stock', puede_ver: true });

            // Inyectamos a la base de datos
            await clienteSupabase.from('permisos_roles').insert(permisosDefecto);
        }

        dibujarListaRoles(roles);
        activarAcordeonesPermisos();

        // Seleccionamos por defecto al Admin (no al dueño) para que el usuario pueda jugar con los botones de inmediato
        const rolParaSeleccionar = roles.find(r => r.nombre === 'Admin') || roles[0];
        seleccionarRol(rolParaSeleccionar.id, rolParaSeleccionar.nombre, rolParaSeleccionar.es_predeterminado);

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
        const badge = esDueno ? `<span class="text-[10px] bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-700 font-bold">Todo el acceso</span>` : `<span class="text-[10px] bg-white px-2 py-1 rounded border text-slate-500 font-bold">Editar ➔</span>`;
        return `<li id="li-rol-${rol.id}" onclick="seleccionarRol('${rol.id}', '${rol.nombre}', ${rol.es_predeterminado})" class="${claseLi} mb-2"><span class="${claseTexto}">${rol.nombre}</span>${badge}</li>`;
    }).join('');
}

// ==========================================
// 2. SELECCIÓN Y CARGA DE PERMISOS
// ==========================================
window.seleccionarRol = async function(idRol, nombreRol, esPredeterminado) {
    window.rolActivoId = idRol;
    
    document.getElementById('nombre-rol-activo').innerText = nombreRol;
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => li.classList.remove('ring-2', 'ring-emerald-500', 'shadow-md'));
    document.getElementById(`li-rol-${idRol}`)?.classList.add('ring-2', 'ring-emerald-500', 'shadow-md');

    const toggles = document.querySelectorAll('.toggle-permiso');
    const maestros = document.querySelectorAll('.toggle-maestro');
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    
    // Apagamos todo para resetear el lienzo
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });

    // Restauramos estilo visual (por si veníamos de un rol bloqueado)
    document.querySelectorAll('.permiso-label').forEach(label => {
        label.classList.remove('opacity-50', 'bg-slate-50', 'cursor-not-allowed');
        label.classList.add('cursor-pointer', 'bg-white');
    });

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        // FORZAMOS AL DUEÑO A TENER TODO ENCENDIDO Y BLOQUEADO VISUALMENTE
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        if(btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.classList.replace('bg-emerald-600', 'bg-slate-300');
            btnGuardar.innerHTML = "🔒 Nivel Dios (Intocable)";
        }
        return; 
    } else {
        if(btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.replace('bg-slate-300', 'bg-emerald-600');
            btnGuardar.innerHTML = "<span>💾</span> Guardar Cambios";
        }
    }

    // Buscar en BD
    try {
        const { data: permisos, error } = await clienteSupabase.from('permisos_roles').select('modulo, puede_ver').eq('id_rol', idRol);
        if (error) throw error;

        if (permisos && permisos.length > 0) {
            permisos.forEach(p => {
                const maestro = document.querySelector(`.toggle-maestro[value="${p.modulo}"]`);
                if(maestro && p.puede_ver) maestro.checked = true;

                const granular = document.querySelector(`.toggle-permiso[value="${p.modulo}"]`);
                if(granular && p.puede_ver) granular.checked = true;
            });
        }
        
        // Ejecutamos inteligencia de bloqueo
        maestros.forEach(m => window.sincronizarMaestroHijo(m.value));

    } catch (err) {
        console.error("Error al cargar permisos:", err.message);
    }
};

// ==========================================
// 3. INTELIGENCIA DE ACORDEONES Y MAESTROS
// ==========================================
function activarAcordeonesPermisos() {
    document.querySelectorAll('.btn-acordeon').forEach(boton => {
        boton.onclick = function() {
            const containerHijos = document.getElementById(`conteo-${this.dataset.categoria}`);
            const icono = this.querySelector('.icono-flecha');
            containerHijos.classList.toggle('hidden');
            icono.innerText = containerHijos.classList.contains('hidden') ? '+' : '-';
        }
    });
}

window.sincronizarMaestroHijo = function(categoriaMaster) {
    const interruptorMaestro = document.querySelector(`.toggle-maestro[value="${categoriaMaster}"]`);
    if (!interruptorMaestro) return;

    const permisosHijosIds = MAPA_PERMISOS[categoriaMaster] || [];
    const maestroEncendido = interruptorMaestro.checked;

    permisosHijosIds.forEach(idHijo => {
        const inputHijo = document.querySelector(`.toggle-permiso[value="${idHijo}"]`);
        if (inputHijo) {
            const labelPadre = inputHijo.closest('.permiso-label');
            if (!maestroEncendido) {
                inputHijo.checked = false;
                inputHijo.disabled = true;
                if (labelPadre) {
                    labelPadre.classList.add('opacity-50', 'bg-slate-50', 'cursor-not-allowed');
                    labelPadre.classList.remove('cursor-pointer', 'bg-white');
                }
            } else {
                if (document.getElementById('nombre-rol-activo').innerText.toLowerCase() !== 'dueño') {
                    inputHijo.disabled = false;
                }
                if (labelPadre) {
                    labelPadre.classList.remove('opacity-50', 'bg-slate-50', 'cursor-not-allowed');
                    labelPadre.classList.add('cursor-pointer', 'bg-white');
                }
            }
        }
    });
}

// ==========================================
// 4. GUARDAR LOS PERMISOS
// ==========================================
window.guardarPermisosRol = async function() {
    if (!window.rolActivoId) return;
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    btnGuardar.innerText = "Guardando..."; btnGuardar.disabled = true;

    const maestros = document.querySelectorAll('.toggle-maestro');
    const toggles = document.querySelectorAll('.toggle-permiso');
    const permisosToSave = [];

    maestros.forEach(t => permisosToSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));
    toggles.forEach(t => permisosToSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));

    try {
        await clienteSupabase.from('permisos_roles').delete().eq('id_rol', window.rolActivoId);
        if (permisosToSave.length > 0) await clienteSupabase.from('permisos_roles').insert(permisosToSave);
        alert("✅ ¡Permisos guardados con éxito!");
    } catch (err) {
        alert("Hubo un error al guardar.");
    } finally {
        btnGuardar.innerHTML = "<span>💾</span> Guardar Cambios"; btnGuardar.disabled = false;
    }
};

window.abrirModalNuevoRol = function() { document.getElementById('modal-nuevo-rol').classList.remove('hidden'); }
window.cerrarModalNuevoRol = function() { document.getElementById('modal-nuevo-rol').classList.add('hidden'); }
window.guardarNuevoRol = async function() {
    const n = document.getElementById('input-nombre-rol').value.trim();
    if (!n) return;
    await clienteSupabase.from('roles').insert([{ id_empresa: window.miEmpresaId, nombre: n, es_predeterminado: false }]);
    cerrarModalNuevoRol(); window.cargarParametros(); 
}