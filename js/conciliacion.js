// ==========================================================
// TESORERÍA · CONCILIACIÓN (Fase 2)
// Sube cartolas, estados de cuenta y reportes de Mercado Pago,
// sugiere a qué corresponde cada línea y la resuelve con
// resolver_movimiento (vincular, crear gasto, interna, ingreso, no corresponde).
// Usa los ayudantes y el estado CP de compras.js.
// ==========================================================
const CC = { movs: [], pagos: [], compras: [], reglas: [], imps: [], vinculados: new Set(), sug: {}, archivo: null, empresaNombres: [] };
const CC_ALIAS = {
    fecha: ['fecha', 'fecha operacion', 'fecha movimiento', 'fecha transaccion', 'dia', 'date'],
    desc: ['detalle', 'descripcion', 'glosa', 'detalle movimiento', 'descripcion operacion', 'descripcion operacion o cobro', 'movimiento', 'concepto', 'comercio'],
    cargo: ['cargo', 'cargos', 'cheque o cargo', 'monto cargo', 'monto cargos', 'debe', 'giro', 'giros', 'salida', 'debito'],
    abono: ['abono', 'abonos', 'deposito o abono', 'depositos', 'monto depositos o abonos', 'haber', 'monto abono', 'entrada', 'credito'],
    monto: ['monto', 'importe', 'valor', 'monto operacion', 'monto operacion o cobro', 'monto total a pagar', 'monto $', 'amount'],
    saldo: ['saldo', 'saldo contable', 'saldo disponible'],
    ref: ['docto nro', 'n docto', 'nro docto', 'referencia', 'codigo referencia', 'numero referencia', 'n operacion']
};
const ccN = (s) => cpNorm(s).replace(/[_.:°º#]/g, ' ').replace(/\s+/g, ' ').trim();
const ccPatron = (d) => String(d || '').toUpperCase().replace(/^(APP-)?TRASPASO (A|DE):\s*/, '').replace(/[^A-ZÑ ]+/g, ' ').trim().slice(0, 22).trim();
const ccDias = (a, b) => Math.abs(Math.round((new Date(a) - new Date(b)) / 864e5));

window.ccIniciar = async function () {
    const sel = document.getElementById('cc-cuenta');
    const prev = sel.value;
    const activas = CP.cuentas.filter(c => c.activo);
    sel.innerHTML = activas.map(c => `<option value="${c.id}">${cpEsc(c.nombre)} · ${TIPOS_CUENTA[c.tipo].replace(/^\S+ /, '')}</option>`).join('');
    if (prev && activas.some(c => c.id === prev)) sel.value = prev;
    else { const b = activas.find(c => c.tipo === 'banco'); if (b) sel.value = b.id; }
    if (!CC.empresaNombres.length) {
        const { data } = await clienteSupabase.from('empresas').select('nombre, nombre_comercial').eq('id', window.miEmpresaId).maybeSingle();
        CC.empresaNombres = [data?.nombre, data?.nombre_comercial].filter(Boolean).map(ccN).filter(n => n.length > 3);
    }
    if (activas.length) ccCargar();
};

async function ccCargar() {
    const cta = document.getElementById('cc-cuenta').value; if (!cta) return;
    const ym = document.getElementById('cc-mes').value;
    const e = window.miEmpresaId;
    try {
        const [movs, pagos, compras, vinc, reglas, imps, pendTodas] = await Promise.all([
            cpTodo(() => { let q = clienteSupabase.from('movimientos_bancarios').select('*').eq('id_cuenta', cta).order('fecha', { ascending: false }).order('created_at');
                if (ym) { const [d, h] = cpRangoMes(ym); q = q.gte('fecha', d).lte('fecha', h); } return q; }),
            cpTodo(() => clienteSupabase.from('cxp_pagos').select('id, fecha, monto, referencia, forma, id_cuenta').eq('id_empresa', e).order('fecha', { ascending: false })),
            cpTodo(() => clienteSupabase.from('compras').select('id, fecha_compra, descripcion, total_compra, total_factura, monto_pagado, estado_pago, observaciones_factura, id_cuenta_pago')
                .eq('id_empresa', e).neq('estado_pago', 'anulado').order('fecha_compra', { ascending: false })),
            cpTodo(() => clienteSupabase.from('movimientos_bancarios').select('vinculo_tipo, vinculo_id').eq('id_empresa', e).not('vinculo_id', 'is', null)),
            clienteSupabase.from('reglas_comercio').select('*').eq('id_empresa', e).order('patron'),
            cpTodo(() => clienteSupabase.from('importaciones_cartola').select('*').eq('id_cuenta', cta).order('periodo_hasta', { ascending: false })),
            cpTodo(() => clienteSupabase.from('movimientos_bancarios').select('id_cuenta').eq('id_empresa', e).eq('estado', 'pendiente'))
        ]);
        CC.pendPorCuenta = {}; pendTodas.forEach(x => CC.pendPorCuenta[x.id_cuenta] = (CC.pendPorCuenta[x.id_cuenta] || 0) + 1);
        CC.movs = movs; CC.pagos = pagos.filter(p => p.id_cuenta === cta); CC.compras = compras;
        CC.vinculados = new Set(vinc.map(v => v.vinculo_tipo + ':' + v.vinculo_id));
        CC.reglas = reglas.data || []; CC.imps = imps || [];
    } catch (err) { console.error(err); return alert('No pude cargar la conciliación: ' + err.message); }
    ccCalcularSugerencias();
    ccPintarCuentas();
    ccPintar();
}

// Fichas de cuentas: a simple vista qué banco / tarjeta / billetera estás revisando y cuánto le falta
const CC_ICONO = { banco: '🏦', billetera: '📱', caja: '💵', tarjeta_credito: '💳', reembolsable: '🙋' };
function ccPintarCuentas() {
    const sel = document.getElementById('cc-cuenta'), box = document.getElementById('cc-cuentas'); if (!box) return;
    box.innerHTML = CP.cuentas.filter(c => c.activo).map(c => {
        const act = c.id === sel.value, n = CC.pendPorCuenta?.[c.id] || 0;
        return `<button onclick="ccElegirCuenta('${c.id}')" class="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition
            ${act ? 'bg-slate-800 border-slate-800 text-white shadow' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'}">
            <span class="text-lg leading-none">${CC_ICONO[c.tipo] || '🏦'}</span>
            <span class="leading-tight"><span class="block text-sm font-bold">${cpEsc(c.nombre)}</span>
                <span class="block text-[11px] ${act ? 'text-slate-300' : 'text-slate-400'}">${TIPOS_CUENTA[c.tipo].replace(/^\S+ /, '')}${c.ultimos_4 ? ' ···· ' + c.ultimos_4 : ''}</span></span>
            ${n ? `<span class="ml-1 px-2 py-0.5 rounded-full text-[11px] font-black ${act ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-700'}">${n}</span>`
                : `<span class="ml-1 text-xs ${act ? 'text-emerald-300' : 'text-emerald-600'}">✓</span>`}</button>`;
    }).join('');
}
function ccElegirCuenta(id) { document.getElementById('cc-cuenta').value = id; ccCargar(); }

function ccRegla(m) {
    const p = ccPatron(m.descripcion);
    if (p.length < 3) return null;
    return CC.reglas.filter(r => p.startsWith(r.patron) || r.patron.startsWith(p)).sort((a, b) => b.patron.length - a.patron.length)[0];
}

function ccCalcularSugerencias() {
    CC.sug = {};
    const usados = new Set(CC.vinculados);
    const cta = cpCuenta(document.getElementById('cc-cuenta').value);
    // Primero las coincidencias exactas, de la línea más antigua a la más nueva
    [...CC.movs].filter(m => m.estado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(m => {
        const abs = Math.abs(Number(m.monto));
        const regla = ccRegla(m);
        if (m.monto < 0) {
            const pago = CC.pagos.filter(p => !usados.has('pago:' + p.id) && Number(p.monto) === abs && ccDias(p.fecha, m.fecha) <= 7)
                .sort((a, b) => ccDias(a.fecha, m.fecha) - ccDias(b.fecha, m.fecha))[0];
            if (pago) { usados.add('pago:' + pago.id); return CC.sug[m.id] = { accion: 'vincular', datos: { tipo: 'pago', id: pago.id }, segura: true, texto: `Calza con el pago “${pago.referencia || 'sin referencia'}” del ${cpFecha(pago.fecha)}` }; }
            const exactos = CC.compras.filter(c => !usados.has('compra:' + c.id) && cpTotal(c) === abs && ccDias(c.fecha_compra, m.fecha) <= 7)
                .sort((a, b) => (a.id_cuenta_pago !== m.id_cuenta) - (b.id_cuenta_pago !== m.id_cuenta) || ccDias(a.fecha_compra, m.fecha) - ccDias(b.fecha_compra, m.fecha));
            const comp = exactos[0];
            if (comp) {
                usados.add('compra:' + comp.id);
                const misma = comp.id_cuenta_pago === m.id_cuenta;
                return CC.sug[m.id] = { accion: 'vincular', datos: { tipo: 'compra', id: comp.id }, segura: misma,
                    texto: `Calza con el gasto “${comp.descripcion}” del ${cpFecha(comp.fecha_compra)}${misma ? '' : ` · ⚠️ registrado con ${cpCuenta(comp.id_cuenta_pago)?.nombre || 'otra cuenta'}`}` };
            }
            if (regla) {
                // Antes de crear un gasto por regla, revisar que no exista uno parecido (±10%, ±7 días) en cualquier cuenta
                const par = regla.accion === 'empresa' && CC.compras.find(c => !usados.has('compra:' + c.id) && Math.abs(cpTotal(c) - abs) <= abs * 0.1 && ccDias(c.fecha_compra, m.fecha) <= 7);
                if (par) return CC.sug[m.id] = { aviso: true, texto: `⚠️ Comercio recordado, pero ya hay un gasto parecido: “${par.descripcion}” ${cpFmt(cpTotal(par))} del ${cpFecha(par.fecha_compra)} (${cpCuenta(par.id_cuenta_pago)?.nombre || 'a crédito'}). Revísalo antes de crear otro.` };
                return CC.sug[m.id] = ccSugRegla(regla);
            }
            const cerca = CC.pagos.filter(p => !usados.has('pago:' + p.id) && ccDias(p.fecha, m.fecha) <= 3 && Math.abs(Number(p.monto) - abs) / abs < 0.5)[0];
            if (cerca) return CC.sug[m.id] = { aviso: true, texto: `⚠️ El ${cpFecha(cerca.fecha)} registraste un pago de ${cpFmt(cerca.monto)} (“${cerca.referencia || ''}”): diferencia de ${cpFmt(Math.abs(Number(cerca.monto) - abs))}` };
            CC.sug[m.id] = { texto: cta?.tipo === 'reembolsable' ? '¿Gasto de la empresa o personal?' : 'No encontré un registro igual' };
        } else {
            if (regla) return CC.sug[m.id] = ccSugRegla(regla);
            const d = ccN(m.descripcion);
            if (CC.empresaNombres.some(n => d.includes(n))) return CC.sug[m.id] = { accion: 'interna', datos: {}, segura: true, texto: 'Viene de otra cuenta de la empresa' };
            if (Number(m.comision) > 0) return CC.sug[m.id] = { accion: 'ingreso', datos: {}, segura: true, texto: `Venta · comisión ${cpFmt(m.comision)} (${(m.comision / m.monto_bruto * 100).toFixed(2)}%)` };
            CC.sug[m.id] = { accion: 'ingreso', datos: {}, segura: false, texto: 'Probablemente una venta o un cobro' };
        }
    });
}
function ccSugRegla(r) {
    const cat = r.id_categoria_gasto ? cpCategoria(r.id_categoria_gasto)?.nombre : null;
    if (r.accion === 'empresa') return { accion: 'crear_gasto', datos: { id_categoria_gasto: r.id_categoria_gasto, recordar: true }, segura: true, texto: `Gasto de la empresa${cat ? ' · ' + cat : ''} (comercio recordado)` };
    if (r.accion === 'interna') return { accion: 'interna', datos: { recordar: true }, segura: true, texto: 'Transferencia entre tus cuentas (recordado)' };
    return { accion: 'no_corresponde', datos: { recordar: true }, segura: true, texto: 'No corresponde a la empresa (recordado)' };
}

const CC_BORDE = { pendiente: 'bg-amber-400', conciliado: 'bg-emerald-500', ingreso: 'bg-sky-500', interna: 'bg-violet-500', no_corresponde: 'bg-slate-300' };
const CC_ESTADOS = { conciliado: ['Conciliado', 'bg-emerald-100 text-emerald-700'], ingreso: ['Ingreso', 'bg-sky-100 text-sky-700'], interna: ['Entre mis cuentas', 'bg-violet-100 text-violet-700'], no_corresponde: ['No corresponde', 'bg-slate-200 text-slate-500'] };

function ccTextoVinculo(m) {
    if (m.vinculo_tipo === 'pago') { const p = CC.pagos.find(x => x.id === m.vinculo_id); return p ? `Pago “${p.referencia || ''}” · ${cpFecha(p.fecha)}` : 'Pago'; }
    if (m.vinculo_tipo === 'compra') { const c = CC.compras.find(x => x.id === m.vinculo_id); return c ? `Gasto “${c.descripcion}”` : 'Gasto'; }
    if (m.vinculo_tipo === 'transferencia') return 'Transferencia registrada';
    if (m.id_gasto_comision) return 'Comisión registrada como gasto';
    return '';
}

function ccPintar() {
    const filtro = document.getElementById('cc-estado').value;
    const cta = cpCuenta(document.getElementById('cc-cuenta').value);
    const filas = CC.movs.filter(m => !filtro || (filtro === 'pendiente' ? m.estado === 'pendiente' : m.estado !== 'pendiente'));
    const pend = CC.movs.filter(m => m.estado === 'pendiente');
    const seguras = pend.filter(m => CC.sug[m.id]?.segura).length;
    const ultimoSaldo = CC.movs.find(m => m.saldo !== null);
    const cargos = CC.movs.filter(m => m.monto < 0).reduce((s, m) => s + Number(m.monto), 0);
    const abonos = CC.movs.filter(m => m.monto > 0).reduce((s, m) => s + Number(m.monto), 0);
    const t = (a, b, c = '') => `<div class="bg-white border border-slate-200 rounded-xl p-3"><p class="text-[11px] font-bold text-slate-500 uppercase">${a}</p><p class="text-xl font-black ${c}">${b}</p></div>`;
    document.getElementById('cc-resumen').innerHTML = CC.movs.length ?
        t('Por revisar', `${pend.length} <span class="text-xs font-bold text-slate-400">de ${CC.movs.length}</span>`, pend.length ? 'text-amber-700' : 'text-emerald-700') +
        t('Salidas', cpFmt(-cargos)) + t('Entradas', cpFmt(abonos)) +
        t(ultimoSaldo ? `Saldo al ${cpFecha(ultimoSaldo.fecha)}` : 'Saldo', ultimoSaldo ? cpFmt(ultimoSaldo.saldo) : '—') : '';
    const btnS = document.getElementById('cc-btn-sugerencias');
    btnS.textContent = `✓ Aceptar sugerencias${seguras ? ` (${seguras})` : ''}`; btnS.disabled = !seguras; btnS.classList.toggle('opacity-40', !seguras);

    // Reembolso de estado de cuenta (cuenta reembolsable)
    const banner = document.getElementById('cc-reembolso');
    if (cta?.tipo === 'reembolsable') {
        const ids = new Set(CC.movs.filter(m => m.vinculo_tipo === 'compra').map(m => m.vinculo_id));
        const pendR = CC.compras.filter(c => c.id_cuenta_pago === cta.id && ids.has(c.id) && ['pendiente', 'parcial'].includes(c.estado_pago));
        banner.classList.toggle('hidden', !pendR.length);
        if (pendR.length) banner.innerHTML = `<p><b>${pendR.length} gastos</b> de este estado de cuenta, por <b>${cpFmt(pendR.reduce((s, c) => s + cpSaldo(c), 0))}</b>, están pendientes de reembolso a ${cpEsc(cta.titular || cta.nombre)}.</p>
            <button onclick="ccIrAReembolsar()" class="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold text-xs whitespace-nowrap">Generar reembolso →</button>`;
        CC.reembolsables = pendR.map(c => c.id);
    } else banner.classList.add('hidden');

    // Agrupar por archivo subido (cada cartola / estado de cuenta / reporte MP es un bloque)
    const fila = (m) => {
        const s = CC.sug[m.id];
        const monto = `<span class="${m.monto < 0 ? 'text-slate-800' : 'text-emerald-700'} font-bold">${m.monto < 0 ? '−' : '+'}${cpFmt(Math.abs(m.monto), cta?.moneda)}</span>`;
        const extra = m.monto_bruto ? `<p class="text-[11px] text-slate-400">Bruto ${cpFmt(m.monto_bruto)} · comisión ${cpFmt(m.comision || 0)}</p>` : '';
        let estado, acc;
        if (m.estado === 'pendiente') {
            estado = s ? `<span class="text-xs ${s.aviso ? 'text-amber-700 font-bold' : s.segura ? 'text-emerald-700 font-bold' : 'text-slate-500'}">${cpEsc(s.texto)}</span>` : '';
            acc = `${s?.accion ? `<button onclick="ccAceptar('${m.id}')" title="Aceptar sugerencia" class="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold">✓</button>` : ''}
                   <button onclick="ccAbrirResolver('${m.id}')" class="px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50">Resolver…</button>`;
        } else {
            const [et, col] = CC_ESTADOS[m.estado];
            estado = `<span class="px-2 py-1 rounded-full text-[11px] font-bold ${col}">${et}</span> <span class="text-[11px] text-slate-400">${cpEsc(ccTextoVinculo(m))}</span>`;
            acc = `<button onclick="ccDeshacer('${m.id}')" class="text-xs font-bold text-slate-400 hover:text-red-600">Deshacer</button>`;
        }
        return `<tr class="${m.estado === 'pendiente' ? '' : 'bg-slate-50/60'}">
            <td class="pl-0 pr-3 py-2 whitespace-nowrap text-slate-500 text-xs"><span class="inline-block w-1 h-8 align-middle mr-3 rounded-r ${CC_BORDE[m.estado] || 'bg-slate-200'}"></span>${cpFecha(m.fecha)}</td>
            <td class="px-3 py-2"><p class="text-slate-700">${cpEsc(m.descripcion)}</p>${extra}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">${monto}</td>
            <td class="px-3 py-2">${estado}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap space-x-1">${acc}</td></tr>`;
    };
    const grupos = new Map();
    CC.movs.forEach(m => { const k = m.id_importacion || 'sin'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); });
    const orden = [...grupos.keys()].sort((a, b) => (grupos.get(b)[0]?.fecha || '').localeCompare(grupos.get(a)[0]?.fecha || ''));
    let hayFilas = false; const enFiltro = new Set(filas);
    document.getElementById('cc-tabla').innerHTML = orden.map(k => {
        const todas = grupos.get(k), imp = CC.imps.find(x => x.id === k);
        const visibles = todas.filter(m => enFiltro.has(m)); if (visibles.length) hayFilas = true;
        const hechas = todas.filter(m => m.estado !== 'pendiente').length, pct = Math.round(hechas / todas.length * 100);
        const fechas = todas.map(m => m.fecha).sort();
        const sal = todas.filter(m => m.monto < 0).reduce((a, m) => a - Number(m.monto), 0), ent = todas.filter(m => m.monto > 0).reduce((a, m) => a + Number(m.monto), 0);
        const listo = hechas === todas.length;
        const cab = `<tr class="bg-slate-100/80 border-t-2 border-slate-200"><td colspan="5" class="px-3 py-2">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span class="font-bold text-slate-700 text-sm">📄 ${cpEsc(imp?.nombre_archivo || 'Líneas sin archivo')}</span>
                <span class="text-xs text-slate-500">${cpFecha(fechas[0])} → ${cpFecha(fechas[fechas.length - 1])}</span>
                <span class="text-xs text-slate-500">salidas <b class="text-slate-700">${cpFmt(sal, cta?.moneda)}</b> · entradas <b class="text-emerald-700">${cpFmt(ent, cta?.moneda)}</b></span>
                <span class="flex items-center gap-2 ml-auto">
                    <span class="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden"><span class="block h-full ${listo ? 'bg-emerald-500' : 'bg-amber-400'}" style="width:${pct}%"></span></span>
                    <span class="text-xs font-bold ${listo ? 'text-emerald-700' : 'text-amber-700'}">${listo ? '✓ Conciliado' : `${hechas} de ${todas.length}`}</span>
                    ${imp && cpEsAdmin() ? `<button onclick="ccBorrarImportacion('${imp.id}')" title="Quitar este archivo" class="text-slate-300 hover:text-red-500 text-xs">✕</button>` : ''}
                </span></div></td></tr>`;
        return cab + visibles.map(fila).join('');
    }).join('');
    const vacio = document.getElementById('cc-vacio');
    vacio.classList.toggle('hidden', hayFilas);
    vacio.textContent = CC.movs.length ? '¡Todo revisado en este período! 🎉' : 'Aún no subes movimientos de esta cuenta. Usa “Subir cartola / estado de cuenta / MP”.';

    document.getElementById('cc-importaciones').innerHTML = CC.imps.map(i => `<div class="flex justify-between gap-2 border-b border-slate-100 pb-1">
        <span>${cpEsc(i.nombre_archivo || 'archivo')} · ${cpFecha(i.periodo_desde)} a ${cpFecha(i.periodo_hasta)} · ${i.nuevas} líneas</span>
        ${cpEsAdmin() ? `<button onclick="ccBorrarImportacion('${i.id}')" class="text-red-500 font-bold hover:underline">Quitar</button>` : ''}</div>`).join('') || '<p class="text-slate-400">—</p>';
    const ACC = { empresa: 'Gasto de la empresa', no_corresponde: 'No corresponde', interna: 'Entre mis cuentas' };
    document.getElementById('cc-reglas').innerHTML = CC.reglas.map(r => `<div class="flex justify-between gap-2 border-b border-slate-100 pb-1">
        <span><b>${cpEsc(r.patron)}</b> → ${ACC[r.accion]}${r.id_categoria_gasto ? ' · ' + cpEsc(cpCategoria(r.id_categoria_gasto)?.nombre || '') : ''}</span>
        <button onclick="ccBorrarRegla('${r.id}')" class="text-red-500 font-bold hover:underline">Olvidar</button></div>`).join('') || '<p class="text-slate-400">Buddy aún no aprende comercios. Al resolver una línea con “Recordar” marcado, la próxima vez te la sugiere solo.</p>';
}

// ---------------------------------------------------------- RESOLVER
async function ccResolver(id, accion, datos) {
    const { error } = await clienteSupabase.rpc('resolver_movimiento', { p_id: id, p_accion: accion, p_datos: datos || {} });
    if (error) { alert(error.message); return false; }
    return true;
}
async function ccAceptar(id) {
    const s = CC.sug[id]; if (!s?.accion) return;
    if (await ccResolver(id, s.accion, s.datos)) ccCargar();
}
async function ccAceptarSugerencias() {
    const lista = CC.movs.filter(m => m.estado === 'pendiente' && CC.sug[m.id]?.segura);
    if (!lista.length || !confirm(`¿Aceptar ${lista.length} sugerencias seguras (coincidencias exactas y comercios recordados)?`)) return;
    let ok = 0;
    for (const m of lista) if (await ccResolver(m.id, CC.sug[m.id].accion, CC.sug[m.id].datos)) ok++;
    await ccCargar();
    alert(`Listo: ${ok} líneas resueltas.`);
}
async function ccDeshacer(id) {
    const m = CC.movs.find(x => x.id === id);
    let borrar = false;
    if (m?.vinculo_tipo === 'compra' && CC.compras.find(c => c.id === m.vinculo_id)?.observaciones_factura === 'Creado desde conciliación')
        borrar = confirm('¿Borrar también el gasto que se creó desde esta línea?\n\nAceptar = borrar el gasto · Cancelar = dejarlo y solo desvincular');
    if (await ccResolver(id, 'deshacer', { borrar_gasto: borrar })) { await cpCargarBase(); ccCargar(); }
}

function ccAbrirResolver(id) {
    const m = CC.movs.find(x => x.id === id); if (!m) return;
    CC.actual = m;
    const abs = Math.abs(Number(m.monto));
    const regla = ccRegla(m);
    document.getElementById('cc-r-linea').innerHTML = `${cpFecha(m.fecha)} · ${cpEsc(m.descripcion)} · <b>${m.monto < 0 ? '−' : '+'}${cpFmt(abs)}</b>`;
    const otras = CP.cuentas.filter(c => c.activo && c.id !== m.id_cuenta);
    const selOtras = `<select id="cc-r-otra" class="flex-1 px-2 py-1.5 border rounded-lg text-xs bg-white"><option value="">Sin indicar la otra cuenta</option>${otras.map(c => `<option value="${c.id}">${cpEsc(c.nombre)}</option>`).join('')}</select>`;
    const caja = (titulo, cuerpo) => `<div class="border border-slate-200 rounded-lg p-3 space-y-2"><p class="font-bold text-sm text-slate-700">${titulo}</p>${cuerpo}</div>`;
    let html = '';
    if (m.monto < 0) {
        const cand = [
            ...CC.pagos.filter(p => !CC.vinculados.has('pago:' + p.id)).map(p => ({ tipo: 'pago', id: p.id, monto: Number(p.monto), fecha: p.fecha, txt: `Pago · ${p.referencia || 'sin referencia'}` })),
            ...CC.compras.filter(c => !CC.vinculados.has('compra:' + c.id)).map(c => ({ tipo: 'compra', id: c.id, monto: cpTotal(c), fecha: c.fecha_compra,
                txt: `Gasto · ${c.descripcion}${c.id_cuenta_pago !== m.id_cuenta ? ' [' + (cpCuenta(c.id_cuenta_pago)?.nombre || 'a crédito') + ']' : ''}` }))
        ].map(c => ({ ...c, score: Math.abs(c.monto - abs) / Math.max(abs, 1) * 30 + ccDias(c.fecha, m.fecha) })).sort((a, b) => a.score - b.score).slice(0, 15);
        if (cand.length) html += caja('Ya lo registré', `<div class="flex gap-2"><select id="cc-r-cand" class="flex-1 px-2 py-1.5 border rounded-lg text-xs bg-white">${cand.map(c =>
            `<option value="${c.tipo}:${c.id}">${cpFecha(c.fecha)} · ${cpFmt(c.monto)} · ${cpEsc(c.txt.slice(0, 60))}${c.monto !== abs ? ' (≠)' : ''}</option>`).join('')}</select>
            <button onclick="ccResolverModal('vincular')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Vincular</button></div>`);
        html += caja('Es un gasto de la empresa que no había anotado', `
            <input id="cc-r-desc" maxlength="300" value="${cpEsc(m.descripcion)}" class="w-full px-2 py-1.5 border rounded-lg text-xs">
            <div class="flex gap-2"><select id="cc-r-cat" class="flex-1 px-2 py-1.5 border rounded-lg text-xs bg-white"><option value="">Sin categoría</option>${cpCategoriasVisibles().map(c => `<option value="${c.id}" ${regla?.id_categoria_gasto === c.id ? 'selected' : ''}>${cpEsc(c.nombre)}</option>`).join('')}</select>
            <button onclick="ccResolverModal('crear_gasto')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Crear gasto</button></div>
            ${cpCuenta(m.id_cuenta)?.tipo === 'reembolsable' ? '<p class="text-[11px] text-amber-700">Quedará pendiente de reembolso a esta persona.</p>' : ''}`);
    } else {
        html += caja('Es un ingreso (venta o cobro)', `${Number(m.comision) > 0 ? `<p class="text-xs text-slate-500">Se registrará la comisión de ${cpFmt(m.comision)} como gasto.</p>` : ''}
            <button onclick="ccResolverModal('ingreso')" class="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-bold">Marcar como ingreso</button>`);
    }
    html += caja('Es una transferencia entre mis cuentas', `<p class="text-[11px] text-slate-500">Pago de tarjeta, retiro o recarga de Mercado Pago, movimiento entre bancos.</p><div class="flex gap-2">${selOtras}
        <button onclick="ccResolverModal('interna')" class="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold">Guardar</button></div>`);
    html += caja('No corresponde a la empresa', `<p class="text-[11px] text-slate-500">Compra personal u otro movimiento que no es del negocio.</p>
        <button onclick="ccResolverModal('no_corresponde')" class="px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-bold">No corresponde</button>`);
    document.getElementById('cc-r-opciones').innerHTML = html;
    document.getElementById('cc-modal-resolver').classList.remove('hidden');
}

async function ccResolverModal(accion) {
    const m = CC.actual; if (!m) return;
    const datos = { recordar: document.getElementById('cc-r-recordar').checked };
    if (accion === 'vincular') { const [t, id] = document.getElementById('cc-r-cand').value.split(':'); datos.tipo = t; datos.id = id; datos.recordar = false; }
    if (accion === 'crear_gasto') { datos.descripcion = document.getElementById('cc-r-desc').value; datos.id_categoria_gasto = document.getElementById('cc-r-cat').value || null; }
    if (accion === 'interna') datos.id_cuenta_otra = document.getElementById('cc-r-otra').value || null;
    if (await ccResolver(m.id, accion, datos)) { cpCerrar('cc-modal-resolver'); ccCargar(); }
}

function ccIrAReembolsar() { CP.preseleccion = CC.reembolsables || []; cpTab('pagar'); }
async function ccBorrarImportacion(id) {
    if (!confirm('¿Quitar este archivo? Se borran sus líneas que aún están por revisar; lo ya resuelto se mantiene.')) return;
    const { data, error } = await clienteSupabase.rpc('borrar_importacion_cartola', { p_id: id });
    if (error) return alert(error.message);
    alert(`Se quitaron ${data.borradas} líneas.`); ccCargar();
}
async function ccBorrarRegla(id) {
    const { error } = await clienteSupabase.from('reglas_comercio').delete().eq('id', id);
    if (error) return alert(error.message);
    ccCargar();
}

// ---------------------------------------------------------- LEER ARCHIVOS
function ccCargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => mal(new Error('No pude cargar el lector de Excel')); document.head.appendChild(s); });
}

