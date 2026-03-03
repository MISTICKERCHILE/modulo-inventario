// --- PRODUCTOS ---
window.abrirModalProducto = function(esEdicion = false) {
    document.getElementById('modal-producto').classList.remove('hidden');
    if(window.unidadesMemoria.length === 0) window.cargarDatosSelects();
    if(!esEdicion) {
        window.cancelarEdicion('producto');
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto / Insumo";
        const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('prod-sku').value = 'PRD-' + aleatorio;
        document.getElementById('prod-stock-min').value = "0";
        document.getElementById('prod-stock-ideal').value = "0";
    }
};

window.cerrarModalProducto = function() { 
    document.getElementById('modal-producto').classList.add('hidden'); 
    window.cancelarEdicion('producto'); 
};

window.toggleFilaProducto = function(idFila) { 
    document.getElementById(idFila).classList.toggle('hidden'); 
}

window.cargarDatosSelects = async function() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId);
    window.unidadesMemoria = uni || []; 
    const opcionesUni = '<option value="">Seleccione...</option>' + window.unidadesMemoria.map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = opcionesUni;
    });
}

function procesarUnidadInteligente(origenId, arrDestinos) {
    const idUnidad = document.getElementById(origenId).value;
    if(!idUnidad) return;
    const unidad = window.unidadesMemoria.find(u => u.id === idUnidad);
    if(!unidad) return;
    if(['gr', 'g', 'ml', 'cc', 'un', 'u', 'und'].includes(unidad.abreviatura.toLowerCase())) {
        arrDestinos.forEach(dest => { 
            document.getElementById(`prod-u-${dest.select}`).value = idUnidad; 
            document.getElementById(`prod-cant-${dest.cant}`).value = 1; 
        });
    }
}

// Eventos de unidades inteligentes
document.getElementById('prod-u-compra')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-compra', [{select:'almacen', cant:'ua'}, {select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-almacen')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-almacen', [{select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-menor')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-menor', [{select:'receta', cant:'ur'}]); });

window.cargarProductos = async function() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-productos').innerHTML = (data||[]).map(p => `
        <tr class="hover:bg-slate-50 border-b transition-colors cursor-pointer" onclick="toggleFilaProducto('acciones-${p.id}')">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4 text-center">${p.tiene_receta ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">Con Receta</span>' : '<span class="text-gray-400 text-xs">Simple</span>'}</td>
            <td class="px-6 py-4 text-right text-slate-400 text-xs">Opciones ▼</td>
        </tr>
        <tr id="acciones-${p.id}" class="hidden bg-slate-100/60 border-b border-slate-200 shadow-inner">
            <td colspan="3" class="px-6 py-3">
                <div class="flex justify-end gap-6 items-center">
                    ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-700 font-bold hover:underline flex items-center gap-1"><span>📝</span> Receta</button>` : ''}
                    <button onclick="editarProductoFull('${p.id}')" class="text-blue-600 font-bold hover:underline flex items-center gap-1 text-lg">✏️ Editar</button>
                    <button onclick="eliminarReg('productos', '${p.id}'); cargarProductos();" class="text-red-600 font-bold hover:underline flex items-center gap-1 text-lg">🗑️ Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.editarProductoFull = async function(id) {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id', id).single();
    document.getElementById('prod-nombre').value = data.nombre;
    document.getElementById('prod-sku').value = data.sku;
    document.getElementById('prod-categoria').value = data.id_categoria;
    document.getElementById('prod-u-compra').value = data.id_unidad_compra;
    document.getElementById('prod-cant-ua').value = data.cant_en_ua_de_uc;
    document.getElementById('prod-u-almacen').value = data.id_unidad_almacenamiento;
    document.getElementById('prod-cant-um').value = data.cant_en_um_de_ua;
    document.getElementById('prod-u-menor').value = data.id_unidad_menor;
    document.getElementById('prod-cant-ur').value = data.cant_en_ur_de_um;
    document.getElementById('prod-u-receta').value = data.id_unidad_receta;
    document.getElementById('prod-tiene-receta').checked = data.tiene_receta;
    
    document.getElementById('prod-stock-min').value = data.stock_minimo_ua || 0;
    document.getElementById('prod-stock-ideal').value = data.stock_ideal_ua || 0;
    
    window.modoEdicion = { activo: true, id: id, form: 'producto' };
    document.getElementById('titulo-modal-producto').innerText = "Editando Producto ✏️";
    document.getElementById('btn-guardar-producto').innerText = 'Actualizar ✏️';
    document.getElementById('btn-guardar-producto').classList.replace('bg-emerald-600', 'bg-blue-600');
    
    window.abrirModalProducto(true);
}

document.getElementById('form-producto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('prod-nombre').value, 
        sku: document.getElementById('prod-sku').value, 
        id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value, 
        cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value, 
        cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value, 
        cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value, 
        tiene_receta: document.getElementById('prod-tiene-receta').checked,
        stock_minimo_ua: parseFloat(document.getElementById('prod-stock-min').value) || 0,
        stock_ideal_ua: parseFloat(document.getElementById('prod-stock-ideal').value) || 0
    };
    
    if (window.modoEdicion.activo && window.modoEdicion.form === 'producto') {
        await clienteSupabase.from('productos').update(payload).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('productos').insert([{...payload, id_empresa: window.miEmpresaId}]);
    }
    window.cerrarModalProducto();
    
    if(window.productoActualParaReceta) await window.actualizarSelectInsumos(); 
    else window.cargarProductos();
});

