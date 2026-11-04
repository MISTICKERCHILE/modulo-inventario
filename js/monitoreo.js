// ==========================================================
// MESA DE MONITOREO: paneles de monitoreo armados por el cliente
// ==========================================================
const LB = { paneles: [], panel: null, widgets: [], edicion: false, sucursales: [], monedas: ['CLP'], sortable: null, editando: null };
const LB_COL = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#0ea5e9', '#64748b', '#ec4899'];
const lbAdmin = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
const lbEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LB_FUENTES = { ventas: 'Ventas (tickets)', productos: 'Productos vendidos', agenda: 'Agenda de trabajo' };
const LB_MEDIDAS = { monto: 'Monto total', tickets: 'Cantidad (tickets / trabajos)', promedio: 'Ticket promedio', maximo: 'Ticket más alto', minimo: 'Ticket más bajo', unidades: 'Unidades vendidas' };
const LB_AGRUPA = { ninguno: 'Sin agrupar (un solo valor)', dia: 'Por día', semana: 'Por semana', mes: 'Por mes', anio: 'Por año', sucursal: 'Por sucursal', metodo: 'Por forma de pago', producto: 'Por producto', tipo: 'Por tipo de trabajo', estado: 'Por estado', cajero: 'Por cajero' };
const LB_VISTAS = { numero: '🔢 Número', tabla: '📋 Tabla', barras: '📊 Barras', linea: '📈 Línea', torta: '🥧 Torta' };
const LB_ANCHOS = { 3: 'Chico', 4: 'Mediano', 6: 'Grande', 8: 'Muy grande', 12: 'Ancho completo' };
const LB_ALTOS = { 2: 'Bajo', 3: 'Normal', 4: 'Alto', 6: 'Muy alto' };
const lbDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const lbNum = (n, d) => Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const lbMonto = (n, m) => (m || 'CLP') + ' ' + lbNum(n, lbDec(m));
const lbValor = (v, cfg, mon) => ['tickets', 'unidades'].includes(cfg.medida) ? lbNum(v, cfg.medida === 'unidades' ? 2 : 0).replace(/,00$/, '') : lbMonto(v, mon);
const lbISO = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function lbEtiqueta(k, agrupar) {
    if (agrupar === 'dia') return k.slice(8, 10) + '/' + k.slice(5, 7);
    if (agrupar === 'semana') return 'sem ' + k.slice(8, 10) + '/' + k.slice(5, 7);
    if (agrupar === 'mes') return MESES[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4);
    return k;
}

window.cargarMonitoreo = async function () {
    const [su, em, pa] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('empresas').select('monedas').eq('id', window.miEmpresaId).maybeSingle(),
        clienteSupabase.from('lab_paneles').select('*').eq('id_empresa', window.miEmpresaId).order('orden')
    ]);
    LB.sucursales = su.data || [];
    LB.monedas = (em.data && em.data.monedas && em.data.monedas.length) ? em.data.monedas : ['CLP'];
    LB.paneles = pa.data || [];
    document.getElementById('lb-sucursal').innerHTML = '<option value="">Todas</option>' + LB.sucursales.map(s => `<option value="${s.id}">${lbEsc(s.nombre)}</option>`).join('');
    document.getElementById('lb-moneda').innerHTML = LB.monedas.map(m => `<option>${lbEsc(m)}</option>`).join('');
    document.getElementById('lb-admin-barra').classList.toggle('hidden', !lbAdmin());
    let ultimo = null; try { ultimo = localStorage.getItem('lb_panel_' + window.miEmpresaId); } catch (e) { }
    const p = LB.paneles.find(x => x.id === ultimo) || LB.paneles[0] || null;
    await lbElegirPanel(p ? p.id : null);
};

function lbPintarTabs() {
    const t = document.getElementById('lb-tabs');
    t.innerHTML = LB.paneles.map(p => `<button onclick="lbElegirPanel('${p.id}')" class="px-4 py-2 rounded-lg text-sm font-bold ${LB.panel === p.id ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}">${lbEsc(p.nombre)}</button>`).join('') +
        (lbAdmin() ? `<button onclick="lbNuevoPanel()" class="px-3 py-2 rounded-lg text-sm font-bold border border-dashed text-blue-600 hover:bg-blue-50">+ Panel</button>` : '') +
        (lbAdmin() && LB.panel ? `<button onclick="lbRenombrarPanel()" class="px-2 py-2 text-xs text-slate-400 hover:text-slate-700" title="Renombrar">✏️</button><button onclick="lbEliminarPanel()" class="px-2 py-2 text-xs text-slate-400 hover:text-red-600" title="Eliminar panel">🗑️</button>` : '');
}

