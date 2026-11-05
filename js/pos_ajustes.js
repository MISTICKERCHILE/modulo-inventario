// ==========================================================
// POS: anular ventas y devolver productos (con PIN de admin)
// ==========================================================
const paEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const paMonto = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: paDec(m), maximumFractionDigits: paDec(m) });
const PA = { venta: null, detalles: [], equipo: [], metodos: [], alTerminar: null };
const paEsAdminRol = (r) => /admin|due[nñ]o/i.test(r || '');
// En el POS el cajero opera con la sesión del negocio: si hay un cajero activo sin rol de admin, se exige el PIN de un admin.
function paNecesitaPin() {
    if (window.cajeroActivo) return !paEsAdminRol(window.cajeroActivo.rol);
    return !['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
}
function paModal(html) {
    let m = document.getElementById('modal-pa');
    if (!m) { m = document.createElement('div'); m.id = 'modal-pa'; m.className = 'fixed inset-0 z-[400] bg-slate-900/70 flex items-center justify-center p-3'; document.body.appendChild(m); }
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto p-5 space-y-3 text-slate-800">${html}</div>`;
}
const paCerrar = () => document.getElementById('modal-pa')?.remove();

// ---------- Ventas de hoy (desde el POS) ----------
window.abrirVentasDelDia = async function () {
    document.getElementById('pos-dropdown-menu')?.classList.add('hidden');
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    let q = clienteSupabase.from('ventas').select('id, numero_ticket, total, estado, metodo_pago, created_at, moneda').eq('id_empresa', window.miEmpresaId)
        .gte('created_at', ini.toISOString()).eq('origen', 'POS').order('created_at', { ascending: false }).limit(100);
    if (window.sucursalActivaID) q = q.eq('id_sucursal', window.sucursalActivaID);
    const { data, error } = await q;
    paModal(`<div class="flex justify-between"><h3 class="text-lg font-black">Ventas de hoy</h3><button onclick="paCerrar()" class="text-slate-400 text-2xl">✕</button></div>
        <p class="text-xs text-slate-500">Elige una venta para anularla o devolver productos.</p>
        ${error ? `<p class="text-red-500 text-sm">${paEsc(error.message)}</p>` : ''}
        <div class="divide-y">${(data || []).map(v => `<div class="py-2 flex items-center justify-between gap-2"><div><p class="font-black">#${paEsc(v.numero_ticket)} <span class="text-xs font-bold ${v.estado === 'ANULADA' ? 'text-red-600' : 'text-slate-400'}">${paEsc(v.estado.replace('_', ' '))}</span></p>
            <p class="text-xs text-slate-500">${new Date(v.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · ${paEsc(v.metodo_pago || '')} · ${paMonto(v.total, v.moneda)}</p></div>
            ${v.estado === 'ANULADA' ? '' : `<div class="flex gap-1 shrink-0">${v.estado === 'COMPLETADA' ? `<button onclick="abrirAjusteVenta('${v.id}','devolucion')" class="px-2 py-1 border rounded-lg text-xs font-bold">↩️ Devolver</button>` : ''}<button onclick="abrirAjusteVenta('${v.id}','anulacion')" class="px-2 py-1 border border-red-200 text-red-600 rounded-lg text-xs font-bold">🚫 Anular</button></div>`}</div>`).join('') || '<p class="py-6 text-center text-slate-400 text-sm">Aún no hay ventas hoy.</p>'}</div>`);
    PA.alTerminar = () => window.abrirVentasDelDia();
};

// ---------- Anular / devolver ----------
window.abrirAjusteVenta = async function (idVenta, tipo, alTerminar) {
    if (alTerminar) PA.alTerminar = alTerminar;
    const [vr, dr, mr] = await Promise.all([
        clienteSupabase.from('ventas').select('id, numero_ticket, total, estado, metodo_pago, id_metodo_pago, moneda').eq('id', idVenta).maybeSingle(),
        clienteSupabase.from('ventas_detalles').select('id, id_producto, cantidad, precio_unitario, subtotal').eq('id_venta', idVenta),
        clienteSupabase.from('metodos_pago').select('id, nombre, activo, tipo').eq('id_empresa', window.miEmpresaId)
    ]);
    PA.venta = vr.data; PA.tipo = tipo; PA.detalles = dr.data || []; PA.metodos = (mr.data || []).filter(m => m.activo !== false && String(m.tipo || '').toUpperCase() !== 'CREDITO');
    if (!PA.venta) return alert('No se encontró la venta.');
    const ids = [...new Set(PA.detalles.map(d => d.id_producto).filter(Boolean))], nombres = {};
    if (ids.length) { const { data: ps } = await clienteSupabase.from('productos').select('id, nombre').in('id', ids); (ps || []).forEach(p => nombres[p.id] = p.nombre); }
    PA.detalles.forEach(d => d.nombre = nombres[d.id_producto] || 'Producto');
    PA.equipo = [];
    if (paNecesitaPin()) {
        const { data: eq } = await clienteSupabase.rpc('listar_equipo_pos', { p_id_empresa: window.miEmpresaId });
        PA.equipo = (eq || []).filter(m => paEsAdminRol(m.rol) && m.tiene_pin);
    }
    const v = PA.venta, dev = tipo === 'devolucion';
    paModal(`<div class="flex justify-between items-start"><div><p class="text-xs font-bold text-slate-400 uppercase">${dev ? '↩️ Devolver productos' : '🚫 Anular venta'}</p><h3 class="text-xl font-black">Venta #${paEsc(v.numero_ticket)} · ${paMonto(v.total, v.moneda)}</h3></div><button onclick="paCerrar()" class="text-slate-400 text-2xl">✕</button></div>
        ${dev ? `<div class="space-y-2">${PA.detalles.map((d, i) => `<div class="border rounded-xl p-3"><div class="flex justify-between text-sm font-bold"><span>${paEsc(d.nombre)}</span><span class="text-slate-500">${Number(d.cantidad)} × ${paMonto(d.precio_unitario, v.moneda)}</span></div>
            <div class="flex items-center gap-3 mt-2 text-sm"><label class="flex items-center gap-1">Devuelve <input type="number" id="pa-c-${i}" min="0" max="${d.cantidad}" step="any" value="0" class="w-20 px-2 py-1 border rounded-lg text-right"></label>
            <label class="flex items-center gap-1 text-xs"><input type="checkbox" id="pa-s-${i}" checked> Vuelve al stock</label></div></div>`).join('')}</div>
            <p class="text-[11px] text-slate-400">Si el producto vuelve dañado, desmarca “Vuelve al stock”.</p>`
            : `<p class="text-sm text-slate-600">Se anula toda la venta y el stock vuelve al inventario.${v.estado === 'POR_COBRAR' ? ' Es una venta a crédito: la deuda queda anulada.' : ''}</p>`}
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Motivo *</label><input id="pa-motivo" maxlength="300" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: error de digitación, cliente se arrepintió"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Cómo se devuelve el dinero</label><select id="pa-metodo" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${PA.metodos.map(m => `<option value="${m.id}" ${m.id === v.id_metodo_pago ? 'selected' : ''}>${paEsc(m.nombre)}</option>`).join('') || `<option value="">${paEsc(v.metodo_pago || '')}</option>`}</select></div>
        ${paNecesitaPin() ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2"><p class="text-xs font-bold text-amber-800">🔒 Autoriza un administrador o dueño</p>
            ${PA.equipo.length ? `<select id="pa-admin" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${PA.equipo.map(m => `<option value="${m.id_usuario}">${paEsc(m.nombre || 'Usuario')} (${paEsc(m.rol)})</option>`).join('')}</select>
            <input id="pa-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="PIN" class="w-full px-3 py-2 border rounded-lg text-sm tracking-widest">` : '<p class="text-xs text-red-600">No hay administradores con PIN. Asígnalo en Parámetros.</p>'}</div>` : ''}
        <p id="pa-err" class="text-sm font-bold text-red-600"></p>
        <button id="pa-ok" onclick="paConfirmar()" class="w-full py-3 rounded-xl font-black text-white ${dev ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}">${dev ? 'Confirmar devolución' : 'Anular venta'}</button>`);
};

window.paConfirmar = async function () {
    const v = PA.venta, dev = PA.tipo === 'devolucion', err = (t) => { document.getElementById('pa-err').innerText = t; };
    const motivo = document.getElementById('pa-motivo').value.trim();
    if (motivo.length < 3) return err('Escribe el motivo.');
    const args = { p_id_venta: v.id, p_motivo: motivo, p_id_autoriza: null, p_pin: null, p_id_metodo_reembolso: document.getElementById('pa-metodo').value || null };
    if (paNecesitaPin()) {
        const pin = (document.getElementById('pa-pin')?.value || '').trim();
        if (!document.getElementById('pa-admin') || !/^[0-9]{4,6}$/.test(pin)) return err('Elige un administrador e ingresa su PIN (4 a 6 dígitos).');
        args.p_id_autoriza = document.getElementById('pa-admin').value; args.p_pin = pin;
    }
    let fn = 'anular_venta';
    if (dev) {
        const items = PA.detalles.map((d, i) => ({ id_detalle: d.id, cantidad: parseFloat(document.getElementById('pa-c-' + i).value) || 0, repone_stock: document.getElementById('pa-s-' + i).checked })).filter(x => x.cantidad > 0);
        if (!items.length) return err('Indica cuánto se devuelve de al menos un producto.');
        if (items.some((x, k) => x.cantidad > Number(PA.detalles.find(d => d.id === x.id_detalle).cantidad))) return err('No puedes devolver más de lo vendido.');
        args.p_items = items; fn = 'devolver_items_venta';
    }
    const btn = document.getElementById('pa-ok'); btn.disabled = true; btn.innerText = 'Procesando…';
    const { data, error } = await clienteSupabase.rpc(fn, args);
    btn.disabled = false; btn.innerText = dev ? 'Confirmar devolución' : 'Anular venta';
    if (error) return err(error.message);
    if (!data || data.ok === false) { const p = document.getElementById('pa-pin'); if (p) p.value = ''; return err((data && data.error) || 'No se pudo completar.'); }
    paModal(`<div class="text-center space-y-3"><p class="text-5xl">✅</p><h3 class="text-xl font-black">${dev ? 'Devolución registrada' : 'Venta anulada'}</h3>
        <p class="text-lg font-black text-slate-800">Devuelve ${paMonto(data.monto_a_devolver, data.moneda)} al cliente</p><p class="text-sm text-slate-500">por ${paEsc(data.metodo || 'la forma elegida')}</p>
        ${data.dia_cerrado ? '<p class="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-left">Esta venta es de un día cuyo cierre ya se hizo. El cierre no cambia; el ajuste queda en el Historial. Si devuelves efectivo hoy, anótalo en el cierre de hoy como “otros cobros” con monto negativo.</p>' : ''}
        <button onclick="paCerrar(); if (PA.alTerminar) PA.alTerminar();" class="w-full py-3 rounded-xl font-black bg-slate-800 text-white">Listo</button></div>`);
};
