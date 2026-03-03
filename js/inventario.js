// ==========================================
// --- MÓDULO B: INVENTARIO FÍSICO (AGRUPADO POR SUCURSAL) ---
// ==========================================

window.cargarInventario = async function() {
    // 1. Traemos los saldos (que ahora pueden estar en distintas ubicaciones)
    const { data: saldos } = await clienteSupabase
        .from('inventario_saldos')
        .select(`
            id_producto, cantidad_actual_ua, id_sucursal, 
            productos (nombre), 
            sucursales (nombre)
        `)
        .eq('id_empresa', window.miEmpresaId); 

    // 2. Traemos las reglas específicas por sucursal
    const { data: reglas } = await clienteSupabase
        .from('reglas_stock_sucursal')
        .select('id_producto, id_sucursal, stock_minimo_ua')
        .eq('id_empresa', window.miEmpresaId);

    const tbody = document.getElementById('lista-inventario');
    if (!tbody) return;

    if (!saldos || saldos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">No hay registros de inventario aún. Registra tu primer conteo físico.</td></tr>';
        return;
    }

    // 3. AGRUPAMOS los saldos: Sumamos todas las gavetas de una misma sucursal
    const inventarioAgrupado = {};
    saldos.forEach(s => {
        const key = `${s.id_sucursal}_${s.id_producto}`;
        if (!inventarioAgrupado[key]) {
            inventarioAgrupado[key] = {
                id_producto: s.id_producto,
                id_sucursal: s.id_sucursal,
                nombre_producto: s.productos?.nombre || 'Producto Eliminado',
                nombre_sucursal: s.sucursales?.nombre || 'N/A',
                cantidad_total: 0
            };
        }
        inventarioAgrupado[key].cantidad_total += Number(s.cantidad_actual_ua);
    });

    // 4. Creamos un "diccionario" de reglas para buscarlas rápido
    const reglasMap = {};
    (reglas || []).forEach(r => {
        reglasMap[`${r.id_sucursal}_${r.id_producto}`] = r.stock_minimo_ua;
    });

    // 5. Convertimos el grupo en lista y ordenamos alfabéticamente
    const filasAgrupadas = Object.values(inventarioAgrupado).sort((a,b) => a.nombre_producto.localeCompare(b.nombre_producto));

    tbody.innerHTML = filasAgrupadas.map(inv => {
        const key = `${inv.id_sucursal}_${inv.id_producto}`;
        const stockMinimo = reglasMap[key] || 0; // Si no tiene regla, el mínimo es 0
        const estaBajo = inv.cantidad_total <= stockMinimo;
        
        const iconoEstado = estaBajo 
            ? `<span class="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-full w-max border border-red-200">🔴 Bajo Mínimo (${stockMinimo})</span>` 
            : '<span class="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full w-max border border-emerald-200">🟢 OK</span>';

        return `
        <tr class="hover:bg-slate-50 border-b transition-colors">
            <td class="px-6 py-4">${iconoEstado}</td>
            <td class="px-6 py-4 font-bold text-slate-700">${inv.nombre_producto}</td>
            <td class="px-6 py-4 text-slate-500">${inv.nombre_sucursal}</td>
            <td class="px-6 py-4 text-right font-mono text-lg ${estaBajo ? 'text-red-600 font-bold' : 'text-slate-700'}">${inv.cantidad_total.toFixed(2)}</td>
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
    document.getElementById('div-inv-ubicacion').classList.add('hidden'); // Ocultar ubicaciones hasta que elija sucursal
    document.getElementById('modal-inventario').classList.remove('hidden');
}

// NUEVA FUNCIÓN: Trae las ubicaciones solo de la sucursal seleccionada
window.cargarUbicacionesInventario = async function(idSucursal) {
    const divUbi = document.getElementById('div-inv-ubicacion');
    const selUbi = document.getElementById('inv-ubicacion');
    
    if(!idSucursal) {
        divUbi.classList.add('hidden');
        selUbi.innerHTML = '';
        return;
    }

    const { data: ubicaciones } = await clienteSupabase.from('ubicaciones_internas').select('id, nombre').eq('id_sucursal', idSucursal);
    
    if(ubicaciones && ubicaciones.length > 0) {
        selUbi.innerHTML = '<option value="">(General de la sucursal)</option>' + ubicaciones.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    } else {
        selUbi.innerHTML = '<option value="">(Sin ubicaciones creadas en esta sucursal)</option>';
    }
    divUbi.classList.remove('hidden');
}

window.cerrarModalInventario = function() { 
    document.getElementById('modal-inventario').classList.add('hidden'); 
}

document.getElementById('form-inventario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idProd = document.getElementById('inv-producto').value;
    const idSuc = document.getElementById('inv-sucursal').value;
    const idUbi = document.getElementById('inv-ubicacion').value || null; // Puede ser nula si elige General
    const nuevaCant = parseFloat(document.getElementById('inv-cantidad').value);

    // Buscar el saldo exacto en esa sucursal Y en esa ubicación
    let query = clienteSupabase.from('inventario_saldos').select('id, cantidad_actual_ua')
        .eq('id_producto', idProd).eq('id_sucursal', idSuc);
    
    if(idUbi) query = query.eq('id_ubicacion', idUbi);
    else query = query.is('id_ubicacion', null);

    const { data: previo } = await query.maybeSingle(); 

    let cantAnterior = 0;
    if (previo) {
        cantAnterior = previo.cantidad_actual_ua;
        await clienteSupabase.from('inventario_saldos').update({ cantidad_actual_ua: nuevaCant, ultima_actualizacion: new Date() }).eq('id', previo.id);
    } else {
        await clienteSupabase.from('inventario_saldos').insert([{ 
            id_empresa: window.miEmpresaId, id_producto: idProd, id_sucursal: idSuc, id_ubicacion: idUbi, cantidad_actual_ua: nuevaCant 
        }]);
    }

    const diferencia = nuevaCant - cantAnterior;
    if (diferencia !== 0) {
        await clienteSupabase.from('movimientos_inventario').insert([{ 
            id_empresa: window.miEmpresaId, id_producto: idProd, id_ubicacion: idUbi, 
            tipo_movimiento: 'AJUSTE', cantidad_movida: diferencia, referencia: 'Ajuste por Conteo Físico' 
        }]);
    }
    
    window.cerrarModalInventario();
    window.cargarInventario(); 
});
