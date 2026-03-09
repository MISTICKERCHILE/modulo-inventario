// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO Y CONTEOS ---
// ==========================================

window.sucursalActivaID = null;
window.sucursalActivaNombre = null;
window.productosGlobalConteo = [];
window.ubicacionesGlobalSucursal = []; 
window.selectConteoActivoIndex = null;
window.saldosGlobalMemoria = [];
window.ordenActualInv = { col: 'nombre', dir: 'asc' };

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

window.abrirInventarioSucursal = async function(idSuc, nombreSuc) {
    window.sucursalActivaID = idSuc;
    window.sucursalActivaNombre = nombreSuc;

    document.getElementById('inv-titulo-sucursal').innerText = `📦 Inventario: ${nombreSuc}`;
    document.getElementById('inv-vista-sucursales').classList.add('hidden');
    document.getElementById('inv-vista-detalle').classList.remove('hidden');

    const tbody = document.getElementById('lista-inventario');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 font-bold">⏳ Cargando inventario...</td></tr>';

    // 1. Traemos los datos de la base de datos
    const [{ data: saldos }, { data: ubicaciones }, { data: reglas }] = await Promise.all([
        clienteSupabase.from('inventario_saldos').select(`id, id_producto, cantidad_actual_ua, id_ubicacion, productos (nombre, id_unidad_almacenamiento(abreviatura)), ubicaciones_internas (nombre)`).eq('id_empresa', window.miEmpresaId).eq('id_sucursal', idSuc),
        clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSuc),
        clienteSupabase.from('reglas_stock_sucursal').select('id_producto, stock_minimo_ua').eq('id_empresa', window.miEmpresaId).eq('id_sucursal', idSuc)
    ]);

    window.ubicacionesGlobalSucursal = ubicaciones || [];
    
    const reglasMap = {};
    (reglas||[]).forEach(r => reglasMap[r.id_producto] = r.stock_minimo_ua);

    // 2. Preparamos los datos en memoria para que no se borren
    window.saldosGlobalMemoria = (saldos || []).map(s => ({
        id: s.id,
        id_producto: s.id_producto,
        id_ubicacion: s.id_ubicacion,
        cantidad_actual_ua: s.cantidad_actual_ua,
        nombreProducto: s.productos?.nombre || 'Producto sin nombre',
        nombreUbicacion: s.ubicaciones_internas?.nombre || 'General / Sin Ubicación Específica',
        stockMinimo: reglasMap[s.id_producto] || 0,
        abreviatura: s.productos?.id_unidad_almacenamiento?.abreviatura || 'UA'
    }));

    // 3. Mandamos a pintar la tabla
    renderizarTablaInventario(window.saldosGlobalMemoria);
}

// FUNCION QUE PINTA LA TABLA CON LOS DATOS REALES
window.renderizarTablaInventario = function(datos) {
    const tbody = document.getElementById('lista-inventario');
    
    if(!datos || datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 italic">No hay productos registrados o no coinciden con la búsqueda.</td></tr>';
        return;
    }

    const optsUbicacionesEdit = `<option value="NULL_UBI">General / Sin Ubicación Específica</option>` + 
                                window.ubicacionesGlobalSucursal.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');

    let html = '';
    
    datos.forEach(inv => {
        const estaBajo = inv.cantidad_actual_ua <= inv.stockMinimo;
        const iconoEstado = estaBajo 
            ? `<span class="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo (${inv.stockMinimo})</span>` 
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
            <td class="px-6 py-3 font-bold text-slate-700">${inv.nombreProducto}</td>
            <td class="px-6 py-3 text-right">
                <span class="font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_actual_ua.toFixed(2)}</span>
                <span class="text-xs text-slate-400 ml-1 font-bold">${inv.abreviatura}</span>
            </td>
            <td class="px-6 py-3 text-center">
                <div class="flex justify-center items-center gap-4 text-lg">
                    <button onclick="agregarASugerenciaInteligente('${inv.id_producto}', '${inv.nombreProducto.replace(/'/g, "\\'")}')" title="Agregar a Pedido" class="text-emerald-600 hover:text-emerald-800 transition-transform hover:scale-110">🛒</button>
                    <button onclick="editarProductoFull('${inv.id_producto}')" title="Editar Detalles del Producto" class="text-blue-500 hover:text-blue-700 transition-transform hover:scale-110">✏️</button>
                    <button onclick="abrirAjusteRapido('${inv.id}', '${inv.id_producto}', '${inv.nombreProducto.replace(/'/g, "\\'")}', '${inv.nombreUbicacion}', ${inv.cantidad_actual_ua}, '${inv.abreviatura}')" title="Ajustar Stock Rápido" class="text-orange-500 hover:text-orange-700 transition-transform hover:scale-110">🎯</button>
                    <button onclick="abrirHistorialKardex('${inv.id_producto}', '${inv.nombreProducto.replace(/'/g, "\\'")}')" title="Ver Historial de Movimientos" class="text-indigo-500 hover:text-indigo-700 transition-transform hover:scale-110">📜</button>
                </div>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

