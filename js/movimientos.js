// --- CLICK FUERA PARA CERRAR BUSCADORES ---
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
        document.querySelectorAll('.lista-dropdown-custom').forEach(el => {
            el.classList.add('hidden');
            const index = el.id.replace('dropdown-', '');
            const hiddenInput = document.getElementById(`hidden-prod-${index}`);
            const searchInput = document.getElementById(`search-prod-${index}`);
            if(hiddenInput && searchInput && window.productosERPGlobal) {
                const prod = window.productosERPGlobal.find(p => p.id === hiddenInput.value);
                searchInput.value = prod ? prod.nombre : '';
            }
        });
    }
});

// --- NAVEGACIÓN DE TABS EN MOVIMIENTOS MANUALES ---
window.cambiarTabMovimientos = function(tab) {
    ['compras', 'ventas', 'otros'].forEach(t => {
        const el = document.getElementById(`seccion-mov-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        
        const btn = document.getElementById(`tab-mov-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50 whitespace-nowrap' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap';
    });

    if(tab === 'compras') { window.cargarSelectsMovimientosFormularios(); window.cargarLogsMovimientos('COMPRA_DIRECTA'); }
    if(tab === 'ventas') { window.prepararPanelVentas(); window.cargarLogsVentasPOS(); }
    if(tab === 'otros') { window.cargarSelectsMovimientosFormularios(); window.cargarLogsMovimientos('OTROS'); }
}

// ==========================================
// --- FASE 4: COMPRAS DIRECTAS Y OTROS MOVS (GRILLAS DINÁMICAS) ---
// ==========================================
window.ubicacionesGlobalesPorSucursal = {}; 
window.productosERPGlobal = [];
window.contadorFilasCD = 0;
window.contadorFilasOM = 0;
window.selectCDActivoIndex = null;
window.selectOMActivoIndex = null;

window.cargarSelectsMovimientosFormularios = async function() {
    const [{ data: provs }, { data: prods }, { data: sucs }, { data: tipos }, { data: ubis }] = await Promise.all([
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('tipos_movimiento').select('id, nombre, operacion').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre, id_sucursal').eq('id_empresa', window.miEmpresaId)
    ]);

    window.productosERPGlobal = prods || [];

    window.ubicacionesGlobalesPorSucursal = {};
    (ubis||[]).forEach(u => {
        if(!window.ubicacionesGlobalesPorSucursal[u.id_sucursal]) window.ubicacionesGlobalesPorSucursal[u.id_sucursal] = [];
        window.ubicacionesGlobalesPorSucursal[u.id_sucursal].push(u);
    });

    const optsProvs = '<option value="" disabled selected>Elegir Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const optsSucs = '<option value="" disabled selected>Elegir Sucursal...</option>' + (sucs||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    const optsTipos = '<option value="" disabled selected>Tipo de Movimiento...</option>' + (tipos||[]).map(t => `<option value="${t.id}" data-operacion="${t.operacion}">${t.nombre} (${t.operacion})</option>`).join('');

    const elProvCD = document.getElementById('cd-proveedor'); if (elProvCD) elProvCD.innerHTML = optsProvs;
    const elSucCD = document.getElementById('cd-sucursal'); if (elSucCD) elSucCD.innerHTML = optsSucs;
    const elSucOM = document.getElementById('om-sucursal'); if (elSucOM) elSucOM.innerHTML = optsSucs;
    const elTipoOM = document.getElementById('om-tipo'); if (elTipoOM) elTipoOM.innerHTML = optsTipos;

    if(document.getElementById('cd-filas') && document.getElementById('cd-filas').innerHTML.trim() === '') agregarFilaCD();
    if(document.getElementById('om-filas') && document.getElementById('om-filas').innerHTML.trim() === '') agregarFilaOM();
}

window.actualizarUbicacionesCD = function() {
    const idSuc = document.getElementById('cd-sucursal').value;
    const selectsUbi = document.querySelectorAll('.cd-select-ubi');
    let opts = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(window.ubicacionesGlobalesPorSucursal[idSuc]) {
        opts += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }
    selectsUbi.forEach(sel => sel.innerHTML = opts);
}

window.agregarFilaCD = function() {
    window.contadorFilasCD++;
    const idx = window.contadorFilasCD;
    const tbody = document.getElementById('cd-filas');
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-200 bg-white fila-cd-item dropdown-container";
    
    const idSuc = document.getElementById('cd-sucursal').value;
    let optsUbi = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(idSuc && window.ubicacionesGlobalesPorSucursal[idSuc]) {
        optsUbi += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }

    tr.innerHTML = `
        <td class="py-3 px-4 relative">
            <input type="hidden" class="cd-id-prod" id="hidden-cd-prod-${idx}">
            <div class="relative">
                <input type="text" id="search-cd-prod-${idx}" class="w-full px-3 py-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" onfocus="abrirDropdownGeneric(${idx}, 'CD')" oninput="filtrarDropdownGeneric(${idx}, this.value, 'CD')" autocomplete="off">
                <div id="dropdown-CD-${idx}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                    <ul id="ul-cd-prod-${idx}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                </div>
            </div>
        </td>
        <td class="py-3 px-4"><select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none cd-select-ubi">${optsUbi}</select></td>
        <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
                <input type="number" step="0.01" placeholder="0" class="w-20 px-2 py-2 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 cd-input-cant">
                <span class="text-xs text-slate-400 font-bold" id="abrev-cd-prod-${idx}">UC</span>
            </div>
        </td>
        <td class="py-3 px-4 text-right"><input type="number" step="0.01" placeholder="$0.00" class="w-full px-2 py-2 border border-slate-300 rounded text-right text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cd-input-costo"></td>
        <td class="py-3 px-4 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-xl font-bold">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

window.guardarCompraDirectaMasiva = async function() {
    const idSuc = document.getElementById('cd-sucursal').value;
    const idProv = document.getElementById('cd-proveedor').value;
    if(!idSuc || !idProv) return alert("❌ Selecciona una Sucursal y un Proveedor en la cabecera.");

    const filas = document.querySelectorAll('.fila-cd-item');
    let dataValida = [];
    let totalGlobal = 0;

    for(const tr of filas) {
        const idProd = tr.querySelector('.cd-id-prod').value;
        const idUbiVal = tr.querySelector('.cd-select-ubi').value;
        const idUbicacion = idUbiVal === 'NULL_UBI' ? null : idUbiVal;
        const cantUC = parseFloat(tr.querySelector('.cd-input-cant').value);
        const costoTotal = parseFloat(tr.querySelector('.cd-input-costo').value);

        if(idProd && cantUC > 0 && costoTotal >= 0) {
            dataValida.push({ idProd, idUbicacion, cantUC, costoTotal });
            totalGlobal += costoTotal;
        }
    }

    if(dataValida.length === 0) return alert("❌ No hay productos válidos para registrar. Revisa cantidades y costos.");

    const btn = document.getElementById('btn-guardar-cd');
    btn.innerText = "⏳ Guardando..."; btn.disabled = true;

    const { data: cabecera } = await clienteSupabase.from('compras').insert([{ 
        id_empresa: window.miEmpresaId, id_proveedor: idProv, total_compra: totalGlobal, estado: 'Completada' 
    }]).select('id').single();

    for(const item of dataValida) {
        const precioUC = item.costoTotal / item.cantUC;
        
        await clienteSupabase.from('compras_detalles').insert([{ id_compra: cabecera.id, id_producto: item.idProd, cantidad_uc: item.cantUC, precio_unitario_uc: precioUC, subtotal: item.costoTotal, estado: 'Recibido' }]);
        
        const prodInfo = window.productosERPGlobal.find(p => p.id === item.idProd);
        const factor = prodInfo?.cant_en_ua_de_uc || 1;
        const cantUA_a_sumar = item.cantUC * factor;

        let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', item.idProd).eq('id_sucursal', idSuc);
        if(item.idUbicacion) query = query.eq('id_ubicacion', item.idUbicacion); else query = query.is('id_ubicacion', null);
        
        const { data: previo } = await query.maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_sucursal: idSuc, id_ubicacion: item.idUbicacion, cantidad_actual_ua: cantUA_a_sumar }]);

        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_ubicacion: item.idUbicacion, tipo_movimiento: 'COMPRA_DIRECTA', cantidad_movida: cantUA_a_sumar, costo_unitario_movimiento: precioUC, referencia: 'Compra Directa Masiva' }]);
        await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', item.idProd);
    }

    alert("✅ Compra Directa registrada con éxito.");
    document.getElementById('cd-filas').innerHTML = ''; agregarFilaCD();
    btn.innerText = "Registrar Compra"; btn.disabled = false;
    window.cargarLogsMovimientos('COMPRA_DIRECTA');
}

window.actualizarUbicacionesOM = function() {
    const idSuc = document.getElementById('om-sucursal').value;
    const selectsUbi = document.querySelectorAll('.om-select-ubi');
    let opts = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(window.ubicacionesGlobalesPorSucursal[idSuc]) {
        opts += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }
    selectsUbi.forEach(sel => {
        sel.innerHTML = opts;
        const idx = sel.getAttribute('data-idx');
        if(idx) window.verificarStockFilaOM(idx);
    });
}

window.agregarFilaOM = function() {
    window.contadorFilasOM++;
    const idx = window.contadorFilasOM;
    const tbody = document.getElementById('om-filas');
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-200 bg-white fila-om-item dropdown-container";
    
    const idSuc = document.getElementById('om-sucursal').value;
    let optsUbi = '<option value="NULL_UBI">General (Sin Ubicación)</option>';
    if(idSuc && window.ubicacionesGlobalesPorSucursal[idSuc]) {
        optsUbi += window.ubicacionesGlobalesPorSucursal[idSuc].map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }

    tr.innerHTML = `
        <td class="py-3 px-4 relative">
            <input type="hidden" class="om-id-prod" id="hidden-om-prod-${idx}">
            <div class="relative">
                <input type="text" id="search-om-prod-${idx}" class="w-full px-3 py-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-slate-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" onfocus="abrirDropdownGeneric(${idx}, 'OM')" oninput="filtrarDropdownGeneric(${idx}, this.value, 'OM')" autocomplete="off">
                <div id="dropdown-OM-${idx}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                    <ul id="ul-om-prod-${idx}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                </div>
            </div>
        </td>
        <td class="py-3 px-4">
            <select class="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none om-select-ubi" data-idx="${idx}" onchange="verificarStockFilaOM(${idx})">${optsUbi}</select>
            <div class="mt-1 flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded w-max border border-slate-200">
                <span class="font-bold text-slate-500">Stock Real:</span>
                <span id="stock-om-${idx}" class="font-mono font-bold text-slate-800">--</span>
            </div>
        </td>
        <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
                <input type="number" step="0.01" placeholder="0" class="w-20 px-2 py-2 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:ring-2 focus:ring-slate-500 om-input-cant">
                <span class="text-xs text-slate-400 font-bold" id="abrev-om-prod-${idx}">UA</span>
            </div>
        </td>
        <td class="py-3 px-4 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-xl font-bold">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

window.verificarStockFilaOM = async function(idx) {
    const idProd = document.getElementById(`hidden-om-prod-${idx}`)?.value;
    const idSuc = document.getElementById('om-sucursal').value;
    const ubiSelect = document.querySelector(`.om-select-ubi[data-idx="${idx}"]`);
    const idUbiVal = ubiSelect ? ubiSelect.value : null;
    const stockBadge = document.getElementById(`stock-om-${idx}`);
    const abrevBadge = document.getElementById(`abrev-om-prod-${idx}`)?.innerText || 'UA';

    if(!idProd || !idSuc) { stockBadge.innerText = '--'; return; }

    stockBadge.innerText = '⏳...';

    let query = clienteSupabase.from('inventario_saldos').select('cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc);
    if(idUbiVal && idUbiVal !== 'NULL_UBI') query = query.eq('id_ubicacion', idUbiVal); else query = query.is('id_ubicacion', null);
    
    const { data } = await query.maybeSingle();
    
    if(data) {
        stockBadge.innerText = `${data.cantidad_actual_ua} ${abrevBadge}`;
        stockBadge.className = data.cantidad_actual_ua <= 0 ? 'font-mono font-bold text-red-600' : 'font-mono font-bold text-emerald-600';
    } else {
        stockBadge.innerText = `0 ${abrevBadge}`;
        stockBadge.className = 'font-mono font-bold text-slate-400';
    }
}

window.guardarOtrosMovimientosMasivo = async function() {
    const idSuc = document.getElementById('om-sucursal').value;
    const selTipo = document.getElementById('om-tipo');
    const idTipo = selTipo.value;
    if(!idSuc || !idTipo) return alert("❌ Selecciona una Sucursal y un Tipo de Movimiento.");
    
    const operacion = selTipo.options[selTipo.selectedIndex].getAttribute('data-operacion');
    const nombreMov = selTipo.options[selTipo.selectedIndex].text;
    const ref = document.getElementById('om-ref').value || 'Ajuste Masivo';

    const filas = document.querySelectorAll('.fila-om-item');
    let dataValida = [];

    for(const tr of filas) {
        const idProd = tr.querySelector('.om-id-prod').value;
        const idUbiVal = tr.querySelector('.om-select-ubi').value;
        const idUbicacion = idUbiVal === 'NULL_UBI' ? null : idUbiVal;
        const cantIngresada = parseFloat(tr.querySelector('.om-input-cant').value);

        if(idProd && cantIngresada > 0) {
            dataValida.push({ idProd, idUbicacion, cantAplicar: (operacion === '+' ? cantIngresada : -cantIngresada) });
        }
    }

    if(dataValida.length === 0) return alert("❌ No hay productos válidos para registrar.");

    const btn = document.getElementById('btn-guardar-om');
    btn.innerText = "⏳ Aplicando..."; btn.disabled = true;

    for(const item of dataValida) {
        let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', item.idProd).eq('id_sucursal', idSuc);
        if(item.idUbicacion) query = query.eq('id_ubicacion', item.idUbicacion); else query = query.is('id_ubicacion', null);
        
        const { data: previo } = await query.maybeSingle();
        if (previo) await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + item.cantAplicar, ultima_actualizacion: new Date() }).eq('id', previo.id);
        else await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_sucursal: idSuc, id_ubicacion: item.idUbicacion, cantidad_actual_ua: item.cantAplicar }]);

        await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: item.idProd, id_ubicacion: item.idUbicacion, tipo_movimiento: nombreMov, cantidad_movida: item.cantAplicar, referencia: ref }]);
    }

    alert(`✅ Movimientos aplicados con éxito.`);
    document.getElementById('om-ref').value = '';
    document.getElementById('om-filas').innerHTML = ''; agregarFilaOM();
    btn.innerText = "Aplicar Movimientos"; btn.disabled = false;
    window.cargarLogsMovimientos('OTROS');
}

