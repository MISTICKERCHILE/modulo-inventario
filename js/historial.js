// ==========================================================
// HISTORIAL UNIFICADO de Ventas
// ==========================================================
const HS = { tipos: new Set(), offset: 0, total: 0, filas: [], porPag: 50, temporizador: null, cargando: 0 };
const HS_TIPOS = { venta: ['🧾', 'Ventas'], cotizacion: ['📄', 'Cotizaciones'], agenda: ['📅', 'Agenda'], cobro: ['💸', 'Cobros'], abono: ['💵', 'Abonos'], cierre: ['🔒', 'Cierres'], ajuste: ['↩️', 'Ajustes'] };
const HS_COLOR = { completada: 'bg-emerald-100 text-emerald-700', pagada: 'bg-emerald-100 text-emerald-700', cuadrado: 'bg-emerald-100 text-emerald-700', entregado: 'bg-purple-100 text-purple-700',
    anulada: 'bg-red-100 text-red-700', cancelado: 'bg-red-100 text-red-700', 'con diferencia': 'bg-red-100 text-red-700', por_cobrar: 'bg-orange-100 text-orange-700', parcial: 'bg-amber-100 text-amber-700', pendiente: 'bg-slate-100 text-slate-600', 'día cerrado': 'bg-amber-100 text-amber-700' };
const hsEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hsDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const hsMonto = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: hsDec(m), maximumFractionDigits: hsDec(m) });
const hsFecha = (t) => new Date(t).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const hsEstadoTxt = (e) => String(e || '').replace(/_/g, ' ');

window.cargarHistorial = async function () {
    const { data } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('hs-sucursal').innerHTML = '<option value="">Todas</option>' + (data || []).map(s => `<option value="${s.id}">${hsEsc(s.nombre)}</option>`).join('');
    HS.tipos = new Set(Object.keys(HS_TIPOS)); HS.offset = 0;
    hsPintarChips(); await hsConsultar();
};
function hsPintarChips() {
    document.getElementById('hs-tipos').innerHTML = Object.entries(HS_TIPOS).map(([k, [i, t]]) =>
        `<button onclick="hsToggleTipo('${k}')" class="px-3 py-1.5 rounded-full text-xs font-bold border ${HS.tipos.has(k) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500'}">${i} ${t}</button>`).join('');
}
function hsToggleTipo(k) {
    if (HS.tipos.has(k)) { if (HS.tipos.size > 1) HS.tipos.delete(k); } else HS.tipos.add(k);
    hsPintarChips(); hsAplicar();
}
function hsBuscarDebounce() { clearTimeout(HS.temporizador); HS.temporizador = setTimeout(hsAplicar, 350); }
function hsAplicar() { HS.offset = 0; hsConsultar(); }
function hsPagina(d) { HS.offset = Math.max(0, HS.offset + d * HS.porPag); hsConsultar(); }
const hsEstadoFiltro = (t) => { const x = t.trim().toLowerCase(); return x === 'con diferencia' ? x : x.replace(/ /g, '_'); };
function hsFiltros(extra) {
    const v = (id) => document.getElementById('hs-' + id).value;
    return { tipos: [...HS.tipos], buscar: v('buscar').trim(), desde: v('desde') || null, hasta: v('hasta') || null, sucursal: v('sucursal') || null,
        estado: hsEstadoFiltro(v('estado')), ...extra };
}
async function hsConsultar() {
    const mi = ++HS.cargando, f = hsFiltros({ limite: HS.porPag, offset: HS.offset });
    document.getElementById('hs-nota').classList.toggle('hidden', !f.sucursal);
    const { data, error } = await clienteSupabase.rpc('historial_unificado', { p_id_empresa: window.miEmpresaId, p_filtros: f });
    if (mi !== HS.cargando) return;
    if (error) { document.getElementById('hs-tabla').innerHTML = `<tr><td colspan="8" class="p-6 text-center text-red-500">${hsEsc(error.message)}</td></tr>`; return; }
    HS.filas = data.filas || []; HS.total = Number(data.total || 0);
    document.getElementById('hs-tabla').innerHTML = HS.filas.map((r, i) => `<tr class="hover:bg-slate-50 cursor-pointer" onclick="hsDetalle(${i})">
        <td class="px-3 py-2 whitespace-nowrap">${hsFecha(r.ts)}</td><td class="px-3 py-2 whitespace-nowrap">${HS_TIPOS[r.tipo][0]} ${HS_TIPOS[r.tipo][1].replace(/s$/, '')}</td>
        <td class="px-3 py-2 font-bold">${hsEsc(r.numero)}</td><td class="px-3 py-2">${hsEsc(r.cliente)}</td><td class="px-3 py-2 text-slate-500 max-w-xs truncate">${hsEsc(r.detalle)}</td>
        <td class="px-3 py-2 text-slate-500">${hsEsc(r.sucursal)}</td><td class="px-3 py-2 text-right font-bold">${hsMonto(r.monto, r.moneda)}</td>
        <td class="px-3 py-2 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${HS_COLOR[r.estado] || 'bg-blue-100 text-blue-700'}">${hsEsc(hsEstadoTxt(r.estado))}</span></td></tr>`).join('');
    document.getElementById('hs-vacio').classList.toggle('hidden', HS.filas.length > 0);
    const ini = HS.total ? HS.offset + 1 : 0, fin = HS.offset + HS.filas.length;
    document.getElementById('hs-info').innerText = `${ini}–${fin} de ${HS.total.toLocaleString('es-CL')}`;
    document.getElementById('hs-prev').disabled = HS.offset === 0;
    document.getElementById('hs-next').disabled = fin >= HS.total;
}

