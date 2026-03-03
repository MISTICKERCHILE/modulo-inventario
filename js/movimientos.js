// --- NAVEGACIÓN DE TABS EN MOVIMIENTOS ---
window.cambiarTabMovimientos = function(tab) {
    ['pedidos', 'compras', 'ventas', 'otros'].forEach(t => {
        const el = document.getElementById(`seccion-mov-${t}`);
        if(el) el.style.display = tab === t ? 'block' : 'none';
        
        const btn = document.getElementById(`tab-mov-${t}`);
        if(btn) btn.className = tab === t ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700 transition-colors';
    });

    if(tab === 'pedidos') window.cargarPedidosPlanificados();
    // if(tab === 'compras') window.cargarComprasDirectas(); // Próxima Fase
    // if(tab === 'ventas') window.prepararPanelVentas(); // Próxima Fase
    // if(tab === 'otros') window.cargarOtrosMovimientos(); // Próxima Fase
}


// ==========================================
// --- SECCIÓN: PEDIDOS PLANIFICADOS (SUGERENCIAS Y TRÁNSITO) ---
// ==========================================
window.cargarPedidosPlanificados = async function() {
    // 1. CARGAMOS LAS ALERTAS DE STOCK (AQUÍ TRAEMOS LAS ABREVIATURAS REALES)
    const { data: prods } = await clienteSupabase
        .from('productos')
        .select(`
            id, nombre, stock_minimo_ua, stock_ideal_ua, cant_en_ua_de_uc, 
            inventario_saldos(cantidad_actual_ua),
            id_unidad_almacenamiento(abreviatura),
            id_unidad_compra(abreviatura)
        `)
        .eq('id_empresa', window.miEmpresaId);

    let htmlAlertas = '';
    
    (prods || []).forEach(p => {
        const stockGlobal = p.inventario_saldos.reduce((sum, inv) => sum + Number(inv.cantidad_actual_ua), 0);
        
        // Obtenemos los nombres reales de las unidades (o valores por defecto)
        const abrevUA = p.id_unidad_almacenamiento?.abreviatura || 'Unid.';
        const abrevUC = p.id_unidad_compra?.abreviatura || 'Unid. Compra';

        if (p.stock_minimo_ua > 0 && stockGlobal <= p.stock_minimo_ua) {
            const sugeridoUA = p.stock_ideal_ua - stockGlobal; 
            const sugeridoUC = p.cant_en_ua_de_uc > 0 ? (sugeridoUA / p.cant_en_ua_de_uc).toFixed(2) : sugeridoUA;
            
            htmlAlertas += `
            <tr class="hover:bg-orange-50 transition-colors border-b border-orange-100">
                <td class="px-6 py-4 font-bold text-slate-700">${p.nombre}</td>
                <td class="px-6 py-4 text-center"><span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold">${stockGlobal} ${abrevUA}</span></td>
                <td class="px-6 py-4 text-center text-orange-800 font-bold">${sugeridoUA} ${abrevUA} <br><span class="text-xs text-orange-500 font-normal">Sugerencia: pedir ${sugeridoUC} ${abrevUC}</span></td>
                <td class="px-6 py-4 text-right">
                    <button onclick="abrirModalCompra('${p.id}', ${sugeridoUC})" class="text-sm bg-orange-500 text-white px-3 py-1 rounded shadow hover:bg-orange-600 font-bold transition-transform hover:scale-105">🛒 Generar Pedido</button>
                </td>
            </tr>`;
        }
    });
    
    const containerAlertas = document.getElementById('lista-alertas-compras');
    if(containerAlertas) {
        containerAlertas.innerHTML = htmlAlertas || '<tr><td colspan="4" class="px-6 py-8 text-center text-emerald-600 font-bold bg-emerald-50">🟢 Todo en orden. No hay productos bajo el stock mínimo.</td></tr>';
    }

    // 2. CARGAMOS LOS PEDIDOS EN TRÁNSITO
    const { data: transito } = await clienteSupabase
        .from('compras_detalles')
        .select(`
            id, cantidad_uc, precio_unitario_uc, id_producto,
            productos(nombre, cant_en_ua_de_uc, id_unidad_compra(abreviatura)), 
            compras!inner(id, fecha_compra, estado, proveedores(nombre))
        `)
        .eq('compras.estado', 'En Tránsito');

    const containerTransito = document.getElementById('lista-pedidos-transito');
    if(containerTransito) {
        containerTransito.innerHTML = (transito || []).map(t => {
            const abrevUC = t.productos?.id_unidad_compra?.abreviatura || 'Unidades';
            return `
            <tr class="hover:bg-blue-50 transition-colors border-b border-blue-100">
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-700">${t.compras.fecha_compra}</p>
                    <p class="text-xs text-slate-500 font-medium uppercase tracking-wide">🏢 ${t.compras.proveedores?.nombre || 'General'}</p>
                </td>
                <td class="px-6 py-4 font-bold text-slate-700">${t.productos?.nombre}</td>
                <td class="px-6 py-4 text-center font-bold text-blue-700 bg-blue-50 rounded">${t.cantidad_uc} ${abrevUC}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="abrirModalRecepcion('${t.compras.id}', '${t.id_producto}', '${t.productos.nombre}', ${t.cantidad_uc}, ${t.precio_unitario_uc}, ${t.productos.cant_en_ua_de_uc})" class="text-sm bg-blue-600 text-white px-3 py-2 rounded shadow hover:bg-blue-700 font-bold transition-transform hover:scale-105">✅ Recepcionar Llegada</button>
                </td>
            </tr>
            `;
        }).join('') || '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No hay camiones en camino.</td></tr>';
    }
}