window.abrirDropdownGeneric = function(index, tipo) {
    document.querySelectorAll('.lista-dropdown-custom').forEach(el => el.classList.add('hidden'));
    window.filtrarDropdownGeneric(index, '', tipo); 
    document.getElementById(`search-${tipo.toLowerCase()}-prod-${index}`).select();
}

window.filtrarDropdownGeneric = function(index, texto, tipo) {
    const ul = document.getElementById(`ul-${tipo.toLowerCase()}-prod-${index}`);
    const term = texto.toLowerCase().trim();
    let filtrados = window.productosERPGlobal;
    if (term) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(term));

    let html = filtrados.map(p => {
        const abrev = tipo === 'CD' ? (p.id_unidad_compra?.abreviatura || 'UC') : (p.id_unidad_almacenamiento?.abreviatura || 'UA');
        return `<li class="px-3 py-2 hover:bg-slate-100 cursor-pointer transition-colors" onclick="seleccionarProductoGeneric(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}', '${abrev}', '${tipo}')">${p.nombre}</li>`;
    }).join('');
    
    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" onclick="crearNuevoProductoGeneric(${index}, '${tipo}')">➕ Crear Nuevo Producto...</li>`;
    ul.innerHTML = html;
    document.getElementById(`dropdown-${tipo}-${index}`).classList.remove('hidden');
}

