// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO Y CONTEOS ---
// ==========================================

window.sucursalActivaID = null;
window.sucursalActivaNombre = null;
window.productosGlobalConteo = [];
window.ubicacionesGlobalSucursal = []; // Para el dropdown editable
window.selectConteoActivoIndex = null; // Para el buscador inteligente del modal de conteo

// 1. CARGA LA CUADRÍCULA INICIAL DE SUCURSALES
window.cargarInventario = async function() {
    document.getElementById('inv-vista-sucursales').classList.remove('hidden');
    document.getElementById('inv-vista-detalle').classList.add('hidden');

    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    
    const grid = document.getElementById('grid-sucursales-inventario');
    if(!sucursales || sucursales.length === 0) {
        grid.innerHTML = '<p class="text-slate-500">No tienes sucursales creadas. Ve a Catálogos > Sucursales.</p>';
        return;
    }

    grid.innerHTML = sucursales.map(s => `
        <button onclick="abrirInventarioSucursal('${s.id}', '${s.nombre}')" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all text-left flex flex-col items-start gap-4 cursor-pointer outline-none">
            <span class="text-5xl">🏢</span>
            <div>
                <span class="block font-bold text-xl text-slate-800">${s.nombre}</span>
                <span class="text-sm text-emerald-600 font-medium mt-1">Ver panel de stock →</span>
            </div>
        </button>
    `).join('');
}

window.volverGridInventario = function() {
    window.sucursalActivaID = null;
    window.sucursalActivaNombre = null;
    window.cargarInventario();
}

// 2. CARGA LA TABLA DE INVENTARIO (CON UBICACIÓN EDITABLE)
window.abrirInventarioSucursal = async function(idSuc, nombreSuc) {
    window.sucursalActivaID = idSuc;
    window.sucursalActivaNombre = nombreSuc;

    document.getElementById('inv-titulo-sucursal').innerText = `📦 Inventario: ${nombreSuc}`;
    document.getElementById('inv-vista-sucursales').classList.add('hidden');
    document.getElementById('inv-vista-detalle').classList.remove('hidden');

    const tbody = document.getElementById('lista-inventario');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 font-bold">⏳ Cargando inventario...</td></tr>';

    // Traemos saldos y ubicaciones al mismo tiempo
    const [{ data: saldos }, { data: ubicaciones }, { data: reglas }] = await Promise.all([
        clienteSupabase.from('inventario_saldos').select(`id, id_producto, cantidad_actual_ua, id_ubicacion, productos (nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas (nombre)`).eq('id_empresa', window.miEmpresaId).eq('id_sucursal', idSuc),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSuc),
        clienteSupabase.from('reglas_stock_sucursal').select('id_producto, stock_minimo_ua').eq('id_empresa', window.miEmpresaId).eq('id_sucursal', idSuc)
    ]);

    window.ubicacionesGlobalSucursal = ubicaciones || [];
    
    // Opciones del <select> para edición rápida
    const optsUbicacionesEdit = `<option value="NULL_UBI">General / Sin Ubicación Específica</option>` + 
                                window.ubicacionesGlobalSucursal.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');

    const reglasMap = {};
    (reglas||[]).forEach(r => reglasMap[r.id_producto] = r.stock_minimo_ua);

    const agrupado = {};
    (saldos||[]).forEach(s => {
        const ubiNombre = s.ubicaciones_internas?.nombre || 'General / Sin Ubicación Específica';
        if(!agrupado[ubiNombre]) agrupado[ubiNombre] = [];
        agrupado[ubiNombre].push(s);
    });

    if(Object.keys(agrupado).length === 0) {
         tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 italic">No hay productos registrados en esta sucursal.</td></tr>';
         return;
    }

    let html = '';
    const ubicacionesOrdenadas = Object.keys(agrupado).sort();
    
    for(const ubi of ubicacionesOrdenadas) {
        html += `<tr class="border-b-2 border-slate-300 bg-slate-100/50"><td colspan="5" class="px-6 py-3 font-bold text-slate-800 text-sm uppercase tracking-wider">📍 ${ubi}</td></tr>`;
        
        const items = agrupado[ubi].sort((a,b) => a.productos.nombre.localeCompare(b.productos.nombre));
        
        items.forEach(inv => {
            const stockMinimo = reglasMap[inv.id_producto] || 0;
            const estaBajo = inv.cantidad_actual_ua <= stockMinimo;
            const abrev = inv.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';

            const iconoEstado = estaBajo 
                ? `<span class="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo (${stockMinimo})</span>` 
                : '<span class="flex items-center gap-1 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-1 rounded-full w-max border border-emerald-200">🟢 OK</span>';

            const ubiActualValue = inv.id_ubicacion || 'NULL_UBI';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="px-6 py-3">${iconoEstado}</td>
                <td class="px-6 py-3">
                    <select class="w-full max-w-[180px] px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-emerald-500 bg-white" onchange="cambiarUbicacionSaldo('${inv.id}', this.value)">
                        ${optsUbicacionesEdit.replace(`value="${ubiActualValue}"`, `value="${ubiActualValue}" selected`)}
                    </select>
                </td>
                <td class="px-6 py-3 font-bold text-slate-700">${inv.productos?.nombre}</td>
                <td class="px-6 py-3 text-right">
                    <span class="font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_actual_ua.toFixed(2)}</span>
                    <span class="text-xs text-slate-400 ml-1 font-bold">${abrev}</span>
                </td>
                <td class="px-6 py-3 text-center">
                    <div class="flex justify-center gap-4 text-lg">
                        <button onclick="editarProductoFull('${inv.id_producto}')" title="Editar Detalles del Producto" class="text-blue-500 hover:text-blue-700 transition-transform hover:scale-110">✏️</button>
                        <button onclick="abrirAjusteRapido('${inv.id}', '${inv.id_producto}', '${inv.productos.nombre.replace(/'/g, "\\'")}', '${ubi}', ${inv.cantidad_actual_ua}, '${abrev}')" title="Ajustar Stock Rápido" class="text-orange-500 hover:text-orange-700 transition-transform hover:scale-110">🎯</button>
                        <button onclick="abrirHistorialKardex('${inv.id_producto}', '${inv.productos.nombre.replace(/'/g, "\\'")}')" title="Ver Historial de Movimientos" class="text-indigo-500 hover:text-indigo-700 transition-transform hover:scale-110">📜</button>
                    </div>
                </td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
}

