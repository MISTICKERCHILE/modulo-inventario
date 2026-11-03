// ==========================================================
// CIERRE DEL DÍA: con POS (suma de turnos) o declarando ventas a mano.
// ==========================================================
const CD = { sucursales: [], metodos: [], estado: null, cerrado: false };
const cdEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cdFmt = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2 });
const cdFecha = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };

window.cargarCierreDia = async function () {
    const [su, em] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('empresas').select('zona_horaria').eq('id', window.miEmpresaId).maybeSingle()
    ]);
    CD.sucursales = su.data || [];
    CD.tz = (em.data && em.data.zona_horaria) || 'America/Santiago';
    document.getElementById('cd-sucursal').innerHTML = CD.sucursales.map(s => `<option value="${s.id}">${cdEsc(s.nombre)}</option>`).join('');
    document.getElementById('cd-fecha').value = new Date().toLocaleDateString('en-CA', { timeZone: CD.tz });
    document.getElementById('cd-fecha').max = document.getElementById('cd-fecha').value;
    const c = window.configVentas;
    document.getElementById('cd-modo').value = (!c || c.canal !== 'importacion') ? 'POS' : 'MANUAL';
    document.getElementById('cd-responsable').value = '';
    document.getElementById('cd-comentario').value = '';
    await cdCargarDia();
    cdCargarHistorial();
};

async function cdCargarDia() {
    const suc = document.getElementById('cd-sucursal').value, fecha = document.getElementById('cd-fecha').value;
    const modo = document.getElementById('cd-modo').value;
    const aviso = document.getElementById('cd-aviso'); aviso.classList.add('hidden');
    document.getElementById('cd-manual-total').classList.toggle('hidden', modo !== 'MANUAL');
    CD.cerrado = false;
    if (!suc || !fecha) return;
    const { data, error } = await clienteSupabase.rpc('resumen_dia_pos', { p_id_sucursal: suc, p_fecha: fecha });
    if (error) { document.getElementById('cd-cuerpo').innerHTML = `<p class="text-sm text-red-600 font-bold">${cdEsc(error.message)}</p>`; return; }
    CD.metodos = data.metodos || [];
    CD.cerrado = !!data.cerrado;
    let msg = '';
    if (CD.cerrado) msg = ['bg-slate-100 text-slate-700', 'Este día ya está cerrado para esta sucursal. Puedes verlo en “Últimos cierres”.'];
    else if (modo === 'POS' && data.turnos_abiertos > 0) msg = ['bg-amber-50 text-amber-800', `Hay ${data.turnos_abiertos} turno(s) abierto(s) en esta sucursal. Ciérralos en el POS antes de cerrar el día.`];
    if (msg) { aviso.className = 'rounded-lg p-3 text-sm font-bold ' + msg[0]; aviso.innerText = msg[1]; }
    CD.bloqueado = CD.cerrado || (modo === 'POS' && data.turnos_abiertos > 0);
    document.getElementById('cd-cuerpo').innerHTML = CD.metodos.length ? CD.metodos.map((m, i) => `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2 items-center border border-slate-200 rounded-lg p-3">
            <div class="font-bold text-slate-800">${cdEsc(m.nombre)} <span class="text-[10px] text-slate-400">${cdEsc(m.moneda)}</span></div>
            <div class="text-sm text-slate-500">${modo === 'POS' ? `Sistema: <b class="text-slate-800">${cdFmt(m.sistema, m.moneda)}</b> <span class="text-xs">(${m.n} ventas)</span>` : ''}</div>
            <input type="number" min="0" step="any" id="cd-decl-${i}" oninput="cdRecalcular()" placeholder="Monto declarado" class="px-3 py-2 border rounded-lg text-sm text-right md:col-span-2">
        </div>`).join('') : '<p class="text-sm text-slate-400">No hay formas de pago para esta sucursal. Créalas en Parámetros.</p>';
    cdRecalcular();
}

function cdLeer() {
    return CD.metodos.map((m, i) => ({ ...m, declarado: parseFloat(document.getElementById('cd-decl-' + i)?.value) || 0 }));
}