// --- RECETAS Y BUSCADOR ---
window.cargarBuscadorRecetas = async function() {
    const { data } = await clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('tiene_receta', true).order('nombre');
    const sel = document.getElementById('buscador-recetas');
    if(!sel) return;
    
    sel.innerHTML = '<option value="">Buscar o seleccionar receta...</option>' + (data||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    if(window.productoActualParaReceta) {
        sel.value = window.productoActualParaReceta;
        document.getElementById('msj-receta-vacia').classList.add('hidden');
        document.getElementById('panel-receta-activa').classList.remove('hidden');
        document.getElementById('panel-estadisticas-receta').classList.remove('hidden');
        document.getElementById('receta-unidad-base').classList.remove('hidden');
    } else {
        document.getElementById('msj-receta-vacia').classList.remove('hidden');
        document.getElementById('panel-receta-activa').classList.add('hidden');
        document.getElementById('panel-estadisticas-receta').classList.add('hidden');
        document.getElementById('receta-unidad-base').classList.add('hidden');
    }
}

window.seleccionarRecetaDesdeBuscador = function(id) {
    if(!id) { window.productoActualParaReceta = null; window.cargarBuscadorRecetas(); return; }
    const sel = document.getElementById('buscador-recetas');
    window.abrirReceta(id, sel.options[sel.selectedIndex].text);
};

window.abrirReceta = async function(idProducto, nombre) {
    window.productoActualParaReceta = idProducto;
    const { data: prodFinal } = await clienteSupabase.from('productos').select('rendimiento_receta, id_unidad_receta(abreviatura)').eq('id', idProducto).single();
    
    const abrev = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    document.getElementById('receta-unidad-base').innerText = `Unidad base: ${abrev}`;
    document.getElementById('receta-label-rendimiento').innerText = abrev;
    document.getElementById('receta-rendimiento').value = prodFinal?.rendimiento_receta || 1;
    
    await window.actualizarSelectInsumos();
    window.cambiarVista('recetas');
    window.cargarIngredientesReceta();
}

window.actualizarSelectInsumos = async function() {
    const { data: prods } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_receta(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    window.productosParaRecetaMemoria = prods || [];
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + 
        (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('') +
        '<option value="NUEVO" class="font-bold text-emerald-600 bg-emerald-50">➕ Crear Nuevo Insumo...</option>';
}

document.getElementById('sel-ingrediente')?.addEventListener('change', (e) => {
    if(e.target.value === 'NUEVO') { e.target.value = ''; window.abrirModalProducto(); return; }
    const prod = window.productosParaRecetaMemoria.find(p => p.id === e.target.value);
    document.getElementById('label-unidad-ingrediente').innerText = prod?.id_unidad_receta?.abreviatura || '';
});

window.guardarRendimiento = async function() {
    await clienteSupabase.from('productos').update({ rendimiento_receta: parseFloat(document.getElementById('receta-rendimiento').value) }).eq('id', window.productoActualParaReceta);
    window.cargarIngredientesReceta();
}

window.cargarIngredientesReceta = async function() {
    const { data } = await clienteSupabase.from('recetas').select('id, id_ingrediente, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))').eq('id_producto_padre', window.productoActualParaReceta);
    document.getElementById('lista-ingredientes-receta').innerHTML = (data||[]).map(r => `
        <tr class="border-b hover:bg-slate-50 items-center">
            <td class="py-3 px-2 text-sm font-medium text-slate-700 w-1/2">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold text-slate-600 bg-slate-100 rounded">${r.cantidad_neta} <span class="text-xs font-normal text-slate-400">${r.id_ingrediente.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 text-right flex justify-end gap-2 pr-2">
                <button onclick="editarIngredienteReceta('${r.id}', '${r.id_ingrediente}', '${r.cantidad_neta}')" class="text-blue-500 hover:text-blue-700 text-lg">✏️</button>
                <button onclick="quitarIngrediente('${r.id}')" class="text-red-500 hover:text-red-700 text-lg">🗑️</button>
            </td>
        </tr>`).join('');
}

window.editarIngredienteReceta = function(idReceta, idInsumo, cantidad) {
    document.getElementById('sel-ingrediente').value = idInsumo;
    document.getElementById('ing-cantidad').value = cantidad;
    document.getElementById('sel-ingrediente').dispatchEvent(new Event('change'));
    window.modoEdicion = { activo: true, id: idReceta, form: 'ingrediente' };
    
    const btnSubmit = document.querySelector(`#form-ingrediente button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Actualizar ✏️';
        btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600');
    }
    document.getElementById('btn-cancelar-ingrediente').classList.remove('hidden');
}

document.getElementById('form-ingrediente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { 
        id_producto_padre: window.productoActualParaReceta, 
        id_ingrediente: document.getElementById('sel-ingrediente').value, 
        cantidad_neta: document.getElementById('ing-cantidad').value 
    };
    
    if(window.modoEdicion.activo && window.modoEdicion.form === 'ingrediente') {
        await clienteSupabase.from('recetas').update(payload).eq('id', window.modoEdicion.id);
    } else {
        await clienteSupabase.from('recetas').insert([{...payload, id_empresa: window.miEmpresaId}]);
    }
    window.cancelarEdicion('ingrediente');
    window.cargarIngredientesReceta();
});

window.quitarIngrediente = async function(id) {
    if(confirm("¿Seguro de quitar este ingrediente de la receta? 🗑️")) {
        await clienteSupabase.from('recetas').delete().eq('id', id);
        window.cargarIngredientesReceta();
    }
}