async function lbElegirPanel(id) {
    if (LB.edicion) lbSalirEdicion();
    LB.panel = id;
    try { if (id) localStorage.setItem('lb_panel_' + window.miEmpresaId, id); } catch (e) { }
    lbPintarTabs();
    LB.widgets = [];
    if (id) {
        const { data } = await clienteSupabase.from('lab_widgets').select('*').eq('id_panel', id).order('orden');
        LB.widgets = (data || []).map(w => ({ ...w, config: w.config || {} }));
    }
    lbPintar();
}

function lbRango() {
    const r = document.getElementById('lb-rango').value, hoy = new Date(), y = hoy.getFullYear(), m = hoy.getMonth();
    if (r === 'hoy') return [lbISO(hoy), lbISO(hoy)];
    if (r === '7d') return [lbISO(new Date(y, m, hoy.getDate() - 6)), lbISO(hoy)];
    if (r === '30d') return [lbISO(new Date(y, m, hoy.getDate() - 29)), lbISO(hoy)];
    if (r === 'mes') return [lbISO(new Date(y, m, 1)), lbISO(hoy)];
    if (r === 'mes_ant') return [lbISO(new Date(y, m - 1, 1)), lbISO(new Date(y, m, 0))];
    if (r === 'anio') return [lbISO(new Date(y, 0, 1)), lbISO(hoy)];
    return [document.getElementById('lb-desde').value || lbISO(hoy), document.getElementById('lb-hasta').value || lbISO(hoy)];
}
function lbCambioFiltro() {
    document.getElementById('lb-custom').classList.toggle('hidden', document.getElementById('lb-rango').value !== 'custom');
    lbPintar();
}

// ---------- Pintar ----------
function lbPintar() {
    const g = document.getElementById('lb-grid'), v = document.getElementById('lb-vacio');
    if (!LB.panel) {
        g.innerHTML = '';
        v.classList.remove('hidden');
        v.innerHTML = lbAdmin() ? 'Aún no tienes paneles. <button onclick="lbNuevoPanel()" class="text-blue-600 font-bold underline">Crea el primero</button> y agrégale widgets.' : 'Todavía no hay paneles armados. Pídele al administrador que cree uno.';
        return;
    }
    v.classList.toggle('hidden', LB.widgets.length > 0);
    v.innerHTML = lbAdmin() ? 'Este panel está vacío. Pulsa “Editar diseño” y luego “+ Widget” para armar el primero.' : 'Este panel todavía no tiene widgets.';
    g.innerHTML = LB.widgets.map((w, i) => `<div data-i="${i}" class="lb-item md:col-span-${Math.min(12, w.w)} bg-white rounded-xl border ${LB.edicion ? 'border-blue-300 border-dashed' : 'border-slate-200'} shadow-sm p-4 flex flex-col" style="min-height:${w.h * 70}px">
        <div class="flex items-start justify-between gap-2 mb-2">
            <h3 class="text-sm font-black text-slate-700 truncate">${lbEsc(w.titulo || 'Sin título')}</h3>
            ${LB.edicion ? `<div class="flex gap-1 shrink-0"><span class="lb-asa cursor-grab px-1 text-slate-400" title="Arrastra para mover">⠿</span><button onclick="lbEditarWidget(${i})" class="px-1 text-slate-500">✏️</button><button onclick="lbDuplicarWidget(${i})" class="px-1 text-slate-500" title="Duplicar">⧉</button><button onclick="lbQuitarWidget(${i})" class="px-1 text-red-500">✕</button></div>` : ''}
        </div>
        <div id="lb-w-${i}" class="flex-1 min-h-0 flex items-center justify-center"><span class="text-xs text-slate-400 animate-pulse">Cargando…</span></div></div>`).join('');
    LB.widgets.forEach((w, i) => lbConsultarYPintar(w, i));
    if (LB.edicion && window.Sortable) {
        if (LB.sortable) LB.sortable.destroy();
        LB.sortable = Sortable.create(g, { handle: '.lb-asa', animation: 150, onEnd: (ev) => {
            const [m] = LB.widgets.splice(ev.oldIndex, 1); LB.widgets.splice(ev.newIndex, 0, m); lbPintar(); } });
    }
}

