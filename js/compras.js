// ==========================================================
// COMPRAS + TESORERÍA (Fase 1)
// Gastos directos, cuentas (banco, billetera, caja, tarjeta, reembolsable),
// por pagar con pago múltiple, categorías de gasto y resumen del mes.
// Las escrituras de dinero pasan por funciones de la base
// (registrar_gasto, registrar_pago_compras) para que los saldos cuadren.
// ==========================================================
const CP = window.CP = { cuentas: [], categorias: [], ocultas: new Set(), proveedores: [], gastos: [], pendientes: [], pagos: [], monedas: ['CLP'], seleccion: {}, importacion: null };
const cpEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cpDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
// Montos sin decimales; CLP se muestra con $, otras monedas con su sigla (USD 60). Decimales solo si el monto los tiene.
const cpFmt = (n, m) => { const v = Number(n || 0); const d = (cpDec(m) === 0 || Number.isInteger(v)) ? 0 : 2;
    return (m && m !== 'CLP' ? m + ' ' : '$') + v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }); };
const CP_MONEDAS_EXT = ['USD', 'EUR'];
const CP_TASAS = {};
// Valor observado (Banco Central) en pesos por 1 unidad, vía la función tasa-cambio. Si el día no tiene valor (fin de semana) usa el anterior.
async function cpTasaDelDia(moneda, fecha) {
    if (!CP_MONEDAS_EXT.includes(moneda) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || fecha > cpHoy()) return null;
    const k = moneda + fecha; if (CP_TASAS[k]) return CP_TASAS[k];
    try { // función en Supabase que consulta mindicador.cl (el navegador no puede directo)
        const { data, error } = await clienteSupabase.functions.invoke('tasa-cambio', { body: { moneda, fecha } });
        if (error || !(data?.valor > 0)) return null; // no se guarda en caché: se reintenta la próxima vez
        return CP_TASAS[k] = Number(data.valor);
    } catch (e) { return null; }
}
// ¿Se parece a un gasto ya registrado? Mismo monto exacto (±$1), o casi igual (±2%) y con alguna palabra en común en la descripción.
const CP_PAL_GEN = new Set(['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','setiembre','octubre','noviembre','diciembre','suscripcion','pago','compra','mensual','anual','plan','para','desde','traspaso','transferencia']);
const cpPalabras = (s) => new Set(cpNorm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 4 && !CP_PAL_GEN.has(w)));
function cpPareceDuplicado(c, desc, monto) {
    const dif = Math.abs(cpTotal(c) - monto);
    if (dif <= 1) return true;
    if (dif > monto * 0.02) return false;
    const a = cpPalabras(desc); return [...cpPalabras(c.descripcion)].some(w => a.has(w));
}
// Gastos ya registrados parecidos y con fecha cercana, en cualquier cuenta
async function cpBuscarParecidos(fecha, monto, desc = '', dias = 5) {
    const d = new Date(fecha + 'T12:00:00'), a = new Date(d), b = new Date(d);
    a.setDate(a.getDate() - dias); b.setDate(b.getDate() + dias);
    const { data } = await clienteSupabase.from('compras').select('id, fecha_compra, descripcion, total_compra, total_factura, id_cuenta_pago, estado_pago')
        .eq('id_empresa', window.miEmpresaId).gte('fecha_compra', a.toISOString().slice(0, 10)).lte('fecha_compra', b.toISOString().slice(0, 10)).neq('estado_pago', 'anulado');
    return (data || []).filter(c => cpPareceDuplicado(c, desc, monto));
}
const cpHoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const cpFecha = (d) => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
const cpMesActual = () => cpHoy().slice(0, 7);
const cpRangoMes = (ym) => { const [y, m] = ym.split('-').map(Number); const fin = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${ym}-01`, `${ym}-${String(fin).padStart(2, '0')}`]; };
const cpTotal = (c) => Number(c.total_factura ?? c.total_compra ?? 0);
const cpSaldo = (c) => Math.max(cpTotal(c) - Number(c.monto_pagado || 0), 0);
const cpNorm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const cpDias = (d) => Math.round((new Date(cpHoy()) - new Date(String(d).slice(0, 10))) / 864e5);
const cpEsAdmin = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
const TIPOS_CUENTA = { banco: '🏦 Banco', billetera: '📱 Billetera', caja: '💵 Caja', tarjeta_credito: '💳 Tarjeta de crédito', reembolsable: '🙋 Reembolsable' };
const ESTADOS = { pendiente: ['Pendiente', 'bg-amber-100 text-amber-700'], parcial: ['Parcial', 'bg-blue-100 text-blue-700'], pagado: ['Pagado', 'bg-emerald-100 text-emerald-700'], anulado: ['Anulado', 'bg-slate-200 text-slate-500'] };

async function cpTodo(query) {
    // Trae todas las filas paginando de a 1000
    const out = []; let desde = 0;
    for (;;) {
        const { data, error } = await query().range(desde, desde + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) return out;
        desde += 1000;
    }
}

async function cpCargarBase() {
    const e = window.miEmpresaId;
    const [cu, ca, oc, pr, em] = await Promise.all([
        clienteSupabase.from('cuentas_financieras').select('*').eq('id_empresa', e).order('nombre'),
        clienteSupabase.from('categorias_gasto').select('*').or(`id_empresa.is.null,id_empresa.eq.${e}`).order('orden').order('nombre'),
        clienteSupabase.from('categorias_gasto_ocultas').select('id_categoria').eq('id_empresa', e),
        clienteSupabase.from('proveedores').select('id, nombre, condicion_pago_defecto, dias_credito_defecto, id_categoria_gasto_defecto').eq('id_empresa', e).order('nombre'),
        clienteSupabase.from('empresas').select('monedas').eq('id', e).maybeSingle()
    ]);
    if (cu.error) console.error(cu.error);
    CP.cuentas = cu.data || [];
    CP.categorias = ca.data || [];
    CP.ocultas = new Set((oc.data || []).map(x => x.id_categoria));
    CP.proveedores = pr.data || [];
    CP.monedas = (em.data && em.data.monedas && em.data.monedas.length) ? em.data.monedas : ['CLP'];
    document.getElementById('cp-sin-cuentas')?.classList.toggle('hidden', CP.cuentas.length > 0);
}
const cpCuenta = (id) => CP.cuentas.find(c => c.id === id);
const cpCategoria = (id) => CP.categorias.find(c => c.id === id);
const cpProveedor = (id) => CP.proveedores.find(p => p.id === id);
const cpCategoriasVisibles = () => CP.categorias.filter(c => c.activo !== false && !(c.id_empresa === null && CP.ocultas.has(c.id)));

window.cargarCompras = async function (tab) {
    await cpCargarBase();
    document.getElementById('cp-r-mes').value = cpMesActual();
    document.getElementById('cp-g-mes').value = '';
    cpTab(tab || window.cpTabInicial || 'resumen');
    window.cpTabInicial = null;
};

function cpTab(t) {
    ['resumen', 'gastos', 'pagar', 'conciliacion', 'cuentas', 'categorias'].forEach(k => {
        document.getElementById('cp-' + k).classList.toggle('hidden', k !== t);
        document.getElementById('cp-tab-' + k).className = 'px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap ' + (k === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800');
    });
    if (t === 'resumen') cpCargarResumen();
    if (t === 'gastos') cpCargarGastos();
    if (t === 'pagar') cpCargarPorPagar();
    if (t === 'cuentas') cpCargarCuentas();
    if (t === 'conciliacion' && typeof window.ccIniciar === 'function') window.ccIniciar();
    if (t === 'categorias') cpPintarCategorias();
}
function cpCerrar(id) { document.getElementById(id).classList.add('hidden'); }

// ---------------------------------------------------------- RESUMEN
async function cpCargarResumen() {
    const ym = document.getElementById('cp-r-mes').value || cpMesActual();
    const [desde, hasta] = cpRangoMes(ym);
    const { data: r, error } = await clienteSupabase.rpc('resumen_compras_mes', { p_id_empresa: window.miEmpresaId, p_desde: desde, p_hasta: hasta });
    if (error) { console.error(error); document.getElementById('cp-r-tarjetas').innerHTML = `<p class="text-red-600 text-sm col-span-4">${cpEsc(error.message)}</p>`; return; }
    const tarjeta = (t, v, s, col = 'text-slate-800') => `<div class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-[11px] font-bold text-slate-500 uppercase">${t}</p><p class="text-2xl font-black ${col}">${cpFmt(v)}</p>${s ? `<p class="text-[11px] text-slate-400 mt-1">${s}</p>` : ''}</div>`;
    document.getElementById('cp-r-tarjetas').innerHTML =
        tarjeta('Gastado en el mes', r.gastado_mes, 'Todo lo registrado con fecha del mes') +
        tarjeta('Salió de mis cuentas', r.salio_de_cuentas, 'Banco, billetera y caja, más pagos y reembolsos') +
        tarjeta('Cargado a tarjetas', r.cargado_tarjetas, 'Tarjetas de crédito de la empresa') +
        tarjeta('Adelantado por personas', r.adelantado_terceros, 'Rendiciones y tarjetas personales', 'text-amber-700');
    const personas = r.debo_personas || [];
    const totalDeuda = Number(r.debo_proveedores || 0) + personas.reduce((s, p) => s + Number(p.monto), 0);
    document.getElementById('cp-r-deudas').innerHTML = totalDeuda === 0
        ? '<p class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-3 font-bold">No debes nada. 🎉</p>'
        : `<div class="flex justify-between"><span class="text-slate-600">Proveedores (a crédito)</span><span class="font-black">${cpFmt(r.debo_proveedores)}</span></div>` +
          personas.map(p => `<div class="flex justify-between"><span class="text-slate-600">${cpEsc(p.cuenta)}</span><span class="font-black text-amber-700">${cpFmt(p.monto)}</span></div>`).join('') +
          `<div class="flex justify-between border-t pt-2"><span class="font-bold">Total</span><span class="font-black">${cpFmt(totalDeuda)}</span></div>
           <button onclick="cpTab('pagar')" class="mt-2 text-blue-600 font-bold text-xs hover:underline">Ir a pagar →</button>`;
    const a = r.antiguedad || {};
    const celda = (t, v, col) => `<div class="rounded-lg p-2 ${Number(v) ? col : 'bg-slate-50 text-slate-400'}"><p class="text-[10px] font-bold uppercase">${t}</p><p class="text-xs font-black">${cpFmt(v)}</p></div>`;
    document.getElementById('cp-r-antiguedad').innerHTML = celda('Al día', a.al_dia, 'bg-emerald-50 text-emerald-700') + celda('≤ 7 días', a.vence_7, 'bg-amber-50 text-amber-700') +
        celda('1-30', a.d1_30, 'bg-orange-50 text-orange-700') + celda('31-60', a.d31_60, 'bg-red-50 text-red-700') + celda('+60', a.d60_mas, 'bg-red-100 text-red-800');
    const cats = r.por_categoria || [];
    const max = Math.max(1, ...cats.map(c => Number(c.monto)));
    document.getElementById('cp-r-categorias').innerHTML = cats.length ? cats.map(c => `
        <div><div class="flex justify-between text-xs"><span class="font-bold text-slate-600">${cpEsc(c.categoria)}</span><span class="font-black">${cpFmt(c.monto)}</span></div>
        <div class="w-full bg-slate-100 rounded-full h-2 mt-1"><div class="bg-emerald-500 h-2 rounded-full" style="width:${(Number(c.monto) / max * 100).toFixed(1)}%"></div></div></div>`).join('')
        : '<p class="text-slate-400 text-xs">Sin gastos este mes.</p>';
    document.getElementById('cp-r-cuentas').innerHTML = (r.por_cuenta || []).map(c => `<div class="flex justify-between text-xs"><span class="text-slate-600">${cpEsc(c.cuenta)}</span><span class="font-bold">${cpFmt(c.monto)}</span></div>`).join('') || '<p class="text-slate-400 text-xs">—</p>';
}