async function ccLeerArchivo(input) {
    const f = input.files[0]; input.value = '';
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) return alert('Por ahora sube la cartola en Excel o CSV (desde tu banco: “Descargar” o “Exportar”). El PDF no se puede leer aquí.');
    try {
        const buf = new Uint8Array(await f.arrayBuffer());
        let filas;
        const binario = (buf[0] === 0x50 && buf[1] === 0x4B) || (buf[0] === 0xD0 && buf[1] === 0xCF);
        if (binario) {
            await ccCargarSheetJS();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
        } else {
            let txt = new TextDecoder('utf-8').decode(buf);
            if (txt.includes('�')) txt = new TextDecoder('latin1').decode(buf);
            filas = Papa.parse(txt.replace(/^﻿/, ''), { skipEmptyLines: true }).data;
        }
        CC.archivo = ccDetectar(f.name, filas);
    } catch (err) { console.error(err); return alert('No pude leer el archivo: ' + err.message); }
    ccAbrirSubir();
}

function ccDetectar(nombre, filas) {
    const a = { nombre, filas, formato: 'generico', header: -1, cols: {}, ult4: null };
    const texto = filas.slice(0, 15).map(r => r.join(' ')).join(' ');
    const m4 = texto.match(/cta[:\s]*0*(\d{4,})/i) || texto.match(/X{4}[\s-]*(\d{4})\b/i) || texto.match(/cuenta[^\d]{0,15}(\d{4,})/i);
    if (m4) a.ult4 = m4[1].slice(-4);
    for (let i = 0; i < Math.min(filas.length, 40); i++) {
        const h = filas[i].map(ccN);
        if (h.includes('source id') || (h.includes('transaction amount') && h.includes('real amount'))) { a.formato = 'mercadopago'; a.header = i; a.h = filas[i].map(x => String(x).trim()); return a; }
        // Reporte "Movimientos" de Mercado Pago (cada cobro y su comisión vienen en filas separadas)
        if (h.includes('tipo de operacion') && h.includes('importe') && (h.includes('operacion relacionada') || h.includes('numero de movimiento'))) {
            a.formato = 'mp_movimientos'; a.header = i; a.h = h; return a;
        }
        const busca = (k) => h.findIndex(x => CC_ALIAS[k].includes(x));
        const fe = busca('fecha'), de = busca('desc');
        if (fe >= 0 && de >= 0) {
            a.header = i; a.cols = { fecha: fe, desc: de, cargo: busca('cargo'), abono: busca('abono'), monto: busca('monto'), saldo: busca('saldo'), ref: busca('ref') };
            if (a.cols.cargo < 0 && a.cols.monto >= 0) a.cols.cargo = a.cols.monto;
            break;
        }
    }
    return a;
}