// LOGICA INTELIGENTE DEL CARRITO (Verifica Tránsito y Producción)
window.agregarASugerenciaInteligente = async function(idProd, nombre) {
    if(!confirm(`¿Deseas agregar "${nombre}" a la lista de pedidos por stock?`)) return;

    try {
        // 1. Verificamos si el producto ya está en una orden activa
        const { data: enCurso, error } = await clienteSupabase
            .from('compras_detalles')
            .select('estado, compras!inner(id_empresa)')
            .eq('compras.id_empresa', window.miEmpresaId)
            .eq('id_producto', idProd)
            .in('estado', ['En Tránsito', 'En Producción', 'Orden de Producción'])
            .limit(1);

        if (error) throw error;

        // Si ya está en camino o en producción, bloqueamos y avisamos
        if (enCurso && enCurso.length > 0) {
            alert(`⚠️ El producto "${nombre}" ya se encuentra en estado: "${enCurso[0].estado}". No es necesario sugerirlo de nuevo.`);
            return;
        }

        // 2. Si no está, lo agregamos a Sugerencias ajustando la regla de stock mínimo
        const { data: regla } = await clienteSupabase.from('reglas_stock_sucursal')
            .select('id, stock_minimo_ua')
            .eq('id_sucursal', window.sucursalActivaID)
            .eq('id_producto', idProd)
            .maybeSingle();

        if(!regla) {
            await clienteSupabase.from('reglas_stock_sucursal').insert({
                id_empresa: window.miEmpresaId,
                id_sucursal: window.sucursalActivaID,
                id_producto: idProd,
                stock_minimo_ua: 0.01 
            });
        } else if (regla.stock_minimo_ua <= 0) {
            await clienteSupabase.from('reglas_stock_sucursal')
                .update({ stock_minimo_ua: 0.01 })
                .eq('id', regla.id);
        }
        
        alert(`✅ "${nombre}" fue agregado con éxito a sugerencias de pedidos.`);

    } catch (err) {
        alert("❌ Error de sistema: " + err.message);
    }
}

// FILTRO INTELIGENTE (Sin recargar página)
window.filtrarInventarioLocal = function(texto) {
    const term = texto.toLowerCase().trim();
    const filtrados = window.saldosGlobalMemoria.filter(s => 
        s.nombreProducto.toLowerCase().includes(term) || 
        s.nombreUbicacion.toLowerCase().includes(term)
    );
    renderizarTablaInventario(filtrados);
}

