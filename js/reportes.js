window.cargarReportes = async function() {
    // 1. Traemos los productos y los saldos de inventario
    const [{data: prods}, {data: saldos}] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, ultimo_costo_uc, cant_en_ua_de_uc, id_unidad_almacenamiento(abreviatura)').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('inventario_saldos').select('id_producto, cantidad_actual_ua').eq('id_empresa', window.miEmpresaId)
    ]);

    // 2. Agrupar saldos: Si un producto está en "Refri 1" y "Bodega 2", los sumamos.
    const stockPorProducto = {};
    (saldos || []).forEach(s => {
        if (!stockPorProducto[s.id_producto]) stockPorProducto[s.id_producto] = 0;
        stockPorProducto[s.id_producto] += Number(s.cantidad_actual_ua);
    });

    let valorTotalGlobal = 0;
    let itemsConStock = 0;
    let htmlFilas = '';

    // 3. Calcular la valorización fila por fila
    (prods || []).forEach(p => {
        const stockFisicoUA = stockPorProducto[p.id] || 0;
        
        // Solo mostramos productos que sí tienen stock físico
        if (stockFisicoUA > 0) {
            itemsConStock++;

            // Matemática: El costo viene en "Unidad de Compra" (Ej: Caja de 10). 
            // Tenemos que dividirlo para saber cuánto cuesta 1 sola "Unidad de Almacén"
            const divisor = p.cant_en_ua_de_uc > 0 ? p.cant_en_ua_de_uc : 1;
            const costoPorUA = (p.ultimo_costo_uc || 0) / divisor;
            
            // Valorización real de este producto
            const valorTotalProd = stockFisicoUA * costoPorUA;
            valorTotalGlobal += valorTotalProd;

            const abrev = p.id_unidad_almacenamiento?.abreviatura || 'UA';

            htmlFilas += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 font-bold text-slate-700">${p.nombre}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="font-mono text-lg font-bold text-slate-800">${stockFisicoUA.toFixed(2)}</span> 
                        <span class="text-xs text-slate-500">${abrev}</span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-slate-500">
                        $${costoPorUA.toFixed(2)} <span class="text-[10px]">/ ${abrev}</span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono font-black text-emerald-700 text-lg">
                        $${valorTotalProd.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </td>
                </tr>
            `;
        }
    });

    // 4. Inyectar resultados en la pantalla
    document.getElementById('lista-rep-valorizacion').innerHTML = htmlFilas || '<tr><td colspan="4" class="text-center py-8 text-slate-400 italic">No hay productos con stock para valorizar.</td></tr>';
    
    document.getElementById('rep-kpi-valor').innerText = `$${valorTotalGlobal.toLocaleString('es-CL', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('rep-kpi-prods').innerText = prods ? prods.length : 0;
    document.getElementById('rep-kpi-stock').innerText = itemsConStock;
}