function ccFechaCelda(v) {
    if (v instanceof Date) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 10); }
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    return cpParseFecha(String(v).trim().split(' ')[0]);
}
function ccMonto(v) { if (v === '' || v === null || v === undefined) return 0; const n = cpParseMonto(v); return isNaN(n) ? 0 : n; }

function ccConvertir() {
    const a = CC.archivo; if (!a || a.header < 0) return [];
    const out = [];
    if (a.formato === 'mercadopago') {
        const ix = (k) => a.h.indexOf(k);
        a.filas.slice(a.header + 1).forEach(r => {
            const bruto = ccMonto(r[ix('TRANSACTION_AMOUNT')]), neto = ccMonto(r[ix('REAL_AMOUNT')]), fee = Math.abs(ccMonto(r[ix('FEE_AMOUNT')]));
            const fecha = String(r[ix('TRANSACTION_DATE')] || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !neto) return;
            const medio = { credit_card: 'tarjeta de crédito', debit_card: 'tarjeta de débito', available_money: 'dinero en cuenta', account_money: 'dinero en cuenta' }[r[ix('PAYMENT_METHOD_TYPE')]] || r[ix('PAYMENT_METHOD_TYPE')] || '';
            const unidad = [r[ix('BUSINESS_UNIT')], r[ix('SUB_UNIT')]].filter(Boolean).join(' · ');
            out.push({ fecha, monto: neto, monto_bruto: bruto > 0 ? bruto : null, comision: bruto > 0 ? fee : null,
                descripcion: bruto > 0 ? `Venta ${unidad} (${medio})` : `Pago en ${unidad || 'Mercado Pago'} (${medio})`, referencia: String(r[ix('SOURCE_ID')] || '') });
        });
        return out;
    }
    if (a.formato === 'mp_movimientos') return ccConvertirMpMovimientos(a);
    const c = a.cols, inv = document.getElementById('cc-s-signo').checked;
    a.filas.slice(a.header + 1).forEach(r => {
        const fecha = ccFechaCelda(r[c.fecha]); const desc = String(r[c.desc] ?? '').replace(/\s+/g, ' ').trim();
        if (!fecha || !desc || /^(saldo (inicial|final|anterior)|total)/i.test(desc)) return;
        let monto;
        if (c.abono >= 0 && c.cargo >= 0 && c.abono !== c.cargo) monto = Math.abs(ccMonto(r[c.abono])) - Math.abs(ccMonto(r[c.cargo]));
        else monto = ccMonto(r[c.cargo]) * (inv ? -1 : 1);
        if (!monto) return;
        out.push({ fecha, descripcion: desc, monto, saldo: c.saldo >= 0 && r[c.saldo] !== '' ? ccMonto(r[c.saldo]) : null, referencia: c.ref >= 0 ? String(r[c.ref] ?? '').replace(/^0+$/, '') || null : null });
    });
    return out;
}

