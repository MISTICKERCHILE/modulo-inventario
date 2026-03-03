
// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO ---
// ==========================================

window.cargarInventario = async function() {
    const { data } = await clienteSupabase
        .from('inventario_saldos')
        .select(`
            id, cantidad_actual_ua, 
            productos (id, nombre, stock_minimo_ua), 
            sucursales (nombre)
        `)
        .eq('id_empresa', window.miEmpresaId)
        .order('cantidad_actual_ua', { ascending: true }); 

    const tbody = document.getElementById('lista-inventario');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">No hay registros de inventario aún. Registra tu primer conteo físico.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(inv => {
        const stockMinimo = inv.productos?.stock_minimo_ua || 0;
        const estaBajo = inv.cantidad_actual_ua <= stockMinimo;
        const iconoEstado = estaBajo 
            ? '<span class="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo</span>' 
            : '<span class="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full w-max border border-emerald-200">🟢 OK</span>';

        return `
        <tr class="hover:bg-slate-50 border-b transition-colors">
            <td class="px-6 py-4">${iconoEstado}</td>
            <td class="px-6 py-4 font-bold text-slate-700">${inv.productos?.nombre || 'Producto Eliminado'}</td>
            <td class="px-6 py-4 text-slate-500">${inv.sucursales?.nombre || 'N/A'}</td>
            <td class="px-6 py-4 text-right font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_actual_ua}</td>
        </tr>`;
    }).join('');
}

window.abrirModalInventario = async function() {
    const [{ data: sucursales }, { data: productos }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('productos').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);
    document.getElementById('inv-sucursal').innerHTML = '<option value="">Elegir sucursal...</option>' + (sucursales||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    document.getElementById('inv-producto').innerHTML = '<option value="">Elegir producto...</option>' + (productos||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    document.getElementById('form-inventario').reset();
    document.getElementById('modal-inventario').classList.remove('hidden');
}

window.cerrarModalInventario = function() { 
    document.getElementById('modal-inventario').classList.add('hidden'); 
}

document.getElementById('form-inventario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idProd = document.getElementById('inv-producto').value;
    const idSuc = document.getElementById('inv-sucursal').value;
    const nuevaCant = parseFloat(document.getElementById('inv-cantidad').value);

    const { data: previo } = await clienteSupabase
        .from('inventario_saldos')
        .select('id, cantidad_actual_ua')
        .eq('id_producto', idProd)
        .eq('id_sucursal', idSuc)
        .single(); 

    let cantAnterior = 0;
    if (previo) {
        cantAnterior = previo.cantidad_actual_ua;
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: nuevaCant, ultima_actualizacion: new Date() }).eq('id', previo.id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, cantidad_actual_ua: nuevaCant }]);
    }

    const diferencia = nuevaCant - cantAnterior;
    if (diferencia !== 0) {
        // Asumimos un "Ajuste" general por ahora. Cuando tengamos "tipos_movimiento" activos, 
        // podríamos asociarlo a un id de movimiento en específico.
        await clienteSupabase.from('movimientos_inventario').insert([{ 
            id_empresa: window.miEmpresaId, 
            id_producto: idProd, 
            tipo_movimiento: 'AJUSTE', 
            cantidad_movida: diferencia, 
            referencia: 'Ajuste por Conteo Físico' 
        }]);
    }
    
    window.cerrarModalInventario();
    window.cargarInventario(); 
});