window.seleccionarProductoGeneric = function(index, idProd, nombreProd, abrev, tipo) {
    const pfx = tipo.toLowerCase();
    document.getElementById(`hidden-${pfx}-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-${pfx}-prod-${index}`);
    searchInput.value = nombreProd;
    
    const badgeAbrev = document.getElementById(`abrev-${pfx}-prod-${index}`);
    if(badgeAbrev) badgeAbrev.innerText = abrev;

    document.getElementById(`dropdown-${tipo}-${index}`).classList.add('hidden');
    if(tipo === 'OM') window.verificarStockFilaOM(index);
}

window.crearNuevoProductoGeneric = function(index, tipo) {
    document.getElementById(`dropdown-${tipo}-${index}`).classList.add('hidden');
    const searchInput = document.getElementById(`search-${tipo.toLowerCase()}-prod-${index}`);
    
    if(tipo === 'CD') window.selectCDActivoIndex = index;
    if(tipo === 'OM') window.selectOMActivoIndex = index;
    
    window.abrirModalProducto(false, searchInput.value);
}

// ==========================================
// --- FASE 5: VENTAS POS (CSV) Y HOMOLOGACIÓN ---
// ==========================================
window.datosCSVAgrupados = [];
window.selectCSVActivoIndex = null;

window.prepararPanelVentas = async function() {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    const el = document.getElementById('csv-sucursal');
    if(el) el.innerHTML = (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

window.procesarArchivoCSV = function() {
    const fInicio = document.getElementById('csv-fecha-inicio').value;
    const fFin = document.getElementById('csv-fecha-fin').value;
    if (!fInicio || !fFin) return alert("❌ Por favor, selecciona la Fecha de Inicio y Fecha Fin del período de ventas antes de analizar.");

    const fileInput = document.getElementById('csv-file');
    if (!fileInput.files.length) return alert("❌ Selecciona un archivo CSV primero.");
    
    Papa.parse(fileInput.files[0], {
        header: true, skipEmptyLines: true,
        complete: function(results) { agruparYAsociarVentas(results.data); }
    });
}

async function agruparYAsociarVentas(filasCSV) {
    const agrupado = {};
    filasCSV.forEach(fila => {
        const keyNombre = Object.keys(fila).find(k => k.toLowerCase().includes('producto') || k.toLowerCase().includes('servicio')) || 'Producto';
        const keyVariante = Object.keys(fila).find(k => k.toLowerCase().includes('variante')) || 'Variante';
        const keyCant = Object.keys(fila).find(k => k.toLowerCase().includes('cantidad')) || 'Cantidad';
        const nombre = (fila[keyNombre] || '').trim();
        const variante = (fila[keyVariante] || '').trim();
        const cant = parseFloat(fila[keyCant]) || 0;
        if(nombre && cant > 0) {
            const clave = `${nombre}_||_${variante}`;
            if(!agrupado[clave]) agrupado[clave] = { nombre_pos: nombre, variante_pos: variante, cantidad: 0 };
            agrupado[clave].cantidad += cant;
        }
    });

    window.datosCSVAgrupados = Object.values(agrupado);

    const [{ data: prodsERP }, { data: homologaciones }] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura), id_unidad_compra(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('homologacion_pos').select('*').eq('id_empresa', window.miEmpresaId)
    ]);

    window.productosERPGlobal = prodsERP || [];
    const tbody = document.getElementById('lista-mapeo-csv');
    if(!tbody) return;
    tbody.innerHTML = '';

    window.datosCSVAgrupados.forEach((item, index) => {
        const match = homologaciones.find(h => h.nombre_pos === item.nombre_pos && (h.variante_pos || '') === item.variante_pos);
        const idPreseleccionado = match ? match.id_producto_erp : '';
        const prodPreseleccionado = window.productosERPGlobal.find(p => p.id === idPreseleccionado);
        const nombrePreseleccionado = prodPreseleccionado ? prodPreseleccionado.nombre : '';
        const colorFila = idPreseleccionado ? '' : 'bg-red-50 border-l-4 border-red-500';
        const bordeInput = idPreseleccionado ? 'border-slate-300' : 'border-red-300';

        tbody.innerHTML += `
        <tr class="${colorFila}" id="fila-csv-${index}">
            <td class="px-4 py-3 font-bold">${item.nombre_pos}</td>
            <td class="px-4 py-3 text-slate-500">${item.variante_pos || '-'}</td>
            <td class="px-4 py-3 text-center font-mono text-lg font-bold">${item.cantidad}</td>
            <td class="px-4 py-3 relative dropdown-container" data-index="${index}">
                <input type="hidden" class="selector-homologacion" id="hidden-prod-${index}" data-index="${index}" value="${idPreseleccionado}">
                <div class="relative">
                    <input type="text" id="search-prod-${index}" class="w-full px-3 py-2 border ${bordeInput} rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer" placeholder="-- Buscar producto --" value="${nombrePreseleccionado}" onfocus="abrirDropdownCSV(${index})" oninput="filtrarDropdownCSV(${index}, this.value)" autocomplete="off">
                    <div id="dropdown-${index}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                        <ul id="ul-prod-${index}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                    </div>
                </div>
            </td>
        </tr>`;
    });
    document.getElementById('panel-mapeo-csv').classList.remove('hidden');
}

