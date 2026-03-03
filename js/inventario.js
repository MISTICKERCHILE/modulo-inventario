// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO Y CONTEOS ---
// ==========================================

window.sucursalActivaID = null;
window.sucursalActivaNombre = null;
window.productosGlobalConteo = [];

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

// 2. CARGA LA TABLA DE INVENTARIO AGRUPADA POR UBICACIÓN
window.abrirInventarioSucursal = async function(idSuc, nombreSuc) {
    window.sucursalActivaID = idSuc;
    window.sucursalActivaNombre = nombreSuc;

    document.getElementById('inv-titulo-sucursal').innerText = `📦 Inventario: ${nombreSuc}`;
    document.getElementById('inv-vista-sucursales').classList.add('hidden');
    document.getElementById('inv-vista-detalle').classList.remove('hidden');

    const tbody = document.getElementById('lista-inventario');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 font-bold">⏳ Cargando inventario...</td></tr>';

    // Traemos saldos con sus relaciones
    const { data: saldos } = await clienteSupabase
        .from('inventario_saldos')
        .select(`
            id, id_producto, cantidad_actual_ua, id_ubicacion,
            productos (nombre, id_unidad_almacenamiento(abreviatura)),
            ubicaciones_internas (nombre)
        `)
        .eq('id_empresa', window.miEmpresaId)
        .eq('id_sucursal', idSuc);
        
    // Traemos reglas de stock para las alertas rojas/verdes
    const { data: reglas } = await clienteSupabase
        .from('reglas_stock_sucursal')
        .select('id_producto, stock_minimo_ua')
        .eq('id_empresa', window.miEmpresaId)
        .eq('id_sucursal', idSuc);

    const reglasMap = {};
    (reglas||[]).forEach(r => reglasMap[r.id_producto] = r.stock_minimo_ua);

    // Agrupamos la data usando la ubicación como llave
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
    // Ordenamos alfabéticamente las ubicaciones (opcional)
    const ubicacionesOrdenadas = Object.keys(agrupado).sort();
    
    for(const ubi of ubicacionesOrdenadas) {
        // --- FILA SEPARADORA DE GRUPO ---
        html += `<tr class="border-b-2 border-slate-300 bg-slate-100/50"><td colspan="5" class="px-6 py-3 font-bold text-slate-800 text-sm uppercase tracking-wider">📍 ${ubi}</td></tr>`;
        
        // --- FILAS DE PRODUCTOS ---
        const items = agrupado[ubi].sort((a,b) => a.productos.nombre.localeCompare(b.productos.nombre));
        
        items.forEach(inv => {
            const stockMinimo = reglasMap[inv.id_producto] || 0;
            const estaBajo = inv.cantidad_actual_ua <= stockMinimo;
            const abrev = inv.productos?.id_unidad_almacenamiento?.abreviatura || 'UA';

            const iconoEstado = estaBajo 
                ? `<span class="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo (${stockMinimo})</span>` 
                : '<span class="flex items-center gap-1 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-1 rounded-full w-max border border-emerald-200">🟢 OK</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="px-6 py-3">${iconoEstado}</td>
                <td class="px-6 py-3 text-slate-400 text-xs truncate max-w-[120px]">${ubi}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${inv.productos?.nombre}</td>
                <td class="px-6 py-3 text-right">
                    <span class="font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_actual_ua.toFixed(2)}</span>
                    <span class="text-xs text-slate-400 ml-1 font-bold">${abrev}</span>
                </td>
                <td class="px-6 py-3 text-center">
                    <div class="flex justify-center gap-4 text-lg">
                        <button onclick="editarProductoFull('${inv.id_producto}')" title="Editar Producto" class="text-blue-500 hover:text-blue-700 transition-transform hover:scale-110">✏️</button>
                        <button onclick="abrirAjusteRapido('${inv.id}', '${inv.id_producto}', '${inv.productos.nombre.replace(/'/g, "\\'")}', '${ubi}', ${inv.cantidad_actual_ua}, '${abrev}')" title="Ajustar Stock Rápido" class="text-orange-500 hover:text-orange-700 transition-transform hover:scale-110">🎯</button>
                        <button onclick="abrirHistorial('${inv.id_producto}', '${inv.productos.nombre.replace(/'/g, "\\'")}')" title="Ver Historial de Movimientos" class="text-slate-500 hover:text-slate-800 transition-transform hover:scale-110">📜</button>
                    </div>
                </td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
}

// ==========================================
// --- CONTEO MASIVO (BULK INVENTORY) ---
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
            if(prod) window.agregarFilaConteoHTML(prod.id, prod.nombre, prod.id_unidad_almacenamiento?.abreviatura || 'UA', s.cantidad_actual_ua);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">No hay productos registrados en esta ubicación aún. Usa el botón de abajo para añadir el primero.</td></tr>';
    }
}

