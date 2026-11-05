// ============================================================================
// LÓGICA DE PARÁMETROS Y PERMISOS (VERSIÓN 4.0 - LA DEFINITIVA)
// ============================================================================

const MAPA_PERMISOS = {
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

    // --- NUEVAS LLAMADAS ---
    cargarMetodosPagoParametros();
    if (typeof cargarDestinatariosResumen === 'function') cargarDestinatariosResumen();
    if (typeof cargarVisibilidadMonitoreo === 'function') cargarVisibilidadMonitoreo();
    cargarAjusteStock();
    // -----------------------

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
        activarEscuchasDeCambios(); 

        const adminRole = roles.find(r => r.nombre === 'Admin');
        const colabRole = roles.find(r => r.nombre === 'Colaborador');

        // FORZAR PERMISOS BASE SI ESTÁN EN BLANCO
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
    const btnGuardar = document.getElementById('btn-guardar-permisos');
    
    toggles.forEach(t => { t.checked = false; t.disabled = false; });
    maestros.forEach(t => { t.checked = false; t.disabled = false; });
    document.querySelectorAll('.permiso-label').forEach(l => l.classList.remove('opacity-40', 'cursor-not-allowed'));

    const esDueno = nombreRol.toLowerCase() === 'dueño' || nombreRol.toLowerCase() === 'dueno';

    if (esDueno) {
        // DUEÑO: TODO PRENDIDO Y BLOQUEADO
        toggles.forEach(t => { t.checked = true; t.disabled = true; });
        maestros.forEach(t => { t.checked = true; t.disabled = true; });
        if(btnGuardar) { 
            btnGuardar.disabled = true; 
            btnGuardar.innerText = "Acceso Total (Intocable)"; 
            btnGuardar.classList.add('opacity-50', 'cursor-not-allowed'); 
        }
        return; 
    } else {
        if(btnGuardar) { 
            btnGuardar.innerText = "Guardar Cambios"; 
        }
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
        maestros.forEach(m => window.sincronizarMaestroHijo(m.value, false));
    } catch (err) { console.error(err); }
};

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
    // Usamos onchange nativo para evitar duplicados en la SPA
    document.querySelectorAll('.toggle-maestro').forEach(maestro => {
        maestro.onchange = function() {
            hayCambiosSinGuardar = true;
            actualizarBotonGuardar();
            window.sincronizarMaestroHijo(this.value, true);
        };
    });

    document.querySelectorAll('.toggle-permiso').forEach(hijo => {
        hijo.onchange = function() {
            hayCambiosSinGuardar = true;
            actualizarBotonGuardar();
        };
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

window.sincronizarMaestroHijo = function(categoriaMaster, autoEncender = false) {
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
                
                if (autoEncender) {
                    inputHijo.checked = true;
                }
            }
        }
    });
}

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

// ============================================================================
// LÓGICA DE MÉTODOS DE PAGO Y AJUSTES DE INVENTARIO
// ============================================================================

// --- 1. MÉTODOS DE PAGO (por sucursal) ---
window._mpEditando = null;
window._mpDatos = [];
window._mpSucursales = [];
window._mpAsignaciones = {};