// ---------------------------------------------------------- GASTOS
async function cpCargarGastos() {
    const ym = document.getElementById('cp-g-mes').value;
    try {
        CP.gastos = await cpTodo(() => {
            let q = clienteSupabase.from('compras').select('id, fecha_compra, descripcion, numero_documento, numero_factura, id_proveedor, id_categoria_gasto, id_cuenta_pago, total_compra, total_factura, monto_pagado, estado_pago, condicion_pago, fecha_vencimiento, origen, moneda, moneda_original, monto_original, tasa_cambio, tipo_documento, referencia_externa, observaciones_factura')
                .eq('id_empresa', window.miEmpresaId).order('fecha_compra', { ascending: false }).order('created_at', { ascending: false });
            if (ym) { const [d, h] = cpRangoMes(ym); q = q.gte('fecha_compra', d).lte('fecha_compra', h); }
            return q;
        });
    } catch (e) { console.error(e); alert('No pude cargar los gastos: ' + e.message); return; }
    const selCta = document.getElementById('cp-g-cuenta'), selCat = document.getElementById('cp-g-categoria');
    const vCta = selCta.value, vCat = selCat.value;
    selCta.innerHTML = '<option value="">Todas las cuentas</option><option value="__credito">A crédito</option>' + CP.cuentas.map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('');
    selCat.innerHTML = '<option value="">Todas las categorías</option><option value="__sin">Sin categoría</option>' + CP.categorias.map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('');
    selCta.value = vCta; selCat.value = vCat;
    cpPintarGastos();
}

function cpFiltrarGastos() {
    const q = cpNorm(document.getElementById('cp-g-buscar').value);
    const cta = document.getElementById('cp-g-cuenta').value, cat = document.getElementById('cp-g-categoria').value, est = document.getElementById('cp-g-estado').value;
    return CP.gastos.filter(g => {
        if (cta === '__credito' ? g.id_cuenta_pago : (cta && g.id_cuenta_pago !== cta)) return false;
        if (cat === '__sin' ? g.id_categoria_gasto : (cat && g.id_categoria_gasto !== cat)) return false;
        if (est ? g.estado_pago !== est : g.estado_pago === 'anulado') return false;
        return !q || cpNorm(`${g.descripcion || ''} ${g.numero_documento || ''} ${cpProveedor(g.id_proveedor)?.nombre || ''}`).includes(q);
    });
}