window.abrirDropdownCSV = function(index) {
    document.querySelectorAll('.lista-dropdown-custom').forEach(el => el.classList.add('hidden'));
    window.filtrarDropdownCSV(index, ''); 
    document.getElementById(`search-prod-${index}`).select();
}

window.filtrarDropdownCSV = function(index, texto) {
    const ul = document.getElementById(`ul-prod-${index}`);
    const term = texto.toLowerCase().trim();
    let filtrados = window.productosERPGlobal;
    if (term) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(term));

    let html = filtrados.map(p => `<li class="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors" onclick="seleccionarProductoCSV(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">${p.nombre}</li>`).join('');
    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" onclick="crearNuevoProductoCSV(${index})">➕ Crear Nuevo Producto...</li>`;
    ul.innerHTML = html;
    document.getElementById(`dropdown-${index}`).classList.remove('hidden');
}

window.seleccionarProductoCSV = function(index, idProd, nombreProd) {
    document.getElementById(`hidden-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-prod-${index}`);
    searchInput.value = nombreProd;
    searchInput.classList.remove('border-red-300'); searchInput.classList.add('border-slate-300');
    document.getElementById(`dropdown-${index}`).classList.add('hidden');
    window.quitarRojoFila(index);
}

window.crearNuevoProductoCSV = function(index) {
    document.getElementById(`dropdown-${index}`).classList.add('hidden');
    const item = window.datosCSVAgrupados[index];
    const nombreSugerido = item.variante_pos ? `${item.nombre_pos} ${item.variante_pos}` : item.nombre_pos;
    window.selectCSVActivoIndex = index; 
    window.abrirModalProducto(false, nombreSugerido);
}