// Agrupa por "Operación relacionada": Cobro + Costo = una venta con su comisión;
// Ingreso de dinero + Pago por el mismo monto = pago hecho con tarjeta o banco a través de Mercado Pago (no usa saldo).
function ccConvertirMpMovimientos(a) {
    const ix = (...ks) => a.h.findIndex(x => ks.includes(x));
    const iF = ix('fecha de pago', 'fecha'), iT = ix('tipo de operacion'), iN = ix('numero de movimiento'), iO = ix('operacion relacionada'), iI = ix('importe');
    const ops = new Map();
    a.filas.slice(a.header + 1).forEach((r, k) => {
        const v = r[iF]; let fecha;
        if (v instanceof Date) fecha = ccFechaCelda(v);
        else if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(String(v))) { const d = new Date(v); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); fecha = d.toISOString().slice(0, 10); } // hora UTC → día local
        else fecha = String(v || '').slice(0, 10);
        const imp = ccMonto(r[iI]); if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !imp) return;
        const op = String((iO >= 0 && r[iO]) || (iN >= 0 && r[iN]) || 'fila' + k);
        if (!ops.has(op)) ops.set(op, { op, fecha, filas: [] });
        ops.get(op).filas.push({ tipo: ccN(r[iT]), imp, num: String(r[iN] || '') });
    });
    const out = [];
    for (const o of ops.values()) {
        const suma = (t) => o.filas.filter(f => f.tipo === t).reduce((s, f) => s + f.imp, 0);
        const cobro = suma('cobro'), costo = suma('costo de mercado pago'), ingreso = suma('ingreso de dinero'), pago = suma('pago');
        const otros = o.filas.filter(f => !['cobro', 'costo de mercado pago', 'ingreso de dinero', 'pago'].includes(f.tipo));
        const ref = 'op ' + o.op;
        if (cobro > 0) out.push({ fecha: o.fecha, monto: cobro + costo, monto_bruto: cobro, comision: Math.abs(costo) || null, descripcion: `Venta Mercado Pago (${ref})`, referencia: o.op });
        else if (costo) out.push({ fecha: o.fecha, monto: costo, descripcion: `Costo de Mercado Pago (${ref})`, referencia: o.op });
        if (pago < 0 && ingreso > 0 && Math.abs(ingreso + pago) < 1) out.push({ fecha: o.fecha, monto: pago, descripcion: `Pago con tarjeta o banco vía Mercado Pago, no usa saldo (${ref})`, referencia: o.op + '-p' });
        else {
            if (pago) out.push({ fecha: o.fecha, monto: pago, descripcion: `Pago con saldo Mercado Pago (${ref})`, referencia: o.op + '-p' });
            if (ingreso) out.push({ fecha: o.fecha, monto: ingreso, descripcion: `Ingreso de dinero (${ref})`, referencia: o.op + '-i' });
        }
        // Descuentos (descuento recibido + pago con descuento) se anulan entre sí: no se suben
        if (Math.abs(otros.reduce((s, f) => s + f.imp, 0)) >= 1)
            otros.forEach(f => out.push({ fecha: o.fecha, monto: f.imp, descripcion: `${f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1)} (${ref})`, referencia: f.num || null }));
    }
    return out.sort((x, y) => x.fecha.localeCompare(y.fecha));
}

