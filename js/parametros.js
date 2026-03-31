// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 3.4 - FIX MAESTROS Y GUARDADO)
// ============================================================================

const MAPA_PERMISOS = {
    admin: ['admin_empresa', 'admin_seguridad'],
    ventas: ['ventas_pos', 'ventas_descuentos', 'ventas_cierre', 'ventas_cxc', 'ventas_cotizaciones', 'ventas_ranking'],
    inventario: ['inventario_stock', 'inventario_ajustes', 'inventario_pedidos', 'inventario_movimientos', 'inventario_recetas'],
    reportes: ['reportes_valorizacion', 'reportes_kardex', 'reportes_historial'],
    catalogos: ['catalogos_productos', 'catalogos_categorias', 'catalogos_unidades', 'catalogos_proveedores', 'catalogos_tipos_mov', 'catalogos_sucursales', 'catalogos_ubicaciones', 'catalogos_clientes']
};

window.rolActivoId = null;
let hayCambiosSinGuardar = false; // Variable para controlar el botón Guardar

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
        activarEscuchasDeCambios(); // Nueva función para detectar cambios

        const adminRole = roles.find(r => r.nombre === 'Admin');
        const colabRole = roles.find(r => r.nombre === 'Colaborador');

        // FORZAR PERMISOS BASE SI ESTÁN EN BLANCO (Solo se ejecuta 1 vez por empresa nueva)
        if (adminRole) {
            const { count } = await clienteSupabase.from('permisos_roles').select('*', { count: 'exact', head: true }).eq('id_rol', adminRole.id);
            if (count === 0) {
                let permisosFuerza = [];
                // Admin: Todo ON, incluyendo Administración (como pediste)
                Object.keys(MAPA_PERMISOS).forEach(master => {
                    permisosFuerza.push({ id_rol: adminRole.id, modulo: master, puede_ver: true });
                    MAPA_PERMISOS[master].forEach(hijo => permisosFuerza.push({ id_rol: adminRole.id, modulo: hijo, puede_ver: true }));
                });
                // Colaborador: Todo ON menos Admin y Recetas
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
    hayCambiosSinGuardar = false; // Reseteamos al cambiar de rol
    actualizarBotonGuardar(); // Actualiza estado visual del botón
    
    document.getElementById('nombre-rol-activo').innerText = nombreRol;
    
    // Pintamos de negro SOLO el rol al que le hicimos clic
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => {
        li.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-white hover:bg-slate-50 text-slate-700 border-l-4 border-transparent";
    });
    const liActivo = document.getElementById(`li-rol-${idRol}`);
    if(liActivo) {
        liActivo.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-slate-900 text-white border-l-4 border-emerald-500 shadow-sm";
    }

    const toggles = document.querySelectorAll('.toggle-permiso');
    const maestros = document.querySelectorAll('.toggle-maestro');
    
    // Apagar todo visualmente antes de cargar
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });
    document.querySelectorAll('.permiso-label').forEach(l => l.classList.remove('opacity-40', 'cursor-not-allowed'));

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        // DUEÑO: Todo bloqueado en ON
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        return; 
    }

    // CARGAR PERMISOS DESDE SUPABASE
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
        // Aplicar bloqueos visuales según estado inicial
        maestros.forEach(m => window.sincronizarMaestroHijo(m.value, false));
    } catch (err) { console.error(err); }
};

// ==========================================
// INTELIGENCIA DE ACORDEONES, MAESTROS Y BOTÓN GUARDAR
// ==========================================
function activarAcordeonesPermisos() {
    document.querySelectorAll('.btn-acordeon').forEach(boton => {
        boton.onclick = function() {
            const container = document.getElementById(`conteo-${this.dataset.categoria}`);
            const icono = this.querySelector('.icono-flecha');
            container.classList.toggle('hidden');
            icono.innerText = container.classList.contains('hidden') ? '▼' : '▲';
        }
    });
}

function activarEscuchasDeCambios() {
    // Escuchar Maestros
    document.querySelectorAll('.toggle-maestro').forEach(maestro => {
        maestro.addEventListener('change', function() {
            hayCambiosSinGuardar = true;
            actualizarBotonGuardar();
            window.sincronizarMaestroHijo(this.value, true); // true = Fue click manual
        });
    });

    // Escuchar Sub-Permisos (Hijos)
    document.querySelectorAll('.toggle-permiso').forEach(hijo => {
        hijo.addEventListener('change', function() {
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

// Lógica de Sincronización Maestro-Hijo
window.sincronizarMaestroHijo = function(categoriaMaster, fueClickManual = false) {
    const maestro = document.querySelector(`.toggle-maestro[value="${categoriaMaster}"]`);
    if (!maestro) return;
    
    const isON = maestro.checked;
    const hijos = MAPA_PERMISOS[categoriaMaster] || [];

    hijos.forEach(idHijo => {
        const inputHijo = document.querySelector(`.toggle-permiso[value="${idHijo}"]`);
        if (inputHijo) {
            const label = inputHijo.closest('.permiso-label');
            if (!isON) {
                inputHijo.checked = false; 
                inputHijo.disabled = true;
                if(label) label.classList.add('opacity-40', 'cursor-not-allowed');
            } else {
                if (document.getElementById('nombre-rol-activo').innerText.toLowerCase() !== 'dueño') {
                    inputHijo.disabled = false;
                }
                if(label) label.classList.remove('opacity-40', 'cursor-not-allowed');
                
                if (fueClickManual) {
                    inputHijo.checked = true;
                }
            }
        }
    });
}

// ==========================================
// GUARDAR PERMISOS Y CREAR ROLES
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
        
        // Exito
        hayCambiosSinGuardar = false;
        actualizarBotonGuardar();
        
        // Usamos una notificación pequeña en vez de un 'alert' invasivo si es posible, pero mantenemos alert por ahora por simplicidad
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