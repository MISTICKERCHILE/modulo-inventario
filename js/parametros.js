// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 3.5 - MAESTROS REPARADOS)
// ============================================================================

const MAPA_PERMISOS = {
    // CORRECCIÓN: El maestro en el HTML se llama "admin", no "admin_empresa"
    admin: ['admin_empresa', 'admin_seguridad'],
    ventas: ['ventas_pos', 'ventas_descuentos', 'ventas_cierre', 'ventas_cxc', 'ventas_cotizaciones', 'ventas_ranking'],
    inventario: ['inventario_stock', 'inventario_ajustes', 'inventario_pedidos', 'inventario_movimientos', 'inventario_recetas'],
    reportes: ['reportes_valorizacion', 'reportes_kardex', 'reportes_historial'],
    catalogos: ['catalogos_productos', 'catalogos_categorias', 'catalogos_unidades', 'catalogos_proveedores', 'catalogos_tipos_mov', 'catalogos_sucursales', 'catalogos_ubicaciones', 'catalogos_clientes']
};

window.rolActivoId = null;
let hayCambiosSinGuardar = false;

window.cargarParametros = async function() {
    if (!window.miEmpresaId) return;

    try {
        let { data: roles } = await clienteSupabase.from('roles').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: true });
        
        if (!roles || roles.length === 0) {
            const rBase = [
                { id_empresa: window.miEmpresaId, nombre: 'Dueño', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Admin', es_predeterminado: true },
                { id_empresa: window.miEmpresaId, nombre: 'Colaborador', es_predeterminado: true }
            ];
            const { data: nRoles } = await clienteSupabase.from('roles').insert(rBase).select();
            roles = nRoles;
        }

        dibujarListaRoles(roles);
        activarAcordeonesPermisos();
        
        // ¡AQUÍ ESTÁ LA MAGIA REPARADA!
        activarEscuchasDeCambios(); 

        const adminRole = roles.find(r => r.nombre === 'Admin');
        const colabRole = roles.find(r => r.nombre === 'Colaborador');

        if (adminRole) {
            const { count } = await clienteSupabase.from('permisos_roles').select('*', { count: 'exact', head: true }).eq('id_rol', adminRole.id);
            if (count === 0) {
                let permisosFuerza = [];
                Object.keys(MAPA_PERMISOS).forEach(master => {
                    permisosFuerza.push({ id_rol: adminRole.id, modulo: master, puede_ver: true });
                    MAPA_PERMISOS[master].forEach(hijo => permisosFuerza.push({ id_rol: adminRole.id, modulo: hijo, puede_ver: true }));
                });
                Object.keys(MAPA_PERMISOS).forEach(master => {
                    if (master !== 'admin') {
                        permisosFuerza.push({ id_rol: colabRole.id, modulo: master, puede_ver: true });
                        MAPA_PERMISOS[master].forEach(hijo => {
                            if (hijo !== 'inventario_recetas') permisosFuerza.push({ id_rol: colabRole.id, modulo: hijo, puede_ver: true });
                        });
                    }
                });
                await clienteSupabase.from('permisos_roles').insert(permisosFuerza);
            }
        }

        const rolInicio = roles.find(r => r.nombre === 'Admin') || roles[0];
        seleccionarRol(rolInicio.id, rolInicio.nombre);

    } catch (err) {
        console.error("Error cargando panel:", err);
    }
};

function dibujarListaRoles(roles) {
    const listaHtml = document.getElementById('lista-roles-parametros');
    if (!listaHtml) return;
    listaHtml.innerHTML = roles.map(rol => {
        return `
            <li id="li-rol-${rol.id}" onclick="seleccionarRol('${rol.id}', '${rol.nombre}')" class="px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-white hover:bg-slate-50 text-slate-700 border-l-4 border-transparent">
                <span class="text-sm font-semibold">${rol.nombre}</span>
            </li>
        `;
    }).join('');
}

window.seleccionarRol = async function(idRol, nombreRol) {
    window.rolActivoId = idRol;
    hayCambiosSinGuardar = false; 
    actualizarBotonGuardar(); 
    
    document.getElementById('nombre-rol-activo').innerText = nombreRol;
    
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => {
        li.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-white hover:bg-slate-50 text-slate-700 border-l-4 border-transparent";
    });
    const liActivo = document.getElementById(`li-rol-${idRol}`);
    if(liActivo) {
        liActivo.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-slate-900 text-white border-l-4 border-emerald-500 shadow-sm";
    }

    const toggles = document.querySelectorAll('.toggle-permiso');
    const maestros = document.querySelectorAll('.toggle-maestro');
    
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });
    document.querySelectorAll('.permiso-label').forEach(l => l.classList.remove('opacity-40', 'cursor-not-allowed'));

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        return; 
    }

    try {
        const { data: permisos } = await clienteSupabase.from('permisos_roles').select('modulo, puede_ver').eq('id_rol', idRol);
        if (permisos && permisos.length > 0) {
            permisos.forEach(p => {
                const maestro = document.querySelector(`.toggle-maestro[value="${p.modulo}"]`);
                if(maestro && p.puede_ver) maestro.checked = true;
                const granular = document.querySelector(`.toggle-permiso[value="${p.modulo}"]`);
                if(granular && p.puede_ver) granular.checked = true;
            });
        }
        
        // Bloqueamos los hijos visualmente solo si el maestro está apagado
        maestros.forEach(m => {
            if (!m.checked) window.sincronizarMaestroHijo(m.value, false);
        });

    } catch (err) { console.error(err); }
};