window.quitarRojoFila = function(index) {
    const fila = document.getElementById(`fila-csv-${index}`);
    if(fila) fila.classList.remove('bg-red-50', 'border-l-4', 'border-red-500');
}

window.cancelarCSV = function() {
    document.getElementById('panel-mapeo-csv').classList.add('hidden');
    document.getElementById('csv-file').value = ''; document.getElementById('csv-fecha-inicio').value = ''; document.getElementById('csv-fecha-fin').value = '';
    window.datosCSVAgrupados = [];
}

window.confirmarDescuentoVentas = async function() {
    const idSucursal = document.getElementById('csv-sucursal').value;
    const fInicio = document.getElementById('csv-fecha-inicio').value;
    const fFin = document.getElementById('csv-fecha-fin').value;
    const periodoReferencia = `[Período: ${fInicio} al ${fFin}]`;
    const selects = document.querySelectorAll('.selector-homologacion');
    
    let todoAsociado = true;
    selects.forEach(sel => { if(!sel.value) todoAsociado = false; });
    if(!todoAsociado) return alert("❌ Debes asociar todos los productos del POS con tus productos del sistema (que no quede ninguno en rojo) antes de continuar.");

    const btn = document.getElementById('btn-procesar-ventas');
    btn.innerText = "⏳ Procesando y descontando..."; btn.disabled = true;

    const { data: catalogoCompleto } = await clienteSupabase.from('productos').select('id, tiene_receta, cant_en_um_de_ua, cant_en_ur_de_um').eq('id_empresa', window.miEmpresaId);

    for (const sel of selects) {
        const index = sel.getAttribute('data-index');
        const itemPOS = window.datosCSVAgrupados[index];
        const idProductoERP = sel.value;
        const cantidadVendida = itemPOS.cantidad;

        const { data: existeH } = await clienteSupabase.from('homologacion_pos').select('id').eq('id_empresa', window.miEmpresaId).eq('nombre_pos', itemPOS.nombre_pos).eq('variante_pos', itemPOS.variante_pos).maybeSingle();
        if(existeH) await clienteSupabase.from('homologacion_pos').update({ id_producto_erp: idProductoERP }).eq('id', existeH.id);
        else await clienteSupabase.from('homologacion_pos').insert([{ id_empresa: window.miEmpresaId, nombre_pos: itemPOS.nombre_pos, variante_pos: itemPOS.variante_pos, id_producto_erp: idProductoERP }]);

        const prodERP = catalogoCompleto.find(p => p.id === idProductoERP);

        if (prodERP.tiene_receta) {
            const { data: ingredientes } = await clienteSupabase.from('recetas').select('cantidad_neta, id_ingrediente(id, cant_en_um_de_ua, cant_en_ur_de_um)').eq('id_producto_padre', idProductoERP);
            for (const ing of (ingredientes||[])) {
                const infoInsumo = ing.id_ingrediente;
                const factorUM = infoInsumo.cant_en_um_de_ua || 1;
                const factorUR = infoInsumo.cant_en_ur_de_um || 1;
                const ua_a_descontar = (cantidadVendida * ing.cantidad_neta) / (factorUM * factorUR);
                await aplicarDescuentoInventario(infoInsumo.id, idSucursal, ua_a_descontar, `Venta POS (Receta de ${itemPOS.nombre_pos}) ${periodoReferencia}`);
            }
        } else {
            const factorUM = prodERP.cant_en_um_de_ua || 1;
            const ua_a_descontar = cantidadVendida / factorUM;
            await aplicarDescuentoInventario(idProductoERP, idSucursal, ua_a_descontar, `Venta POS Directa (${itemPOS.nombre_pos}) ${periodoReferencia}`);
        }
    }

    alert("✅ ¡Ventas importadas y stock descontado con éxito!");
    btn.innerText = "✅ Confirmar y Descontar Inventario"; btn.disabled = false;
    cancelarCSV();
    window.cargarLogsVentasPOS();
}