window.cargarMetodosPagoParametros = async function() {
    try {
        const [mp, su, asg] = await Promise.all([
            clienteSupabase.from('metodos_pago').select('*').eq('id_empresa', window.miEmpresaId).eq('activo', true).order('created_at', { ascending: true }),
            clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
            clienteSupabase.from('metodos_pago_sucursales').select('id_metodo_pago, id_sucursal').eq('id_empresa', window.miEmpresaId)
        ]);
        if (mp.error) throw mp.error;
        const data = mp.data || [];
        window._mpDatos = data; window._mpSucursales = su.data || [];
        window._mpAsignaciones = {};
        (asg.data || []).forEach(a => (window._mpAsignaciones[a.id_metodo_pago] ||= []).push(a.id_sucursal));

        const tbody = document.getElementById('tabla-metodos-pago');
        if (!tbody) return;
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400 font-bold">Aún no hay métodos de pago configurados.</td></tr>';
            return;
        }
        const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        tbody.innerHTML = data.map(mp => {
            let icono = '🪙';
            if (mp.tipo === 'EFECTIVO') icono = '💵';
            if (mp.tipo === 'TARJETA') icono = '💳';
            if (mp.tipo === 'TRANSFERENCIA') icono = '📱';
            if (mp.tipo === 'CREDITO') icono = '📝';
            const ids = window._mpAsignaciones[mp.id] || [];
            const donde = ids.length ? ids.map(i => esc((window._mpSucursales.find(s => s.id === i) || {}).nombre || '—')).join(', ') : 'Todas las sucursales';
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-black text-slate-800">${icono} ${esc(mp.nombre)}</td>
                <td class="px-6 py-4"><span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-md text-xs font-bold border border-slate-200">${esc(mp.tipo)}</span></td>
                <td class="px-6 py-4">
                    <span class="font-bold text-slate-600">${esc(mp.moneda)}</span>
                    ${Number(mp.tasa_cambio) !== 1 ? `<span class="block text-[10px] text-blue-500 font-bold mt-0.5">Tasa: ×${mp.tasa_cambio}</span>` : ''}
                </td>
                <td class="px-6 py-4 text-xs text-slate-600 font-bold">${donde}</td>
                <td class="px-6 py-4 text-center whitespace-nowrap">
                    <button onclick="abrirModalNuevoMetodoPago('${mp.id}')" class="text-blue-600 hover:text-blue-800 font-bold text-sm px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors">Editar</button>
                    <button onclick="eliminarMetodoPago('${mp.id}')" class="text-red-400 hover:text-red-600 font-bold text-sm px-3 py-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors">Ocultar</button>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error("Error cargando métodos:", error);
    }
}

window.toggleSucursalesMetodo = function() {
    const algunas = document.querySelector('input[name="mp-donde"][value="algunas"]').checked;
    document.getElementById('mp-lista-sucursales').classList.toggle('hidden', !algunas);
}

window.abrirModalNuevoMetodoPago = (idEditar) => {
    const mp = typeof idEditar === 'string' ? window._mpDatos.find(m => m.id === idEditar) : null;
    window._mpEditando = mp ? mp.id : null;
    document.getElementById('input-mp-nombre').value = mp ? mp.nombre : '';
    if (mp) {
        document.getElementById('select-mp-tipo').value = mp.tipo;
        const sel = document.getElementById('select-mp-moneda');
        if (![...sel.options].some(o => o.value === mp.moneda)) sel.insertAdjacentHTML('beforeend', `<option value="${mp.moneda}">${mp.moneda}</option>`);
        sel.value = mp.moneda;
        document.getElementById('input-mp-tasa').value = mp.tasa_cambio;
    } else {
        document.getElementById('input-mp-tasa').value = 1;
    }
    window.verificarMonedaExtranjera();
    if (mp) document.getElementById('input-mp-tasa').value = mp.tasa_cambio;
    const ids = mp ? (window._mpAsignaciones[mp.id] || []) : [];
    document.querySelector(`input[name="mp-donde"][value="${ids.length ? 'algunas' : 'todas'}"]`).checked = true;
    document.getElementById('mp-lista-sucursales').innerHTML = window._mpSucursales.map(s =>
        `<label class="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" class="mp-chk-sucursal" value="${s.id}" ${ids.includes(s.id) ? 'checked' : ''}> ${String(s.nombre).replace(/</g, '&lt;')}</label>`).join('');
    window.toggleSucursalesMetodo();
    document.getElementById('modal-nuevo-metodo').classList.remove('hidden');
}

window.cerrarModalNuevoMetodoPago = () => {
    document.getElementById('modal-nuevo-metodo').classList.add('hidden');
}

window.guardarNuevoMetodoPago = async function() {
    const nombre = document.getElementById('input-mp-nombre').value.trim();
    const tipo = document.getElementById('select-mp-tipo').value;
    const moneda = document.getElementById('select-mp-moneda').value;
    const tasaInput = parseFloat(document.getElementById('input-mp-tasa').value);
    const tasaCambio = tasaInput > 0 ? tasaInput : 1;
    if (!nombre) return alert("⚠️ Debes ingresar un nombre para el método de pago.");

    const algunas = document.querySelector('input[name="mp-donde"][value="algunas"]').checked;
    const sucursales = algunas ? [...document.querySelectorAll('.mp-chk-sucursal:checked')].map(c => c.value) : [];
    if (algunas && !sucursales.length) return alert("⚠️ Elige al menos una sucursal, o marca 'En todas las sucursales'.");

    const btn = document.getElementById('btn-guardar-mp');
    btn.innerText = "⏳ Guardando..."; btn.disabled = true;
    try {
        const { error } = await clienteSupabase.rpc('guardar_metodo_pago', {
            p_id_empresa: window.miEmpresaId, p_id: window._mpEditando, p_nombre: nombre, p_tipo: tipo,
            p_moneda: moneda === 'OTRA' ? 'CLP' : moneda, p_tasa: tasaCambio, p_sucursales: sucursales });
        if (error) throw error;
        cerrarModalNuevoMetodoPago();
        cargarMetodosPagoParametros();
    } catch (error) {
        console.error("Error al guardar método:", error);
        alert("❌ No se pudo guardar: " + (error.message || 'error'));
    } finally {
        btn.innerText = "Guardar Método"; btn.disabled = false;
    }
}

window.verificarMonedaExtranjera = function() {
    const moneda = document.getElementById('select-mp-moneda').value;
    const divTasa = document.getElementById('div-tasa-cambio');
    if (moneda !== 'CLP') {
        divTasa.classList.remove('hidden');
    } else {
        divTasa.classList.add('hidden');
        document.getElementById('input-mp-tasa').value = 1;
    }
}

window.eliminarMetodoPago = async function(id) {
    if (!confirm("¿Ocultar esta forma de pago?\n\nDejará de aparecer en la caja, pero el historial de ventas y cierres que la usaron se conserva y se puede descargar.")) return;
    try {
        const { error } = await clienteSupabase.rpc('ocultar_metodo_pago', { p_id: id });
        if (error) throw error;
        cargarMetodosPagoParametros();
    } catch (error) {
        console.error("Error ocultando método:", error);
        alert("❌ " + (error.message || 'No se pudo ocultar.'));
    }
}

// --- 2. AJUSTES DE STOCK ---
window.cargarAjusteStock = async function() {
    try {
        const { data, error } = await clienteSupabase
            .from('empresas')
            .select('venta_sin_stock')
            .eq('id', window.miEmpresaId)
            .single();

        if (error) throw error;
        
        const toggle = document.getElementById('toggle-vender-sin-stock');
        if (toggle) toggle.checked = data.venta_sin_stock === true;
    } catch (error) {
        console.error("Error cargando ajuste de stock:", error);
    }
}

window.guardarParametroVentaSinStock = async function(valor) {
    try {
        const { error } = await clienteSupabase
            .from('empresas')
            .update({ venta_sin_stock: valor })
            .eq('id', window.miEmpresaId);

        if (error) throw error;
        
        // Pequeño aviso visual opcional
    } catch (error) {
        console.error("Error guardando stock:", error);
        alert("❌ Error al actualizar la configuración en la nube.");
        // Revertir el toggle visualmente si falló
        document.getElementById('toggle-vender-sin-stock').checked = !valor;
    }
}

// --- Resumen diario por correo: destinatarios ---
window.cargarDestinatariosResumen = async function() {
    const card = document.getElementById('card-resumen-correo'); if (!card) return;
    const admin = ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
    card.classList.toggle('hidden', !admin); if (!admin) return;
    const { data } = await clienteSupabase.from('resumen_destinatarios').select('id, correo').eq('id_empresa', window.miEmpresaId).order('created_at');
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    document.getElementById('lista-destinatarios').innerHTML = (data || []).map(d =>
        `<li class="py-2 flex justify-between items-center"><span class="font-bold text-slate-700">${esc(d.correo)}</span><button onclick="quitarDestinatarioResumen('${d.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold">Quitar</button></li>`).join('')
        || '<li class="py-2 text-slate-400">Aún no hay destinatarios: no se enviará ningún correo.</li>';
}
window.agregarDestinatarioResumen = async function() {
    const el = document.getElementById('input-destinatario');
    const { error } = await clienteSupabase.rpc('agregar_destinatario_resumen', { p_id_empresa: window.miEmpresaId, p_correo: el.value });
    if (error) return alert('❌ ' + error.message);
    el.value = ''; cargarDestinatariosResumen();
}
window.quitarDestinatarioResumen = async function(id) {
    const { error } = await clienteSupabase.rpc('quitar_destinatario_resumen', { p_id: id });
    if (error) return alert('❌ ' + error.message);
    cargarDestinatariosResumen();
}

// --- Mesa de monitoreo: quién ve cada panel ---
window.cargarVisibilidadMonitoreo = async function() {
    const card = document.getElementById('card-vis-monitoreo'); if (!card) return;
    const admin = ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
    card.classList.toggle('hidden', !admin); if (!admin) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const [pa, ro] = await Promise.all([
        clienteSupabase.from('lab_paneles').select('id, nombre, visible_para').eq('id_empresa', window.miEmpresaId).order('orden'),
        clienteSupabase.rpc('roles_equipo_lab', { p_id_empresa: window.miEmpresaId })
    ]);
    const roles = ro.data || [], paneles = pa.data || [];
    window._visRoles = roles;
    document.getElementById('lista-vis-monitoreo').innerHTML = paneles.map(p => {
        const modo = p.visible_para === null ? 'todos' : (p.visible_para.length ? 'roles' : 'admin');
        return `<div class="border rounded-xl p-4 space-y-2" data-panel="${p.id}"><p class="font-bold text-slate-800">${esc(p.nombre)}</p>
            <select onchange="visMonitoreoModo('${p.id}', this.value)" class="px-3 py-2 border rounded-lg bg-white text-sm" id="vis-modo-${p.id}">
                <option value="todos" ${modo === 'todos' ? 'selected' : ''}>Todo el equipo con acceso a Ventas</option>
                <option value="admin" ${modo === 'admin' ? 'selected' : ''}>Solo dueño y administradores</option>
                <option value="roles" ${modo === 'roles' ? 'selected' : ''}>Solo estos roles…</option></select>
            <div id="vis-roles-${p.id}" class="${modo === 'roles' ? '' : 'hidden'} flex flex-wrap gap-3">${roles.length ? roles.map(r => `<label class="flex items-center gap-1"><input type="checkbox" value="${esc(r)}" ${(p.visible_para || []).includes(r) ? 'checked' : ''}> ${esc(r)}</label>`).join('') : '<span class="text-xs text-slate-400">Aún no hay otros roles en tu equipo.</span>'}</div>
            <button onclick="guardarVisMonitoreo('${p.id}')" class="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Guardar</button></div>`;
    }).join('') || '<p class="text-slate-400">Aún no hay paneles. Créalos en Ventas → Mesa de monitoreo.</p>';
}
window.visMonitoreoModo = function(id, modo) { document.getElementById('vis-roles-' + id).classList.toggle('hidden', modo !== 'roles'); }
window.guardarVisMonitoreo = async function(id) {
    const modo = document.getElementById('vis-modo-' + id).value;
    const sel = [...document.querySelectorAll('#vis-roles-' + id + ' input:checked')].map(i => i.value);
    if (modo === 'roles' && !sel.length) return alert('Marca al menos un rol, o elige “Solo dueño y administradores”.');
    const { error } = await clienteSupabase.rpc('guardar_visibilidad_lab', { p_id_panel: id, p_visible: modo === 'todos' ? null : (modo === 'admin' ? [] : sel) });
    if (error) return alert('❌ ' + error.message);
    alert('✅ Guardado');
}
