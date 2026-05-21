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

// --- 1. MÉTODOS DE PAGO ---
window.cargarMetodosPagoParametros = async function() {
    try {
        const { data, error } = await clienteSupabase
            .from('metodos_pago')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .eq('activo', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        const tbody = document.getElementById('tabla-metodos-pago');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 font-bold">Aún no hay métodos de pago configurados.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(mp => {
            let icono = '🪙';
            if (mp.tipo === 'EFECTIVO') icono = '💵';
            if (mp.tipo === 'TARJETA') icono = '💳';
            if (mp.tipo === 'TRANSFERENCIA') icono = '📱';
            if (mp.tipo === 'CREDITO') icono = '📝';

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-black text-slate-800">${icono} ${mp.nombre}</td>
                <td class="px-6 py-4"><span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-md text-xs font-bold border border-slate-200">${mp.tipo}</span></td>
                <td class="px-6 py-4 font-bold text-slate-500">${mp.moneda}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="eliminarMetodoPago('${mp.id}')" class="text-red-400 hover:text-red-600 font-bold text-sm px-3 py-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors">Ocultar / Borrar</button>
                </td>
            </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Error cargando métodos:", error);
    }
}

window.abrirModalNuevoMetodoPago = () => {
    document.getElementById('input-mp-nombre').value = '';
    document.getElementById('modal-nuevo-metodo').classList.remove('hidden');
}

window.cerrarModalNuevoMetodoPago = () => {
    document.getElementById('modal-nuevo-metodo').classList.add('hidden');
}

window.guardarNuevoMetodoPago = async function() {
    const nombre = document.getElementById('input-mp-nombre').value.trim();
    const tipo = document.getElementById('select-mp-tipo').value;
    const moneda = document.getElementById('select-mp-moneda').value;

    if (!nombre) return alert("⚠️ Debes ingresar un nombre para el método de pago.");

    const btn = document.getElementById('btn-guardar-mp');
    btn.innerText = "⏳ Guardando..."; 
    btn.disabled = true;

    try {
        const { error } = await clienteSupabase
            .from('metodos_pago')
            .insert([{
                id_empresa: window.miEmpresaId,
                nombre: nombre,
                tipo: tipo,
                moneda: moneda
            }]);

        if (error) throw error;
        
        cerrarModalNuevoMetodoPago();
        cargarMetodosPagoParametros(); // Recargar la tabla dinámicamente
    } catch (error) {
        console.error("Error al guardar método:", error);
        alert("❌ Error al guardar el método de pago.");
    } finally {
        btn.innerText = "Guardar Método"; 
        btn.disabled = false;
    }
}

window.eliminarMetodoPago = async function(id) {
    if (!confirm("🗑️ ¿Seguro que deseas eliminar este método de pago?\n\nNota: Los historiales de ventas anteriores con este método no se borrarán, solo dejará de aparecer como opción en la caja.")) return;

    try {
        // Hacemos un "Soft Delete" (solo lo desactivamos) para que la contabilidad antigua no explote
        const { error } = await clienteSupabase
            .from('metodos_pago')
            .update({ activo: false })
            .eq('id', id);

        if (error) throw error;
        cargarMetodosPagoParametros(); // Recargar la tabla dinámicamente
    } catch (error) {
        console.error("Error eliminando método:", error);
        alert("❌ Error al eliminar.");
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
        console.log(`Configuración actualizada: Vender sin stock = ${valor}`);
    } catch (error) {
        console.error("Error guardando stock:", error);
        alert("❌ Error al actualizar la configuración en la nube.");
        // Revertir el toggle visualmente si falló
        document.getElementById('toggle-vender-sin-stock').checked = !valor;
    }
}