async function aplicarDescuentoInventario(idProd, idSuc, cantidad_ua_descontar, referencia) {
    if(cantidad_ua_descontar <= 0) return;
    const { data: saldos } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSuc).order('cantidad_actual_ua', { ascending: false });
    if(saldos && saldos.length > 0) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: saldos[0].cantidad_actual_ua - cantidad_ua_descontar, ultima_actualizacion: new Date() }).eq('id', saldos[0].id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: -cantidad_ua_descontar }]);
    }
    await clienteSupabase.from('movimientos_inventario').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, tipo_movimiento: 'VENTA_POS', cantidad_movida: -cantidad_ua_descontar, referencia: referencia }]);
}

// ==========================================
// --- FASE 6: LOGS RECIENTES Y EXPORTACIÓN ---
// ==========================================
window.cargarLogsMovimientos = async function(tipo) {
    const isCompra = tipo === 'COMPRA_DIRECTA';
    const tbody = document.getElementById(isCompra ? 'log-compras-directas' : 'log-otros-movs');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 font-bold animate-pulse">Cargando últimos registros...</td></tr>';
    
    let query = clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false })
        .limit(20);
        
    if(isCompra) {
        query = query.eq('tipo_movimiento', 'COMPRA_DIRECTA');
    } else {
        query = query.not('tipo_movimiento', 'in', '("COMPRA_DIRECTA", "VENTA_POS", "INGRESO_COMPRA", "AJUSTE_CONTEO")'); 
    }

    const { data } = await query;
    
    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 italic">No hay registros recientes de este tipo.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d => {
        const fecha = new Date(d.fecha_movimiento).toLocaleString('es-CL', {dateStyle:'short', timeStyle:'short'});
        const prod = d.productos?.nombre || 'Desconocido';
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = d.ubicaciones_internas?.nombre || 'General';
        const cantColor = d.cantidad_movida > 0 ? 'text-emerald-600' : 'text-red-600';
        const signo = d.cantidad_movida > 0 ? '+' : '';
        
        if(isCompra) {
            return `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-slate-600 whitespace-nowrap">${fecha}</td>
                <td class="px-4 py-2 font-bold text-slate-800">${prod}</td>
                <td class="px-4 py-2 text-right font-mono ${cantColor} font-bold">${signo}${d.cantidad_movida} <span class="text-xs text-slate-400">${abrev}</span></td>
                <td class="px-4 py-2 text-slate-500 text-xs">📍 ${ubi}</td>
            </tr>`;
        } else {
            return `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-slate-600 whitespace-nowrap">${fecha}</td>
                <td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap border border-slate-200">${d.tipo_movimiento}</span></td>
                <td class="px-4 py-2 font-bold text-slate-800">${prod}</td>
                <td class="px-4 py-2 text-right font-mono ${cantColor} font-bold">${signo}${d.cantidad_movida} <span class="text-xs text-slate-400">${abrev}</span></td>
                <td class="px-4 py-2 text-slate-500 text-xs italic">"${d.referencia || '-'}"</td>
            </tr>`;
        }
    }).join('');
}