// ==========================================
// EL MOTOR REPARADO DE LOS BOTONES MAESTROS
// ==========================================
function activarEscuchasDeCambios() {
    // 1. Escuchar los interruptores MAESTROS
    document.querySelectorAll('.toggle-maestro').forEach(maestro => {
        // Removemos cualquier listener viejo para que no se duplique
        const nuevoMaestro = maestro.cloneNode(true);
        maestro.parentNode.replaceChild(nuevoMaestro, maestro);
        
        nuevoMaestro.addEventListener('change', function(e) {
            console.log("Clic detectado en maestro:", this.value, "Estado:", this.checked);
            hayCambiosSinGuardar = true;
            actualizarBotonGuardar();
            window.sincronizarMaestroHijo(this.value, true);
        });
    });

    // 2. Escuchar los interruptores HIJOS
    document.querySelectorAll('.toggle-permiso').forEach(hijo => {
        const nuevoHijo = hijo.cloneNode(true);
        hijo.parentNode.replaceChild(nuevoHijo, hijo);

        nuevoHijo.addEventListener('change', function(e) {
            hayCambiosSinGuardar = true;
            actualizarBotonGuardar();
        });
    });
}

function actualizarBotonGuardar() {
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    if (!btnGuardar) return;

    if (hayCambiosSinGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        btnGuardar.disabled = true;
        btnGuardar.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

window.sincronizarMaestroHijo = function(categoriaMaster, autoEncenderHijos = false) {
    const maestro = document.querySelector(`.toggle-maestro[value="${categoriaMaster}"]`);
    if (!maestro) return;
    
    const isON = maestro.checked;
    const hijos = MAPA_PERMISOS[categoriaMaster] || [];

    hijos.forEach(idHijo => {
        const inputHijo = document.querySelector(`.toggle-permiso[value="${idHijo}"]`);
        if (inputHijo) {
            const label = inputHijo.closest('.permiso-label');
            
            if (!isON) {
                // APAGAR Y BLOQUEAR
                inputHijo.checked = false; 
                inputHijo.disabled = true;
                if(label) label.classList.add('opacity-40', 'cursor-not-allowed');
            } else {
                // ENCENDIDO: DESBLOQUEAR
                if (document.getElementById('nombre-rol-activo').innerText.toLowerCase() !== 'dueño') {
                    inputHijo.disabled = false;
                }
                if(label) label.classList.remove('opacity-40', 'cursor-not-allowed');
                
                // Si el clic fue manual en el maestro, encendemos todos los hijos automáticamente
                if (autoEncenderHijos) {
                    inputHijo.checked = true;
                }
            }
        }
    });
}

// ==========================================
// GUARDAR PERMISOS
// ==========================================
window.guardarPermisosRol = async function() {
    if (!window.rolActivoId) return;

    const nombreRol = document.getElementById('nombre-rol-activo').innerText.toLowerCase();
    if (nombreRol === 'dueño' || nombreRol === 'dueno') {
        return alert("Al ser el dueño no puedes modificar los permisos otorgados.");
    }

    const btn = document.getElementById('btn-guardar-permisos');
    btn.innerText = "Guardando..."; btn.disabled = true;

    const toSave = [];
    document.querySelectorAll('.toggle-maestro').forEach(t => toSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));
    document.querySelectorAll('.toggle-permiso').forEach(t => toSave.push({ id_rol: window.rolActivoId, modulo: t.value, puede_ver: t.checked }));

    try {
        await clienteSupabase.from('permisos_roles').delete().eq('id_rol', window.rolActivoId);
        if (toSave.length > 0) await clienteSupabase.from('permisos_roles').insert(toSave);
        
        hayCambiosSinGuardar = false;
        actualizarBotonGuardar();
        alert("✅ Configuración guardada exitosamente.");
    } catch (err) { 
        alert("Error al guardar."); 
    } finally { 
        btn.innerText = "Guardar Cambios"; 
        if (hayCambiosSinGuardar) btn.disabled = false;
    }
};

window.abrirModalNuevoRol = () => document.getElementById('modal-nuevo-rol').classList.remove('hidden');
window.cerrarModalNuevoRol = () => document.getElementById('modal-nuevo-rol').classList.add('hidden');
window.guardarNuevoRol = async () => {
    const n = document.getElementById('input-nombre-rol').value.trim();
    if (!n) return;
    await clienteSupabase.from('roles').insert([{ id_empresa: window.miEmpresaId, nombre: n, es_predeterminado: false }]);
    cerrarModalNuevoRol(); window.cargarParametros(); 
}