async function lbConsultarYPintar(w, i) {
    const [desde, hasta] = lbRango(), cont = document.getElementById('lb-w-' + i);
    const { data, error } = await clienteSupabase.rpc('lab_consultar', { p_id_empresa: window.miEmpresaId, p_config: {
        ...w.config, desde, hasta, sucursal: document.getElementById('lb-sucursal').value || null, moneda: document.getElementById('lb-moneda').value || 'CLP' } });
    const el = document.getElementById('lb-w-' + i); if (!el || el !== cont) return;
    if (error) { el.innerHTML = `<p class="text-xs text-red-500 text-center">${lbEsc(error.message)}</p>`; return; }
    const filas = (data && data.filas) || [];
    if (!filas.length) { el.innerHTML = '<p class="text-xs text-slate-400 text-center">Sin datos en este período.</p>'; return; }
    const mon = data.moneda, cfg = w.config;
    if (w.vista === 'numero') {
        const val = Number(filas[0].valor), ant = data.anterior && data.anterior.length ? Number(data.anterior[0].valor) : (data.anterior ? 0 : null);
        let cmp = '';
        if (ant !== null && cfg.comparar) {
            if (ant === 0) cmp = '<p class="text-xs text-slate-400 mt-1">Sin datos del período anterior</p>';
            else { const p = (val - ant) / ant * 100; cmp = `<p class="text-xs font-bold mt-1 ${p >= 0 ? 'text-emerald-600' : 'text-red-600'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}% vs período anterior</p>`; }
        }
        el.innerHTML = `<div class="text-center"><p class="text-3xl md:text-4xl font-black text-slate-800">${lbValor(val, cfg, mon)}</p>${cmp}</div>`;
    } else if (w.vista === 'tabla') {
        const tiempo = ['dia', 'semana', 'mes', 'anio'].includes(cfg.agrupar);
        el.className = 'flex-1 min-h-0 overflow-auto';
        el.innerHTML = `<table class="min-w-full text-sm"><thead class="text-[11px] text-slate-400 uppercase"><tr><th class="text-left py-1">${lbEsc(LB_AGRUPA[cfg.agrupar || 'ninguno'].replace('Por ', '').replace(/ \(.*/, ''))}</th><th class="text-right py-1">${lbEsc(LB_MEDIDAS[cfg.medida || 'monto'])}</th></tr></thead><tbody class="divide-y">${filas.map(f => `<tr><td class="py-1.5">${lbEsc(tiempo ? lbEtiqueta(f.k, cfg.agrupar) : f.k)}</td><td class="py-1.5 text-right font-bold">${lbValor(f.valor, cfg, mon)}</td></tr>`).join('')}</tbody></table>`;
    } else if (w.vista === 'barras') {
        const max = Math.max(...filas.map(f => Number(f.valor)), 1), tiempo = ['dia', 'semana', 'mes', 'anio'].includes(cfg.agrupar);
        el.className = 'flex-1 min-h-0 overflow-auto block';
        el.innerHTML = filas.map((f, j) => `<div class="mb-2"><div class="flex justify-between text-xs mb-0.5"><span class="truncate pr-2">${lbEsc(tiempo ? lbEtiqueta(f.k, cfg.agrupar) : f.k)}</span><b>${lbValor(f.valor, cfg, mon)}</b></div><div class="h-2.5 rounded-full bg-slate-100"><div class="h-2.5 rounded-full" style="width:${Math.max(2, Number(f.valor) / max * 100)}%;background:${LB_COL[j % LB_COL.length]}"></div></div></div>`).join('');
    } else if (w.vista === 'linea') {
        const W = 400, H = 160, P = 24, vals = filas.map(f => Number(f.valor)), max = Math.max(...vals, 1), n = filas.length;
        const xs = (j) => n === 1 ? W / 2 : P + j * (W - 2 * P) / (n - 1), ys = (v) => H - P - v / max * (H - 2 * P);
        const pts = vals.map((v, j) => `${xs(j).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
        const paso = Math.ceil(n / 6);
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-full max-h-60"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#e2e8f0"/>
            <polyline points="${xs(0)},${H - P} ${pts} ${xs(n - 1)},${H - P}" fill="#2563eb22" stroke="none"/><polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
            ${vals.map((v, j) => `<circle cx="${xs(j)}" cy="${ys(v)}" r="3" fill="#2563eb"><title>${lbEsc(lbEtiqueta(filas[j].k, cfg.agrupar))}: ${lbValor(v, cfg, mon)}</title></circle>`).join('')}
            ${filas.map((f, j) => j % paso === 0 ? `<text x="${xs(j)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#64748b">${lbEsc(lbEtiqueta(f.k, cfg.agrupar))}</text>` : '').join('')}</svg>`;
    } else if (w.vista === 'torta') {
        const tot = filas.reduce((s, f) => s + Math.max(0, Number(f.valor)), 0) || 1; let ang = -Math.PI / 2;
        const arcos = filas.map((f, j) => { const a = Math.max(0, Number(f.valor)) / tot * 2 * Math.PI, x1 = 60 + 55 * Math.cos(ang), y1 = 60 + 55 * Math.sin(ang); ang += a;
            const x2 = 60 + 55 * Math.cos(ang), y2 = 60 + 55 * Math.sin(ang);
            return filas.length === 1 ? `<circle cx="60" cy="60" r="55" fill="${LB_COL[0]}"/>` : `<path d="M60 60 L${x1.toFixed(2)} ${y1.toFixed(2)} A55 55 0 ${a > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${LB_COL[j % LB_COL.length]}"/>`; }).join('');
        el.className = 'flex-1 min-h-0 flex items-center gap-4 flex-wrap justify-center';
        el.innerHTML = `<svg viewBox="0 0 120 120" class="w-32 h-32 shrink-0">${arcos}</svg><div class="text-xs space-y-1">${filas.map((f, j) => `<div class="flex items-center gap-2"><span class="w-3 h-3 rounded-sm shrink-0" style="background:${LB_COL[j % LB_COL.length]}"></span><span class="truncate max-w-[140px]">${lbEsc(['dia', 'semana', 'mes', 'anio'].includes(cfg.agrupar) ? lbEtiqueta(f.k, cfg.agrupar) : f.k)}</span><b>${(Math.max(0, Number(f.valor)) / tot * 100).toFixed(0)}%</b></div>`).join('')}</div>`;
    }
}

// ---------- Paneles ----------
async function lbNuevoPanel() {
    const n = prompt('Nombre del panel (ej: Ventas del mes)'); if (!n || !n.trim()) return;
    const { data, error } = await clienteSupabase.rpc('guardar_panel_lab', { p_id_empresa: window.miEmpresaId, p_id: null, p_nombre: n.trim() });
    if (error) return alert(error.message);
    const { data: pa } = await clienteSupabase.from('lab_paneles').select('*').eq('id_empresa', window.miEmpresaId).order('orden');
    LB.paneles = pa || []; await lbElegirPanel(data); lbToggleEdicion();
}
async function lbRenombrarPanel() {
    const p = LB.paneles.find(x => x.id === LB.panel); const n = prompt('Nuevo nombre', p ? p.nombre : ''); if (!n || !n.trim()) return;
    const { error } = await clienteSupabase.rpc('guardar_panel_lab', { p_id_empresa: window.miEmpresaId, p_id: LB.panel, p_nombre: n.trim() });
    if (error) return alert(error.message); p.nombre = n.trim(); lbPintarTabs();
}
async function lbEliminarPanel() {
    if (!confirm('¿Eliminar este panel y todos sus widgets?')) return;
    const { error } = await clienteSupabase.rpc('eliminar_panel_lab', { p_id: LB.panel });
    if (error) return alert(error.message);
    LB.paneles = LB.paneles.filter(p => p.id !== LB.panel); await lbElegirPanel(LB.paneles[0] ? LB.paneles[0].id : null);
}

// ---------- Edición ----------
function lbToggleEdicion() {
    if (!LB.panel) return alert('Primero crea un panel con “+ Panel”.');
    LB.edicion = !LB.edicion; lbBarra(); lbPintar();
}
function lbSalirEdicion() { LB.edicion = false; lbBarra(); }
function lbBarra() {
    document.getElementById('lb-btn-editar').innerText = LB.edicion ? '✖ Salir sin guardar' : '✏️ Editar diseño';
    document.getElementById('lb-btn-widget').classList.toggle('hidden', !LB.edicion);
    document.getElementById('lb-btn-guardar').classList.toggle('hidden', !LB.edicion);
}
async function lbGuardarDiseno() {
    const ws = LB.widgets.map((w, i) => ({ titulo: w.titulo, vista: w.vista, config: w.config, x: 0, y: i, w: w.w, h: w.h }));
    const { error } = await clienteSupabase.rpc('guardar_widgets_lab', { p_id_panel: LB.panel, p_widgets: ws });
    if (error) return alert('No se pudo guardar: ' + error.message);
    LB.edicion = false; lbBarra(); await lbElegirPanel(LB.panel);
}
function lbQuitarWidget(i) { if (confirm('¿Quitar este widget?')) { LB.widgets.splice(i, 1); lbPintar(); } }
function lbDuplicarWidget(i) { const c = JSON.parse(JSON.stringify(LB.widgets[i])); delete c.id; c.titulo += ' (copia)'; LB.widgets.splice(i + 1, 0, c); lbPintar(); }
function lbNuevoWidget() { LB.editando = -1; lbForm({ titulo: '', vista: 'numero', config: { fuente: 'ventas', medida: 'monto', agrupar: 'ninguno', limite: 10, comparar: true }, w: 4, h: 2 }); }
function lbEditarWidget(i) { LB.editando = i; lbForm(LB.widgets[i]); }
const lbSel = (id, op, val) => `<select id="${id}" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${Object.entries(op).map(([k, t]) => `<option value="${k}" ${String(k) === String(val) ? 'selected' : ''}>${lbEsc(t)}</option>`).join('')}</select>`;
function lbForm(w) {
    const c = w.config || {};
    let m = document.getElementById('modal-lab'); if (!m) { m = document.createElement('div'); m.id = 'modal-lab'; m.className = 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4'; document.body.appendChild(m); }
    const L = (t) => `<label class="block text-xs font-bold text-slate-500 mb-1">${t}</label>`;
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-3">
        <div class="flex justify-between"><h3 class="text-lg font-black">${LB.editando === -1 ? 'Nuevo widget' : 'Editar widget'}</h3><button onclick="lbCerrarForm()" class="text-slate-400 text-xl">✕</button></div>
        <div>${L('Título')}<input id="lw-titulo" maxlength="80" value="${lbEsc(w.titulo)}" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Ticket promedio"></div>
        <div class="grid grid-cols-2 gap-3"><div>${L('Qué mirar')}${lbSel('lw-fuente', LB_FUENTES, c.fuente || 'ventas')}</div><div>${L('Qué medir')}${lbSel('lw-medida', LB_MEDIDAS, c.medida || 'monto')}</div></div>
        <div>${L('Agrupar')}${lbSel('lw-agrupar', LB_AGRUPA, c.agrupar || 'ninguno')}</div>
        <div>${L('Cómo mostrarlo')}${lbSel('lw-vista', LB_VISTAS, w.vista)}</div>
        <div class="grid grid-cols-3 gap-3"><div>${L('Ancho')}${lbSel('lw-w', LB_ANCHOS, w.w)}</div><div>${L('Alto')}${lbSel('lw-h', LB_ALTOS, w.h)}</div><div>${L('Máx. filas')}<input id="lw-limite" type="number" min="1" max="100" value="${c.limite || 10}" class="w-full px-3 py-2 border rounded-lg text-sm"></div></div>
        <label class="flex items-center gap-2 text-sm"><input id="lw-comparar" type="checkbox" ${c.comparar ? 'checked' : ''}> Comparar con el período anterior (solo en “Número” sin agrupar)</label>
        <p id="lw-err" class="text-xs text-red-600"></p>
        <button onclick="lbAplicarForm()" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm">Aceptar</button></div>`;
}
const lbCerrarForm = () => document.getElementById('modal-lab')?.remove();
function lbAplicarForm() {
    const v = (k) => document.getElementById('lw-' + k).value;
    const cfg = { fuente: v('fuente'), medida: v('medida'), agrupar: v('agrupar'), limite: Math.max(1, Math.min(100, parseInt(v('limite')) || 10)), comparar: document.getElementById('lw-comparar').checked };
    const err = (t) => { document.getElementById('lw-err').innerText = t; };
    if (cfg.agrupar === 'producto' && cfg.fuente !== 'productos') return err('Para agrupar por producto, elige “Productos vendidos” en “Qué mirar”.');
    if (cfg.agrupar === 'tipo' && cfg.fuente !== 'agenda') return err('Agrupar por tipo solo funciona con “Agenda de trabajo”.');
    if (cfg.fuente === 'agenda' && cfg.medida === 'unidades') return err('La agenda no tiene unidades.');
    const w = { titulo: v('titulo').trim() || LB_MEDIDAS[cfg.medida], vista: v('vista'), config: cfg, w: parseInt(v('w')), h: parseInt(v('h')) };
    if (LB.editando === -1) LB.widgets.push(w); else LB.widgets[LB.editando] = { ...LB.widgets[LB.editando], ...w };
    lbCerrarForm(); lbPintar();
}