window.agregarFilaConteoHTML = function(idProd, nombre, abrev, cantActual) {
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
        <td class="py-3 px-4 text-center text-xs font-bold text-emerald-600 cm-label-abrev bg-emerald-50 rounded">${abrev}</td>
        <td class="py-3 px-4 relative flex justify-center flex-col items-center">
            <span class="text-[10px] text-slate-400 font-bold mb-1">Anterior: ${cantActual}</span>
            <input type="number" step="0.01" value="${cantActual}" class="w-24 px-2 py-1 border border-slate-300 rounded text-center cm-input-cant font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500">
        </td>
        <td class="py-3 px-4 text-right"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-lg">🗑️</button></td>
    `;
    tbody.appendChild(tr);
}

// Para añadir un producto que no estaba en la gaveta originalmente
window.agregarFilaConteo = function() {
    const tbody = document.getElementById('cm-filas');
    if(tbody.innerHTML.includes('No hay productos')) tbody.innerHTML = '';
    
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-100 fila-conteo-item bg-orange-50";
    
    const optsProds = '<option value="">-- Elige un producto --</option>' + window.productosGlobalConteo.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    tr.innerHTML = `
        <td class="py-3 px-4">
            <select class="w-full px-2 py-1 border rounded text-sm cm-select-prod outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                ${optsProds}
            </select>
        </td>
        <td class="py-3 px-4 text-center text-xs font-bold text-slate-400 cm-label-abrev">-</td>
        <td class="py-3 px-4 text-center">
            <input type="number" step="0.01" placeholder="0.00" class="w-24 px-2 py-1 border border-orange-300 rounded text-center cm-input-cant font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500">
        </td>
        <td class="py-3 px-4 text-right"><button onclick="this.closest('tr').remove()" class="text-red-400 hover:text-red-600 text-lg">🗑️</button></td>
    `;
    tbody.appendChild(tr);

    const select = tr.querySelector('.cm-select-prod');
    select.addEventListener('change', function() {
        const prod = window.productosGlobalConteo.find(p => p.id === this.value);
        if(prod) tr.querySelector('.cm-label-abrev').innerText = prod.id_unidad_almacenamiento?.abreviatura || 'UA';
    });
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
        if(!idProd) continue; // Si dejó el select vacío, lo ignoramos
        
        const nuevaCant = parseFloat(tr.querySelector('.cm-input-cant').value);
        if(isNaN(nuevaCant)) continue;

        const inputAnterior = tr.querySelector('.cm-cant-anterior');
        let cantAnterior = inputAnterior ? parseFloat(inputAnterior.value) : null;

        // Validamos en BD por seguridad
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
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre); // Recargamos la tabla
}

// ==========================================
// --- AJUSTE RÁPIDO (UN SOLO PRODUCTO) ---
// ==========================================
window.abrirAjusteRapido = function(idSaldo, idProd, nombreProd, ubiNombre, cantActual, abrev) {
    document.getElementById('ar-id-saldo').value = idSaldo;
    document.getElementById('ar-id-prod').value = idProd;
    document.getElementById('ar-titulo').innerText = nombreProd;
    document.getElementById('ar-ubi').innerText = ubiNombre;
    document.getElementById('ar-cant').value = cantActual;
    document.getElementById('ar-abrev').innerText = abrev;
    document.getElementById('modal-ajuste-rapido').classList.remove('hidden');
}

document.getElementById('form-ajuste-rapido')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idSaldo = document.getElementById('ar-id-saldo').value;
    const idProd = document.getElementById('ar-id-prod').value;
    const nuevaCant = parseFloat(document.getElementById('ar-cant').value);

    const {data: previo} = await clienteSupabase.from('inventario_saldos').select('cantidad_actual_ua, id_ubicacion').eq('id', idSaldo).single();
    if(!previo) return;
    const diferencia = nuevaCant - previo.cantidad_actual_ua;

    if(diferencia !== 0) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: nuevaCant, ultima_actualizacion: new Date() }).eq('id', idSaldo);
        await clienteSupabase.from('movimientos_inventario').insert([{ 
            id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: previo.id_ubicacion, 
            tipo_movimiento: 'AJUSTE', cantidad_movida: diferencia, referencia: 'Ajuste Rápido Directo' 
        }]);
    }
    document.getElementById('modal-ajuste-rapido').classList.add('hidden');
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre);
});

// ==========================================
// --- HISTORIAL DE MOVIMIENTOS ---
// ==========================================
window.abrirHistorial = async function(idProd, nombreProd) {
    document.getElementById('hm-titulo').innerText = `📜 Historial Global: ${nombreProd}`;
    document.getElementById('modal-historial').classList.remove('hidden');
    
    const ul = document.getElementById('hm-lista');
    ul.innerHTML = '<li class="text-center py-8 text-slate-500 font-bold">Buscando en los archivos... 🕵️‍♀️</li>';

    // Traemos los últimos 30 movimientos de la empresa para este producto
    const { data: movs } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, ubicaciones_internas(nombre)')
        .eq('id_producto', idProd)
        .eq('id_empresa', window.miEmpresaId)
        .order('fecha_movimiento', { ascending: false })
        .limit(30);

    if(!movs || movs.length === 0) {
        ul.innerHTML = '<li class="text-center py-8 text-slate-400 italic">Este producto no ha tenido movimientos aún.</li>';
        return;
    }

    ul.innerHTML = movs.map(m => {
        const ubi = m.ubicaciones_internas?.nombre || 'General / Desconocida';
        const colorCant = m.cantidad_movida > 0 ? 'text-emerald-600' : 'text-red-600';
        const signo = m.cantidad_movida > 0 ? '+' : '';
        const fecha = new Date(m.fecha_movimiento).toLocaleString();

        return `
        <li class="py-4 flex justify-between items-center hover:bg-slate-50 px-2 rounded transition-colors">
            <div>
                <p class="font-bold text-slate-700">${m.tipo_movimiento}</p>
                <p class="text-xs text-slate-500 font-medium">📍 ${ubi} | 🕒 ${fecha}</p>
                <p class="text-xs text-slate-400 mt-1 italic">${m.referencia || ''}</p>
            </div>
            <div class="font-mono text-lg font-bold ${colorCant} bg-slate-100 px-3 py-1 rounded shadow-inner border border-slate-200">
                ${signo}${m.cantidad_movida}
            </div>
        </li>`;
    }).join('');
}