window.cargarLogsVentasPOS = async function() {
    const tbody = document.getElementById('log-ventas-pos');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 font-bold animate-pulse">Cargando períodos procesados...</td></tr>';
    
    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, referencia')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .order('fecha_movimiento', { ascending: false })
        .limit(500);

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 italic">No hay ventas del POS importadas aún.</td></tr>';
        return;
    }

    const periodosAgrupados = [];
    data.forEach(d => {
        const match = d.referencia.match(/\[Período:.*?\]/);
        const refKey = match ? match[0] : "Período no especificado";
        
        let existe = periodosAgrupados.find(p => p.ref === refKey);
        if(!existe) {
            periodosAgrupados.push({ ref: refKey, fechaProcesado: new Date(d.fecha_movimiento), itemsAfectados: 1 });
        } else {
            existe.itemsAfectados++;
        }
    });

    tbody.innerHTML = periodosAgrupados.map(p => {
        const fechaProc = p.fechaProcesado.toLocaleString('es-CL', {dateStyle:'medium', timeStyle:'short'});
        const refEscapada = p.ref.replace(/'/g, "\\'");

        return `<tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-4 py-3 font-medium text-slate-600">${fechaProc}</td>
            <td class="px-4 py-3 font-bold text-blue-700"><span class="bg-blue-50 border border-blue-100 px-3 py-1 rounded-md shadow-sm">${p.ref}</span></td>
            <td class="px-4 py-3 text-center text-slate-500 font-medium text-xs">${p.itemsAfectados} líneas descontadas</td>
            <td class="px-4 py-3 text-center">
                <button onclick="abrirDetallesVentas('${refEscapada}')" class="text-slate-500 hover:text-blue-600 bg-white border border-slate-300 shadow-sm px-3 py-1 rounded font-bold transition-transform hover:scale-105">👁️ Ver</button>
            </td>
        </tr>`;
    }).join('');
}