function cdRecalcular() {
    const modo = document.getElementById('cd-modo').value, filas = cdLeer();
    let cuadra = true, html = '';
    if (modo === 'POS') {
        const porMon = {};
        filas.forEach(f => { const o = porMon[f.moneda] ||= { s: 0, d: 0 }; o.s += Number(f.sistema); o.d += f.declarado; });
        // en POS, "declarado vacío" = no contado todavía
        cuadra = filas.every(f => f.declarado === Number(f.sistema));
        html = Object.entries(porMon).map(([m, o]) => `${m}: sistema ${cdFmt(o.s, m)} · declarado ${cdFmt(o.d, m)} · diferencia <span class="${o.d - o.s === 0 ? 'text-emerald-600' : 'text-red-600'}">${cdFmt(o.d - o.s, m)}</span>`).join('<br>');
    } else {
        const suma = filas.reduce((a, f) => a + f.declarado, 0), total = parseFloat(document.getElementById('cd-total-dia').value) || 0;
        const dif = total - suma; cuadra = dif === 0;
        html = `Suma por forma de pago: ${suma.toLocaleString('es-CL')} · Total del día: ${total.toLocaleString('es-CL')} · diferencia <span class="${cuadra ? 'text-emerald-600' : 'text-red-600'}">${dif.toLocaleString('es-CL')}</span>`;
    }
    const r = document.getElementById('cd-resultado');
    r.innerHTML = (cuadra ? '✅ Cuadra en 0.<br>' : '⚠️ No cuadra en 0.<br>') + html;
    r.className = 'rounded-xl border p-4 text-sm font-bold ' + (cuadra ? 'bg-emerald-50 border-emerald-200 text-slate-700' : 'bg-red-50 border-red-200 text-slate-700');
    document.getElementById('cd-obligatorio').classList.toggle('hidden', cuadra);
    document.getElementById('cd-btn').disabled = !!CD.bloqueado;
    CD.cuadra = cuadra;
}

async function cdCerrar() {
    const modo = document.getElementById('cd-modo').value, filas = cdLeer();
    const resp = document.getElementById('cd-responsable').value.trim(), com = document.getElementById('cd-comentario').value.trim();
    if (!resp) return alert('Escribe el nombre del responsable.');
    if (!CD.cuadra && !com) return alert('No cuadra: escribe un comentario que explique la diferencia.');
    if (!confirm('¿Cerrar el día? No se puede deshacer.')) return;
    const { data, error } = await clienteSupabase.rpc('cerrar_dia', {
        p_id_sucursal: document.getElementById('cd-sucursal').value, p_fecha: document.getElementById('cd-fecha').value, p_modo: modo,
        p_responsable: resp, p_comentario: com || null,
        p_declarado: filas.map(f => ({ id_metodo_pago: f.id_metodo_pago, monto: f.declarado })),
        p_total_dia: modo === 'MANUAL' ? (parseFloat(document.getElementById('cd-total-dia').value) || 0) : null });
    if (error) return alert('No se pudo cerrar: ' + error.message);
    alert(data.cuadrado ? '✅ Día cerrado y cuadrado.' : '✅ Día cerrado con diferencia registrada.');
    await cdCargarDia(); cdCargarHistorial();
}

async function cdCargarHistorial() {
    const { data } = await clienteSupabase.from('cierres_dia').select('*').eq('id_empresa', window.miEmpresaId).order('fecha', { ascending: false }).limit(30);
    const nom = {}; CD.sucursales.forEach(s => nom[s.id] = s.nombre);
    document.getElementById('cd-historial').innerHTML = (data || []).map(c => {
        const tot = Object.entries(c.totales || {}).map(([m, o]) => cdFmt(o.declarado, m)).join(' · ');
        return `<tr><td class="px-3 py-2 font-bold">${cdFecha(c.fecha)}</td><td class="px-3 py-2">${cdEsc(nom[c.id_sucursal] || '')}</td><td class="px-3 py-2 text-slate-500">${c.modo === 'POS' ? 'POS' : 'Declarado'}</td>
            <td class="px-3 py-2">${cdEsc(c.responsable)}</td><td class="px-3 py-2 text-right">${tot}</td>
            <td class="px-3 py-2 text-center" title="${cdEsc(c.comentario || '')}">${c.cuadrado ? '<span class="text-emerald-600 font-bold">Cuadrado</span>' : '<span class="text-red-600 font-bold">Con diferencia</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-400">Aún no hay cierres.</td></tr>';
}