// Función que se dispara al cambiar el select de la tabla
window.cambiarUbicacionSaldo = async function(idSaldo, nuevoIdUbicacionStr) {
    const idUbicacionFinal = nuevoIdUbicacionStr === 'NULL_UBI' ? null : nuevoIdUbicacionStr;
    await clienteSupabase.from('inventario_saldos').update({ id_ubicacion: idUbicacionFinal, ultima_actualizacion: new Date() }).eq('id', idSaldo);
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre); // Recargar
}

// ==========================================
// --- CONTEO MASIVO CON BUSCADOR INTELIGENTE ---
// ==========================================
window.abrirModalConteoMasivo = async function() {
    document.getElementById('cm-sucursal-nombre').innerText = window.sucursalActivaNombre;
    
    const [{ data: ubicaciones }, { data: productos }] = await Promise.all([
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', window.sucursalActivaID),
        clienteSupabase.from('productos').select('id, nombre, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);
    
    window.productosGlobalConteo = productos || [];
    
    let optsUbi = '<option value="">Selecciona Ubicación a contar...</option>';
    optsUbi += '<option value="GENERAL" class="font-bold">General (Sin ubicación específica)</option>';
    optsUbi += (ubicaciones||[]).map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    
    document.getElementById('cm-ubicacion').innerHTML = optsUbi;
    document.getElementById('cm-filas').innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">Selecciona una ubicación arriba para cargar los productos.</td></tr>';
    
    document.getElementById('modal-conteo-masivo').classList.remove('hidden');
}

window.cargarFilasConteoMasivo = async function(idUbicacion) {
    const tbody = document.getElementById('cm-filas');
    if(!idUbicacion) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">Selecciona una ubicación.</td></tr>'; return; }
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">Buscando productos...</td></tr>';

    let query = clienteSupabase.from('inventario_saldos').select('id_producto, cantidad_actual_ua').eq('id_sucursal', window.sucursalActivaID);
    if(idUbicacion === 'GENERAL') query = query.is('id_ubicacion', null);
    else query = query.eq('id_ubicacion', idUbicacion);

    const { data: saldosActuales } = await query;
    tbody.innerHTML = '';
    
    if(saldosActuales && saldosActuales.length > 0) {
        saldosActuales.forEach(s => {
            const prod = window.productosGlobalConteo.find(p => p.id === s.id_producto);
            if(prod) window.agregarFilaConteoFija(prod.id, prod.nombre, prod.id_unidad_almacenamiento?.abreviatura || 'UA', s.cantidad_actual_ua);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">No hay productos registrados en esta ubicación aún. Usa el botón de abajo para agregar uno.</td></tr>';
    }
}

// Carga las filas que YA existen (no son editables el nombre)
window.agregarFilaConteoFija = function(idProd, nombre, abrev, cantActual) {
    const tbody = document.getElementById('cm-filas');
    if(tbody.innerHTML.includes('No hay productos')) tbody.innerHTML = '';
    
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-100 fila-conteo-item hover:bg-slate-50";
    tr.innerHTML = `
        <td class="py-3 px-4 font-medium text-sm text-slate-700">
            ${nombre}
            <input type="hidden" class="cm-select-prod" value="${idProd}">
            <input type="hidden" class="cm-cant-anterior" value="${cantActual}">
        </td>
        <td class="py-3 px-4 text-center text-xs font-bold text-emerald-600 bg-emerald-50 rounded cm-label-abrev">${abrev}</td>
        <td class="py-3 px-4 relative flex justify-center flex-col items-center">
            <span class="text-[10px] text-slate-400 font-bold mb-1">Anterior: ${cantActual}</span>
            <input type="number" step="0.01" value="${cantActual}" class="w-24 px-2 py-1 border border-slate-300 rounded text-center cm-input-cant font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500">
        </td>
        <td class="py-3 px-4 text-right"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-lg">🗑️</button></td>
    `;
    tbody.appendChild(tr);
}

// NUEVO: Agrega una fila con el BUSCADOR INTELIGENTE
window.contadorFilasNuevasConteo = 0;
window.agregarFilaConteo = function() {
    const tbody = document.getElementById('cm-filas');
    if(tbody.innerHTML.includes('No hay productos')) tbody.innerHTML = '';
    
    window.contadorFilasNuevasConteo++;
    const idx = window.contadorFilasNuevasConteo;

    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-200 fila-conteo-item bg-orange-50/50 dropdown-container";
    
    tr.innerHTML = `
        <td class="py-3 px-4 relative">
            <input type="hidden" class="cm-select-prod" id="hidden-cm-prod-${idx}" value="">
            <div class="relative">
                <input type="text" id="search-cm-prod-${idx}" 
                    class="w-full px-3 py-2 border border-orange-300 rounded bg-white text-sm focus:ring-2 focus:ring-orange-500 outline-none cursor-pointer"
                    placeholder="-- Buscar producto --"
                    onfocus="abrirDropdownConteo(${idx})"
                    oninput="filtrarDropdownConteo(${idx}, this.value)"
                    autocomplete="off">
                
                <div id="dropdown-cm-${idx}" class="lista-dropdown-custom hidden absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-xl max-h-48 overflow-y-auto">
                    <ul id="ul-cm-prod-${idx}" class="py-1 text-sm text-slate-700 divide-y divide-slate-100"></ul>
                </div>
            </div>
        </td>
        <td class="py-3 px-4 text-center text-xs font-bold text-slate-400" id="abrev-cm-prod-${idx}">-</td>
        <td class="py-3 px-4 text-center">
            <input type="hidden" class="cm-cant-anterior" value="0">
            <input type="number" step="0.01" placeholder="0.00" class="w-24 px-2 py-2 border border-orange-300 rounded text-center cm-input-cant font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500">
        </td>
        <td class="py-3 px-4 text-right"><button onclick="this.closest('tr').remove()" class="text-red-400 hover:text-red-600 text-lg">🗑️</button></td>
    `;
    tbody.appendChild(tr);
    // Auto abrir el dropdown al crear la fila para fluidez
    setTimeout(() => document.getElementById(`search-cm-prod-${idx}`).focus(), 50);
}

// LOGICA DROPDOWN CONTEO
window.abrirDropdownConteo = function(index) {
    document.querySelectorAll('.lista-dropdown-custom').forEach(el => el.classList.add('hidden'));
    window.filtrarDropdownConteo(index, ''); 
    document.getElementById(`search-cm-prod-${index}`).select();
}

window.filtrarDropdownConteo = function(index, texto) {
    const ul = document.getElementById(`ul-cm-prod-${index}`);
    const term = texto.toLowerCase().trim();

    let filtrados = window.productosGlobalConteo;
    if (term) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(term));

    let html = filtrados.map(p => `
        <li class="px-3 py-2 hover:bg-orange-50 cursor-pointer transition-colors" 
            onclick="seleccionarProductoConteo(${index}, '${p.id}', '${p.nombre.replace(/'/g, "\\'")}', '${p.id_unidad_almacenamiento?.abreviatura || 'UA'}')">
            ${p.nombre}
        </li>
    `).join('');

    html += `<li class="px-3 py-3 hover:bg-emerald-50 cursor-pointer font-bold text-emerald-600 bg-slate-50 transition-colors border-t border-emerald-100" 
                onclick="crearNuevoProductoDesdeConteo(${index})">
                ➕ Crear Nuevo Producto...
            </li>`;

    ul.innerHTML = html;
    document.getElementById(`dropdown-cm-${index}`).classList.remove('hidden');
}

window.seleccionarProductoConteo = function(index, idProd, nombreProd, abrev) {
    document.getElementById(`hidden-cm-prod-${index}`).value = idProd;
    const searchInput = document.getElementById(`search-cm-prod-${index}`);
    searchInput.value = nombreProd;
    searchInput.classList.replace('border-orange-300', 'border-slate-300');
    document.getElementById(`abrev-cm-prod-${index}`).innerText = abrev;
    document.getElementById(`dropdown-cm-${index}`).classList.add('hidden');
}

window.crearNuevoProductoDesdeConteo = function(index) {
    document.getElementById(`dropdown-cm-${index}`).classList.add('hidden');
    window.selectConteoActivoIndex = index; 
    const inputActual = document.getElementById(`search-cm-prod-${index}`).value;
    window.abrirModalProducto(false, inputActual); // Abre modal con el texto que había escrito
}

// Función global que se llama al guardar un producto nuevo desde cualquier lado
window.actualizarSelectsMapeoCSV = async function(nuevoIdProducto) {
    const { data: prodsERP } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    
    // Actualizamos las memorias
    window.productosERPGlobal = prodsERP || []; // Para Ventas POS
    window.productosGlobalConteo = prodsERP || []; // Para Conteo Masivo

    // Si viene de Ventas POS
    if (window.selectCSVActivoIndex !== null && nuevoIdProducto) {
        const nuevoProd = window.productosERPGlobal.find(p => p.id === nuevoIdProducto);
        if(nuevoProd) window.seleccionarProductoCSV(window.selectCSVActivoIndex, nuevoProd.id, nuevoProd.nombre);
        window.selectCSVActivoIndex = null; 
    }

    // Si viene del Conteo Masivo
    if (window.selectConteoActivoIndex !== null && nuevoIdProducto) {
        const nuevoProd = window.productosGlobalConteo.find(p => p.id === nuevoIdProducto);
        if(nuevoProd) window.seleccionarProductoConteo(window.selectConteoActivoIndex, nuevoProd.id, nuevoProd.nombre, nuevoProd.id_unidad_almacenamiento?.abreviatura || 'UA');
        window.selectConteoActivoIndex = null; 
    }
}


window.guardarConteoMasivo = async function() {
    const ubiSelect = document.getElementById('cm-ubicacion').value;
    if(!ubiSelect) return alert("Selecciona en qué ubicación estás contando antes de guardar.");
    const idUbi = ubiSelect === 'GENERAL' ? null : ubiSelect;

    const filas = document.querySelectorAll('.fila-conteo-item');
    if(filas.length === 0) return alert("No hay productos en la lista para guardar.");

    const btn = document.getElementById('btn-guardar-conteo');
    btn.innerText = "⏳ Guardando..."; btn.disabled = true;

    for(const tr of filas) {
        const idProd = tr.querySelector('.cm-select-prod').value;
        if(!idProd) continue; 
        
        const nuevaCant = parseFloat(tr.querySelector('.cm-input-cant').value);
        if(isNaN(nuevaCant)) continue;

        const inputAnterior = tr.querySelector('.cm-cant-anterior');
        let cantAnterior = inputAnterior ? parseFloat(inputAnterior.value) : null;

        let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', window.sucursalActivaID);
        if(idUbi) query = query.eq('id_ubicacion', idUbi); else query = query.is('id_ubicacion', null);
        
        const { data: previo } = await query.maybeSingle();
        let dbCantAnterior = previo ? previo.cantidad_actual_ua : 0;
        const diferencia = nuevaCant - dbCantAnterior;

        if(diferencia !== 0) {
            if(previo) {
                await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: nuevaCant, ultima_actualizacion: new Date() }).eq('id', previo.id);
            } else {
                await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: window.sucursalActivaID, id_ubicacion: idUbi, cantidad_actual_ua: nuevaCant }]);
            }
            
            await clienteSupabase.from('movimientos_inventario').insert([{ 
                id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, 
                tipo_movimiento: 'AJUSTE_CONTEO', cantidad_movida: diferencia, referencia: 'Conteo Físico Masivo' 
            }]);
        }
    }

    btn.innerText = "Guardar Conteo ✅"; btn.disabled = false;
    document.getElementById('modal-conteo-masivo').classList.add('hidden');
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre);
}