window.abrirDetallesVentas = async function(periodoRef) {
    document.getElementById('dv-periodo').innerText = periodoRef;
    const tbody = document.getElementById('dv-filas');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8">⏳ Buscando líneas descontadas...</td></tr>';
    document.getElementById('modal-detalles-ventas').classList.remove('hidden');

    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .eq('tipo_movimiento', 'VENTA_POS')
        .like('referencia', `%${periodoRef}%`)
        .order('fecha_movimiento', { ascending: false });

    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">No se encontraron detalles.</td></tr>'; return;
    }

    tbody.innerHTML = data.map(d => {
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = d.ubicaciones_internas?.nombre || 'Bodega General';
        const cant = Math.abs(d.cantidad_movida);

        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-bold text-slate-700 text-sm whitespace-nowrap">${d.productos?.nombre || 'Desconocido'}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-red-600 bg-red-50/50">-${cant} <span class="text-[10px] text-slate-400">${abrev}</span></td>
            <td class="px-4 py-3 text-sm text-slate-500">📍 ${ubi}</td>
            <td class="px-4 py-3 text-xs text-slate-500 italic max-w-[250px] truncate" title="${d.referencia}">"${d.referencia}"</td>
        </tr>`;
    }).join('');
}

window.exportarMovimientosCSV = async function() {
    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, productos(nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false })
        .limit(1000); 
    
    if(!data || data.length === 0) return alert("No hay movimientos registrados para exportar.");

    let csv = "Fecha,Hora,Producto,Accion,Cantidad,Unidad,Ubicacion,Referencia\n";
    data.forEach(d => {
        const f = new Date(d.fecha_movimiento);
        const fecha = f.toLocaleDateString('es-CL');
        const hora = f.toLocaleTimeString('es-CL');
        const prod = `"${(d.productos?.nombre || '').replace(/"/g, '""')}"`;
        const accion = `"${d.tipo_movimiento}"`;
        const cant = d.cantidad_movida;
        const abrev = d.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';
        const ubi = `"${d.ubicaciones_internas?.nombre || 'General'}"`;
        const ref = `"${(d.referencia || '').replace(/"/g, '""')}"`;
        
        csv += `${fecha},${hora},${prod},${accion},${cant},${abrev},${ubi},${ref}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Log_Movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
