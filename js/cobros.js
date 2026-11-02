// ==========================================================
// COBROS: cuentas por cobrar, abonos, notas de cobro,
// conversión de cotización a venta y tarjeta del dashboard de Ventas.
// ==========================================================
const CB = { cuentas: [], clientes: {}, sucursales: [], metodos: [], monedas: ['CLP'] };
const cbEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cbDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const cbFmt = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: cbDec(m), maximumFractionDigits: cbDec(m) });
const cbHoy = () => new Date().toISOString().slice(0, 10);
const cbFecha = (d) => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
const cbSaldo = (c) => Number(c.monto_deuda) - Number(c.monto_pagado);
const cbVencida = (c) => cbSaldo(c) > 0 && c.fecha_vencimiento && c.fecha_vencimiento < cbHoy();

async function cbCargarBase() {
    const [cl, su, mp, em] = await Promise.all([
        clienteSupabase.from('clientes').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('metodos_pago').select('id, nombre, tipo, activo').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('empresas').select('monedas').eq('id', window.miEmpresaId).maybeSingle()
    ]);
    CB.clientes = {}; (cl.data || []).forEach(c => CB.clientes[c.id] = c.nombre);
    CB.clientesLista = cl.data || [];
    CB.sucursales = su.data || [];
    CB.metodos = (mp.data || []).filter(m => m.activo !== false && String(m.tipo || '').toUpperCase() !== 'CREDITO');
    CB.monedas = (em.data && em.data.monedas && em.data.monedas.length) ? em.data.monedas : ['CLP'];
}

window.cargarCuentasCobrar = async function () {
    await cbCargarBase();
    const { data, error } = await clienteSupabase.from('cuentas_por_cobrar').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: false });
    if (error) console.error(error);
    CB.cuentas = data || [];
    document.getElementById('cb-lista-clientes').innerHTML = CB.clientesLista.map(c => `<option value="${cbEsc(c.nombre)}"></option>`).join('');
    document.getElementById('cb-n-sucursal').innerHTML = CB.sucursales.map(s => `<option value="${s.id}">${cbEsc(s.nombre)}</option>`).join('');
    document.getElementById('cb-n-moneda').innerHTML = CB.monedas.map(m => `<option>${m}</option>`).join('');
    document.getElementById('cb-n-vence').value = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    cbTab(window.cbTabInicial || 'cobrar'); window.cbTabInicial = null;
    cbPintar();
};