// ---------- Detalle ----------
const HS_VISTA = { cotizacion: 'cotizaciones', agenda: 'agenda', cobro: 'cuentas_cobrar', abono: 'cuentas_cobrar', cierre: 'cierre_dia' };
async function hsDetalle(i) {
    const r = HS.filas[i]; if (!r) return;
    let extra = '';
    if (r.tipo === 'venta') {
        const { data: its } = await clienteSupabase.from('ventas_detalles').select('id_producto, cantidad, precio_unitario, subtotal').eq('id_venta', r.id);
        const ids = [...new Set((its || []).map(x => x.id_producto).filter(Boolean))];
        const nombres = {};
        if (ids.length) { const { data: ps } = await clienteSupabase.from('productos').select('id, nombre').in('id', ids); (ps || []).forEach(p => nombres[p.id] = p.nombre); }
        extra = `<table class="min-w-full text-sm mt-2"><tbody class="divide-y">${(its || []).map(x => `<tr><td class="py-1.5">${hsEsc(nombres[x.id_producto] || 'Producto')}</td><td class="py-1.5 text-right text-slate-500">${Number(x.cantidad)} × ${hsMonto(x.precio_unitario, r.moneda)}</td><td class="py-1.5 text-right font-bold">${hsMonto(x.subtotal, r.moneda)}</td></tr>`).join('') || '<tr><td class="py-2 text-slate-400">Sin líneas de detalle.</td></tr>'}</tbody></table>`;
    }
    let m = document.getElementById('modal-historial-u'); if (!m) { m = document.createElement('div'); m.id = 'modal-historial-u'; m.className = 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4'; document.body.appendChild(m); }
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-3">
        <div class="flex justify-between"><div><p class="text-xs font-bold text-slate-400 uppercase">${HS_TIPOS[r.tipo][0]} ${HS_TIPOS[r.tipo][1]} ${hsEsc(r.numero)}</p><h3 class="text-xl font-black text-slate-800">${hsEsc(r.cliente || r.detalle)}</h3></div><button onclick="document.getElementById('modal-historial-u').remove()" class="text-slate-400 text-xl">✕</button></div>
        <p class="text-sm text-slate-600">${hsFecha(r.ts)} · ${hsEsc(r.sucursal || 'Sin sucursal')}</p><p class="text-sm text-slate-600">${hsEsc(r.detalle)}</p>
        <p class="text-2xl font-black">${hsMonto(r.monto, r.moneda)} <span class="text-xs px-2 py-1 rounded-full font-bold align-middle ${HS_COLOR[r.estado] || 'bg-blue-100 text-blue-700'}">${hsEsc(hsEstadoTxt(r.estado))}</span></p>${extra}
        ${r.tipo === 'venta' && ['completada', 'por_cobrar'].includes(r.estado) ? `<div class="flex gap-2">${r.estado === 'completada' ? `<button onclick="document.getElementById('modal-historial-u').remove(); abrirAjusteVenta('${r.id}','devolucion', hsConsultar)" class="px-4 py-2 border rounded-lg text-sm font-bold">↩️ Devolver productos</button>` : ''}<button onclick="document.getElementById('modal-historial-u').remove(); abrirAjusteVenta('${r.id}','anulacion', hsConsultar)" class="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold">🚫 Anular venta</button></div>` : ''}
        ${HS_VISTA[r.tipo] ? `<button onclick="document.getElementById('modal-historial-u').remove(); cambiarVista('${HS_VISTA[r.tipo]}')" class="px-4 py-2 border rounded-lg text-sm font-bold">Ir a ${HS_TIPOS[r.tipo][1]} ↗️</button>` : ''}</div>`;
}

// ---------- CSV ----------
const hsCelda = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
async function hsDescargar() {
    const btn = document.getElementById('hs-btn-csv'); btn.disabled = true; btn.innerText = 'Preparando…';
    try {
        const { data, error } = await clienteSupabase.rpc('historial_unificado', { p_id_empresa: window.miEmpresaId, p_filtros: hsFiltros({ limite: 5000, offset: 0 }) });
        if (error) throw error;
        const filas = data.filas || [];
        const cab = ['Fecha', 'Tipo', 'N°', 'Cliente', 'Detalle', 'Sucursal', 'Moneda', 'Monto', 'Estado'];
        const csv = '﻿' + [cab, ...filas.map(r => [hsFecha(r.ts), HS_TIPOS[r.tipo][1], r.numero, r.cliente, r.detalle, r.sucursal, r.moneda, r.monto, hsEstadoTxt(r.estado)])].map(f => f.map(hsCelda).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'historial_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
        if (data.total > 5000) alert(`Se descargaron los primeros 5.000 de ${data.total.toLocaleString('es-CL')}. Acota el rango de fechas para el resto.`);
    } catch (e) { alert('No se pudo descargar: ' + (e.message || e)); }
    btn.disabled = false; btn.innerText = '⬇️ Descargar CSV';
}