function cpPintarGastos() {
    const filas = cpFiltrarGastos();
    const total = filas.filter(g => g.estado_pago !== 'anulado').reduce((s, g) => s + cpTotal(g), 0);
    document.getElementById('cp-g-total').textContent = `${filas.length} registros · ${cpFmt(total)}`;
    document.getElementById('cp-g-tabla').innerHTML = filas.slice(0, 1000).map(g => {
        const [et, col] = ESTADOS[g.estado_pago] || ['—', 'bg-slate-100 text-slate-500'];
        const cta = cpCuenta(g.id_cuenta_pago);
        const sinDatos = g.origen === 'orden_compra' && !g.id_cuenta_pago && g.condicion_pago !== 'credito' && !Number(g.monto_pagado);
        const prov = cpProveedor(g.id_proveedor)?.nombre;
        return `<tr>
            <td class="px-3 py-2 whitespace-nowrap text-slate-500">${cpFecha(g.fecha_compra)}</td>
            <td class="px-3 py-2"><p class="font-bold text-slate-700">${cpEsc(g.descripcion || (g.origen === 'orden_compra' ? 'Orden de compra ' + (g.numero_documento || '') : '—'))}</p>
                ${prov ? `<p class="text-[11px] text-slate-400">${cpEsc(prov)}</p>` : ''}</td>
            <td class="px-3 py-2 text-slate-500 text-xs">${cpEsc(cpCategoria(g.id_categoria_gasto)?.nombre || '—')}</td>
            <td class="px-3 py-2 text-xs">${cta ? cpEsc(cta.nombre) : (g.condicion_pago === 'credito' ? '<span class="text-blue-600 font-bold">A crédito</span>' : '—')}</td>
            <td class="px-3 py-2 text-right font-bold whitespace-nowrap ${g.estado_pago === 'anulado' ? 'line-through text-slate-400' : ''}">${cpFmt(cpTotal(g), g.moneda)}
                ${g.moneda_original ? `<p class="text-[11px] font-normal text-slate-400">${cpFmt(g.monto_original, g.moneda_original)} × ${cpFmt(g.tasa_cambio)}</p>` : ''}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap ${cpSaldo(g) ? 'font-black text-amber-700' : 'text-slate-300'}">${cpSaldo(g) ? cpFmt(cpSaldo(g), g.moneda) : '—'}</td>
            <td class="px-3 py-2 text-center">${sinDatos ? '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500" title="Orden de compra de Inventario sin datos de pago">Por completar</span>' : `<span class="px-2 py-1 rounded-full text-[11px] font-bold ${col}">${et}</span>`}</td>
            <td class="px-3 py-2 text-right">${cpEsAdmin() && g.origen === 'gasto' && g.estado_pago !== 'anulado' ? `<button onclick="cpAnularGasto('${g.id}')" class="text-[11px] font-bold text-slate-400 hover:text-red-600">Anular</button>` : ''}</td></tr>`;
    }).join('');
    document.getElementById('cp-g-vacio').classList.toggle('hidden', filas.length > 0);
}