// ==========================================
// --- KARDEX: LÍNEA DE TIEMPO (TIMELINE) ---
// ==========================================
window.abrirHistorialKardex = async function(idProd, nombreProd) {
    document.getElementById('hm-subtitulo').innerText = `Producto: ${nombreProd}`;
    document.getElementById('modal-historial').classList.remove('hidden');
    
    const container = document.getElementById('hm-timeline');
    container.innerHTML = '<div class="absolute -left-1.5 top-0 w-3 h-3 bg-blue-400 rounded-full animate-ping"></div><p class="ml-6 text-slate-500">Recopilando la vida de este producto...</p>';

    // Traemos TODOS los movimientos de este producto, ordenados por fecha descendente
    const { data: movs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, ubicaciones_internas(nombre)')
        .eq('id_producto', idProd)
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false });

    // Traemos la fecha de creación del producto para marcar el "Nacimiento" en la línea de tiempo
    const { data: prodInfo } = await clienteSupabase.from('productos').select('created_at, id_unidad_almacenamiento(abreviatura)').eq('id', idProd).single();
    const abrev = prodInfo?.id_unidad_almacenamiento?.abreviatura || 'UA';

    if(!movs || movs.length === 0) {
        container.innerHTML = `
            <div class="relative flex items-start group">
                <div class="absolute -left-[9px] top-1 w-4 h-4 bg-indigo-500 rounded-full border-4 border-white shadow"></div>
                <div class="ml-6 bg-indigo-50 px-4 py-3 rounded-lg border border-indigo-100 w-full">
                    <p class="text-xs font-bold text-indigo-400 uppercase mb-1">${new Date(prodInfo.created_at).toLocaleString()}</p>
                    <p class="font-bold text-indigo-700">Producto Registrado en el Sistema 🐣</p>
                    <p class="text-sm text-indigo-600 mt-1">Aún no tiene movimientos de stock.</p>
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    
    // Nodos de Movimientos
    movs.forEach(m => {
        const ubi = m.ubicaciones_internas?.nombre || 'General';
        const isPositivo = m.cantidad_movida > 0;
        const isCero = m.cantidad_movida === 0; // A veces hay ajustes nulos
        
        let colorPunto = 'bg-slate-400';
        let colorCaja = 'bg-white border-slate-200';
        let colorTexto = 'text-slate-700';
        let icono = '🔄';

        if(isPositivo) {
            colorPunto = 'bg-emerald-500'; colorCaja = 'bg-emerald-50 border-emerald-100'; colorTexto = 'text-emerald-700'; icono = '📥';
        } else if (!isCero) {
            colorPunto = 'bg-red-500'; colorCaja = 'bg-red-50 border-red-100'; colorTexto = 'text-red-700'; icono = '📤';
        }

        const signo = isPositivo ? '+' : '';
        const fecha = new Date(m.fecha_movimiento).toLocaleString();

        html += `
        <div class="relative flex items-start group hover:-translate-y-0.5 transition-transform">
            <div class="absolute -left-[9px] top-1 w-4 h-4 ${colorPunto} rounded-full border-4 border-white shadow z-10 group-hover:scale-125 transition-transform"></div>
            
            <div class="ml-6 ${colorCaja} px-4 py-3 rounded-lg border w-full shadow-sm">
                <div class="flex justify-between items-start mb-1">
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">${fecha}</p>
                    <span class="font-mono text-lg font-black ${colorTexto}">${signo}${m.cantidad_movida} <span class="text-xs">${abrev}</span></span>
                </div>
                <p class="font-bold text-slate-800 text-sm flex items-center gap-2"><span>${icono}</span> ${m.tipo_movimiento}</p>
                <div class="mt-2 text-xs text-slate-500 flex justify-between items-end">
                    <p>📍 <span class="font-medium">${ubi}</span></p>
                    <p class="italic">"${m.referencia || 'Sin detalle'}"</p>
                </div>
            </div>
        </div>`;
    });

    // Nodo Final (Origen del producto)
    html += `
        <div class="relative flex items-start group mt-4">
            <div class="absolute -left-[9px] top-1 w-4 h-4 bg-indigo-500 rounded-full border-4 border-white shadow"></div>
            <div class="ml-6 bg-indigo-50 px-4 py-3 rounded-lg border border-indigo-100 w-full">
                <p class="text-xs font-bold text-indigo-400 uppercase mb-1">${new Date(prodInfo.created_at).toLocaleString()}</p>
                <p class="font-bold text-indigo-700">Producto Registrado en el Sistema 🐣</p>
            </div>
        </div>
    `;

    container.innerHTML = html;
}