// ORDENAMIENTO (Igual que en productos)
window.ordenarInventario = function(columna) {
    const dir = (window.ordenActualInv.col === columna && window.ordenActualInv.dir === 'asc') ? 'desc' : 'asc';
    window.ordenActualInv = { col: columna, dir: dir };

    const datosOrdenados = [...window.saldosGlobalMemoria].sort((a, b) => {
        let valA, valB;
        if(columna === 'nombre') { valA = a.nombreProducto; valB = b.nombreProducto; }
        else if(columna === 'ubicacion') { valA = a.nombreUbicacion; valB = b.nombreUbicacion; }
        else if(columna === 'stock') { valA = a.cantidad_actual_ua; valB = b.cantidad_actual_ua; }
        else if(columna === 'estado') { valA = a.cantidad_actual_ua <= a.stockMinimo; valB = b.cantidad_actual_ua <= b.stockMinimo; }
        
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    renderizarTablaInventario(datosOrdenados);
}

// ACCIÓN: AGREGAR A PEDIDO (La joya de la corona 💎)
window.agregarASugerenciaInteligente = async function(idProd, nombre) {
    if(!confirm(`¿Deseas agregar "${nombre}" a la lista de pedidos?`)) return;

    try {
        // 1. Verificar si ya está en una orden en curso (Tránsito o Producción)
        const { data: enCurso, error: errCurso } = await clienteSupabase
            .from('compras_detalles')
            .select('id, estado, compras!inner(id_empresa)')
            .eq('compras.id_empresa', window.miEmpresaId)
            .eq('id_producto', idProd)
            .in('estado', ['En Tránsito', 'En Producción'])
            .limit(1);

        if (errCurso) throw errCurso;

        if (enCurso && enCurso.length > 0) {
            alert(`⚠️ "${nombre}" ya se encuentra en estado "${enCurso[0].estado}". Por favor, revisa tus órdenes en curso.`);
            return; // Detenemos la ejecución
        }

        // 2. Si no está en curso, lo agregamos a sugerencias creando/actualizando la regla
        const { data: regla } = await clienteSupabase.from('reglas_stock_sucursal')
            .select('id, stock_minimo_ua')
            .eq('id_sucursal', window.sucursalActivaID)
            .eq('id_producto', idProd)
            .maybeSingle();

        if(!regla) {
            // Creamos una regla mínima para que salte la alerta
            await clienteSupabase.from('reglas_stock_sucursal').insert({
                id_empresa: window.miEmpresaId,
                id_sucursal: window.sucursalActivaID,
                id_producto: idProd,
                stock_minimo_ua: 0.01 
            });
        } else if (regla.stock_minimo_ua <= 0) {
            // Si la regla existe pero es 0, la subimos un poco para forzar la sugerencia
            await clienteSupabase.from('reglas_stock_sucursal')
                .update({ stock_minimo_ua: 0.01 })
                .eq('id', regla.id);
        }
        
        alert(`✅ "${nombre}" se ha agregado a sugerencias de pedidos.`);
        // Opcional: Recargar el inventario para actualizar la UI si tienes un indicador visual
        // window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre);

    } catch (err) {
        alert("Error al procesar el pedido: " + err.message);
        console.error(err);
    }
}

window.cambiarUbicacionSaldo = async function(idSaldo, nuevoIdUbicacionStr) {
    const idUbicacionFinal = nuevoIdUbicacionStr === 'NULL_UBI' ? null : nuevoIdUbicacionStr;
    await clienteSupabase.from('inventario_saldos').update({ id_ubicacion: idUbicacionFinal, ultima_actualizacion: new Date() }).eq('id', idSaldo);
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre); 
}

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
    if(!idUbicacion) { 
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-8">Selecciona una ubicación.</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-emerald-600 py-8 font-bold animate-pulse">⏳ Cargando catálogo y saldos...</td></tr>';

    try {
        // 1. Traemos TODOS los productos físicos del catálogo
        const { data: prodsFisicos } = await clienteSupabase.from('productos')
            .select('id, nombre, id_unidad_almacenamiento(abreviatura)')
            .eq('id_empresa', window.miEmpresaId)
            .is('control_stock', true)
            .order('nombre');

        // 2. Traemos TODOS los saldos actuales de esta sucursal
        const { data: saldosActuales } = await clienteSupabase.from('inventario_saldos')
            .select('id_producto, cantidad_actual_ua, id_ubicacion')
            .eq('id_sucursal', window.sucursalActivaID);

        let html = '';
        let contadorFilas = 0;

        // 3. Cruzamos los datos según la regla de negocio
        (prodsFisicos || []).forEach(p => {
            const saldosDelProducto = (saldosActuales || []).filter(s => s.id_producto === p.id);
            let mostrar = false;
            let cantActual = 0;

            if (idUbicacion === 'GENERAL') {
                // REGLA GENERAL: Mostrar si tiene saldo en 'General' (NULL) o si es un producto totalmente NUEVO
                const saldoGeneral = saldosDelProducto.find(s => s.id_ubicacion === null);
                const sinNingunSaldo = saldosDelProducto.length === 0;

                if (saldoGeneral || sinNingunSaldo) {
                    mostrar = true;
                    cantActual = saldoGeneral ? saldoGeneral.cantidad_actual_ua : 0;
                }
            } else {
                // REGLA BODEGA ESPECÍFICA: Solo mostrar si YA existe físicamente en esa ubicación
                const saldoEspecifico = saldosDelProducto.find(s => s.id_ubicacion === idUbicacion);
                if (saldoEspecifico) {
                    mostrar = true;
                    cantActual = saldoEspecifico.cantidad_actual_ua;
                }
            }

            // Si cumple la regla, dibujamos la fila
            if (mostrar) {
                contadorFilas++;
                const abrev = p.id_unidad_almacenamiento?.abreviatura || 'UA';
                html += `
                <tr class="border-b border-slate-100 fila-conteo-item hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 font-medium text-sm text-slate-700">
                        ${p.nombre}
                        <input type="hidden" class="cm-select-prod" value="${p.id}">
                        <input type="hidden" class="cm-cant-anterior" value="${cantActual}">
                    </td>
                    <td class="py-3 px-4 text-center">
                        <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">${abrev}</span>
                    </td>
                    <td class="py-3 px-4 relative flex justify-center flex-col items-center">
                        <span class="text-[10px] text-slate-400 font-bold mb-1">Stock Sistema: ${cantActual}</span>
                        <input type="number" step="0.01" value="${cantActual}" class="w-24 px-2 py-1 border border-slate-300 rounded text-center cm-input-cant font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner">
                    </td>
                    <td class="py-3 px-4 text-right">
                        <button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-red-500 text-lg transition-transform hover:scale-110">🗑️</button>
                    </td>
                </tr>`;
            }
        });

        // 4. Si la bodega está realmente vacía, mostramos el mensaje
        if (contadorFilas === 0) {
            tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-slate-400 py-12">
                    <p class="text-lg">📭 Ubicación Vacía</p>
                    <p class="text-xs mt-1">No hay productos registrados aquí. Usa el botón "+ Agregar Fila" para sumar un producto a esta ubicación.</p>
                </td>
            </tr>`;
        } else {
            tbody.innerHTML = html;
        }

    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500 py-8">❌ Error al cargar los datos.</td></tr>';
    }
}

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
    setTimeout(() => document.getElementById(`search-cm-prod-${idx}`).focus(), 50);
}

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
    window.abrirModalProducto(false, inputActual); 
}

window.actualizarSelectsMapeoCSV = async function(nuevoIdProducto) {
    const { data: prodsERP } = await clienteSupabase.from('productos').select('id, nombre, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre');
    
    window.productosERPGlobal = prodsERP || []; 
    window.productosGlobalConteo = prodsERP || []; 

    if (window.selectCSVActivoIndex !== null && nuevoIdProducto) {
        const nuevoProd = window.productosERPGlobal.find(p => p.id === nuevoIdProducto);
        if(nuevoProd) window.seleccionarProductoCSV(window.selectCSVActivoIndex, nuevoProd.id, nuevoProd.nombre);
        window.selectCSVActivoIndex = null; 
    }

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

window.abrirHistorialKardex = async function(idProd, nombreProd) {
    document.getElementById('hm-subtitulo').innerText = `Producto: ${nombreProd}`;
    document.getElementById('modal-historial').classList.remove('hidden');
    const timeline = document.getElementById('hm-timeline');
    timeline.innerHTML = '<p class="text-center py-8 text-slate-500">⏳ Trazando movimientos...</p>';

    const { data } = await clienteSupabase.from('movimientos_inventario')
        .select('fecha_movimiento, tipo_movimiento, cantidad_movida, referencia, ubicaciones_internas(nombre)')
        .eq('id_empresa', window.miEmpresaId)
        .eq('id_producto', idProd)
        .order('fecha_movimiento', { ascending: true }); 

    if(!data || data.length === 0) {
        timeline.innerHTML = '<p class="text-center py-8 text-slate-500 italic">No hay historial registrado.</p>';
        return;
    }

    let saldoAcumulado = 0;
    const movimientosCalculados = data.map(d => {
        saldoAcumulado += d.cantidad_movida;
        return { ...d, saldoAcumulado };
    }).reverse();

    timeline.innerHTML = movimientosCalculados.map(d => {
        const f = new Date(d.fecha_movimiento);
        const fecha = f.toLocaleDateString('es-CL') + ' ' + f.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});
        
        const isPos = d.cantidad_movida > 0;
        const color = isPos ? 'text-emerald-600' : 'text-red-600';
        const bg = isPos ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100';
        const ubi = d.ubicaciones_internas?.nombre || 'Bodega General';
        const signo = isPos ? '+' : '';

        return `
        <div class="relative pl-6 sm:pl-8 py-2">
            <div class="absolute left-[-5px] top-4 w-3 h-3 rounded-full ${isPos ? 'bg-emerald-500' : 'bg-red-500'} ring-4 ring-white"></div>
            <div class="bg-white p-3 sm:p-4 rounded-lg border shadow-sm ${bg}">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-xs font-bold text-slate-500">${fecha}</span>
                    <span class="font-mono font-black text-lg ${color}">${signo}${d.cantidad_movida}</span>
                </div>
                <div class="flex justify-between items-end mt-2">
                    <div>
                        <p class="text-sm font-bold text-slate-800 uppercase">${d.tipo_movimiento.replace(/_/g, ' ')}</p>
                        <p class="text-xs text-slate-500 mt-0.5">📍 ${ubi} <br> <span class="italic text-[10px]">"${d.referencia || ''}"</span></p>
                    </div>
                    <div class="text-right">
                        <span class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Stock Histórico</span>
                        <span class="font-mono font-bold text-slate-700 text-sm bg-white px-2 py-1 rounded border">${d.saldoAcumulado.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.abrirAjusteRapido = function(idSaldo, idProd, nombreProd, ubiNombre, cantActual, abrev) {
    document.getElementById('ar-id-saldo').value = idSaldo;
    document.getElementById('ar-id-prod').value = idProd;
    document.getElementById('ar-titulo').innerText = nombreProd;
    document.getElementById('ar-ubi').innerText = ubiNombre;
    document.getElementById('ar-cant').value = cantActual;
    document.getElementById('ar-abrev').innerText = abrev;
    document.getElementById('modal-ajuste-rapido').classList.remove('hidden');
}

// NUEVO: EL CEREBRO DEL FORMULARIO DE AJUSTE RÁPIDO PARA QUE NO RECARGUE LA PÁGINA
document.getElementById('form-ajuste-rapido')?.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evitamos que se recargue la pantalla
    const idSaldo = document.getElementById('ar-id-saldo').value;
    const idProd = document.getElementById('ar-id-prod').value;
    const cantNueva = parseFloat(document.getElementById('ar-cant').value);

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "⏳ Aplicando..."; btn.disabled = true;

    // Buscamos el stock anterior y la ubicación en la base de datos
    const { data: previo } = await clienteSupabase.from('inventario_saldos').select('cantidad_actual_ua, id_ubicacion, id_sucursal').eq('id', idSaldo).single();
    
    if(previo) {
        const diferencia = cantNueva - previo.cantidad_actual_ua;
        
        if(diferencia !== 0) {
            // Actualizamos la cantidad
            await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: cantNueva, ultima_actualizacion: new Date() }).eq('id', idSaldo);
            
            // Guardamos el recibo (log) en el historial
            await clienteSupabase.from('movimientos_inventario').insert([{ 
                id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: previo.id_ubicacion, 
                tipo_movimiento: 'AJUSTE_CONTEO', cantidad_movida: diferencia, referencia: 'Ajuste Rápido Individual' 
            }]);
        }
    }

    document.getElementById('modal-ajuste-rapido').classList.add('hidden');
    btn.innerText = "Aplicar"; btn.disabled = false;
    
    // Refrescamos visualmente la tabla de fondo
    window.abrirInventarioSucursal(window.sucursalActivaID, window.sucursalActivaNombre);
});


// ==========================================
// --- IMPRESIÓN DE PLANILLA FÍSICA ---
// ==========================================
window.imprimirPlanillaConteo = function() {
    const ubiSelect = document.getElementById('cm-ubicacion');
    if(!ubiSelect || !ubiSelect.value) {
        return alert("❌ Por favor, selecciona una ubicación a contar primero para generar la planilla.");
    }

    const filas = document.querySelectorAll('.fila-conteo-item');
    if(filas.length === 0) {
        return alert("❌ No hay productos en la lista para imprimir.");
    }

    const nombreSucursal = window.sucursalActivaNombre || 'General';
    const nombreUbicacion = ubiSelect.options[ubiSelect.selectedIndex].text;
    const fechaHoy = new Date().toLocaleDateString('es-CL');

    let filasHtml = '';
    filas.forEach(tr => {
        let celdaNombre = tr.querySelector('td:nth-child(1)');
        let inputBusqueda = celdaNombre.querySelector('input[type="text"]');
        let nombreProd = "";
        
        if (inputBusqueda && inputBusqueda.value) {
            nombreProd = inputBusqueda.value.trim();
        } else {
            let clone = celdaNombre.cloneNode(true);
            clone.querySelectorAll('input, div').forEach(el => el.remove());
            nombreProd = clone.textContent.trim();
        }

        if(!nombreProd) return; 
        
        let abrev = tr.querySelector('td:nth-child(2)').textContent.trim();

        filasHtml += `
            <tr>
                <td class="prod-col">${nombreProd}</td>
                <td class="box-col"></td>
                <td class="unit-col">${abrev}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Planilla de Conteo - ${nombreUbicacion}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #333; }
                .header-box { border: 2px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .header-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 15px 0; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .info-grid { display: flex; flex-wrap: wrap; gap: 15px; }
                .info-item { flex: 1 1 45%; font-size: 14px; }
                .info-item strong { text-transform: uppercase; font-size: 12px; color: #555; display: block; }
                .info-item .line { border-bottom: 1px solid #000; height: 20px; display: block; margin-top: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 12px 8px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 12px; }
                thead { display: table-header-group; } 
                tr { page-break-inside: avoid; }
                .prod-col { font-weight: bold; font-size: 14px; }
                .box-col { width: 120px; }
                .unit-col { width: 60px; text-align: center; font-size: 12px; color: #666; font-weight: bold;}
                @media print { body { padding: 0; } @page { margin: 15mm; } .header-box { background-color: white !important; -webkit-print-color-adjust: exact; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="header-box">
                <h1 class="header-title">Planilla de Conteo Físico</h1>
                <div class="info-grid">
                    <div class="info-item"><strong>Sucursal:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${nombreSucursal}</div></div>
                    <div class="info-item"><strong>Ubicación a Contar:</strong><div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${nombreUbicacion}</div></div>
                    <div class="info-item"><strong>Responsable del Conteo:</strong><span class="line"></span></div>
                    <div class="info-item"><strong>Fecha:</strong><div style="font-size: 16px; margin-top: 4px;">${fechaHoy}</div></div>
                </div>
            </div>
            <table>
                <thead><tr><th>Producto / Insumo</th><th style="text-align: center;">Cantidad Contada</th><th style="text-align: center;">Unidad</th></tr></thead>
                <tbody>${filasHtml}</tbody>
            </table>
            <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
