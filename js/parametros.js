// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 3.3 - FIX SOMBREADO Y TOGGLES)
// ============================================================================

const MAPA_PERMISOS = {
    admin: ['admin_empresa', 'admin_seguridad'],
    ventas: ['ventas_pos', 'ventas_descuentos', 'ventas_cierre', 'ventas_cxc', 'ventas_cotizaciones', 'ventas_ranking'],
    inventario: ['inventario_stock', 'inventario_ajustes', 'inventario_pedidos', 'inventario_movimientos', 'inventario_recetas'],
    reportes: ['reportes_valorizacion', 'reportes_kardex', 'reportes_historial'],
    catalogos: ['catalogos_productos', 'catalogos_categorias', 'catalogos_unidades', 'catalogos_proveedores', 'catalogos_tipos_mov', 'catalogos_sucursales', 'catalogos_ubicaciones', 'catalogos_clientes']
};

window.rolActivoId = null;

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
        activarEventosMaestros(); // Conectamos los interruptores maestros con su inteligencia

        const adminRole = roles.find(r => r.nombre === 'Admin');
        const colabRole = roles.find(r => r.nombre === 'Colaborador');

        // FORZAR PERMISOS BASE SI ESTÁN EN BLANCO
        if (adminRole) {
            const { count } = await clienteSupabase.from('permisos_roles').select('*', { count: 'exact', head: true }).eq('id_rol', adminRole.id);
            if (count === 0) {
                let permisosFuerza = [];
                Object.keys(MAPA_PERMISOS).forEach(master => {
                    if (master !== 'admin') {
                        permisosFuerza.push({ id_rol: adminRole.id, modulo: master, puede_ver: true });
                        MAPA_PERMISOS[master].forEach(hijo => permisosFuerza.push({ id_rol: adminRole.id, modulo: hijo, puede_ver: true }));
                    }
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
    // FIX SOMBREADO: Todos nacen en blanco, la función seleccionarRol se encargará de pintarlos
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
    document.getElementById('nombre-rol-activo').innerText = nombreRol;
    
    // FIX SOMBREADO: Limpiamos todos los roles a color blanco
    document.querySelectorAll('#lista-roles-parametros li').forEach(li => {
        li.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-white hover:bg-slate-50 text-slate-700 border-l-4 border-transparent";
    });
    
    // FIX SOMBREADO: Pintamos de negro SOLO el rol al que le hicimos clic
    const liActivo = document.getElementById(`li-rol-${idRol}`);
    if(liActivo) {
        liActivo.className = "px-4 py-3 cursor-pointer flex justify-between items-center transition-colors bg-slate-900 text-white border-l-4 border-emerald-500 shadow-md";
    }

    const toggles = document.querySelectorAll('.toggle-permiso');
    const maestros = document.querySelectorAll('.toggle-maestro');
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    
    // Apagar todo visualmente antes de cargar
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });
    document.querySelectorAll('.permiso-label').forEach(l => l.classList.remove('opacity-40', 'cursor-not-allowed'));

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        // DUEÑO: Todo bloqueado en ON
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        if(btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerText = "Guardar Cambios"; btnGuardar.classList.remove('opacity-50', 'cursor-not-allowed'); }
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
        // Aplicar bloqueos visuales según lo que cargó la BD (sin auto-encender)
        maestros.forEach(m => window.sincronizarMaestroHijo(m.value, false));
    } catch (err) { console.error(err); }
};

// ==========================================
// INTELIGENCIA DE ACORDEONES Y MAESTROS
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

function activarEventosMaestros() {
    // Escuchamos cuando el usuario hace clic manualmente en un interruptor Maestro
    document.querySelectorAll('.toggle-maestro').forEach(maestro => {
        maestro.removeAttribute('onchange'); // Quitamos el onchange viejo del HTML por seguridad
        maestro.addEventListener('change', function() {
            window.sincronizarMaestroHijo(this.value, true); // true = Fue un click manual, auto-enciende los hijos
        });
    });
}

// FIX TOGGLES: Función que sincroniza maestros e hijos
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
                // Maestro APAGADO: Apagamos y bloqueamos hijos
                inputHijo.checked = false; 
                inputHijo.disabled = true;
                if(label) label.classList.add('opacity-40', 'cursor-not-allowed');
            } else {
                // Maestro ENCENDIDO: Desbloqueamos hijos
                if (document.getElementById('nombre-rol-activo').innerText.toLowerCase() !== 'dueño') {
                    inputHijo.disabled = false;
                }
                if(label) label.classList.remove('opacity-40', 'cursor-not-allowed');
                
                // MAGIA: Si el usuario prendió el maestro con un clic, prendemos todos los hijos automáticamente
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
        alert("✅ Configuración guardada exitosamente.");
    } catch (err) { alert("Error al guardar."); } 
    finally { btn.innerText = "Guardar Cambios"; btn.disabled = false; }
};

window.abrirModalNuevoRol = () => document.getElementById('modal-nuevo-rol').classList.remove('hidden');
window.cerrarModalNuevoRol = () => document.getElementById('modal-nuevo-rol').classList.add('hidden');
window.guardarNuevoRol = async () => {
    const n = document.getElementById('input-nombre-rol').value.trim();
    if (!n) return;
    await clienteSupabase.from('roles').insert([{ id_empresa: window.miEmpresaId, nombre: n, es_predeterminado: false }]);
    cerrarModalNuevoRol(); window.cargarParametros(); 
}