// ==========================================
// --- LÓGICA DE MODALES DE COMPRA / RECEPCIÓN ---
// ==========================================
window.abrirModalCompra = async function(idProductoSugerido = null, cantSugerida = 0) {
    const [{ data: provs }, { data: prods }] = await Promise.all([
        clienteSupabase.from('proveedores').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);

    document.getElementById('compra-proveedor').innerHTML = '<option value="">Elegir Proveedor...</option>' + (provs||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    const selectProd = document.getElementById('compra-producto');
    selectProd.innerHTML = '<option value="">Elegir Producto...</option>' + (prods||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    document.getElementById('form-compra').reset();
    
    if(idProductoSugerido) {
        selectProd.value = idProductoSugerido;
        document.getElementById('compra-cantidad').value = cantSugerida;
    }
    document.getElementById('modal-compra').classList.remove('hidden');
}

document.getElementById('form-compra')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cant = parseFloat(document.getElementById('compra-cantidad').value);
    const precio = parseFloat(document.getElementById('compra-precio').value);
    
    const { data: cabecera, error: errCab } = await clienteSupabase.from('compras').insert([{
        id_empresa: window.miEmpresaId,
        id_proveedor: document.getElementById('compra-proveedor').value,
        total_compra: cant * precio,
        estado: 'En Tránsito'
    }]).select('id').single();

    if(cabecera) {
        await clienteSupabase.from('compras_detalles').insert([{
            id_compra: cabecera.id, 
            id_producto: document.getElementById('compra-producto').value, 
            cantidad_uc: cant, 
            precio_unitario_uc: precio, 
            subtotal: cant * precio
        }]);
    }

    document.getElementById('modal-compra').classList.add('hidden');
    window.cargarPedidosPlanificados(); 
});

window.abrirModalRecepcion = async function(idCompra, idProd, nombreProd, cantUC, precioUC, factorConversion) {
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    document.getElementById('rec-sucursal').innerHTML = '<option value="">Selecciona bodega destino...</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    
    document.getElementById('rec-id-compra').value = idCompra;
    document.getElementById('rec-id-producto').value = idProd;
    document.getElementById('rec-cantidad-uc').value = cantUC;
    document.getElementById('rec-precio-uc').value = precioUC;
    
    const entrarUA = cantUC * factorConversion;
    document.getElementById('rec-resumen-texto').innerText = `${nombreProd}: Ingresarán ${entrarUA} Unidades de Almacén.`;
    document.getElementById('modal-recepcion').classList.remove('hidden');
}

document.getElementById('form-recepcion')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idCompra = document.getElementById('rec-id-compra').value;
    const idProd = document.getElementById('rec-id-producto').value;
    const idSucursal = document.getElementById('rec-sucursal').value;
    const precioUC = parseFloat(document.getElementById('rec-precio-uc').value);
    
    const { data: prod } = await clienteSupabase.from('productos').select('cant_en_ua_de_uc').eq('id', idProd).single();
    const cantUA_a_sumar = parseFloat(document.getElementById('rec-cantidad-uc').value) * prod.cant_en_ua_de_uc;

    const { data: previo } = await clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua').eq('id_producto', idProd).eq('id_sucursal', idSucursal).single();
    
    if (previo) {
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: previo.cantidad_actual_ua + cantUA_a_sumar, ultima_actualizacion: new Date() }).eq('id', previo.id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSucursal, cantidad_actual_ua: cantUA_a_sumar }]);
    }

    // Aquí, cuando integremos la nueva tabla tipos_movimiento, enlazaremos este ingreso al tipo "Ingreso por Compra"
    await clienteSupabase.from('movimientos_inventario').insert([{ 
        id_empresa: window.miEmpresaId, 
        id_producto: idProd, 
        tipo_movimiento: 'INGRESO_COMPRA', 
        cantidad_movida: cantUA_a_sumar, 
        costo_unitario_movimiento: precioUC, 
        referencia: 'Recepción de Pedido' 
    }]);
    
    await clienteSupabase.from('productos').update({ ultimo_costo_uc: precioUC }).eq('id', idProd);
    await clienteSupabase.from('compras').update({ estado: 'Completada' }).eq('id', idCompra);

    document.getElementById('modal-recepcion').classList.add('hidden');
    window.cargarPedidosPlanificados(); 
});
