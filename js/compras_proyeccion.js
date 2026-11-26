// ============================================================
// Compras · Proyección, presupuesto y alertas
// Todo se calcula con fórmulas sobre los gastos registrados (sin IA, sin costo por consulta).
// ============================================================
(function () {
    const PY = window.PY = { gastos: [], presup: [], movPend: [], cargado: false };
    const esc = (s) => cpEsc(s);
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const nomMes = (ym, corto) => { const n = MESES[+ym.slice(5, 7) - 1]; return `${corto ? n.slice(0, 3) : n} ${ym.slice(0, 4)}`; };
    const sumarMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
    const diasDelMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
    const prom = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    const desv = (a) => { if (a.length < 2) return 0; const m = prom(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
    const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
    // Colores Buddy para el semáforo (sin emojis)
    const TONO = {
        ok: { barra: 'bg-emerald-500', texto: 'text-emerald-700', fondo: 'bg-emerald-50', punto: 'bg-emerald-500', etiqueta: 'En rango' },
        atencion: { barra: 'bg-amber-400', texto: 'text-amber-700', fondo: 'bg-amber-50', punto: 'bg-amber-400', etiqueta: 'Atención' },
        excedido: { barra: 'bg-rose-500', texto: 'text-rose-700', fondo: 'bg-rose-50', punto: 'bg-rose-500', etiqueta: 'Excedido' },
        info: { barra: 'bg-teal-500', texto: 'text-teal-700', fondo: 'bg-teal-50', punto: 'bg-teal-500', etiqueta: 'Info' }
    };
    const tonoPresup = (real, presup) => !presup ? null : real > presup ? TONO.excedido : real >= presup * 0.8 ? TONO.atencion : TONO.ok;
    const punto = (t) => `<span class="inline-block w-2 h-2 rounded-full ${t.punto} shrink-0"></span>`;

    // ---------- carga
    window.pyIniciar = async function () {
        const cont = document.getElementById('cp-proyeccion');
        if (!PY.cargado) cont.innerHTML = '<p class="text-sm text-slate-400 p-6">Calculando…</p>';
        const e = window.miEmpresaId, desde = sumarMes(cpMesActual(), -24) + '-01';
        try {
            const [gs, rep, pr, mv] = await Promise.all([
                cpTodo(() => clienteSupabase.from('compras').select('id, fecha_compra, descripcion, total_compra, total_factura, monto_pagado, estado_pago, id_categoria_gasto, id_proveedor, id_cuenta_pago, id_sucursal, id_centro_costo, condicion_pago, fecha_vencimiento, origen, moneda, observaciones_factura')
                    .eq('id_empresa', e).neq('estado_pago', 'anulado').gte('fecha_compra', desde).order('fecha_compra')),
                cpTodo(() => clienteSupabase.from('compras_distribucion').select('id_compra, id_centro_costo, id_sucursal, porcentaje, monto').eq('id_empresa', e)),
                cpTodo(() => clienteSupabase.from('presupuestos').select('*').eq('id_empresa', e)).catch(() => []),
                cpTodo(() => clienteSupabase.from('movimientos_bancarios').select('fecha, id_cuenta').eq('id_empresa', e).eq('estado', 'pendiente')).catch(() => [])
            ]);
            // Órdenes de compra de Inventario sin datos de pago todavía no son gasto
            PY.gastos = gs.filter(g => !(g.origen === 'orden_compra' && !g.id_cuenta_pago && g.condicion_pago !== 'credito' && !Number(g.monto_pagado)));
            CP.repartos = {}; rep.forEach(r => (CP.repartos[r.id_compra] ||= []).push(r));
            PY.presup = pr; PY.movPend = mv; PY.cargado = true;
        } catch (err) { console.error(err); cont.innerHTML = `<p class="text-sm text-rose-600 p-6">No pude cargar los datos: ${esc(err.message)}</p>`; return; }
        if (!document.getElementById('py-mes')) pyArmar();
        pyCalcular();
    };

    function pyArmar() {
        const sel = (id, opciones) => `<select id="${id}" onchange="pyCalcular()" class="px-3 py-2 border rounded-lg bg-white text-sm">${opciones}</select>`;
        const razones = CP.razones || [];
        document.getElementById('cp-proyeccion').innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div class="flex flex-wrap gap-2 items-center">
                <input id="py-mes" type="month" value="${cpMesActual()}" onchange="pyCalcular()" class="px-3 py-2 border rounded-lg text-sm">
                ${razones.length > 1 ? sel('py-razon', '<option value="">Todas las razones sociales</option>' + razones.map(r => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('')) : '<input type="hidden" id="py-razon" value="">'}
                ${CP.sucursales.length > 1 ? sel('py-suc', cpOpcionesSucursal('Todas las sucursales')) : '<input type="hidden" id="py-suc" value="">'}
                ${CP.centros.length ? sel('py-cc', cpOpcionesCentro('Todos los centros de costo')) : '<input type="hidden" id="py-cc" value="">'}
                ${sel('py-cat', '<option value="">Todas las categorías</option>' + CP.categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join(''))}
                ${sel('py-prov', '<option value="">Todos los proveedores</option>' + CP.proveedores.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join(''))}
            </div>
            <p class="text-[11px] text-slate-400">Los cálculos usan tus gastos registrados de los últimos 24 meses. Cambia los filtros y todo se recalcula.</p>
        </div>
        <div id="py-kpis" class="grid grid-cols-2 lg:grid-cols-4 gap-3"></div>
        <div id="py-alertas"></div>
        <div class="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
            <div id="py-presupuesto" class="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm"></div>
            <div id="py-grafico" class="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4"></div>
        </div>
        <div id="py-proyeccion" class="bg-white rounded-xl border border-slate-200 shadow-sm"></div>
        <div id="py-recurrentes" class="bg-white rounded-xl border border-slate-200 shadow-sm"></div>
        <div id="py-matriz" class="bg-white rounded-xl border border-slate-200 shadow-sm"></div>`;
    }

    // ---------- filtros y montos (respetando repartos por %)
    const filtro = () => ({ mes: val('py-mes') || cpMesActual(), razon: val('py-razon'), suc: val('py-suc'), cc: val('py-cc'), cat: val('py-cat'), prov: val('py-prov') });
    const val = (id) => document.getElementById(id)?.value || '';
    const razonDe = (g) => cpSucursal(g.id_sucursal)?.id_razon_social || cpCuenta(g.id_cuenta_pago)?.id_razon_social || (CP.razones || []).find(r => r.principal)?.id;
    const total = (g) => Number(g.total_factura ?? g.total_compra ?? 0);
    const centroCoincide = (idCentro, cc) => idCentro === cc || cpCentro(idCentro)?.id_padre === cc;
    // Parte del gasto que corresponde a los filtros de sucursal / centro
    function montoFiltrado(g, f) {
        const rep = CP.repartos?.[g.id] || [];
        if (!f.suc && !f.cc) return total(g);
        if (rep.length) return rep.filter(r => (!f.cc || centroCoincide(r.id_centro_costo, f.cc)) && (!f.suc || (r.id_sucursal || g.id_sucursal) === f.suc)).reduce((s, r) => s + Number(r.monto), 0);
        if (f.cc && !centroCoincide(g.id_centro_costo, f.cc)) return 0;
        if (f.suc && g.id_sucursal !== f.suc) return 0;
        return total(g);
    }
    function aplicar(f, { sinCat, sinProv } = {}) {
        return PY.gastos.map(g => {
            if (f.razon && razonDe(g) !== f.razon) return null;
            if (!sinCat && f.cat && g.id_categoria_gasto !== f.cat) return null;
            if (!sinProv && f.prov && g.id_proveedor !== f.prov) return null;
            const m = montoFiltrado(g, f); return m ? { ...g, m, ym: g.fecha_compra.slice(0, 7) } : null;
        }).filter(Boolean);
    }
    const porMes = (filas) => { const o = {}; filas.forEach(g => o[g.ym] = (o[g.ym] || 0) + g.m); return o; };
    const serie = (mapa, hasta, n) => Array.from({ length: n }, (_, i) => mapa[sumarMes(hasta, i - n + 1)] || 0);
    // Meses con datos desde el primer gasto registrado (para no promediar meses en que la empresa no existía)
    const primerMes = () => PY.gastos[0]?.fecha_compra.slice(0, 7) || cpMesActual();
    function pronostico(mapa, ym) {
        const ant = sumarMes(ym, -1), inicio = primerMes();
        const validos = (n) => serie(mapa, ant, n).slice(-Math.max(1, Math.min(n, mesesEntre(inicio, ant) + 1)));
        const p3 = prom(validos(3)), p12 = prom(validos(12)), anio = mapa[sumarMes(ym, -12)];
        const tieneAnio = sumarMes(ym, -12) >= inicio && anio !== undefined;
        const esperado = tieneAnio ? 0.5 * p3 + 0.25 * p12 + 0.25 * anio : 0.65 * p3 + 0.35 * p12;
        const d = desv(validos(6));
        return { esperado: Math.round(esperado), min: Math.max(0, Math.round(esperado - d)), max: Math.round(esperado + d), p3, anio: tieneAnio ? anio : null };
    }
    const mesesEntre = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

    // ---------- gastos recurrentes
    const GENERICAS = new Set(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre', 'mensual', 'suscripcion', 'pago', 'compra', 'anual', 'plan', 'de', 'del', 'la', 'el', 'para', 'mes']);
    // Clave: el proveedor, o la primera palabra con sentido de la descripción ("Google Workspace Junio" → google; "250810461939 BLUE EXPRESS SA" → blue)
    const SINONIMOS = { gmail: 'google', contabilidad: 'contadora', contador: 'contadora', imposiciones: 'previred', bluexpress: 'blue' };
    const claveRec = (g) => { if (g.id_proveedor) return 'p:' + g.id_proveedor;
        const w = cpNorm(g.descripcion).replace(/^(app-)?traspaso a:/, '').replace(/[^a-z ]+/g, ' ').split(' ').find(x => x.length > 2 && !GENERICAS.has(x)) || '';
        return 'd:' + (SINONIMOS[w] || w); };
    function recurrentes(filas, ym) {
        const grupos = {};
        filas.forEach(g => { const k = claveRec(g); if (k.length > 3) (grupos[k] ||= []).push(g); });
        const hoy = cpHoy(), out = [];
        for (const [k, gs] of Object.entries(grupos)) {
            const meses = {}; gs.forEach(g => (meses[g.ym] ||= []).push(g));
            const ult6 = Array.from({ length: 6 }, (_, i) => sumarMes(ym, i - 6));
            const presentes = ult6.filter(m => meses[m]);
            const ult3 = ult6.slice(3).filter(m => meses[m]);
            if (presentes.length < 3 || ult3.length < 2) continue;
            const montos = presentes.map(m => meses[m].reduce((s, g) => s + g.m, 0));
            if (desv(montos) / (prom(montos) || 1) > 0.25) continue;
            const ordenados = gs.slice().sort((a, b) => a.fecha_compra.localeCompare(b.fecha_compra));
            const ultimo = ordenados[ordenados.length - 1], previo = ordenados.filter(g => g.ym < ultimo.ym).pop();
            const dias = presentes.map(m => +meses[m][0].fecha_compra.slice(8, 10)).sort((a, b) => a - b);
            const dia = dias[Math.floor(dias.length / 2)];
            const esteMes = meses[ym];
            const fechaEsperada = `${ym}-${String(Math.min(dia, diasDelMes(ym))).padStart(2, '0')}`;
            let estado;
            if (esteMes) estado = { t: TONO.ok, txt: 'Registrado este mes' };
            else if (ym === cpMesActual() && hoy > fechaEsperada) estado = Math.round((new Date(hoy) - new Date(fechaEsperada)) / 864e5) > 5
                ? { t: TONO.atencion, txt: `No ha llegado (suele ser el ${dia})` } : { t: TONO.info, txt: `Debería llegar estos días` };
            else if (ym >= cpMesActual()) estado = { t: TONO.info, txt: `Próximo: ${cpFecha(fechaEsperada)}` };
            else estado = { t: TONO.atencion, txt: 'No se registró ese mes' };
            const cambio = previo && Math.abs(total(ultimo) - total(previo)) > Math.max(1, total(previo) * 0.001) ? { antes: total(previo), ahora: total(ultimo) } : null;
            out.push({ k, nombre: cpProveedor(ultimo.id_proveedor)?.nombre || ultimo.descripcion, cat: cpCategoria(ultimo.id_categoria_gasto)?.nombre,
                monto: Math.round(prom(montos)), ultimo, dia, estado, cambio, veces: presentes.length, pendienteMes: !esteMes });
        }
        return out.sort((a, b) => b.monto - a.monto);
    }

    // ---------- pintar todo
    window.pyCalcular = function () {
        if (!document.getElementById('py-mes')) return;
        const f = filtro(), ym = f.mes, esActual = ym === cpMesActual();
        const filas = aplicar(f), mapa = porMes(filas);
        const delMes = filas.filter(g => g.ym === ym);
        const gastado = delMes.reduce((s, g) => s + g.m, 0);
        const pr = pronostico(mapa, ym);
        const recs = recurrentes(filas, ym);
        const recPend = recs.filter(r => r.pendienteMes).reduce((s, r) => s + r.monto, 0);
        const dia = esActual ? +cpHoy().slice(8, 10) : diasDelMes(ym), dm = diasDelMes(ym);
        const noRecEsperado = Math.max(0, pr.esperado - recs.reduce((s, r) => s + r.monto, 0));
        const cierre = esActual ? Math.round(gastado + recPend + noRecEsperado * (dm - dia) / dm) : gastado;
        const anio = mapa[sumarMes(ym, -12)];

        // KPIs
        const kpi = (t, v, sub, tono) => `<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4"><p class="text-[11px] font-bold text-slate-500 uppercase">${t}</p>
            <p class="text-2xl font-black text-slate-800 mt-1">${v}</p><p class="text-xs mt-1 ${tono || 'text-slate-500'}">${sub}</p></div>`;
        const vsP3 = pct(esActual ? cierre : gastado, pr.p3);
        document.getElementById('py-kpis').innerHTML =
            kpi(`Gastado en ${nomMes(ym)}`, cpFmt(gastado), `${delMes.length} gastos${esActual ? ` · día ${dia} de ${dm}` : ''}`) +
            kpi(esActual ? 'Proyección de cierre' : 'Cierre del mes', cpFmt(cierre), esActual ? `Rango esperado ${cpFmt(Math.max(gastado, pr.min))} – ${cpFmt(Math.max(gastado, pr.max))}` : 'Mes cerrado') +
            kpi('Promedio últimos 3 meses', cpFmt(Math.round(pr.p3)), vsP3 === null ? '—' : `${esActual ? 'La proyección' : 'Este mes'} va ${vsP3 >= 0 ? '+' : ''}${vsP3}%`, vsP3 > 10 ? 'text-rose-700 font-bold' : vsP3 < -10 ? 'text-emerald-700 font-bold' : '') +
            kpi(`Mismo mes ${+ym.slice(0, 4) - 1}`, anio !== undefined && sumarMes(ym, -12) >= primerMes() ? cpFmt(anio) : '—', anio ? `${pct(esActual ? cierre : gastado, anio) >= 0 ? '+' : ''}${pct(esActual ? cierre : gastado, anio)}% vs año anterior` : 'Sin datos del año anterior');

        pyPintarPresupuesto(f, ym, esActual, dia, dm);
        pyPintarGrafico(mapa, ym, esActual ? cierre : null);
        pyPintarProyeccion(f, ym);
        pyPintarRecurrentes(recs, ym);
        pyPintarMatriz();
        pyPintarAlertas(f, ym, recs);
    };

    // ---------- presupuesto vs real
    const presupDe = (ym, cat, f) => PY.presup.find(p => p.periodo.slice(0, 7) === ym && (p.id_categoria_gasto || '') === (cat || '') && (p.id_centro_costo || '') === (f.cc || '') && (p.id_sucursal || '') === (f.suc || ''));
    function pyPintarPresupuesto(f, ym, esActual, dia, dm) {
        const admin = cpEsAdmin();
        const filas = aplicar({ ...f, cat: '' });
        const delMes = filas.filter(g => g.ym === ym), mapaCat = {};
        filas.forEach(g => { const k = g.id_categoria_gasto || ''; ((mapaCat[k] ||= {})[g.ym] = (mapaCat[k][g.ym] || 0) + g.m); });
        const cats = new Set([...delMes.map(g => g.id_categoria_gasto || ''), ...PY.presup.filter(p => p.periodo.slice(0, 7) === ym && (p.id_centro_costo || '') === (f.cc || '') && (p.id_sucursal || '') === (f.suc || '')).map(p => p.id_categoria_gasto || '').filter(Boolean)]);
        if (f.cat) [...cats].forEach(c => c !== f.cat && cats.delete(c));
        const filasCat = [...cats].map(c => {
            const real = delMes.filter(g => (g.id_categoria_gasto || '') === c).reduce((s, g) => s + g.m, 0);
            const p = presupDe(ym, c, f), pr = pronostico(mapaCat[c] || {}, ym);
            const proy = esActual ? Math.max(real, Math.round(real + pr.esperado * (dm - dia) / dm)) : real;
            return { c, nombre: c ? cpCategoria(c)?.nombre || 'Categoría' : 'Sin categoría', real, presup: p ? Number(p.monto) : null, proy, sugerido: pr.esperado };
        }).sort((a, b) => (b.presup || b.real) - (a.presup || a.real));
        const totP = filasCat.reduce((s, x) => s + (x.presup || 0), 0), totR = filasCat.reduce((s, x) => s + x.real, 0), totProy = filasCat.reduce((s, x) => s + x.proy, 0);
        const barra = (real, p) => { if (!p) return '<span class="text-[11px] text-slate-400">Sin presupuesto</span>'; const t = tonoPresup(real, p), w = Math.min(100, Math.round(real / p * 100));
            return `<div class="flex items-center gap-2"><div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${t.barra}" style="width:${w}%"></div></div><span class="text-xs font-bold ${t.texto} w-10 text-right">${Math.round(real / p * 100)}%</span></div>`; };
        const contexto = [f.cc && cpNombreCentro(f.cc), f.suc && cpSucursal(f.suc)?.nombre].filter(Boolean).join(' · ');
        document.getElementById('py-presupuesto').innerHTML = `
            <div class="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div><h3 class="font-black text-slate-800">Presupuesto vs. real · ${nomMes(ym)}</h3>
                    <p class="text-[11px] text-slate-500">${contexto ? `Presupuesto de <b>${esc(contexto)}</b>` : 'Presupuesto general de la empresa'}. ${esActual ? 'La proyección estima cómo cerrará cada categoría.' : ''}</p></div>
                ${admin ? `<div class="flex gap-2"><button onclick="pySugerir('${ym}')" class="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 text-slate-600 hover:bg-slate-50">Sugerir montos</button>
                    <button onclick="pyCopiarMesAnterior('${ym}')" class="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 text-slate-600 hover:bg-slate-50">Copiar mes anterior</button></div>` : ''}</div>
            <div class="overflow-x-auto"><table class="min-w-full text-sm">
                <thead class="text-[11px] font-bold text-slate-400 uppercase"><tr><th class="px-4 py-2 text-left">Categoría</th><th class="px-3 py-2 text-right">Presupuesto</th><th class="px-3 py-2 text-right">Real</th><th class="px-3 py-2 w-40">Consumido</th>${esActual ? '<th class="px-3 py-2 text-right">Cierre estimado</th>' : ''}</tr></thead>
                <tbody class="divide-y divide-slate-50">${filasCat.map(x => {
                    const tp = esActual && x.presup ? tonoPresup(x.proy, x.presup) : null;
                    return `<tr><td class="px-4 py-2 font-bold text-slate-700">${esc(x.nombre)}</td>
                        <td class="px-3 py-2 text-right">${admin ? `<input value="${x.presup ?? ''}" placeholder="${cpFmt(x.sugerido)}" onchange="pyGuardarPresup('${ym}', '${x.c}', this.value)" inputmode="numeric" class="w-28 px-2 py-1 border border-slate-200 rounded text-right text-sm">` : (x.presup !== null ? cpFmt(x.presup) : '—')}</td>
                        <td class="px-3 py-2 text-right font-bold">${cpFmt(x.real)}</td><td class="px-3 py-2">${barra(x.real, x.presup)}</td>
                        ${esActual ? `<td class="px-3 py-2 text-right whitespace-nowrap ${tp ? tp.texto + ' font-bold' : 'text-slate-500'}">${cpFmt(x.proy)}</td>` : ''}</tr>`; }).join('')
                    || `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400 text-sm">No hay gastos ni presupuesto en este mes.</td></tr>`}
                ${filasCat.length ? `<tr class="bg-slate-50 font-black"><td class="px-4 py-2">Total</td><td class="px-3 py-2 text-right">${totP ? cpFmt(totP) : '—'}</td><td class="px-3 py-2 text-right">${cpFmt(totR)}</td><td class="px-3 py-2">${barra(totR, totP)}</td>${esActual ? `<td class="px-3 py-2 text-right">${cpFmt(totProy)}</td>` : ''}</tr>` : ''}
                </tbody></table></div>
            ${admin ? '<p class="px-4 py-2 text-[11px] text-slate-400">Escribe el monto y presiona Enter para guardarlo. El número gris es lo que Buddy estima según tu historial.</p>' : ''}`;
    }
    window.pyGuardarPresup = async function (ym, cat, valor) {
        const f = filtro(), monto = cpParseMonto(valor), ex = presupDe(ym, cat, f);
        let res;
        if (!String(valor).trim()) { if (!ex) return; res = await clienteSupabase.from('presupuestos').delete().eq('id', ex.id); }
        else if (!(monto >= 0)) return alert('Monto no válido');
        else if (ex) res = await clienteSupabase.from('presupuestos').update({ monto, updated_at: new Date().toISOString() }).eq('id', ex.id).select().single();
        else res = await clienteSupabase.from('presupuestos').insert({ id_empresa: window.miEmpresaId, periodo: ym + '-01', id_categoria_gasto: cat || null, id_centro_costo: f.cc || null, id_sucursal: f.suc || null, monto }).select().single();
        if (res.error) return alert(res.error.message);
        PY.presup = PY.presup.filter(p => p.id !== ex?.id); if (res.data) PY.presup.push(res.data);
        pyCalcular();
    };
    window.pySugerir = async function (ym) {
        const f = filtro(), filas = aplicar({ ...f, cat: '' }), mapaCat = {};
        filas.forEach(g => { const k = g.id_categoria_gasto; if (k) ((mapaCat[k] ||= {})[g.ym] = (mapaCat[k][g.ym] || 0) + g.m); });
        const sug = Object.entries(mapaCat).map(([c, m]) => [c, Math.ceil(pronostico(m, ym).esperado / 1000) * 1000]).filter(([c, v]) => v > 0 && !presupDe(ym, c, f));
        if (!sug.length) return alert('Ya tienes presupuesto en todas las categorías con historial.');
        if (!confirm(`Buddy propone presupuesto para ${sug.length} categorías según tu historial (redondeado a miles). Solo completa las que están vacías. ¿Continuar?`)) return;
        for (const [c, v] of sug) await pyGuardarPresup(ym, c, String(v));
    };
    window.pyCopiarMesAnterior = async function (ym) {
        const f = filtro(), ant = sumarMes(ym, -1);
        const previos = PY.presup.filter(p => p.periodo.slice(0, 7) === ant && (p.id_centro_costo || '') === (f.cc || '') && (p.id_sucursal || '') === (f.suc || ''));
        if (!previos.length) return alert(`No hay presupuesto en ${nomMes(ant)} para copiar.`);
        const nuevos = previos.filter(p => !presupDe(ym, p.id_categoria_gasto || '', f));
        if (!nuevos.length) return alert('Este mes ya tiene esos montos.');
        for (const p of nuevos) await pyGuardarPresup(ym, p.id_categoria_gasto || '', String(p.monto));
    };

    // ---------- gráfico: 12 meses reales + 3 proyectados
    function pyPintarGrafico(mapa, ym, cierre) {
        const real = Array.from({ length: 12 }, (_, i) => sumarMes(ym, i - 11));
        const fut = Array.from({ length: 3 }, (_, i) => sumarMes(ym, i + 1));
        const mapaP = { ...mapa }; if (cierre !== null) mapaP[ym] = cierre;
        const proy = fut.map(m => { const p = pronostico(mapaP, m); mapaP[m] = p.esperado; return p; });
        const vals = [...real.map(m => m === ym && cierre !== null ? cierre : mapa[m] || 0), ...proy.map(p => p.max)];
        const max = Math.max(1, ...vals), W = 15, H = 140, ancho = 100 / W;
        const barras = [...real.map((m, i) => ({ m, v: mapa[m] || 0, c: m === ym ? cierre : null, i })), ...proy.map((p, j) => ({ m: fut[j], p, i: 12 + j }))].map(b => {
            const x = b.i * ancho + ancho * 0.15, w = ancho * 0.7;
            if (b.p) { const y = H - b.p.esperado / max * H, y1 = H - b.p.max / max * H, y2 = H - b.p.min / max * H;
                return `<rect x="${x}" y="${y}" width="${w}" height="${H - y}" rx="2" class="fill-teal-200"><title>${nomMes(b.m)}: esperado ${cpFmt(b.p.esperado)} (${cpFmt(b.p.min)} – ${cpFmt(b.p.max)})</title></rect>
                    <line x1="${x + w / 2}" x2="${x + w / 2}" y1="${y1}" y2="${y2}" class="stroke-teal-600" stroke-width="0.6" vector-effect="non-scaling-stroke"/>`; }
            const y = H - b.v / max * H, yc = b.c !== null ? H - b.c / max * H : null;
            return `${yc !== null && b.c > b.v ? `<rect x="${x}" y="${yc}" width="${w}" height="${y - yc}" rx="2" class="fill-teal-200"><title>Cierre estimado ${cpFmt(b.c)}</title></rect>` : ''}
                <rect x="${x}" y="${y}" width="${w}" height="${H - y}" rx="2" class="${b.m === ym ? 'fill-emerald-600' : 'fill-emerald-400'}"><title>${nomMes(b.m)}: ${cpFmt(b.v)}</title></rect>`;
        }).join('');
        const etiquetas = [...real, ...fut].map((m, i) => `<span class="flex-1 text-center text-[10px] ${i >= 12 ? 'text-teal-600 font-bold' : m === ym ? 'text-emerald-700 font-bold' : 'text-slate-400'}">${MESES[+m.slice(5) - 1].slice(0, 1).toUpperCase()}</span>`).join('');
        document.getElementById('py-grafico').innerHTML = `<h3 class="font-black text-slate-800">Últimos 12 meses y próximos 3</h3>
            <p class="text-[11px] text-slate-500 mb-3">Verde: lo real. Turquesa claro: lo proyectado, con la línea del rango mínimo–máximo. Pasa el cursor sobre una barra para ver el monto.</p>
            <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" class="w-full h-44">${barras}</svg>
            <div class="flex mt-1">${etiquetas}</div>`;
    }

    // ---------- proyección próximos 3 meses por categoría
    function pyPintarProyeccion(f, ym) {
        const filas = aplicar({ ...f, cat: '' }), mapaCat = {};
        filas.forEach(g => { const k = g.id_categoria_gasto || ''; ((mapaCat[k] ||= {})[g.ym] = (mapaCat[k][g.ym] || 0) + g.m); });
        const fut = [1, 2, 3].map(n => sumarMes(ym, n));
        const datos = Object.entries(mapaCat).map(([c, m]) => ({ nombre: c ? cpCategoria(c)?.nombre || 'Categoría' : 'Sin categoría', ps: fut.map(x => pronostico(m, x)) }))
            .filter(x => x.ps.some(p => p.esperado > 0) && (!f.cat || x.nombre === cpCategoria(f.cat)?.nombre)).sort((a, b) => b.ps[0].esperado - a.ps[0].esperado);
        const tot = fut.map((_, i) => datos.reduce((s, x) => s + x.ps[i].esperado, 0));
        document.getElementById('py-proyeccion').innerHTML = `<div class="p-4 border-b border-slate-100"><h3 class="font-black text-slate-800">Proyección por categoría</h3>
            <p class="text-[11px] text-slate-500">Esperado y rango para los próximos 3 meses. Combina el promedio reciente, el de 12 meses y el mismo mes del año anterior.</p></div>
            <div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="text-[11px] font-bold text-slate-400 uppercase"><tr><th class="px-4 py-2 text-left">Categoría</th>
                ${fut.map(m => `<th class="px-3 py-2 text-right">${nomMes(m)}</th>`).join('')}</tr></thead>
            <tbody class="divide-y divide-slate-50">${datos.map(x => `<tr><td class="px-4 py-2 font-bold text-slate-700">${esc(x.nombre)}</td>
                ${x.ps.map(p => `<td class="px-3 py-2 text-right whitespace-nowrap"><b>${cpFmt(p.esperado)}</b><p class="text-[11px] text-slate-400">${cpFmt(p.min)} – ${cpFmt(p.max)}</p></td>`).join('')}</tr>`).join('')
                || '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">Aún no hay historial suficiente para proyectar.</td></tr>'}
            ${datos.length ? `<tr class="bg-slate-50 font-black"><td class="px-4 py-2">Total</td>${tot.map(t => `<td class="px-3 py-2 text-right">${cpFmt(t)}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
    }

    // ---------- recurrentes
    function pyPintarRecurrentes(recs, ym) {
        document.getElementById('py-recurrentes').innerHTML = `<div class="p-4 border-b border-slate-100"><h3 class="font-black text-slate-800">Gastos que se repiten</h3>
            <p class="text-[11px] text-slate-500">Buddy detecta lo que pagas casi todos los meses por un monto parecido, y te avisa si cambia de precio o si no ha llegado.</p></div>
            <div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="text-[11px] font-bold text-slate-400 uppercase"><tr>
                <th class="px-4 py-2 text-left">Gasto</th><th class="px-3 py-2 text-right">Monto habitual</th><th class="px-3 py-2 text-left">Frecuencia</th><th class="px-3 py-2 text-left">${nomMes(ym)}</th><th class="px-3 py-2 text-left">Precio</th></tr></thead>
            <tbody class="divide-y divide-slate-50">${recs.map(r => `<tr>
                <td class="px-4 py-2"><p class="font-bold text-slate-700">${esc(r.nombre)}</p><p class="text-[11px] text-slate-400">${esc(r.cat || '')}</p></td>
                <td class="px-3 py-2 text-right font-bold whitespace-nowrap">${cpFmt(r.monto)}</td>
                <td class="px-3 py-2 text-xs text-slate-500">Mensual · ${r.veces} de los últimos 6 meses · suele ser el día ${r.dia}</td>
                <td class="px-3 py-2"><span class="inline-flex items-center gap-2 text-xs font-bold ${r.estado.t.texto}">${punto(r.estado.t)}${esc(r.estado.txt)}</span></td>
                <td class="px-3 py-2 text-xs">${r.cambio ? `<span class="font-bold ${r.cambio.ahora > r.cambio.antes ? 'text-rose-700' : 'text-emerald-700'}">${r.cambio.ahora > r.cambio.antes ? 'Subió' : 'Bajó'} ${cpFmt(r.cambio.antes)} → ${cpFmt(r.cambio.ahora)}</span>` : '<span class="text-slate-400">Estable</span>'}</td></tr>`).join('')
                || '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">Aún no se detectan gastos recurrentes (se necesitan al menos 3 meses).</td></tr>'}</tbody></table></div>`;
    }

    // ---------- matriz: agrupar el mes por cualquier dimensión
    window.pyPintarMatriz = function () {
        const f = filtro(), ym = f.mes, dim = val('py-dim') || 'cat';
        const filas = aplicar(f), prev = [1, 2, 3].map(n => sumarMes(ym, -n));
        const nombre = { cat: g => cpCategoria(g.id_categoria_gasto)?.nombre || 'Sin categoría', prov: g => cpProveedor(g.id_proveedor)?.nombre || 'Sin proveedor',
            cta: g => cpCuenta(g.id_cuenta_pago)?.nombre || (g.condicion_pago === 'credito' ? 'A crédito' : 'Sin cuenta'), suc: g => cpSucursal(g.id_sucursal)?.nombre || 'Sin sucursal',
            cc: g => cpNombreCentro(g.id_centro_costo) || ((CP.repartos?.[g.id] || []).length ? 'Repartido' : 'Sin centro de costo') }[dim];
        const grupos = {};
        filas.forEach(g => { if (g.ym !== ym && !prev.includes(g.ym)) return; const k = nombre(g); const x = (grupos[k] ||= { mes: 0, n: 0, prev: 0 });
            if (g.ym === ym) { x.mes += g.m; x.n++; } else x.prev += g.m / 3; });
        const tot = Object.values(grupos).reduce((s, x) => s + x.mes, 0);
        const lista = Object.entries(grupos).filter(([, x]) => x.mes || x.prev).sort((a, b) => b[1].mes - a[1].mes).slice(0, 40);
        const opc = [['cat', 'Categoría'], ['prov', 'Proveedor'], ['cta', 'Cuenta'], ...(CP.sucursales.length > 1 ? [['suc', 'Sucursal']] : []), ...(CP.centros.length ? [['cc', 'Centro de costo']] : [])];
        document.getElementById('py-matriz').innerHTML = `<div class="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div><h3 class="font-black text-slate-800">Matriz de ${nomMes(ym)}</h3><p class="text-[11px] text-slate-500">Participación, tendencia contra el promedio de los 3 meses anteriores, frecuencia y ticket promedio.</p></div>
                <label class="text-xs font-bold text-slate-500">Agrupar por <select id="py-dim" onchange="pyPintarMatriz()" class="ml-1 px-2 py-1.5 border rounded-lg bg-white text-sm">${opc.map(([k, t]) => `<option value="${k}" ${k === dim ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
            <div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="text-[11px] font-bold text-slate-400 uppercase"><tr>
                <th class="px-4 py-2 text-left">${opc.find(o => o[0] === dim)[1]}</th><th class="px-3 py-2 text-right">Total mes</th><th class="px-3 py-2 w-36">Participación</th><th class="px-3 py-2 text-right">Tendencia</th><th class="px-3 py-2 text-right">Veces</th><th class="px-3 py-2 text-right">Ticket promedio</th></tr></thead>
            <tbody class="divide-y divide-slate-50">${lista.map(([k, x]) => { const t = pct(x.mes, x.prev), part = tot ? Math.round(x.mes / tot * 100) : 0;
                return `<tr><td class="px-4 py-2 font-bold text-slate-700">${esc(k)}</td><td class="px-3 py-2 text-right font-bold">${cpFmt(x.mes)}</td>
                    <td class="px-3 py-2"><div class="flex items-center gap-2"><div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-teal-500" style="width:${part}%"></div></div><span class="text-xs text-slate-500 w-8 text-right">${part}%</span></div></td>
                    <td class="px-3 py-2 text-right text-xs font-bold ${t === null ? 'text-slate-400' : t > 15 ? 'text-rose-700' : t < -15 ? 'text-emerald-700' : 'text-slate-500'}">${t === null ? 'Nuevo' : (t > 0 ? '+' : '') + t + '%'}</td>
                    <td class="px-3 py-2 text-right text-slate-500">${x.n}</td><td class="px-3 py-2 text-right text-slate-500">${x.n ? cpFmt(Math.round(x.mes / x.n)) : '—'}</td></tr>`; }).join('')
                || '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">Sin gastos en este mes.</td></tr>'}</tbody></table></div>`;
    };

    // ---------- alertas
    function pyPintarAlertas(f, ym, recs) {
        const al = [];
        const add = (t, titulo, detalle, accion) => al.push({ t, titulo, detalle, accion });
        // presupuesto
        const filas = aplicar({ ...f, cat: '' }), delMes = filas.filter(g => g.ym === ym);
        PY.presup.filter(p => p.periodo.slice(0, 7) === ym && (p.id_centro_costo || '') === (f.cc || '') && (p.id_sucursal || '') === (f.suc || '')).forEach(p => {
            const real = delMes.filter(g => !p.id_categoria_gasto || g.id_categoria_gasto === p.id_categoria_gasto).reduce((s, g) => s + g.m, 0);
            const t = tonoPresup(real, Number(p.monto)), nom = cpCategoria(p.id_categoria_gasto)?.nombre || 'Total';
            if (t === TONO.excedido) add(TONO.excedido, `${nom}: presupuesto excedido`, `Llevas ${cpFmt(real)} de ${cpFmt(p.monto)} (${Math.round(real / p.monto * 100)}%).`);
            else if (t === TONO.atencion) add(TONO.atencion, `${nom}: vas en ${Math.round(real / p.monto * 100)}% del presupuesto`, `Quedan ${cpFmt(p.monto - real)} para el resto del mes.`);
        });
        // gasto inusual
        const seisAntes = filas.filter(g => g.ym < ym && g.ym >= sumarMes(ym, -6));
        delMes.forEach(g => { const mismos = seisAntes.filter(x => x.id_categoria_gasto === g.id_categoria_gasto); if (mismos.length < 3) return;
            const tk = prom(mismos.map(x => x.m)); if (g.m > 2 * tk && g.m >= 20000)
                add(TONO.atencion, `Gasto inusual: ${g.descripcion}`, `${cpFmt(g.m)} el ${cpFecha(g.fecha_compra)}, más del doble del ticket habitual de ${cpCategoria(g.id_categoria_gasto)?.nombre || 'su categoría'} (${cpFmt(Math.round(tk))}).`, `cpVerGasto('${g.id}')`); });
        // recurrentes
        recs.filter(r => r.cambio).forEach(r => add(r.cambio.ahora > r.cambio.antes ? TONO.atencion : TONO.info, `${r.nombre} ${r.cambio.ahora > r.cambio.antes ? 'subió' : 'bajó'} de precio`, `${cpFmt(r.cambio.antes)} → ${cpFmt(r.cambio.ahora)}.`));
        recs.filter(r => r.estado.t === TONO.atencion && !r.cambio).forEach(r => add(TONO.atencion, `${r.nombre}: ${r.estado.txt.toLowerCase()}`, `Habitualmente ${cpFmt(r.monto)} al mes.`));
        // facturas por vencer / vencidas
        const hoy = cpHoy(), en7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
        const porPagar = PY.gastos.filter(g => ['pendiente', 'parcial'].includes(g.estado_pago) && g.fecha_vencimiento);
        const vencidas = porPagar.filter(g => g.fecha_vencimiento < hoy), proximas = porPagar.filter(g => g.fecha_vencimiento >= hoy && g.fecha_vencimiento <= en7);
        if (vencidas.length) add(TONO.excedido, `${vencidas.length} ${vencidas.length === 1 ? 'factura vencida' : 'facturas vencidas'}`, `Por ${cpFmt(vencidas.reduce((s, g) => s + cpSaldo(g), 0))}.`, `cpTab('pagar')`);
        if (proximas.length) add(TONO.atencion, `${proximas.length} ${proximas.length === 1 ? 'factura vence' : 'facturas vencen'} esta semana`, `Por ${cpFmt(proximas.reduce((s, g) => s + cpSaldo(g), 0))}.`, `cpTab('pagar')`);
        // deuda con personas (cuentas reembolsables)
        CP.cuentas.filter(c => c.tipo === 'reembolsable').forEach(c => {
            const pend = PY.gastos.filter(g => g.id_cuenta_pago === c.id && ['pendiente', 'parcial'].includes(g.estado_pago));
            if (!pend.length) return;
            const vieja = pend.reduce((a, g) => g.fecha_compra < a ? g.fecha_compra : a, '9999');
            add(TONO.info, `Por reembolsar a ${c.titular || c.nombre}: ${cpFmt(pend.reduce((s, g) => s + cpSaldo(g), 0))}`, `${pend.length} gastos pendientes · el más antiguo es de ${nomMes(vieja.slice(0, 7))}.`, `cpTab('pagar')`);
        });
        // conciliación
        if (PY.movPend.length) { const meses = [...new Set(PY.movPend.map(m => m.fecha.slice(0, 7)))].sort();
            add(TONO.atencion, `${PY.movPend.length} líneas de cartola sin conciliar`, `En ${meses.map(m => nomMes(m, true)).join(', ')}.`, `cpTab('conciliacion')`); }
        const orden = [TONO.excedido, TONO.atencion, TONO.info];
        al.sort((a, b) => orden.indexOf(a.t) - orden.indexOf(b.t));
        document.getElementById('py-alertas').innerHTML = !al.length ? '' : `<div class="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div class="p-4 border-b border-slate-100 flex items-center gap-2"><h3 class="font-black text-slate-800">Alertas</h3>
                <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black">${al.length}</span></div>
            <div class="divide-y divide-slate-50 max-h-80 overflow-y-auto">${al.map(a => `<div class="flex items-start gap-3 px-4 py-3 ${a.accion ? 'cursor-pointer hover:bg-slate-50' : ''}" ${a.accion ? `onclick="${a.accion}"` : ''}>
                <span class="mt-1.5">${punto(a.t)}</span><div class="min-w-0"><p class="text-sm font-bold ${a.t.texto}">${esc(a.titulo)}</p><p class="text-xs text-slate-500">${esc(a.detalle)}</p></div></div>`).join('')}</div></div>`;
    }
    window.__py = { recurrentes, pronostico, porMes, claveRec };
})();
