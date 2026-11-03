// ==========================================================
// VENTAS EN VIVO (dashboard de Ventas): hoy / semana / mes contra el período
// anterior a la misma altura (mismo día y hora de la semana pasada, etc.).
// ==========================================================
window.vvPeriodo = window.vvPeriodo || 'dia';
let _vvTimer = null;
const vvEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vvFmt = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2 });
const VV_TXT = { dia: ['del Día', 'el mismo día y hora de la semana pasada'], semana: ['de la Semana', 'la semana anterior a esta misma altura'], mes: ['del Mes', 'el mes anterior a esta misma altura'] };

function vvPct(actual, anterior) {
    if (!anterior) return actual > 0 ? { txt: 'nuevo', cls: 'bg-blue-100 text-blue-700' } : { txt: '—', cls: 'bg-slate-100 text-slate-500' };
    const p = (actual - anterior) / anterior * 100;
    return { txt: (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%', cls: p >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700' };
}

window.cargarVentasVivo = async function () {
    if (_vvTimer) { clearInterval(_vvTimer); _vvTimer = null; }
    await vvActualizar();
    _vvTimer = setInterval(() => {
        if (!document.getElementById('dv-resumen-sucursales')) { clearInterval(_vvTimer); _vvTimer = null; return; }
        vvActualizar();
    }, 60000);
};

async function vvActualizar() {
    const cont = document.getElementById('dv-resumen-sucursales'); if (!cont) return;
    const { data, error } = await clienteSupabase.rpc('ventas_en_vivo', { p_id_empresa: window.miEmpresaId });
    if (error) { cont.innerHTML = `<p class="text-sm text-red-500">${vvEsc(error.message)}</p>`; return; }
    window._vvDatos = data; vvPintar();
}

window.vvCambiar = function (p) { window.vvPeriodo = p; vvPintar(); };

function vvPintar() {
    const cont = document.getElementById('dv-resumen-sucursales'); if (!cont || !window._vvDatos) return;
    const p = window.vvPeriodo;
    document.getElementById('dv-periodo-titulo').innerText = VV_TXT[p][0];
    document.getElementById('dv-vivo-tabs').innerHTML = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, t]) =>
        `<button onclick="vvCambiar('${k}')" class="px-3 py-1 rounded-full text-xs font-bold ${p === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}">${t}</button>`).join('');
    const filas = (window._vvDatos.filas || []).filter(f => f.periodo === p);
    if (!filas.length) { cont.innerHTML = '<p class="text-sm text-slate-400 italic">Aún sin ventas en este período.</p>'; }
    else {
        const tot = {};
        filas.forEach(f => { const o = tot[f.moneda] ||= { a: 0, b: 0 }; o.a += Number(f.actual); o.b += Number(f.anterior); });
        const lineas = filas.map(f => { const d = vvPct(Number(f.actual), Number(f.anterior));
            return `<div class="flex justify-between items-center gap-2 text-sm"><span class="truncate text-slate-600">${vvEsc(f.sucursal)}</span><span class="whitespace-nowrap"><b class="text-slate-800">${vvFmt(f.actual, f.moneda)}</b> <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${d.cls}">${d.txt}</span></span></div>`; }).join('');
        const totales = Object.keys(tot).length > 1 || filas.length > 1 ? Object.entries(tot).map(([m, o]) => { const d = vvPct(o.a, o.b);
            return `<div class="flex justify-between items-center border-t pt-2 text-sm font-black"><span>Total ${m}</span><span>${vvFmt(o.a, m)} <span class="px-2 py-0.5 rounded-full text-[11px] ${d.cls}">${d.txt}</span></span></div>`; }).join('') : '';
        cont.innerHTML = lineas + totales;
    }
    const act = window._vvDatos.actualizado ? new Date(window._vvDatos.actualizado).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    document.getElementById('dv-vivo-nota').innerText = `Comparado con ${VV_TXT[p][1]}. Actualizado ${act}.`;
}