function ccAbrirSubir() {
    const a = CC.archivo;
    const sel = document.getElementById('cc-s-cuenta');
    sel.innerHTML = CP.cuentas.filter(c => c.activo).map(c => `<option value="${c.id}">${cpEsc(c.nombre)}${c.ultimos_4 ? ' ···· ' + c.ultimos_4 : ''}</option>`).join('');
    const porDigitos = a.ult4 && CP.cuentas.find(c => c.ultimos_4 === a.ult4);
    const sugerida = porDigitos || (a.formato.startsWith('mp') || a.formato === 'mercadopago' ? CP.cuentas.find(c => c.tipo === 'billetera') : null) || cpCuenta(document.getElementById('cc-cuenta').value);
    if (sugerida) sel.value = sugerida.id;
    const esMP = a.formato === 'mercadopago' || a.formato === 'mp_movimientos';
    document.getElementById('cc-s-formato').innerHTML = a.formato === 'mercadopago' ? '📱 Reconocí un <b>reporte de liquidaciones de Mercado Pago</b>: cada venta trae su comisión.'
        : a.formato === 'mp_movimientos' ? '📱 Reconocí un <b>reporte de movimientos de Mercado Pago</b>: junté cada cobro con su comisión.'
        : a.header >= 0 ? `🏦 Reconocí una <b>cartola / estado de cuenta</b>${a.ult4 ? ` de la cuenta terminada en <b>${a.ult4}</b>` : ''}. Revisa que las columnas estén bien.`
        : '⚠️ No reconocí las columnas. Elige cuál es cada una.';
    const map = document.getElementById('cc-s-map');
    map.classList.toggle('hidden', esMP);
    if (!esMP) {
        if (a.header < 0) { a.header = 0; a.cols = { fecha: 0, desc: 1, cargo: 2, abono: -1, saldo: -1, ref: -1 }; }
        const h = a.filas[a.header] || [];
        const ops = (v, vacio) => (vacio ? '<option value="-1">—</option>' : '') + h.map((x, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${cpEsc(String(x).slice(0, 25) || 'Columna ' + (i + 1))}</option>`).join('');
        document.getElementById('cc-m-fecha').innerHTML = ops(a.cols.fecha);
        document.getElementById('cc-m-desc').innerHTML = ops(a.cols.desc);
        document.getElementById('cc-m-cargo').innerHTML = ops(a.cols.cargo, true);
        document.getElementById('cc-m-abono').innerHTML = ops(a.cols.abono, true);
    }
    document.getElementById('cc-s-signo').checked = false;
    document.getElementById('cc-modal-subir').classList.remove('hidden');
    ccPrevisualizar(true);
}

function ccPrevisualizar(inicial) {
    const a = CC.archivo; if (!a) return;
    const esMP = a.formato === 'mercadopago' || a.formato === 'mp_movimientos';
    if (!esMP && !inicial) {
        a.cols.fecha = +document.getElementById('cc-m-fecha').value; a.cols.desc = +document.getElementById('cc-m-desc').value;
        a.cols.cargo = +document.getElementById('cc-m-cargo').value; a.cols.abono = +document.getElementById('cc-m-abono').value;
    }
    const cta = cpCuenta(document.getElementById('cc-s-cuenta').value);
    const unaColumna = !esMP && !(a.cols.abono >= 0 && a.cols.abono !== a.cols.cargo);
    const box = document.getElementById('cc-s-signo-box'); box.classList.toggle('hidden', !unaColumna);
    if (inicial && unaColumna && ['tarjeta_credito', 'reembolsable'].includes(cta?.tipo)) {
        // en estados de cuenta las compras suelen venir positivas
        const vals = a.filas.slice(a.header + 1).map(r => ccMonto(r[a.cols.cargo])).filter(Boolean);
        document.getElementById('cc-s-signo').checked = vals.filter(v => v > 0).length > vals.length / 2;
    }
    const filas = ccConvertir(); a.convertidas = filas;
    const sal = filas.filter(f => f.monto < 0).reduce((s, f) => s + f.monto, 0), ent = filas.filter(f => f.monto > 0).reduce((s, f) => s + f.monto, 0);
    const fechas = filas.map(f => f.fecha).sort();
    document.getElementById('cc-s-preview').innerHTML = filas.length ? `
        <p class="text-sm mb-2"><b>${filas.length}</b> movimientos del ${cpFecha(fechas[0])} al ${cpFecha(fechas[fechas.length - 1])} · salidas <b>${cpFmt(-sal)}</b> · entradas <b>${cpFmt(ent)}</b></p>
        <table class="min-w-full"><tbody class="divide-y divide-slate-100">${filas.slice(0, 8).map(f => `<tr><td class="py-1 pr-2 text-slate-500 whitespace-nowrap">${cpFecha(f.fecha)}</td><td class="py-1 pr-2">${cpEsc(f.descripcion.slice(0, 50))}</td><td class="py-1 text-right font-bold whitespace-nowrap ${f.monto < 0 ? '' : 'text-emerald-700'}">${f.monto < 0 ? '−' : '+'}${cpFmt(Math.abs(f.monto))}</td></tr>`).join('')}</tbody></table>
        ${filas.length > 8 ? `<p class="text-slate-400 mt-1">…y ${filas.length - 8} más</p>` : ''}
        <p class="text-slate-400 mt-2">Si vuelves a subir un archivo con líneas que ya estaban, esas se saltan.</p>`
        : '<p class="text-red-600 font-bold">No encontré movimientos con esas columnas.</p>';
    document.getElementById('cc-s-importar').disabled = !filas.length;
}

async function ccImportar() {
    const a = CC.archivo; const filas = a?.convertidas || [];
    if (!filas.length) return;
    const cta = document.getElementById('cc-s-cuenta').value;
    const btn = document.getElementById('cc-s-importar'); btn.disabled = true; btn.textContent = 'Importando…';
    const { data, error } = await clienteSupabase.rpc('importar_movimientos', { p_id_cuenta: cta, p_archivo: a.nombre, p_formato: a.formato, p_filas: filas });
    btn.disabled = false; btn.textContent = 'Importar';
    if (error) return alert(error.message);
    const c = cpCuenta(cta);
    if (a.ult4 && c && !c.ultimos_4) { await clienteSupabase.from('cuentas_financieras').update({ ultimos_4: a.ult4 }).eq('id', cta); await cpCargarBase(); }
    cpCerrar('cc-modal-subir');
    document.getElementById('cc-cuenta').value = cta;
    document.getElementById('cc-mes').value = '';
    document.getElementById('cc-estado').value = 'pendiente';
    await ccCargar();
    alert(data.nuevas ? `Listo: ${data.nuevas} movimientos nuevos${data.repetidas ? ` (${data.repetidas} ya estaban y se saltaron)` : ''}.` : 'Todos estos movimientos ya estaban subidos.');
}

Object.assign(window, { ccElegirCuenta, ccCargar, ccPintar, ccAceptar, ccAceptarSugerencias, ccDeshacer, ccAbrirResolver, ccResolverModal, ccIrAReembolsar,
    ccBorrarImportacion, ccBorrarRegla, ccLeerArchivo, ccPrevisualizar, ccImportar });
