// ==========================================
// CEREBRO DE EDICIÓN GLOBAL (Previene recargas y errores)
// ==========================================
window.modoEdicion = { activo: false, id: null, form: null };

window.activarEdicionGlobal = function(formId, recordId, camposObj) {
    window.modoEdicion = { activo: true, id: recordId, form: formId };
    
    // Llenamos los campos del formulario con los datos del ítem
    for (const [idElemento, valor] of Object.entries(camposObj)) {
        const el = document.getElementById(idElemento);
        if (el) el.value = valor;
    }
    
    // Cambiamos el color y texto del botón para que el usuario sepa que está editando
    const form = document.getElementById(`form-${formId}`);
    if(form) {
        const btnSubmit = form.querySelector('button[type="submit"]');
        if(btnSubmit) {
            btnSubmit.innerText = 'Actualizar ✏️';
            btnSubmit.classList.replace('bg-slate-800', 'bg-blue-600');
        }
        const btnCancelar = document.getElementById(`btn-cancelar-${formId}`);
        if(btnCancelar) btnCancelar.classList.remove('hidden');
    }
};

window.cancelarEdicion = function(formId) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const form = document.getElementById(`form-${formId}`);
    if(form) {
        form.reset();
        const btnSubmit = form.querySelector('button[type="submit"]');
        if(btnSubmit) {
            btnSubmit.innerText = formId === 'proveedor' ? 'Guardar Proveedor' : (formId === 'sucursal' ? 'Guardar Sucursal' : (formId === 'ubicacion' ? 'Guardar Ubicación' : 'Guardar'));
            btnSubmit.classList.replace('bg-blue-600', 'bg-slate-800');
        }
        const btnCancelar = document.getElementById(`btn-cancelar-${formId}`);
        if(btnCancelar) btnCancelar.classList.add('hidden');
    }
};

