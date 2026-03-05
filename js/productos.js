// --- PRODUCTOS ---
window.abrirModalProducto = async function(esEdicion = false, nombreSugerido = '') {
    document.getElementById('modal-producto').classList.remove('hidden');
    if(window.unidadesMemoria.length === 0) window.cargarDatosSelects();
    
    // CARGAR SUCURSALES DINÁMICAS PARA LAS REGLAS DE STOCK
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    
    let htmlReglas = '';
    (sucursales || []).forEach(suc => {
        htmlReglas += `
        <div class="bg-white p-3 rounded shadow-sm border border-orange-100 mb-2">
            <p class="text-xs font-bold text-slate-700 mb-2 uppercase">🏢 ${suc.nombre}</p>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-[10px] font-bold text-orange-700 mb-1">Mínimo (Alerta)</label>
                    <input type="number" step="0.01" id="regla-min-${suc.id}" class="regla-input w-full px-2 py-1 border border-orange-200 rounded text-sm outline-none focus:ring-1 focus:ring-orange-400" value="0">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-orange-700 mb-1">Ideal (Pedir)</label>
                    <input type="number" step="0.01" id="regla-ideal-${suc.id}" class="regla-input w-full px-2 py-1 border border-orange-200 rounded text-sm outline-none focus:ring-1 focus:ring-orange-400" value="0">
                </div>
            </div>
        </div>`;
    });
    document.getElementById('contenedor-reglas-stock').innerHTML = htmlReglas;

    if(!esEdicion) {
        window.cancelarEdicion('producto');
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto / Insumo";
        const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('prod-sku').value = 'PRD-' + aleatorio;
        
        // AUTO-LLENADO DEL NOMBRE SI VIENE SUGERIDO DESDE EL CSV
        if (nombreSugerido) {
            document.getElementById('prod-nombre').value = nombreSugerido;
        }
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

document.getElementById('prod-u-compra')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-compra', [{select:'almacen', cant:'ua'}, {select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-almacen')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-almacen', [{select:'menor', cant:'um'}, {select:'receta', cant:'ur'}]); });
document.getElementById('prod-u-menor')?.addEventListener('change', () => { procesarUnidadInteligente('prod-u-menor', [{select:'receta', cant:'ur'}]); });

window.cargarProductos = async function() {
    const lista = document.getElementById('lista-productos');
    
    // EL FRENO DE EMERGENCIA: Si la tabla no existe en esta vista, detenemos la función aquí mismo.
    if (!lista) {
        // Si estamos en la vista de inventario, recargamos el inventario visualmente
        if(document.getElementById('cuerpo-inventario')) window.cargarInventario();
        return; 
    }
    
    // Mensaje de carga mientras busca en la base de datos
    lista.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-slate-400 font-bold">⏳ Cargando catálogo...</td></tr>';

    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    
    lista.innerHTML = (data||[]).map(p => `
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
    
    // Primero abrimos el modal para que dibuje las sucursales vacías
    await window.abrirModalProducto(true); 

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
    
    // Cargar las reglas por sucursal guardadas en la BD
    const { data: reglas } = await clienteSupabase.from('reglas_stock_sucursal').select('*').eq('id_producto', id);
    (reglas || []).forEach(r => {
        const inputMin = document.getElementById(`regla-min-${r.id_sucursal}`);
        const inputIdeal = document.getElementById(`regla-ideal-${r.id_sucursal}`);
        if(inputMin) inputMin.value = r.stock_minimo_ua || 0;
        if(inputIdeal) inputIdeal.value = r.stock_ideal_ua || 0;
    });
    
    window.modoEdicion = { activo: true, id: id, form: 'producto' };
    document.getElementById('titulo-modal-producto').innerText = "Editando Producto ✏️";
    document.getElementById('btn-guardar-producto').innerText = 'Actualizar ✏️';
    document.getElementById('btn-guardar-producto').classList.replace('bg-emerald-600', 'bg-blue-600');
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
        tiene_receta: document.getElementById('prod-tiene-receta').checked
    };
    
    let idProdActual = null;

    if (window.modoEdicion.activo && window.modoEdicion.form === 'producto') {
        idProdActual = window.modoEdicion.id;
        await clienteSupabase.from('productos').update(payload).eq('id', idProdActual);
    } else {
        const { data: nuevoProd } = await clienteSupabase.from('productos').insert([{...payload, id_empresa: window.miEmpresaId}]).select('id').single();
        if(nuevoProd) idProdActual = nuevoProd.id;
    }

    // --- GUARDAR REGLAS DE STOCK POR SUCURSAL ---
    if(idProdActual) {
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id').eq('id_empresa', window.miEmpresaId);
        
        for (const suc of sucursales) {
            const valMin = parseFloat(document.getElementById(`regla-min-${suc.id}`)?.value) || 0;
            const valIdeal = parseFloat(document.getElementById(`regla-ideal-${suc.id}`)?.value) || 0;

            const { data: existeRegla } = await clienteSupabase.from('reglas_stock_sucursal')
                .select('id').eq('id_producto', idProdActual).eq('id_sucursal', suc.id).maybeSingle();
            
            if(existeRegla) {
                await clienteSupabase.from('reglas_stock_sucursal').update({ stock_minimo_ua: valMin, stock_ideal_ua: valIdeal }).eq('id', existeRegla.id);
            } else {
                await clienteSupabase.from('reglas_stock_sucursal').insert([{ 
                    id_empresa: window.miEmpresaId, id_producto: idProdActual, id_sucursal: suc.id, 
                    stock_minimo_ua: valMin, stock_ideal_ua: valIdeal 
                }]);
            }
        }
    }

    window.cerrarModalProducto();
    
    // VERIFICAR DESDE DÓNDE SE ABRIÓ EL MODAL PARA ACTUALIZAR LO CORRECTO
    const panelCSV = document.getElementById('panel-mapeo-csv');
    
    if(window.productoActualParaReceta) {
        await window.actualizarSelectInsumos(); 
    } else if (panelCSV && !panelCSV.classList.contains('hidden') && typeof window.actualizarSelectsMapeoCSV === 'function') {
        // SI ESTAMOS EN EL CSV, REFRESCAR LOS SELECTS SIN PERDER DATOS
        await window.actualizarSelectsMapeoCSV(idProdActual);
    } else {
        window.cargarProductos();
    }
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

// ==========================================
// --- IMPORTAR Y EXPORTAR (CSV / EXCEL) ---
// ==========================================

window.exportarProductosCSV = function() {
    // 1. Tomamos los datos limpios de la memoria global
    if (!window.productosERPGlobal || window.productosERPGlobal.length === 0) {
        return alert("No hay productos para exportar.");
    }

    // 2. Armamos la cabecera (Esta será la plantilla)
    let csvContent = "Nombre,Categoria_ID,Unidad_Compra_ID,Cant_UA_por_UC,Unidad_Almacen_ID,Tiene_Receta\n";

    // 3. Llenamos las filas
    window.productosERPGlobal.forEach(p => {
        // Escapamos comillas por si un producto tiene una coma en su nombre
        let nombre = p.nombre ? `"${p.nombre.replace(/"/g, '""')}"` : "";
        let idCat = p.id_categoria || "";
        let idUC = p.id_unidad_compra?.id || "";
        let factor = p.cant_en_ua_de_uc || "1";
        let idUA = p.id_unidad_almacenamiento?.id || "";
        let tieneReceta = p.tiene_receta ? "TRUE" : "FALSE";
        
        csvContent += `${nombre},${idCat},${idUC},${factor},${idUA},${tieneReceta}\n`;
    });

    // 4. Forzamos la descarga del archivo en el navegador
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // \uFEFF es para que Excel lea los acentos (UTF-8)
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Catalogo_Productos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.importarProductosCSV = function(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    // Reseteamos el input para que permita subir el mismo archivo dos veces si se equivocó
    inputElement.value = '';

    // Usamos PapaParse para leer el CSV mágicamente
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const filas = results.data;
            if(filas.length === 0) return alert("El archivo está vacío.");
            
            // Verificamos que tenga la columna principal de nuestra plantilla
            if(!filas[0].hasOwnProperty('Nombre')) {
                return alert("❌ Formato incorrecto. Por favor descarga la plantilla con el botón Exportar primero.");
            }

            let insertados = 0;
            let omitidos = 0;

            // Mostramos feedback al usuario
            const tbody = document.getElementById('lista-productos');
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-emerald-600 font-bold animate-pulse">⏳ Importando y validando ${filas.length} productos...</td></tr>`;

            for (const fila of filas) {
                const nombre = fila['Nombre']?.trim();
                if (!nombre) continue;

                // PROTECCIÓN: Revisamos si ya existe un producto con ese nombre exacto
                const existe = window.productosERPGlobal.some(p => p.nombre.toLowerCase() === nombre.toLowerCase());
                
                if (existe) {
                    omitidos++;
                    continue; // Nos saltamos este para no sobreescribir ni duplicar
                }

                // Preparamos los datos con valores por defecto si dejaron la celda en blanco
                const payload = {
                    id_empresa: window.miEmpresaId,
                    nombre: nombre,
                    id_categoria: fila['Categoria_ID'] || null,
                    id_unidad_compra: fila['Unidad_Compra_ID'] || null,
                    cant_en_ua_de_uc: fila['Cant_UA_por_UC'] ? parseFloat(fila['Cant_UA_por_UC']) : 1,
                    id_unidad_almacenamiento: fila['Unidad_Almacen_ID'] || null,
                    tiene_receta: fila['Tiene_Receta'] === 'TRUE'
                };

                // Insertamos en Supabase
                const { error } = await clienteSupabase.from('productos').insert([payload]);
                if (!error) insertados++;
            }

            alert(`✅ Importación terminada.\n\nNuevos agregados: ${insertados}\nDuplicados omitidos: ${omitidos}`);
            window.cargarProductos(); // Recargamos la tabla para ver los cambios
            if(window.cargarDatosSelects) window.cargarDatosSelects(); // Actualizamos variables globales
        },
        error: function(err) {
            alert("Error leyendo el archivo CSV: " + err.message);
        }
    });
}