function cpAbrirGasto() {
    if (!CP.cuentas.length) { cpTab('cuentas'); return cpAbrirCuenta(); }
    document.getElementById('cp-lista-proveedores').innerHTML = CP.proveedores.map(p => `<option value="${cpEsc(p.nombre)}"></option>`).join('');
    document.getElementById('cp-n-cat').innerHTML = '<option value="">Sin categoría</option>' + cpCategoriasVisibles().map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('');
    document.getElementById('cp-n-cuenta').innerHTML = CP.cuentas.filter(c => c.activo).map(c => `<option value="${c.id}">${cpEsc(c.nombre)} · ${TIPOS_CUENTA[c.tipo].replace(/^\S+ /, '')}</option>`).join('');
    ['cp-n-desc', 'cp-n-monto', 'cp-n-prov', 'cp-n-numdoc', 'cp-n-nota'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cp-n-fecha').value = cpHoy();
    document.getElementById('cp-n-cond').value = 'contado';
    document.getElementById('cp-n-tipodoc').value = '';
    document.getElementById('cp-n-moneda').innerHTML = ['CLP', ...CP_MONEDAS_EXT].map(m => `<option>${m}</option>`).join('');
    document.getElementById('cp-n-tasa').value = '';
    cpCambioMoneda();
    cpCambioCondicion();
    document.getElementById('cp-modal-gasto').classList.remove('hidden');
    document.getElementById('cp-n-desc').focus();
}
function cpCambioCondicion() {
    const cred = document.getElementById('cp-n-cond').value === 'credito';
    document.getElementById('cp-n-cuenta-box').classList.toggle('hidden', cred);
    document.getElementById('cp-n-dias-box').classList.toggle('hidden', !cred);
}

let cpTimerMoneda;
function cpCambioMoneda() { clearTimeout(cpTimerMoneda); cpTimerMoneda = setTimeout(cpCambioMonedaYa, 500); }
async function cpCambioMonedaYa() {
    const m = document.getElementById('cp-n-moneda').value, fecha = document.getElementById('cp-n-fecha').value;
    document.getElementById('cp-n-tasa-box').classList.toggle('hidden', m === 'CLP');
    document.getElementById('cp-n-monto-label').textContent = m === 'CLP' ? 'Monto *' : `Monto en ${m} *`;
    if (m === 'CLP') return;
    const info = document.getElementById('cp-n-tasa-info');
    info.textContent = `Buscando el ${m} observado del ${cpFecha(fecha)}…`;
    const t = await cpTasaDelDia(m, fecha);
    if (t) { document.getElementById('cp-n-tasa').value = t; info.textContent = `${m} observado del Banco Central (mindicador.cl). Cámbialo si el banco cobró otro valor.`; }
    else info.innerHTML = `No pude traer el valor automático: escríbelo a mano. Lo encuentras en <a href="https://mindicador.cl" target="_blank" class="underline">mindicador.cl</a> (dólar observado).`;
    cpPreviewMoneda();
}
function cpPreviewMoneda() {
    const m = document.getElementById('cp-n-moneda').value; if (m === 'CLP') return;
    const monto = Number(document.getElementById('cp-n-monto').value), t = Number(document.getElementById('cp-n-tasa').value);
    document.getElementById('cp-n-tasa-total').textContent = monto > 0 && t > 0 ? `= ${cpFmt(Math.round(monto * t))}` : '';
}

async function cpAnularGasto(id) {
    const g = CP.gastos.find(x => x.id === id); if (!g) return;
    const motivo = prompt(`¿Anular “${g.descripcion}” por ${cpFmt(cpTotal(g), g.moneda)}?\n\nDeja de contar en los totales. Si estaba vinculado a una línea de cartola, esa línea vuelve a “por revisar”.\n\nMotivo (opcional):`, 'Duplicado');
    if (motivo === null) return;
    const { error } = await clienteSupabase.rpc('anular_gasto', { p_id: id, p_motivo: motivo });
    if (error) return alert(error.message);
    cpCargarGastos();
}

async function cpGuardarGasto() {
    const v = (id) => document.getElementById(id).value.trim();
    const cond = v('cp-n-cond');
    const provNombre = v('cp-n-prov');
    const prov = CP.proveedores.find(p => cpNorm(p.nombre) === cpNorm(provNombre));
    if (cond === 'credito' && !prov) return alert('Para una compra a crédito elige un proveedor de tu lista (lo puedes crear en Catálogos → Proveedores).');
    const p = {
        id_empresa: window.miEmpresaId, descripcion: v('cp-n-desc'), monto: Number(v('cp-n-monto')), fecha: v('cp-n-fecha'),
        id_categoria_gasto: v('cp-n-cat') || null, id_proveedor: prov?.id || null, condicion_pago: cond,
        id_cuenta_pago: cond === 'credito' ? null : v('cp-n-cuenta'), dias_credito: cond === 'credito' ? Number(v('cp-n-dias') || 0) : 0,
        tipo_documento: v('cp-n-tipodoc') || null, numero_documento: v('cp-n-numdoc') || null,
        nota: [provNombre && !prov ? 'Proveedor: ' + provNombre : '', v('cp-n-nota')].filter(Boolean).join(' · ') || null
    };
    const mon = v('cp-n-moneda');
    if (mon !== 'CLP') {
        const t = Number(v('cp-n-tasa'));
        if (!(t > 0)) return alert(`Indica cuántos pesos vale 1 ${mon}.`);
        Object.assign(p, { moneda_original: mon, monto_original: p.monto, tasa_cambio: t }); p.monto = Math.round(p.monto * t);
    }
    if (p.monto > 0 && p.fecha) {
        const par = await cpBuscarParecidos(p.fecha, p.monto, p.descripcion);
        if (par.length && !confirm(`Ojo, posible duplicado. Ya hay ${par.length === 1 ? 'un gasto parecido' : par.length + ' gastos parecidos'}:\n\n` +
            par.slice(0, 5).map(c => `• ${cpFecha(c.fecha_compra)} · ${c.descripcion} · ${cpFmt(cpTotal(c))} (${cpCuenta(c.id_cuenta_pago)?.nombre || 'a crédito'})`).join('\n') +
            '\n\n¿Guardarlo igual?')) return;
    }
    const btn = document.getElementById('cp-n-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
    const { error } = await clienteSupabase.rpc('registrar_gasto', { p });
    btn.disabled = false; btn.textContent = 'Guardar gasto';
    if (error) return alert(error.message);
    cpCerrar('cp-modal-gasto');
    const visible = ['resumen', 'gastos', 'pagar', 'cuentas'].find(k => !document.getElementById('cp-' + k).classList.contains('hidden')) || 'gastos';
    cpTab(visible);
}

// ---------------------------------------------------------- CSV
const CP_COLUMNAS = ['fecha', 'detalle', 'monto', 'categoria', 'pagado_con', 'condicion', 'dias_credito', 'proveedor', 'tipo_documento', 'numero_documento', 'estado', 'lote_reembolso', 'referencia', 'nota', 'moneda', 'tasa_cambio'];
const CP_ALIAS = {
    moneda: ['moneda', 'divisa', 'currency'], tasa: ['tasa cambio', 'tasa_cambio', 'tasa', 'tipo de cambio'],
    fecha: ['fecha', 'fecha compra', 'fecha_compra'], detalle: ['detalle', 'descripcion', 'detalle compra', 'concepto', 'que se compro'],
    monto: ['monto', 'total', 'valor', 'importe'], categoria: ['categoria', 'categoria gasto'], pagado_con: ['pagado con', 'pagado_con', 'cuenta', 'medio de pago', 'forma de pago'],
    condicion: ['condicion', 'condicion pago'], dias_credito: ['dias credito', 'dias_credito'], proveedor: ['proveedor'], tipo_documento: ['tipo documento', 'tipo_documento', 'documento'],
    numero_documento: ['numero documento', 'numero_documento', 'n documento', 'folio'], estado: ['estado', 'status'],
    lote_reembolso: ['lote reembolso', 'lote_reembolso', 'reembolso / lote', 'reembolso', 'lote', 'rendicion'], referencia: ['referencia', 'id', 'item'], nota: ['nota', 'notas', 'observacion']
};

function cpCSV(filas) {
    const c = (x) => { const s = String(x ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + filas.map(f => f.map(c).join(',')).join('\n');
}
function cpBajar(nombre, texto) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function cpDescargarPlantilla() {
    const ej = CP.cuentas[0]?.nombre || 'Banco';
    cpBajar('plantilla_gastos.csv', cpCSV([CP_COLUMNAS,
        [cpHoy(), 'Envío Blue Express pedido 1042', 4300, 'Despachos y envíos', ej, 'contado', '', '', 'boleta', '', 'pagado', '', '', '', 'CLP', ''],
        [cpHoy(), 'Rollos de vinilo', 120000, 'Insumos y materiales', '', 'credito', 30, 'Mi proveedor', 'factura', '12345', 'pendiente', '', '', '', 'CLP', ''],
        [cpHoy(), 'Suscripción en dólares (tasa vacía = dólar del día)', 20, 'Software y suscripciones', ej, 'contado', '', '', 'extranjero', '', 'pagado', '', '', '', 'USD', '']]));
}
function cpDescargarGastos() {
    const filas = cpFiltrarGastos().map(g => [g.fecha_compra, g.descripcion || '', g.moneda_original ? g.monto_original : cpTotal(g), cpCategoria(g.id_categoria_gasto)?.nombre || '', cpCuenta(g.id_cuenta_pago)?.nombre || '',
        g.condicion_pago, '', cpProveedor(g.id_proveedor)?.nombre || '', g.tipo_documento || '', g.numero_documento || g.numero_factura || '', g.estado_pago, '', g.referencia_externa || '', g.observaciones_factura || '', g.moneda_original || g.moneda || 'CLP', g.tasa_cambio || '']);
    cpBajar(`gastos_${cpHoy()}.csv`, cpCSV([CP_COLUMNAS, ...filas]));
}

function cpParseMonto(x) {
    if (typeof x === 'number') return x;
    let s = String(x ?? '').replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.includes('.') && s.includes(',')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
    else s = s.replace(',', '.');
    return Number(s);
}
function cpParseFecha(x) {
    const s = String(x ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
}
function cpTipoCuentaDesdeNombre(n) {
    const s = cpNorm(n);
    if (/rendicion|personal|reembols/.test(s)) return 'reembolsable';
    if (/tdc|tarjeta|credito|visa|master/.test(s)) return 'tarjeta_credito';
    if (/mercado ?pago|billetera|paypal|mach|tenpo/.test(s)) return 'billetera';
    if (/caja|efectivo/.test(s)) return 'caja';
    return 'banco';
}

function cpLeerCSV(input) {
    const f = input.files[0]; input.value = '';
    if (!f) return;
    Papa.parse(f, {
        header: true, skipEmptyLines: true, complete: (res) => cpPrepararImport(res.data, res.meta.fields || []),
        error: (e) => alert('No pude leer el archivo: ' + e.message)
    });
}

async function cpPrepararImport(filas, campos) {
    const mapa = {};
    campos.forEach(c => { const n = cpNorm(c).replace(/[_]+/g, ' '); for (const [k, al] of Object.entries(CP_ALIAS)) if (!mapa[k] && al.map(a => a.replace(/_/g, ' ')).includes(n)) mapa[k] = c; });
    const faltan = ['fecha', 'detalle', 'monto'].filter(k => !mapa[k]);
    const resumen = document.getElementById('cp-i-resumen'), errores = document.getElementById('cp-i-errores');
    document.getElementById('cp-modal-import').classList.remove('hidden');
    document.getElementById('cp-i-progreso').classList.add('hidden');
    if (faltan.length) {
        resumen.innerHTML = `<p class="text-red-600 font-bold">Al archivo le faltan columnas: ${faltan.join(', ')}.</p><p>Descarga la plantilla para ver el formato.</p>`;
        errores.classList.add('hidden'); document.getElementById('cp-i-importar').classList.add('hidden'); document.getElementById('cp-i-opciones').classList.add('hidden');
        return;
    }
    // Referencias ya importadas (para no duplicar si se sube dos veces)
    const existentes = new Set((await cpTodo(() => clienteSupabase.from('compras').select('referencia_externa').eq('id_empresa', window.miEmpresaId).not('referencia_externa', 'is', null))).map(x => x.referencia_externa));
    const val = (r, k) => mapa[k] ? String(r[mapa[k]] ?? '').trim() : '';
    const lista = [], errs = [], cuentasNuevas = new Map(), catsNuevas = new Map();
    let duplicadas = 0;
    for (const [i, r] of filas.entries()) await (async () => {
        const fila = i + 2;
        const fecha = cpParseFecha(val(r, 'fecha')), detalle = val(r, 'detalle');
        let monto = cpParseMonto(val(r, 'monto'));
        if (!fecha) return errs.push(`Fila ${fila}: fecha no válida (“${val(r, 'fecha')}”)`);
        if (!(monto > 0)) return errs.push(`Fila ${fila}: monto no válido (“${val(r, 'monto')}”)`);
        if (!detalle) return errs.push(`Fila ${fila}: falta el detalle`);
        const moneda = (val(r, 'moneda') || 'CLP').toUpperCase().replace('$', '').trim() || 'CLP';
        let ext = null;
        if (moneda !== 'CLP') {
            const tasa = cpParseMonto(val(r, 'tasa')) || await cpTasaDelDia(moneda, fecha);
            if (!(tasa > 0)) return errs.push(`Fila ${fila}: falta el tipo de cambio de ${moneda} (columna tasa_cambio)`);
            ext = { moneda_original: moneda, monto_original: monto, tasa_cambio: tasa }; monto = Math.round(monto * tasa);
        }
        const ref = val(r, 'referencia') || null;
        if (ref && existentes.has(ref)) { duplicadas++; return; }
        const estadoTxt = cpNorm(val(r, 'estado'));
        let cond = cpNorm(val(r, 'condicion')).startsWith('cred') ? 'credito' : 'contado';
        const ctaNombre = val(r, 'pagado_con');
        let cta = ctaNombre ? CP.cuentas.find(c => cpNorm(c.nombre) === cpNorm(ctaNombre)) : null;
        if (ctaNombre && !cta) {
            if (cpNorm(ctaNombre) === 'revisar') return errs.push(`Fila ${fila}: “Pagado con” dice Revisar`);
            if (!cuentasNuevas.has(cpNorm(ctaNombre))) cuentasNuevas.set(cpNorm(ctaNombre), { nombre: ctaNombre, tipo: cpTipoCuentaDesdeNombre(ctaNombre) });
        }
        const tipoCta = cta?.tipo || cuentasNuevas.get(cpNorm(ctaNombre))?.tipo;
        if (!ctaNombre && cond === 'contado') {
            if (/pend|por pagar/.test(estadoTxt)) cond = 'credito'; else return errs.push(`Fila ${fila}: falta “pagado_con”`);
        }
        if (cond === 'contado' && tipoCta !== 'reembolsable' && /por pagar/.test(estadoTxt)) cond = 'credito';
        const catNombre = val(r, 'categoria');
        if (catNombre && !CP.categorias.find(c => cpNorm(c.nombre) === cpNorm(catNombre)) && !catsNuevas.has(cpNorm(catNombre))) catsNuevas.set(cpNorm(catNombre), catNombre);
        const yaPagado = /pagad|reembolsad/.test(estadoTxt) && !/pendiente|por pagar|confirmar/.test(estadoTxt);
        lista.push({ fila, fecha, monto, detalle, cond, ctaNombre, catNombre, provNombre: val(r, 'proveedor'), tipoDoc: val(r, 'tipo_documento'),
            numDoc: val(r, 'numero_documento'), dias: Number(val(r, 'dias_credito')) || 0, ref, nota: val(r, 'nota'),
            lote: val(r, 'lote_reembolso'), yaPagado, reembolsable: tipoCta === 'reembolsable', ext });
    })();
    // Posibles duplicados: mismo monto, o casi igual con descripción parecida, y fecha cercana (±5 días) en cualquier cuenta
    if (lista.length) {
        const fs = lista.map(x => x.fecha).sort(), d0 = new Date(fs[0] + 'T12:00:00'), d1 = new Date(fs[fs.length - 1] + 'T12:00:00');
        d0.setDate(d0.getDate() - 5); d1.setDate(d1.getDate() + 5);
        const ex = await cpTodo(() => clienteSupabase.from('compras').select('fecha_compra, descripcion, total_compra, total_factura, id_cuenta_pago')
            .eq('id_empresa', window.miEmpresaId).neq('estado_pago', 'anulado').gte('fecha_compra', d0.toISOString().slice(0, 10)).lte('fecha_compra', d1.toISOString().slice(0, 10)));
        const usados = new Set();
        lista.forEach(x => {
            const k = ex.findIndex((c, j) => !usados.has(j) && cpPareceDuplicado(c, x.detalle, x.monto) && cpDias(c.fecha_compra) - cpDias(x.fecha) <= 5 && cpDias(x.fecha) - cpDias(c.fecha_compra) <= 5);
            if (k >= 0) { usados.add(k); x.dup = ex[k]; }
        });
    }
    const dups = lista.filter(x => x.dup);
    const aReembolsar = lista.filter(x => x.reembolsable && x.yaPagado);
    CP.importacion = { lista, cuentasNuevas: [...cuentasNuevas.values()], catsNuevas: [...catsNuevas.values()] };
    const total = lista.reduce((s, x) => s + x.monto, 0);
    resumen.innerHTML = `
        <p><b>${lista.length}</b> gastos listos para importar por <b>${cpFmt(total)}</b>.</p>
        ${duplicadas ? `<p class="text-slate-500">${duplicadas} filas ya estaban importadas (misma referencia) y se omiten.</p>` : ''}
        ${dups.length ? `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <label class="flex items-center gap-2 font-bold text-amber-800"><input id="cp-i-saltar" type="checkbox" checked> Saltar ${dups.length} posibles duplicados (ya hay un gasto parecido)</label>
            <div class="text-xs text-amber-900 max-h-40 overflow-y-auto space-y-1">${dups.map(x => `<p>Fila ${x.fila}: ${cpEsc(x.detalle)} ${cpFmt(x.monto)} (${cpFecha(x.fecha)}) ≈ ya existe “${cpEsc(x.dup.descripcion)}” ${cpFmt(cpTotal(x.dup))} (${cpFecha(x.dup.fecha_compra)}, ${cpEsc(cpCuenta(x.dup.id_cuenta_pago)?.nombre || 'a crédito')})</p>`).join('')}</div></div>` : ''}
        ${CP.importacion.cuentasNuevas.length ? `<p>Se crearán estas cuentas: ${CP.importacion.cuentasNuevas.map(c => `<b>${cpEsc(c.nombre)}</b> (${TIPOS_CUENTA[c.tipo].replace(/^\S+ /, '')})`).join(', ')}.</p>` : ''}
        ${CP.importacion.catsNuevas.length ? `<p>Se crearán estas categorías propias: ${CP.importacion.catsNuevas.map(cpEsc).join(', ')}.</p>` : ''}
        ${aReembolsar.length ? `<p><b>${aReembolsar.length}</b> gastos que pagó una persona ya figuran como reembolsados: quedarán pagados en ${new Set(aReembolsar.map(x => x.lote || 'Histórico')).size} lotes de reembolso.</p>` : ''}`;
    errores.innerHTML = errs.length ? `<p class="font-bold mb-1">${errs.length} filas con problemas (no se importan):</p>` + errs.slice(0, 100).map(cpEsc).join('<br>') : '';
    errores.classList.toggle('hidden', !errs.length);
    const opc = document.getElementById('cp-i-opciones');
    opc.classList.toggle('hidden', !aReembolsar.length);
    const origen = CP.cuentas.filter(c => c.activo && c.tipo !== 'reembolsable');
    document.getElementById('cp-i-cuenta-reembolso').innerHTML = origen.map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('')
        + CP.importacion.cuentasNuevas.filter(c => c.tipo !== 'reembolsable').map(c => `<option value="nueva:${cpEsc(c.nombre)}">${cpEsc(c.nombre)} (nueva)</option>`).join('');
    document.getElementById('cp-i-importar').classList.toggle('hidden', !lista.length);
}

async function cpImportar() {
    const imp = CP.importacion; if (!imp) return;
    const btn = document.getElementById('cp-i-importar'); btn.disabled = true; btn.textContent = 'Importando…';
    const prog = document.getElementById('cp-i-progreso'), barra = document.getElementById('cp-i-barra'), texto = document.getElementById('cp-i-texto');
    prog.classList.remove('hidden');
    const e = window.miEmpresaId; const errs = [];
    if (document.getElementById('cp-i-saltar')?.checked) imp.lista = imp.lista.filter(x => !x.dup);
    try {
        // 1. Cuentas y categorías nuevas
        for (const c of imp.cuentasNuevas) {
            const { error } = await clienteSupabase.from('cuentas_financieras').insert({ id_empresa: e, nombre: c.nombre.slice(0, 80), tipo: c.tipo, titular: c.tipo === 'reembolsable' ? c.nombre.slice(0, 80) : null, moneda: CP.monedas[0] || 'CLP' });
            if (error) throw error;
        }
        for (const n of imp.catsNuevas) {
            const { error } = await clienteSupabase.from('categorias_gasto').insert({ id_empresa: e, nombre: n.slice(0, 60) });
            if (error) throw error;
        }
        const origenSel = document.getElementById('cp-i-cuenta-reembolso').value;
        await cpCargarBase();
        const idOrigen = origenSel.startsWith('nueva:') ? CP.cuentas.find(c => c.nombre === origenSel.slice(6))?.id : origenSel;
        // 2. Gastos (de a 5 en paralelo)
        const creados = [];
        for (let i = 0; i < imp.lista.length; i += 5) {
            await Promise.all(imp.lista.slice(i, i + 5).map(async x => {
                const cta = x.ctaNombre ? CP.cuentas.find(c => cpNorm(c.nombre) === cpNorm(x.ctaNombre)) : null;
                const cat = x.catNombre ? CP.categorias.find(c => cpNorm(c.nombre) === cpNorm(x.catNombre)) : null;
                const prov = x.provNombre ? CP.proveedores.find(p => cpNorm(p.nombre) === cpNorm(x.provNombre)) : null;
                const tipoDoc = ['factura', 'boleta', 'boleta_honorarios', 'factura_exenta', 'extranjero', 'sin_documento'].includes(cpNorm(x.tipoDoc).replace(/ /g, '_')) ? cpNorm(x.tipoDoc).replace(/ /g, '_') : null;
                const cond = x.cond === 'credito' && !prov && cta ? 'contado' : x.cond;
                const { data, error } = await clienteSupabase.rpc('registrar_gasto', { p: {
                    id_empresa: e, descripcion: x.detalle, monto: x.monto, fecha: x.fecha, id_categoria_gasto: cat?.id || null, id_proveedor: prov?.id || null,
                    condicion_pago: cond, id_cuenta_pago: cta?.id || null, dias_credito: x.dias, tipo_documento: tipoDoc, numero_documento: x.numDoc || null,
                    ...(x.ext || {}), referencia_externa: x.ref, nota: [x.provNombre && !prov ? 'Proveedor: ' + x.provNombre : '', x.lote && !x.yaPagado ? x.lote : '', x.nota].filter(Boolean).join(' · ') || null } });
                if (error) errs.push(`Fila ${x.fila}: ${error.message}`); else creados.push({ ...x, id: data.id, estado: data.estado_pago });
            }));
            barra.style.width = `${Math.round((i + 5) / imp.lista.length * 90)}%`;
            texto.textContent = `${Math.min(i + 5, imp.lista.length)} de ${imp.lista.length} gastos…`;
        }
        // 3. Lotes de reembolso de lo que ya estaba devuelto
        const lotes = {};
        creados.filter(x => x.reembolsable && x.yaPagado && x.estado === 'pendiente').forEach(x => (lotes[x.lote || 'Histórico'] ||= []).push(x));
        let nLotes = 0;
        for (const [lote, items] of Object.entries(lotes)) {
            const sueldo = /sueldo/i.test(lote);
            if (!sueldo && !idOrigen) { errs.push(`Lote ${lote}: falta elegir desde qué cuenta se reembolsó`); continue; }
            const fechaLote = (lote.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || items.map(x => x.fecha).sort().pop();
            for (let j = 0; j < items.length; j += 500) {
                const { error } = await clienteSupabase.rpc('registrar_pago_compras', {
                    p_id_empresa: e, p_id_cuenta: sueldo ? null : idOrigen, p_forma: sueldo ? 'via_sueldo' : 'transferencia', p_fecha: fechaLote,
                    p_aplicaciones: items.slice(j, j + 500).map(x => ({ id_compra: x.id })), p_referencia: lote.slice(0, 80), p_nota: 'Importado' });
                if (error) errs.push(`Lote ${lote}: ${error.message}`); else nLotes++;
            }
        }
        barra.style.width = '100%';
        texto.textContent = `Listo: ${creados.length} gastos importados${nLotes ? ` y ${nLotes} lotes de reembolso` : ''}.`;
    } catch (err) {
        errs.push(err.message);
    }
    const box = document.getElementById('cp-i-errores');
    if (errs.length) { box.innerHTML = `<p class="font-bold mb-1">${errs.length} problemas:</p>` + errs.slice(0, 100).map(cpEsc).join('<br>'); box.classList.remove('hidden'); }
    btn.classList.add('hidden'); btn.disabled = false; btn.textContent = 'Importar';
    CP.importacion = null;
    await cpCargarBase(); cpCargarGastos();
}

// ---------------------------------------------------------- POR PAGAR
async function cpCargarPorPagar() {
    try {
        CP.pendientes = await cpTodo(() => clienteSupabase.from('compras')
            .select('id, fecha_compra, fecha_vencimiento, descripcion, numero_documento, id_proveedor, id_cuenta_pago, total_compra, total_factura, monto_pagado, estado_pago, condicion_pago, origen, moneda')
            .eq('id_empresa', window.miEmpresaId).in('estado_pago', ['pendiente', 'parcial']).order('fecha_compra'));
        const { data: pg } = await clienteSupabase.from('cxp_pagos').select('*, cxp_pagos_aplicaciones(id)').eq('id_empresa', window.miEmpresaId).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(50);
        CP.pagos = pg || [];
    } catch (e) { console.error(e); return alert('No pude cargar lo pendiente: ' + e.message); }
    // OC de Inventario sin datos de pago no son deuda todavía
    CP.pendientes = CP.pendientes.filter(c => c.origen === 'gasto' || c.id_cuenta_pago || c.condicion_pago === 'credito' || Number(c.monto_pagado) > 0);
    CP.seleccion = {};
    (CP.preseleccion || []).forEach(id => { if (CP.pendientes.some(c => c.id === id)) CP.seleccion[id] = true; });
    CP.preseleccion = null;
    cpPintarPorPagar();
}

function cpGrupos() {
    const g = {};
    CP.pendientes.forEach(c => {
        const cta = cpCuenta(c.id_cuenta_pago);
        const k = cta && cta.tipo === 'reembolsable' ? 'cta:' + cta.id : 'prov:' + (c.id_proveedor || 'sin');
        const nombre = cta && cta.tipo === 'reembolsable' ? `🙋 ${cta.titular || cta.nombre}` : `🏢 ${cpProveedor(c.id_proveedor)?.nombre || 'Proveedor sin indicar'}`;
        (g[k] ||= { k, nombre, sub: cta && cta.tipo === 'reembolsable' ? cta.nombre : 'Compras a crédito', items: [] }).items.push(c);
    });
    return Object.values(g).sort((a, b) => b.items.reduce((s, c) => s + cpSaldo(c), 0) - a.items.reduce((s, c) => s + cpSaldo(c), 0));
}

function cpPintarPorPagar() {
    const grupos = cpGrupos();
    document.getElementById('cp-p-grupos').innerHTML = grupos.length ? grupos.map(gr => {
        const tot = gr.items.reduce((s, c) => s + cpSaldo(c), 0);
        const sel = gr.items.filter(c => CP.seleccion[c.id]);
        const totSel = sel.reduce((s, c) => s + cpSaldo(c), 0);
        return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 border-b border-slate-100">
                <div><p class="font-black text-slate-800">${cpEsc(gr.nombre)}</p><p class="text-xs text-slate-400">${cpEsc(gr.sub)} · ${gr.items.length} pendientes</p></div>
                <div class="flex items-center gap-3"><p class="text-xl font-black text-amber-700">${cpFmt(tot)}</p>
                    <button onclick="cpAbrirPago('${gr.k}')" ${sel.length ? '' : 'disabled'} class="px-4 py-2 rounded-lg font-bold text-xs ${sel.length ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400'}">Pagar ${sel.length ? `${sel.length} (${cpFmt(totSel)})` : 'seleccionados'}</button></div>
            </div>
            <div class="overflow-x-auto max-h-96 overflow-y-auto"><table class="min-w-full text-sm">
                <thead class="text-[11px] font-bold text-slate-400 uppercase sticky top-0 bg-white"><tr>
                    <th class="px-3 py-2 text-left"><input type="checkbox" onchange="cpSelGrupo('${gr.k}', this.checked)" ${sel.length === gr.items.length ? 'checked' : ''}></th>
                    <th class="px-3 py-2 text-left">Fecha</th><th class="px-3 py-2 text-left">Detalle</th><th class="px-3 py-2 text-right">Días</th><th class="px-3 py-2 text-right">Saldo</th></tr></thead>
                <tbody class="divide-y divide-slate-50">${gr.items.map(c => {
                    const ref = c.fecha_vencimiento || c.fecha_compra; const d = cpDias(ref);
                    const dtxt = c.fecha_vencimiento ? (d > 0 ? `<span class="text-red-600 font-bold">vencida hace ${d}</span>` : `vence en ${-d}`) : `${d} días`;
                    return `<tr><td class="px-3 py-2"><input type="checkbox" ${CP.seleccion[c.id] ? 'checked' : ''} onchange="cpSel('${c.id}', this.checked)"></td>
                        <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${cpFecha(c.fecha_compra)}</td><td class="px-3 py-2">${cpEsc(c.descripcion || 'Orden de compra ' + (c.numero_documento || ''))}</td>
                        <td class="px-3 py-2 text-right text-xs whitespace-nowrap">${dtxt}</td><td class="px-3 py-2 text-right font-bold whitespace-nowrap">${cpFmt(cpSaldo(c), c.moneda)}</td></tr>`;
                }).join('')}</tbody></table></div></div>`;
    }).join('') : '<div class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-sm font-bold">No tienes nada pendiente de pago. 🎉</div>';
    document.getElementById('cp-p-historial').innerHTML = CP.pagos.map(p => `<tr>
        <td class="px-3 py-2 text-slate-500">${cpFecha(p.fecha)}</td><td class="px-3 py-2">${p.forma === 'via_sueldo' ? 'Dentro del sueldo' : cpEsc(cpCuenta(p.id_cuenta)?.nombre || '—')}</td>
        <td class="px-3 py-2 text-slate-500">${cpEsc(p.referencia || '')}</td><td class="px-3 py-2 text-right">${(p.cxp_pagos_aplicaciones || []).length}</td>
        <td class="px-3 py-2 text-right font-bold">${cpFmt(p.monto)}</td>
        <td class="px-3 py-2 text-right">${cpEsAdmin() ? `<button onclick="cpAnularPago('${p.id}')" class="text-red-500 text-xs font-bold hover:underline">Anular</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-400 text-xs">Aún no hay pagos.</td></tr>';
}
function cpSel(id, on) { if (on) CP.seleccion[id] = true; else delete CP.seleccion[id]; cpPintarPorPagar(); }
function cpSelGrupo(k, on) { (cpGrupos().find(g => g.k === k)?.items || []).forEach(c => { if (on) CP.seleccion[c.id] = true; else delete CP.seleccion[c.id]; }); cpPintarPorPagar(); }

function cpAbrirPago(k) {
    const gr = cpGrupos().find(g => g.k === k); if (!gr) return;
    const sel = gr.items.filter(c => CP.seleccion[c.id]); if (!sel.length) return;
    CP.pagoActual = sel;
    const tot = sel.reduce((s, c) => s + cpSaldo(c), 0);
    document.getElementById('cp-pg-resumen').innerHTML = `${sel.length} compras de <b>${cpEsc(gr.nombre.replace(/^\S+ /, ''))}</b> por <b>${cpFmt(tot)}</b>.`;
    const origen = CP.cuentas.filter(c => c.activo && c.tipo !== 'reembolsable');
    document.getElementById('cp-pg-cuenta').innerHTML = origen.map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('')
        + (k.startsWith('cta:') ? '<option value="via_sueldo">Se devolvió dentro del sueldo</option>' : '');
    if (!origen.length && !k.startsWith('cta:')) return alert('Primero crea la cuenta desde la que pagas (banco, billetera o caja).');
    document.getElementById('cp-pg-fecha').value = cpHoy();
    document.getElementById('cp-pg-ref').value = '';
    document.getElementById('cp-modal-pago').classList.remove('hidden');
}

async function cpConfirmarPago() {
    const sel = CP.pagoActual || []; if (!sel.length) return;
    const cta = document.getElementById('cp-pg-cuenta').value;
    const btn = document.getElementById('cp-pg-guardar'); btn.disabled = true; btn.textContent = 'Registrando…';
    const { error } = await clienteSupabase.rpc('registrar_pago_compras', {
        p_id_empresa: window.miEmpresaId, p_id_cuenta: cta === 'via_sueldo' ? null : cta, p_forma: cta === 'via_sueldo' ? 'via_sueldo' : 'transferencia',
        p_fecha: document.getElementById('cp-pg-fecha').value, p_aplicaciones: sel.map(c => ({ id_compra: c.id })),
        p_referencia: document.getElementById('cp-pg-ref').value.trim() || null, p_nota: null });
    btn.disabled = false; btn.textContent = 'Registrar pago';
    if (error) return alert(error.message);
    cpCerrar('cp-modal-pago');
    cpCargarPorPagar();
}

async function cpAnularPago(id) {
    if (!confirm('¿Anular este pago? Las compras que cubría vuelven a quedar pendientes.')) return;
    const { error } = await clienteSupabase.rpc('anular_pago_compras', { p_id_pago: id });
    if (error) return alert(error.message);
    cpCargarPorPagar();
}

// ---------------------------------------------------------- CUENTAS
async function cpCargarCuentas() {
    if (!CP.pendientes.length) {
        try { CP.pendientes = await cpTodo(() => clienteSupabase.from('compras').select('id, id_cuenta_pago, total_compra, total_factura, monto_pagado, estado_pago').eq('id_empresa', window.miEmpresaId).in('estado_pago', ['pendiente', 'parcial'])); }
        catch (e) { console.error(e); }
    }
    const debe = {};
    CP.pendientes.forEach(c => { if (c.id_cuenta_pago) debe[c.id_cuenta_pago] = (debe[c.id_cuenta_pago] || 0) + cpSaldo(c); });
    document.getElementById('cp-c-lista').innerHTML = CP.cuentas.length ? CP.cuentas.map(c => `
        <div class="bg-white rounded-xl border ${c.activo ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'} shadow-sm p-4 space-y-2">
            <div class="flex justify-between items-start"><div><p class="font-black text-slate-800">${cpEsc(c.nombre)}</p>
                <p class="text-xs text-slate-500">${TIPOS_CUENTA[c.tipo]}${c.ultimos_4 ? ' ···· ' + cpEsc(c.ultimos_4) : ''} · ${cpEsc(c.moneda)}</p></div>
                <button onclick="cpAbrirCuenta('${c.id}')" class="text-xs font-bold text-blue-600 hover:underline">Editar</button></div>
            ${c.tipo === 'reembolsable' ? `<p class="text-sm">La empresa le debe a <b>${cpEsc(c.titular || c.nombre)}</b>: <span class="font-black text-amber-700">${cpFmt(debe[c.id] || 0, c.moneda)}</span></p>` : ''}
            ${!c.activo ? '<p class="text-[11px] font-bold text-slate-400">Desactivada</p>' : ''}
        </div>`).join('') : '<p class="text-sm text-slate-400">Aún no tienes cuentas.</p>';
}

function cpAbrirCuenta(id) {
    const c = id ? cpCuenta(id) : null;
    document.getElementById('cp-c-titulo').textContent = c ? 'Editar cuenta' : 'Nueva cuenta';
    document.getElementById('cp-c-id').value = c?.id || '';
    document.getElementById('cp-c-nombre').value = c?.nombre || '';
    document.getElementById('cp-c-tipo').value = c?.tipo || 'banco';
    document.getElementById('cp-c-tipo').disabled = !!c;
    document.getElementById('cp-c-moneda').innerHTML = CP.monedas.map(m => `<option>${m}</option>`).join('');
    document.getElementById('cp-c-moneda').value = c?.moneda || CP.monedas[0];
    document.getElementById('cp-c-titular').value = c?.titular || '';
    document.getElementById('cp-c-ult4').value = c?.ultimos_4 || '';
    cpCambioTipoCuenta();
    const m = document.getElementById('cp-modal-cuenta');
    m.querySelector('#cp-c-activo-box')?.remove();
    if (c) m.querySelector('.grid').insertAdjacentHTML('beforeend', `<label id="cp-c-activo-box" class="md:col-span-2 flex items-center gap-2 text-sm"><input id="cp-c-activo" type="checkbox" ${c.activo ? 'checked' : ''}> Cuenta activa</label>`);
    m.classList.remove('hidden');
}
function cpCambioTipoCuenta() {
    const t = document.getElementById('cp-c-tipo').value;
    document.getElementById('cp-c-titular-box').classList.toggle('hidden', t !== 'reembolsable');
    document.getElementById('cp-c-ult4-box').classList.toggle('hidden', !['tarjeta_credito', 'reembolsable', 'banco'].includes(t));
}
async function cpGuardarCuenta() {
    const id = document.getElementById('cp-c-id').value;
    const tipo = document.getElementById('cp-c-tipo').value;
    const ult4 = document.getElementById('cp-c-ult4').value.trim();
    const datos = {
        nombre: document.getElementById('cp-c-nombre').value.trim(), moneda: document.getElementById('cp-c-moneda').value,
        titular: tipo === 'reembolsable' ? document.getElementById('cp-c-titular').value.trim() : null, ultimos_4: ult4 || null
    };
    if (!datos.nombre) return alert('Ponle un nombre a la cuenta.');
    if (tipo === 'reembolsable' && !datos.titular) return alert('Indica quién es la persona.');
    if (ult4 && !/^\d{4}$/.test(ult4)) return alert('Los últimos 4 dígitos deben ser 4 números.');
    let res;
    if (id) { datos.activo = document.getElementById('cp-c-activo')?.checked ?? true; res = await clienteSupabase.from('cuentas_financieras').update(datos).eq('id', id); }
    else res = await clienteSupabase.from('cuentas_financieras').insert({ ...datos, tipo, id_empresa: window.miEmpresaId });
    if (res.error) return alert(res.error.message);
    cpCerrar('cp-modal-cuenta');
    await cpCargarBase(); cpCargarCuentas();
}

// ---------------------------------------------------------- CATEGORÍAS
function cpPintarCategorias() {
    document.getElementById('cp-k-tabla').innerHTML = CP.categorias.map(c => {
        const base = c.id_empresa === null;
        const visible = base ? !CP.ocultas.has(c.id) : c.activo !== false;
        return `<tr><td class="px-3 py-2 font-bold text-slate-700">${cpEsc(c.nombre)}</td>
            <td class="px-3 py-2 text-xs text-slate-500">${base ? 'Base' : 'Propia'}</td>
            <td class="px-3 py-2 text-center">${c.es_remuneracion ? '✔️' : ''}</td>
            <td class="px-3 py-2 text-center"><input type="checkbox" ${visible ? 'checked' : ''} onchange="cpVisibleCategoria('${c.id}', this.checked)"></td>
            <td class="px-3 py-2 text-right">${!base && cpEsAdmin() ? `<button onclick="cpBorrarCategoria('${c.id}')" class="text-red-500 text-xs font-bold hover:underline">Borrar</button>` : ''}</td></tr>`;
    }).join('');
}
async function cpCrearCategoria() {
    const nombre = document.getElementById('cp-k-nombre').value.trim();
    if (!nombre) return;
    const { error } = await clienteSupabase.from('categorias_gasto').insert({ id_empresa: window.miEmpresaId, nombre, es_remuneracion: document.getElementById('cp-k-rem').checked });
    if (error) return alert(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : error.message);
    document.getElementById('cp-k-nombre').value = ''; document.getElementById('cp-k-rem').checked = false;
    await cpCargarBase(); cpPintarCategorias();
}
async function cpVisibleCategoria(id, on) {
    const c = cpCategoria(id); let res;
    if (c.id_empresa === null) res = on ? await clienteSupabase.from('categorias_gasto_ocultas').delete().eq('id_empresa', window.miEmpresaId).eq('id_categoria', id)
                                        : await clienteSupabase.from('categorias_gasto_ocultas').insert({ id_empresa: window.miEmpresaId, id_categoria: id });
    else res = await clienteSupabase.from('categorias_gasto').update({ activo: on }).eq('id', id);
    if (res.error) alert(res.error.message);
    await cpCargarBase(); cpPintarCategorias();
}
async function cpBorrarCategoria(id) {
    if (!confirm('¿Borrar esta categoría? Los gastos que la usaban quedan sin categoría.')) return;
    const { error } = await clienteSupabase.from('categorias_gasto').delete().eq('id', id);
    if (error) return alert(error.message);
    await cpCargarBase(); cpPintarCategorias();
}

Object.assign(window, { cpCambioMoneda, cpPreviewMoneda, cpAnularGasto, cpTab, cpCerrar, cpCargarResumen, cpCargarGastos, cpPintarGastos, cpAbrirGasto, cpCambioCondicion, cpGuardarGasto, cpDescargarPlantilla, cpDescargarGastos,
    cpLeerCSV, cpImportar, cpSel, cpSelGrupo, cpAbrirPago, cpConfirmarPago, cpAnularPago, cpAbrirCuenta, cpCambioTipoCuenta, cpGuardarCuenta, cpCrearCategoria, cpVisibleCategoria, cpBorrarCategoria });
