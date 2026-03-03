// --- NAVEGACIÓN DE TABS EN CATÁLOGOS ---
window.cambiarTab = function(tab) {
    if(!window.miEmpresaId) return;
    
    // Agregamos 'tipos_movimiento' a la lista
    ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones', 'tipos_movimiento'].forEach(t => {
        const el = document.getElementById(`seccion-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        
        const btn = document.getElementById(`tab-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });
    
    if(tab === 'categorias') window.cargarCategorias();
    if(tab === 'unidades') window.cargarUnidades();
    if(tab === 'proveedores') window.cargarProveedores();
    if(tab === 'sucursales') window.cargarSucursales();
    if(tab === 'ubicaciones') { window.cargarSelectSucursales(); window.cargarUbicaciones(); }
    if(tab === 'tipos_movimiento') window.cargarTiposMovimiento();
    
    window.cancelarEdicion(tab); 
}

// --- LOGICA DE GUARDADO Y EDICIÓN ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-categoria').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'categoria') await clienteSupabase.from('categorias').update({nombre}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('categorias').insert([{ nombre, id_empresa: window.miEmpresaId }]); window.cancelarEdicion('categoria'); window.cargarCategorias(); });
document.getElementById('form-unidad').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-unidad').value, abreviatura = document.getElementById('abrev-unidad').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'unidad') await clienteSupabase.from('unidades').update({nombre, abreviatura}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('unidades').insert([{ nombre, abreviatura, id_empresa: window.miEmpresaId }]); window.cancelarEdicion('unidad'); window.cargarUnidades(); });
document.getElementById('form-proveedor').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-proveedor').value, nombre_contacto = document.getElementById('contacto-proveedor').value, lapso_entrega_dias = document.getElementById('tiempo-entrega').value || null; if(window.modoEdicion.activo && window.modoEdicion.form === 'proveedor') await clienteSupabase.from('proveedores').update({nombre, nombre_contacto, lapso_entrega_dias}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('proveedores').insert([{ nombre, nombre_contacto, lapso_entrega_dias, id_empresa: window.miEmpresaId }]); window.cancelarEdicion('proveedor'); window.cargarProveedores(); });
document.getElementById('form-sucursal').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-sucursal').value, direccion = document.getElementById('dir-sucursal').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'sucursal') await clienteSupabase.from('sucursales').update({nombre, direccion}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('sucursales').insert([{ nombre, direccion, id_empresa: window.miEmpresaId }]); window.cancelarEdicion('sucursal'); window.cargarSucursales(); });
document.getElementById('form-ubicacion').addEventListener('submit', async (e) => { e.preventDefault(); const nombre = document.getElementById('nombre-ubicacion').value, id_sucursal = document.getElementById('sel-sucursal-ubi').value; if(window.modoEdicion.activo && window.modoEdicion.form === 'ubicacion') await clienteSupabase.from('ubicaciones_internas').update({nombre, id_sucursal}).eq('id', window.modoEdicion.id); else await clienteSupabase.from('ubicaciones_internas').insert([{ nombre, id_sucursal, id_empresa: window.miEmpresaId }]); window.cancelarEdicion('ubicacion'); window.cargarUbicaciones(); });

// NUEVO: Guardado de Tipos de Movimiento
document.getElementById('form-tipo-movimiento')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const nombre = document.getElementById('nombre-tipo-mov').value;
    const operacion = document.getElementById('operacion-tipo-mov').value;
    
    if(window.modoEdicion.activo && window.modoEdicion.form === 'tipo-movimiento') {
        await clienteSupabase.from('tipos_movimiento').update({nombre, operacion}).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('tipos_movimiento').insert([{ nombre, operacion, id_empresa: window.miEmpresaId }]); 
    }
    window.cancelarEdicion('tipo-movimiento'); 
    window.cargarTiposMovimiento(); 
});


// --- CARGA DE LISTAS ---
window.cargarCategorias = async function() { const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${c.nombre}</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("categoria", "${c.id}", {"nombre-categoria": "${c.nombre}"})' class="text-blue-500 hover:text-blue-700 text-lg" title="Editar">✏️</button><button onclick="eliminarReg('categorias','${c.id}')" class="text-red-500 hover:text-red-700 text-lg" title="Eliminar">🗑️</button></div></li>`).join(''); }
window.cargarUnidades = async function() { const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${u.nombre} (${u.abreviatura})</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("unidad", "${u.id}", {"nombre-unidad": "${u.nombre}", "abrev-unidad": "${u.abreviatura}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('unidades','${u.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
window.cargarProveedores = async function() { const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><div><p class="font-bold">${p.nombre}</p><p class="text-xs text-gray-500">${p.nombre_contacto||''} - ${p.lapso_entrega_dias||''} días</p></div><div class="flex gap-2"><button onclick='activarEdicionGlobal("proveedor", "${p.id}", {"nombre-proveedor": "${p.nombre}", "contacto-proveedor": "${p.nombre_contacto||''}", "tiempo-entrega": "${p.lapso_entrega_dias||''}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('proveedores','${p.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
window.cargarSucursales = async function() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${s.nombre}</span><div class="flex gap-2"><button onclick='activarEdicionGlobal("sucursal", "${s.id}", {"nombre-sucursal": "${s.nombre}", "dir-sucursal": "${s.direccion||''}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }
window.cargarSelectSucursales = async function() { const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId); document.getElementById('sel-sucursal-ubi').innerHTML = '<option value="">Elegir Sucursal...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join(''); }
window.cargarUbicaciones = async function() { const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId); document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center"><span>${u.nombre} <b class="text-emerald-600">@${u.sucursales?.nombre}</b></span><div class="flex gap-2"><button onclick='activarEdicionGlobal("ubicacion", "${u.id}", {"nombre-ubicacion": "${u.nombre}", "sel-sucursal-ubi": "${u.id_sucursal}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button><button onclick="eliminarReg('ubicaciones_internas','${u.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button></div></li>`).join(''); }

// NUEVO: Carga de Tipos de Movimiento
window.cargarTiposMovimiento = async function() { 
    const { data } = await clienteSupabase.from('tipos_movimiento').select('*').eq('id_empresa', window.miEmpresaId).order('nombre'); 
    
    document.getElementById('lista-tipos-movimiento').innerHTML = (data||[]).map(t => {
        const colorOp = t.operacion === '+' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';
        return `
        <li class="p-4 flex justify-between border-b hover:bg-slate-50 items-center">
            <div>
                <span class="font-bold">${t.nombre}</span>
                <span class="ml-2 px-2 py-1 rounded text-xs font-bold border ${colorOp}">
                    ${t.operacion === '+' ? 'Suma (+)' : 'Resta (-)'}
                </span>
            </div>
            <div class="flex gap-2">
                ${t.es_sistema ? '<span class="text-xs text-gray-400 italic">Sistema (No editable)</span>' : `
                <button onclick='activarEdicionGlobal("tipo-movimiento", "${t.id}", {"nombre-tipo-mov": "${t.nombre}", "operacion-tipo-mov": "${t.operacion}"})' class="text-blue-500 hover:text-blue-700 text-lg">✏️</button>
                <button onclick="eliminarReg('tipos_movimiento','${t.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button>
                `}
            </div>
        </li>`
    }).join('') || '<li class="p-4 text-center text-gray-500">No hay tipos de movimiento.</li>'; 
}