function cbTab(t) {
    document.getElementById('cb-cobrar').classList.toggle('hidden', t !== 'cobrar');
    document.getElementById('cb-nota').classList.toggle('hidden', t !== 'nota');
    ['cobrar', 'nota'].forEach(k => document.getElementById('cb-tab-' + k).className = 'px-4 py-2 text-sm font-bold border-b-2 ' + (k === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'));
}

function cbPintar() {
    // Resumen por moneda de lo pendiente
    const abiertas = CB.cuentas.filter(c => cbSaldo(c) > 0);
    const porMon = {};
    abiertas.forEach(c => { const o = porMon[c.moneda] ||= { saldo: 0, venc: 0 }; o.saldo += cbSaldo(c); if (cbVencida(c)) o.venc += cbSaldo(c); });
    const r = document.getElementById('cb-resumen');
    r.innerHTML = Object.keys(porMon).length ? Object.entries(porMon).map(([m, o]) => `<div class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-xs font-bold text-slate-500 uppercase">Por cobrar (${m})</p><p class="text-2xl font-black text-slate-800">${cbFmt(o.saldo, m)}</p>${o.venc ? `<p class="text-xs font-bold text-red-600 mt-1">${cbFmt(o.venc, m)} vencido</p>` : ''}</div>`).join('')
        : '<div class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-sm font-bold md:col-span-3">No tienes cuentas pendientes de cobro. 🎉</div>';
    const q = (document.getElementById('cb-buscar').value || '').toLowerCase().trim();
    const f = document.getElementById('cb-filtro').value;
    const filas = CB.cuentas.filter(c => {
        if (f === 'abiertas' && cbSaldo(c) <= 0) return false;
        if (f === 'vencidas' && !cbVencida(c)) return false;
        if (f === 'pagadas' && cbSaldo(c) > 0) return false;
        return !q || `${CB.clientes[c.id_cliente] || ''} ${c.concepto || ''}`.toLowerCase().includes(q);
    });
    document.getElementById('cb-tabla').innerHTML = filas.map(c => {
        const est = cbSaldo(c) <= 0 ? 'Pagada' : (cbVencida(c) ? 'Vencida' : c.estado);
        const col = { Pagada: 'bg-emerald-100 text-emerald-700', Vencida: 'bg-red-100 text-red-700', Parcial: 'bg-amber-100 text-amber-700', Pendiente: 'bg-slate-100 text-slate-600' }[est] || 'bg-slate-100 text-slate-600';
        return `<tr><td class="px-3 py-2 font-bold">${cbEsc(CB.clientes[c.id_cliente] || '—')}</td><td class="px-3 py-2 text-slate-500">${cbEsc(c.concepto || 'Venta a crédito')}</td>
            <td class="px-3 py-2 text-slate-500">${cbFecha(c.fecha_vencimiento)}</td><td class="px-3 py-2 text-right">${cbFmt(c.monto_deuda, c.moneda)}</td>
            <td class="px-3 py-2 text-right font-black">${cbFmt(cbSaldo(c), c.moneda)}</td>
            <td class="px-3 py-2 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${col}">${est}</span></td>
            <td class="px-3 py-2 text-right whitespace-nowrap"><button onclick="cbAbrirCuenta('${c.id}')" class="text-blue-600 font-bold hover:underline">${cbSaldo(c) > 0 ? 'Cobrar' : 'Ver'}</button></td></tr>`;
    }).join('');
    document.getElementById('cb-vacio').classList.toggle('hidden', filas.length > 0);
}

async function cbCrearNota() {
    const nombre = document.getElementById('cb-n-cliente').value.trim();
    if (!nombre) return alert('Indica el cliente.');
    let idCliente = (CB.clientesLista.find(c => c.nombre === nombre) || {}).id;
    if (!idCliente) {
        if (!confirm(`“${nombre}” no está en tus clientes. ¿Crearlo?`)) return;
        const { data, error } = await clienteSupabase.from('clientes').insert({ id_empresa: window.miEmpresaId, nombre }).select('id').single();
        if (error) return alert('No se pudo crear el cliente: ' + error.message);
        idCliente = data.id;
    }
    const { error } = await clienteSupabase.rpc('crear_nota_cobro', {
        p_id_empresa: window.miEmpresaId, p_id_sucursal: document.getElementById('cb-n-sucursal').value, p_id_cliente: idCliente,
        p_concepto: document.getElementById('cb-n-concepto').value, p_monto: parseFloat(document.getElementById('cb-n-monto').value) || 0,
        p_moneda: document.getElementById('cb-n-moneda').value, p_vencimiento: document.getElementById('cb-n-vence').value || null
    });
    if (error) return alert('No se pudo guardar: ' + error.message);
    ['cb-n-cliente', 'cb-n-concepto', 'cb-n-monto'].forEach(i => document.getElementById(i).value = '');
    await window.cargarCuentasCobrar(); cbTab('cobrar');
}

// ---------- Detalle y abonos ----------
function cbModal(html) {
    let m = document.getElementById('modal-cobro');
    if (!m) { m = document.createElement('div'); m.id = 'modal-cobro'; m.className = 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4'; document.body.appendChild(m); }
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">${html}</div>`;
}
const cbCerrar = () => document.getElementById('modal-cobro')?.remove();

async function cbAbrirCuenta(id) {
    const c = CB.cuentas.find(x => x.id === id); if (!c) return;
    const { data: pagos } = await clienteSupabase.from('cxc_pagos').select('*').eq('id_cuenta', id).order('created_at');
    const saldo = cbSaldo(c);
    cbModal(`<div class="flex justify-between"><div><h3 class="text-lg font-black text-slate-800">${cbEsc(CB.clientes[c.id_cliente] || '')}</h3><p class="text-xs text-slate-500">${cbEsc(c.concepto || 'Venta a crédito')} · vence ${cbFecha(c.fecha_vencimiento)}</p></div><button onclick="cbCerrar()" class="text-slate-400 text-xl">✕</button></div>
        <div class="grid grid-cols-3 gap-2 text-center text-sm"><div class="bg-slate-50 rounded-lg p-2"><p class="text-xs text-slate-500">Total</p><p class="font-black">${cbFmt(c.monto_deuda, c.moneda)}</p></div>
            <div class="bg-slate-50 rounded-lg p-2"><p class="text-xs text-slate-500">Abonado</p><p class="font-black">${cbFmt(c.monto_pagado, c.moneda)}</p></div>
            <div class="bg-orange-50 rounded-lg p-2"><p class="text-xs text-orange-600">Saldo</p><p class="font-black text-orange-700">${cbFmt(saldo, c.moneda)}</p></div></div>
        <div><p class="text-xs font-bold text-slate-500 uppercase mb-1">Abonos</p>${(pagos || []).length ? `<ul class="text-sm divide-y">${pagos.map(p => `<li class="py-1.5 flex justify-between"><span>${cbFecha(p.fecha)} · ${cbEsc(p.metodo_nombre || '')}${p.nota ? ' · ' + cbEsc(p.nota) : ''}</span><span class="font-bold">${cbFmt(p.monto, c.moneda)}</span></li>`).join('')}</ul>` : '<p class="text-sm text-slate-400">Aún sin abonos.</p>'}</div>
        ${saldo > 0 ? `<div class="border-t pt-3 space-y-2"><p class="text-xs font-bold text-slate-500 uppercase">Registrar abono</p>
            <div class="grid grid-cols-2 gap-2"><input id="cb-a-monto" type="number" min="0" step="any" value="${saldo}" class="px-3 py-2 border rounded-lg text-sm">
            <select id="cb-a-metodo" class="px-3 py-2 border rounded-lg bg-white text-sm">${CB.metodos.map(m => `<option value="${m.id}">${cbEsc(m.nombre)}</option>`).join('')}</select></div>
            <input id="cb-a-nota" maxlength="300" placeholder="Nota (opcional)" class="w-full px-3 py-2 border rounded-lg text-sm">
            <button onclick="cbAbonar('${c.id}')" class="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700">Registrar abono</button></div>` : '<p class="text-sm font-bold text-emerald-600">Cuenta pagada por completo ✔</p>'}`);
}
async function cbAbonar(id) {
    const { error } = await clienteSupabase.rpc('registrar_abono', {
        p_id_cuenta: id, p_monto: parseFloat(document.getElementById('cb-a-monto').value) || 0,
        p_id_metodo_pago: document.getElementById('cb-a-metodo').value || null, p_nota: document.getElementById('cb-a-nota').value || null });
    if (error) return alert(error.message);
    cbCerrar(); await window.cargarCuentasCobrar();
}

// ---------- Convertir cotización aceptada en venta por cobrar ----------
window.cbConvertirCotizacion = async function (idCot) {
    await cbCargarBase();
    cbModal(`<div class="flex justify-between"><h3 class="text-lg font-black text-slate-800">Convertir en venta por cobrar</h3><button onclick="cbCerrar()" class="text-slate-400 text-xl">✕</button></div>
        <p class="text-xs text-slate-500">Se crea la venta y una cuenta por cobrar con el total de la cotización. Todas las líneas deben estar vinculadas a un producto.</p>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Sucursal</label><select id="cb-c-sucursal" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${CB.sucursales.map(s => `<option value="${s.id}">${cbEsc(s.nombre)}</option>`).join('')}</select></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Vence</label><input id="cb-c-vence" type="date" value="${new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <label class="flex items-center gap-2 text-sm"><input id="cb-c-stock" type="checkbox" class="w-4 h-4"> Descontar inventario</label>
        <button onclick="cbConfirmarConversion('${idCot}')" class="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">Convertir</button>`);
};
async function cbConfirmarConversion(idCot) {
    const { error } = await clienteSupabase.rpc('convertir_cotizacion', {
        p_id: idCot, p_id_sucursal: document.getElementById('cb-c-sucursal').value,
        p_vencimiento: document.getElementById('cb-c-vence').value || null, p_descontar: document.getElementById('cb-c-stock').checked });
    if (error) return alert(error.message);
    cbCerrar(); alert('Listo: la cotización quedó convertida y la deuda aparece en Cobros.');
    if (typeof window.cargarCotizaciones === 'function') window.cargarCotizaciones();
}

// ---------- Tarjeta del dashboard: cuentas por cobrar ↔ cotizaciones pendientes ----------
window.cbModoCard = 'cuentas';
window.cargarCardCobros = async function () {
    const cont = document.getElementById('dv-card-cobros'); if (!cont) return;
    await cbCargarBase();
    const hoy = cbHoy();
    const [cu, co] = await Promise.all([
        clienteSupabase.from('cuentas_por_cobrar').select('*').eq('id_empresa', window.miEmpresaId).neq('estado', 'Pagada').order('created_at', { ascending: false }),
        clienteSupabase.from('cotizaciones').select('*').eq('id_empresa', window.miEmpresaId).in('estado', ['borrador', 'enviada']).gte('fecha_vencimiento', hoy).order('created_at', { ascending: false })
    ]);
    const lista = window.cbModoCard === 'cuentas' ? (cu.data || []).filter(c => cbSaldo(c) > 0) : (co.data || []);
    const val = (x) => window.cbModoCard === 'cuentas' ? cbSaldo(x) : Number(x.total);
    const tot = {}; lista.forEach(x => tot[x.moneda] = (tot[x.moneda] || 0) + val(x));
    document.getElementById('dv-cobros-tabs').innerHTML = [['cuentas', 'Por cobrar'], ['cotizaciones', 'Cotizaciones']].map(([k, t]) =>
        `<button onclick="event.stopPropagation(); window.cbModoCard='${k}'; cargarCardCobros()" class="px-3 py-1 rounded-full text-xs font-bold ${window.cbModoCard === k ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}">${t}</button>`).join('');
    document.getElementById('dv-cobros-total').innerText = lista.length;
    document.getElementById('dv-cobros-montos').innerHTML = Object.entries(tot).map(([m, v]) => `<span class="block">${cbFmt(v, m)}</span>`).join('') || '<span class="text-slate-400">Nada pendiente</span>';
    document.getElementById('dv-cobros-lista').innerHTML = lista.slice(0, 3).map(x => {
        const nombre = window.cbModoCard === 'cuentas' ? (CB.clientes[x.id_cliente] || '—') : x.cliente_nombre;
        return `<li class="flex justify-between gap-2 text-sm"><span class="truncate">${cbEsc(nombre)}</span><span class="font-bold whitespace-nowrap">${cbFmt(val(x), x.moneda)}</span></li>`;
    }).join('');
    cont.dataset.destino = window.cbModoCard === 'cuentas' ? 'cuentas_cobrar' : 'cotizaciones';
};