// ==========================================
// DELEGADOR GLOBAL DE EVENTOS (Evita que la página se recargue)
// ==========================================
if (!window.eventosCatalogosAtados) {
    document.addEventListener('submit', async (e) => {
        
        // --- GUARDAR CATEGORÍA ---
        if (e.target.id === 'form-categoria') {
            e.preventDefault();
            const nombre = document.getElementById('nombre-categoria').value;
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'categoria') {
                res = await clienteSupabase.from('categorias').update({nombre}).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('categorias').insert([{id_empresa: window.miEmpresaId, nombre}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('categoria'); window.cargarCategorias();
        }
        
        // --- GUARDAR UNIDAD ---
        else if (e.target.id === 'form-unidad') {
            e.preventDefault();
            const nombre = document.getElementById('nombre-unidad').value;
            const abrev = document.getElementById('abrev-unidad').value;
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'unidad') {
                res = await clienteSupabase.from('unidades').update({nombre, abreviatura: abrev}).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('unidades').insert([{id_empresa: window.miEmpresaId, nombre, abreviatura: abrev}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('unidad'); window.cargarUnidades();
        }

        // --- GUARDAR PROVEEDOR ---
        else if (e.target.id === 'form-proveedor') {
            e.preventDefault();
            const tiempoInput = document.getElementById('tiempo-entrega').value;
            const payload = {
                nombre: document.getElementById('nombre-proveedor').value,
                tipo: document.getElementById('tipo-proveedor').value,
                whatsapp: document.getElementById('whatsapp-proveedor').value,
                correo: document.getElementById('correo-proveedor').value,
                lapso_entrega_dias: tiempoInput ? parseInt(tiempoInput) : null
            };
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'proveedor') {
                res = await clienteSupabase.from('proveedores').update(payload).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('proveedores').insert([{...payload, id_empresa: window.miEmpresaId}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('proveedor'); window.cargarProveedores();
        }

        // --- GUARDAR LISTA DE PRECIOS ---
        else if (e.target.id === 'form-precio-prov') {
            e.preventDefault();
            const idProd = document.getElementById('pp-producto').value;
            const precio = parseFloat(document.getElementById('pp-precio').value);
            const { data: previo } = await clienteSupabase.from('proveedor_precios').select('id').eq('id_proveedor', window.proveedorActivoPrecio).eq('id_producto', idProd).maybeSingle();
            let res;
            if(previo) {
                res = await clienteSupabase.from('proveedor_precios').update({precio_referencia: precio, fecha_actualizacion: new Date()}).eq('id', previo.id);
            } else {
                res = await clienteSupabase.from('proveedor_precios').insert([{id_empresa: window.miEmpresaId, id_proveedor: window.proveedorActivoPrecio, id_producto: idProd, precio_referencia: precio}]);
            }
            if (res && res.error) return alert("❌ Error BD: " + res.error.message);
            document.getElementById('pp-precio').value = ''; window.cargarTablaPreciosProv();
        }

        // --- GUARDAR SUCURSAL ---
        else if (e.target.id === 'form-sucursal') {
            e.preventDefault();
            const payload = {
                nombre: document.getElementById('nombre-sucursal').value,
                nombre_comercial: document.getElementById('comercial-sucursal').value,
                empresa_asociada: document.getElementById('empresa-sucursal').value,
                horarios_atencion: document.getElementById('horario-sucursal').value,
                direccion: document.getElementById('dir-sucursal').value
            };
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'sucursal') {
                res = await clienteSupabase.from('sucursales').update(payload).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('sucursales').insert([{...payload, id_empresa: window.miEmpresaId}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('sucursal'); window.cargarSucursales();
        }

        // --- GUARDAR UBICACIÓN ---
        else if (e.target.id === 'form-ubicacion') {
            e.preventDefault();
            const nombre = document.getElementById('nombre-ubicacion').value;
            const id_sucursal = document.getElementById('sel-sucursal-ubi').value;
            const res = await clienteSupabase.from('ubicaciones_internas').insert([{id_empresa: window.miEmpresaId, id_sucursal, nombre}]);
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('ubicacion'); window.cargarUbicaciones();
        }

        // --- GUARDAR TIPO DE MOVIMIENTO ---
        else if (e.target.id === 'form-tipo-movimiento') {
            e.preventDefault();
            const nombre = document.getElementById('nombre-tipo-mov').value;
            const operacion = document.getElementById('operacion-tipo-mov').value;
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'tipo-movimiento') {
                res = await clienteSupabase.from('tipos_movimiento').update({nombre, operacion}).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('tipos_movimiento').insert([{id_empresa: window.miEmpresaId, nombre, operacion}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('tipo-movimiento'); window.cargarTiposMovimiento();
        }

        // --- GUARDAR CLIENTE (CRM) ---
        else if (e.target.id === 'form-cliente') {
            e.preventDefault();
            const payload = {
                nombre: document.getElementById('nombre-cliente').value,
                documento: document.getElementById('doc-cliente').value,
                correo: document.getElementById('correo-cliente').value,
                telefono: document.getElementById('telefono-cliente').value,
                direccion: document.getElementById('direccion-cliente').value 
            };
            let res;
            if(window.modoEdicion.activo && window.modoEdicion.form === 'cliente') {
                res = await clienteSupabase.from('clientes').update(payload).eq('id', window.modoEdicion.id);
            } else {
                res = await clienteSupabase.from('clientes').insert([{...payload, id_empresa: window.miEmpresaId}]);
            }
            if (res.error) return alert("❌ Error BD: " + res.error.message);
            window.cancelarEdicion('cliente'); window.cargarClientes();
        }
    });
    window.eventosCatalogosAtados = true;
}

window.cambiarTab = function(tab) {
    const todosLosTabs = ['productos', 'categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones', 'tipos_movimiento', 'clientes'];
    
    todosLosTabs.forEach(t => {
        const sec = document.getElementById(`seccion-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if(sec) sec.classList.add('hidden');
        if(btn) btn.className = 'text-left px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors w-full outline-none';
    });
    
    const actSec = document.getElementById(`seccion-${tab}`);
    const actBtn = document.getElementById(`tab-${tab}`);
    if(actSec) actSec.classList.remove('hidden');
    if(actBtn) actBtn.className = 'text-left px-4 py-2 rounded-lg font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 shadow-sm w-full outline-none';

    // MAGIA MOBILE: Si la pantalla es chica, ocultamos el menú y mostramos la tabla a pantalla completa
    if (window.innerWidth < 768) {
        document.getElementById('menu-lateral-catalogos').classList.add('hidden');
        document.getElementById('menu-lateral-catalogos').classList.remove('block');
        document.getElementById('area-contenido-catalogos').classList.remove('hidden');
        document.getElementById('area-contenido-catalogos').classList.add('block');
    }

    if(tab === 'categorias') window.cargarCategorias();
    if(tab === 'unidades') window.cargarUnidades();
    if(tab === 'proveedores') window.cargarProveedores();
    if(tab === 'sucursales') window.cargarSucursales();
    if(tab === 'ubicaciones') window.cargarUbicaciones();
    if(tab === 'tipos_movimiento') window.cargarTiposMovimiento();
    if(tab === 'clientes') window.cargarClientes();
    
}

// NUEVA FUNCIÓN: Para el botón "Volver" en celulares
window.volverMenuMobileCat = function() {
    document.getElementById('menu-lateral-catalogos').classList.remove('hidden');
    document.getElementById('menu-lateral-catalogos').classList.add('block');
    document.getElementById('area-contenido-catalogos').classList.add('hidden');
    document.getElementById('area-contenido-catalogos').classList.remove('block');
}

window.cargarCategorias = async function() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
            <span class="font-bold text-slate-700">${c.nombre}</span>
            <div class="flex gap-4">
                <button onclick="activarEdicionGlobal('categoria', '${c.id}', {'nombre-categoria': '${c.nombre.replace(/'/g,"\\'")}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
                <button onclick="eliminarReg('categorias', '${c.id}')" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            </div>
        </li>
    `).join('');
}

window.cargarUnidades = async function() {
    // Traemos las unidades PRIVADAS de la empresa actual OR las UNIVERSALES (id_empresa is null)
    const { data } = await clienteSupabase.from('unidades')
        .select('*')
        .or(`id_empresa.eq.${window.miEmpresaId},id_empresa.is.null`)
        .order('nombre');
        
    document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => {
        const esUniversal = u.id_empresa === null;
        
        // Si es universal, le ponemos un candadito visual. Si es privada, le damos los botones normales.
        const botonesHtml = esUniversal 
            ? `<span class="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded border border-blue-200 shadow-sm" title="Unidad del Sistema (No editable)">🌎 Universal</span>`
            : `
                <button onclick="activarEdicionGlobal('unidad', '${u.id}', {'nombre-unidad': '${u.nombre.replace(/'/g,"\\'")}', 'abrev-unidad': '${u.abreviatura}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
                <button onclick="eliminarReg('unidades', '${u.id}')" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            `;

        return `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
            <div>
                <span class="font-bold text-slate-700">${u.nombre}</span>
                <span class="ml-2 px-2 py-1 bg-slate-200 text-slate-600 text-[10px] rounded font-mono font-bold">${u.abreviatura}</span>
            </div>
            <div class="flex gap-4 items-center">
                ${botonesHtml}
            </div>
        </li>
    `}).join('');
}

window.cargarProveedores = async function() {
    const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => {
        const isInterno = p.tipo === 'Interno';
        const colorBadge = isInterno ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
        return `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-slate-800 text-lg">${p.nombre}</span>
                    <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded ${colorBadge}">${p.tipo || 'Externo'}</span>
                </div>
                <div class="text-xs text-slate-500 flex gap-4">
                    <span>📱 ${p.whatsapp || 'Sin WhatsApp'}</span>
                    <span>✉️ ${p.correo || 'Sin Correo'}</span>
                </div>
            </div>
            <div class="flex gap-4">
                <button onclick="abrirPreciosProveedor('${p.id}', '${p.nombre.replace(/'/g,"\\'")}')" class="text-emerald-600 bg-emerald-50 px-3 py-1 rounded font-bold hover:bg-emerald-100 text-sm transition-colors shadow-sm">💰 Lista Precios</button>
                <button onclick="activarEdicionGlobal('proveedor', '${p.id}', {'nombre-proveedor': '${p.nombre.replace(/'/g,"\\'")}', 'tipo-proveedor': '${p.tipo || 'Externo'}', 'whatsapp-proveedor': '${p.whatsapp || ''}', 'correo-proveedor': '${p.correo || ''}', 'tiempo-entrega': '${p.lapso_entrega_dias || ''}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110 mt-1" title="Editar">✏️</button>
                <button onclick="eliminarReg('proveedores', '${p.id}')" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110 mt-1" title="Eliminar">🗑️</button>
            </div>
        </li>
    `}).join('');
}

window.proveedorActivoPrecio = null;
window.abrirPreciosProveedor = async function(idProv, nombreProv) {
    window.proveedorActivoPrecio = idProv;
    document.getElementById('titulo-precios-prov').innerText = `💰 Lista de Precios de: ${nombreProv}`;
    document.getElementById('modal-precios-proveedor').classList.remove('hidden');

    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('pp-producto').innerHTML = '<option value="" disabled selected>Elegir producto del catálogo...</option>' + prods.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    window.cargarTablaPreciosProv();
}

window.cargarTablaPreciosProv = async function() {
    const tbody = document.getElementById('lista-precios-prov');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500">Cargando...</td></tr>';
    
    const { data: precios } = await clienteSupabase.from('proveedor_precios')
        .select('id, precio_referencia, productos(nombre)')
        .eq('id_proveedor', window.proveedorActivoPrecio);
        
    if(!precios || precios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-500 italic">Sin precios registrados. Usa el panel de arriba para agregar uno.</td></tr>';
        return;
    }

    tbody.innerHTML = precios.map(p => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-3 font-bold text-slate-700">${p.productos?.nombre}</td>
            <td class="px-4 py-3 text-right font-mono text-emerald-700 font-bold">$${p.precio_referencia}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="eliminarReg('proveedor_precios', '${p.id}', false); setTimeout(window.cargarTablaPreciosProv, 500);" class="text-red-400 hover:text-red-600 text-lg">🗑️</button>
            </td>
        </tr>
    `).join('');
}

window.cargarSucursales = async function() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors border-b border-slate-100">
            <div class="flex flex-col gap-1">
                <div class="flex items-baseline gap-2">
                    <span class="font-black text-slate-800 text-lg uppercase">${s.nombre}</span>
                    <span class="text-xs text-slate-400 font-bold">(${s.nombre_comercial || 'Sin Nombre Comercial'})</span>
                </div>
                <div class="text-xs text-slate-500 flex gap-4 mt-1">
                    <span><b class="text-slate-600">Razón Social:</b> ${s.empresa_asociada || '-'}</span>
                    <span><b class="text-slate-600">Horario:</b> ${s.horarios_atencion || '-'}</span>
                </div>
                <div class="text-xs text-slate-500 mt-1">
                    <span>📍 ${s.direccion || 'Sin dirección física asignada'}</span>
                </div>
            </div>
            <div class="flex gap-4">
                <button onclick="activarEdicionGlobal('sucursal', '${s.id}', {'nombre-sucursal': '${s.nombre.replace(/'/g,"\\'")}', 'comercial-sucursal': '${(s.nombre_comercial||'').replace(/'/g,"\\'")}', 'empresa-sucursal': '${(s.empresa_asociada||'').replace(/'/g,"\\'")}', 'horario-sucursal': '${(s.horarios_atencion||'').replace(/'/g,"\\'")}', 'dir-sucursal': '${(s.direccion||'').replace(/'/g,"\\'")}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
                <button onclick="eliminarReg('sucursales', '${s.id}')" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            </div>
        </li>
    `).join('');
    
    const selectUbi = document.getElementById('sel-sucursal-ubi');
    if(selectUbi) {
        selectUbi.innerHTML = '<option value="" disabled selected>Elige sucursal padre...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    }
}

window.cargarUbicaciones = async function() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre, sucursales(nombre)').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
            <div>
                <span class="font-bold text-slate-700">${u.nombre}</span>
                <span class="ml-2 text-xs text-slate-400">en ${u.sucursales?.nombre || 'Desconocida'}</span>
            </div>
            <div class="flex gap-4">
                <button onclick="eliminarReg('ubicaciones_internas', '${u.id}'); setTimeout(window.cargarUbicaciones, 500);" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            </div>
        </li>
    `).join('');
}

window.cargarTiposMovimiento = async function() {
    const { data } = await clienteSupabase.from('tipos_movimiento').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-tipos-movimiento').innerHTML = (data||[]).map(t => {
        const colorOp = t.operacion === '+' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200';
        return `
        <li class="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
            <div>
                <span class="font-bold text-slate-700">${t.nombre}</span>
                <span class="ml-2 px-2 py-0.5 text-xs font-bold rounded border ${colorOp}">${t.operacion === '+' ? 'Suma (+)' : 'Resta (-)'}</span>
            </div>
            <div class="flex gap-4">
                <button onclick="activarEdicionGlobal('tipo-movimiento', '${t.id}', {'nombre-tipo-mov': '${t.nombre.replace(/'/g,"\\'")}', 'operacion-tipo-mov': '${t.operacion}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
                <button onclick="eliminarReg('tipos_movimiento', '${t.id}')" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            </div>
        </li>
    `}).join('');
}

window.cargarClientes = async function() {
    const { data } = await clienteSupabase.from('clientes').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    
    const lista = document.getElementById('lista-clientes');
    if (!lista) return;

    if (!data || data.length === 0) {
        lista.innerHTML = '<li class="p-8 text-center text-slate-400 font-medium">Aún no tienes clientes registrados. ¡Empieza a crear tu base de datos!</li>';
        return;
    }

    lista.innerHTML = data.map(c => `
        <li class="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-slate-50 transition-colors border-b border-slate-100 gap-4">
            <div class="flex flex-col gap-1 w-full">
                <div class="flex items-baseline gap-2">
                    <span class="font-black text-slate-800 text-lg uppercase">${c.nombre}</span>
                    <span class="text-[10px] text-slate-500 font-bold border border-slate-200 bg-slate-100 px-2 py-0.5 rounded uppercase">${c.documento || 'Sin RUT'}</span>
                </div>
                <div class="text-xs text-slate-500 flex flex-col sm:flex-row gap-2 sm:gap-4 mt-1">
                    <span class="flex items-center gap-1">✉️ <b class="text-blue-600">${c.correo || 'Sin correo'}</b></span>
                    <span class="flex items-center gap-1">📱 <b class="text-emerald-600">${c.telefono || 'Sin teléfono'}</b></span>
                </div>
                <div class="text-xs text-slate-500 mt-1">
                    <span class="flex items-center gap-1">📍 <b class="text-slate-600">${c.direccion || 'Sin dirección registrada'}</b></span>
                </div>
            </div>
            <div class="flex gap-4 self-end md:self-auto shrink-0">
                <button onclick="activarEdicionGlobal('cliente', '${c.id}', {'nombre-cliente': '${c.nombre.replace(/'/g,"\\'")}', 'doc-cliente': '${(c.documento||'').replace(/'/g,"\\'")}', 'correo-cliente': '${(c.correo||'').replace(/'/g,"\\'")}', 'telefono-cliente': '${(c.telefono||'').replace(/'/g,"\\'")}', 'direccion-cliente': '${(c.direccion||'').replace(/'/g,"\\'")}'})" class="text-blue-500 hover:text-blue-700 text-lg transition-transform hover:scale-110" title="Editar">✏️</button>
                <button onclick="eliminarReg('clientes', '${c.id}'); setTimeout(window.cargarClientes, 500);" class="text-slate-400 hover:text-red-500 text-lg transition-transform hover:scale-110" title="Eliminar">🗑️</button>
            </div>
        </li>
    `).join('');
}

// ==========================================
// NAVEGACIÓN SEGURA DESDE EL POS A CLIENTES
// ==========================================

window.irAClientesDesdePOS = function() {
    // 1. Cambiamos a la vista de catálogos
    cambiarVista('catalogos');
    
    // 2. Esperamos un instante a que cargue y hacemos la magia
    setTimeout(() => {
        cambiarTab('clientes');
        
        // Ocultamos el menú lateral (Modo "Cajero Encerrado")
        const sidebar = document.getElementById('sidebar-menu');
        if(sidebar) sidebar.style.display = 'none';
        
        // Mostramos el botón de volver al POS y ocultamos el sobre
        const btnVolver = document.getElementById('btn-volver-pos-clientes');
        const iconoCrm = document.getElementById('icono-crm-clientes');
        if(btnVolver) btnVolver.classList.remove('hidden');
        if(iconoCrm) iconoCrm.classList.add('hidden');
    }, 300);
};

window.volverAPosDesdeClientes = function() {
    // 1. Restauramos el menú lateral a la normalidad
    const sidebar = document.getElementById('sidebar-menu');
    if(sidebar) sidebar.style.display = '';
    
    // 2. Ocultamos el botón de volver y mostramos el sobre
    const btnVolver = document.getElementById('btn-volver-pos-clientes');
    const iconoCrm = document.getElementById('icono-crm-clientes');
    if(btnVolver) btnVolver.classList.add('hidden');
    if(iconoCrm) iconoCrm.classList.remove('hidden');
    
    // 3. Lo devolvemos al POS
    cambiarVista('ventas');
};