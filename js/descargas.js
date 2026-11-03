// ==========================================================
// DESCARGAS: ventas y cierres de caja por sucursal, columnas elegidas, rango e historial.
// ==========================================================
const DS_COLS = {
    ventas: [['fecha', 'Fecha'], ['hora', 'Hora'], ['ticket', 'N° ticket'], ['origen', 'Origen'], ['estado', 'Estado'], ['cliente', 'Cliente'],
             ['forma_pago', 'Forma de pago'], ['moneda', 'Moneda'], ['total', 'Total'], ['cajero', 'Cajero'], ['productos', 'Productos'], ['unidades', 'Unidades'], ['id_externo', 'ID externo']],
    cierres: [['fecha', 'Fecha'], ['sucursal', 'Sucursal'], ['modo', 'Modo'], ['forma_pago', 'Forma de pago'], ['moneda', 'Moneda'], ['sistema', 'Sistema'], ['otros', 'Otros cobros'],
              ['declarado', 'Declarado'], ['diferencia', 'Diferencia'], ['responsable', 'Responsable'], ['cuadrado', 'Cuadrado'], ['comentario', 'Comentario'], ['otros_cobros', 'Detalle otros cobros']]
};
const DS = { sucursales: [], orden: [], activas: new Set(), tz: 'America/Santiago' };
const dsEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dsAdmin = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
const dsFecha = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
const dsLabel = (tipo, k) => (DS_COLS[tipo].find(c => c[0] === k) || [k, k])[1];

window.cargarDescargas = async function () {
    const [su, em] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('empresas').select('zona_horaria').eq('id', window.miEmpresaId).maybeSingle()
    ]);
    DS.sucursales = su.data || []; DS.tz = (em.data && em.data.zona_horaria) || 'America/Santiago';
    document.getElementById('ds-sucursal').innerHTML = DS.sucursales.map(s => `<option value="${s.id}">${dsEsc(s.nombre)}</option>`).join('');
    document.getElementById('ds-guardar-orden').classList.toggle('hidden', !dsAdmin());
    document.getElementById('ds-programados').classList.toggle('hidden', !dsAdmin());
    document.getElementById('pg-sucursal').innerHTML = DS.sucursales.map(s => `<option value="${s.id}">${dsEsc(s.nombre)}</option>`).join('');
    dsAtajo('7');
    await dsCargarConfig();
    dsCargarHistorial();
    if (dsAdmin()) dsCargarEnvios();
};

function dsHoyLocal() { return new Date().toLocaleDateString('en-CA', { timeZone: DS.tz }); }
function dsSumar(f, dias) { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toLocaleDateString('en-CA'); }
function dsAtajo(a) {
    const hoy = dsHoyLocal(); let d = hoy, h = hoy;
    if (a === 'ayer') { d = h = dsSumar(hoy, -1); }
    if (a === '7') { d = dsSumar(hoy, -7); h = dsSumar(hoy, -1); }
    if (a === 'mes') { d = hoy.slice(0, 8) + '01'; }
    if (a === 'mes_ant') { const p = new Date(hoy.slice(0, 8) + '01T12:00:00'); p.setDate(0); h = p.toLocaleDateString('en-CA'); d = h.slice(0, 8) + '01'; }
    document.getElementById('ds-desde').value = d; document.getElementById('ds-hasta').value = h;
}

async function dsCambioTipo() { await dsCargarConfig(); document.getElementById('ds-previa').classList.add('hidden'); }

async function dsCargarConfig() {
    const tipo = document.getElementById('ds-tipo').value, suc = document.getElementById('ds-sucursal').value;
    const todas = DS_COLS[tipo].map(c => c[0]);
    let guardado = null;
    if (suc) {
        const { data } = await clienteSupabase.from('export_config').select('columnas').eq('id_sucursal', suc).eq('tipo', tipo).maybeSingle();
        guardado = data && data.columnas;
    }
    if (guardado && guardado.length) {
        const validas = guardado.filter(k => todas.includes(k));
        DS.orden = [...validas, ...todas.filter(k => !validas.includes(k))];
        DS.activas = new Set(validas);
        document.getElementById('ds-orden-info').innerText = 'Usando el orden guardado para esta sucursal.';
    } else {
        DS.orden = todas; DS.activas = new Set(todas);
        document.getElementById('ds-orden-info').innerText = 'Aún no hay un orden guardado para esta sucursal: se usa el orden estándar.';
    }
    dsPintarColumnas();
}

function dsPintarColumnas() {
    const tipo = document.getElementById('ds-tipo').value;
    document.getElementById('ds-columnas').innerHTML = DS.orden.map((k, i) => `
        <div class="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 ${DS.activas.has(k) ? 'bg-white' : 'bg-slate-50 opacity-60'}">
            <input type="checkbox" ${DS.activas.has(k) ? 'checked' : ''} onchange="dsToggle('${k}')" class="w-4 h-4">
            <span class="flex-1 text-sm font-bold text-slate-700">${dsEsc(dsLabel(tipo, k))}</span>
            <button onclick="dsMover(${i},-1)" class="px-2 text-slate-400 hover:text-slate-800" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button onclick="dsMover(${i},1)" class="px-2 text-slate-400 hover:text-slate-800" ${i === DS.orden.length - 1 ? 'disabled' : ''}>↓</button>
        </div>`).join('');
}
function dsToggle(k) { DS.activas.has(k) ? DS.activas.delete(k) : DS.activas.add(k); dsPintarColumnas(); }
function dsMover(i, d) { const j = i + d; if (j < 0 || j >= DS.orden.length) return; [DS.orden[i], DS.orden[j]] = [DS.orden[j], DS.orden[i]]; dsPintarColumnas(); }
const dsColumnasElegidas = () => DS.orden.filter(k => DS.activas.has(k));

async function dsGuardarOrden() {
    const cols = dsColumnasElegidas(); if (!cols.length) return alert('Elige al menos una columna.');
    const { error } = await clienteSupabase.rpc('guardar_export_config', { p_id_sucursal: document.getElementById('ds-sucursal').value, p_tipo: document.getElementById('ds-tipo').value, p_columnas: cols });
    if (error) return alert(error.message);
    document.getElementById('ds-orden-info').innerText = 'Orden guardado para esta sucursal. Se usará siempre, también en los envíos automáticos.';
}

async function dsObtener(tipo, suc, desde, hasta) {
    if (!suc || !desde || !hasta) { alert('Elige sucursal y fechas.'); return null; }
    if (hasta < desde) { alert('La fecha final no puede ser anterior a la inicial.'); return null; }
    const { data, error } = await clienteSupabase.rpc('exportar_datos', { p_id_sucursal: suc, p_tipo: tipo, p_desde: desde, p_hasta: hasta });
    if (error) { alert('No se pudo obtener los datos: ' + error.message); return null; }
    return data || [];
}

function dsTabla(tipo, cols, filas) {
    const f = filas.slice(0, 50);
    return `<table class="min-w-full text-xs"><thead class="bg-slate-50 font-bold text-slate-500"><tr>${cols.map(k => `<th class="px-2 py-1.5 text-left whitespace-nowrap">${dsEsc(dsLabel(tipo, k))}</th>`).join('')}</tr></thead>
        <tbody class="divide-y divide-slate-100">${f.map(r => `<tr>${cols.map(k => `<td class="px-2 py-1 whitespace-nowrap">${dsEsc(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p class="px-3 py-2 text-xs text-slate-500">${filas.length} filas${filas.length > 50 ? ' (se muestran las primeras 50)' : ''}.</p>`;
}

async function dsVistaPrevia() {
    const tipo = document.getElementById('ds-tipo').value, cols = dsColumnasElegidas(); if (!cols.length) return alert('Elige al menos una columna.');
    const filas = await dsObtener(tipo, document.getElementById('ds-sucursal').value, document.getElementById('ds-desde').value, document.getElementById('ds-hasta').value);
    if (!filas) return;
    const p = document.getElementById('ds-previa'); p.classList.remove('hidden'); p.innerHTML = filas.length ? dsTabla(tipo, cols, filas) : '<p class="p-4 text-sm text-slate-400">No hay datos en ese período.</p>';
}

function dsCsv(tipo, cols, filas) {
    const celda = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lineas = [cols.map(k => celda(dsLabel(tipo, k))).join(';')];
    filas.forEach(r => lineas.push(cols.map(k => celda(r[k])).join(';')));
    return '﻿' + lineas.join('\r\n');
}
function dsBajar(nombre, texto) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function dsDescargar(paramsExtra) {
    const tipo = (paramsExtra && paramsExtra.tipo) || document.getElementById('ds-tipo').value;
    const suc = (paramsExtra && paramsExtra.suc) || document.getElementById('ds-sucursal').value;
    const desde = (paramsExtra && paramsExtra.desde) || document.getElementById('ds-desde').value;
    const hasta = (paramsExtra && paramsExtra.hasta) || document.getElementById('ds-hasta').value;
    const cols = (paramsExtra && paramsExtra.cols) || dsColumnasElegidas(); if (!cols.length) return alert('Elige al menos una columna.');
    const filas = await dsObtener(tipo, suc, desde, hasta); if (!filas) return;
    if (!filas.length) return alert('No hay datos en ese período.');
    const nomSuc = (DS.sucursales.find(s => s.id === suc) || {}).nombre || 'sucursal';
    dsBajar(`${tipo === 'ventas' ? 'Ventas' : 'Cierres'} ${nomSuc} ${desde} a ${hasta}.csv`.replace(/[\\/:*?"<>|]+/g, ''), dsCsv(tipo, cols, filas));
    await clienteSupabase.rpc('registrar_exportacion', { p_id_sucursal: suc, p_tipo: tipo, p_desde: desde, p_hasta: hasta, p_columnas: cols, p_filas: filas.length });
    dsCargarHistorial();
}

async function dsCargarHistorial() {
    const { data } = await clienteSupabase.from('export_historial').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: false }).limit(50);
    DS.historial = data || [];
    const nom = {}; DS.sucursales.forEach(s => nom[s.id] = s.nombre);
    document.getElementById('ds-historial').innerHTML = DS.historial.map((h, i) => `<tr>
        <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${new Date(h.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td class="px-3 py-2">${h.tipo === 'ventas' ? 'Ventas' : 'Cierres'}</td><td class="px-3 py-2">${dsEsc(nom[h.id_sucursal] || '—')}</td>
        <td class="px-3 py-2 whitespace-nowrap">${dsFecha(h.desde)} → ${dsFecha(h.hasta)}</td><td class="px-3 py-2 text-center">${h.filas}</td>
        <td class="px-3 py-2 text-slate-500">${h.origen === 'automatico' ? 'Envío automático' + (h.correos && h.correos.length ? ' a ' + dsEsc(h.correos.join(', ')) : '') : 'Descarga manual'}${h.estado !== 'ok' ? ' · <span class="text-red-600 font-bold">' + dsEsc(h.detalle || 'error') + '</span>' : ''}</td>
        <td class="px-3 py-2 text-right"><button onclick="dsAbrirHistorial(${i})" class="text-blue-600 font-bold hover:underline">Abrir</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">Aún no hay descargas.</td></tr>';
}

async function dsAbrirHistorial(i) {
    const h = DS.historial[i]; if (!h || !h.id_sucursal) return;
    document.getElementById('ds-tipo').value = h.tipo;
    document.getElementById('ds-sucursal').value = h.id_sucursal;
    document.getElementById('ds-desde').value = h.desde; document.getElementById('ds-hasta').value = h.hasta;
    DS.orden = [...h.columnas, ...DS_COLS[h.tipo].map(c => c[0]).filter(k => !h.columnas.includes(k))];
    DS.activas = new Set(h.columnas);
    document.getElementById('ds-orden-info').innerText = 'Mostrando las columnas de esa descarga.';
    dsPintarColumnas(); await dsVistaPrevia();
    document.getElementById('ds-previa').scrollIntoView({ behavior: 'smooth' });
}


// ---------- Envíos automáticos ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const RANGOS = { ayer: 'ayer', semana_anterior: 'la semana anterior', mes_anterior: 'el mes anterior' };
function dsFrecuencia() {
    const f = document.getElementById('pg-frecuencia').value;
    document.getElementById('pg-w-semana').classList.toggle('hidden', f !== 'semanal');
    document.getElementById('pg-w-mes').classList.toggle('hidden', f !== 'mensual');
}
function dsNuevoEnvio() { DS.editandoEnvio = null; document.getElementById('pg-correos').value = ''; dsFrecuencia(); document.getElementById('ds-form-envio').classList.remove('hidden'); }
async function dsGuardarEnvio() {
    const correos = document.getElementById('pg-correos').value.split(/[,;\s]+/).map(c => c.trim()).filter(Boolean);
    if (!correos.length) return alert('Escribe al menos un correo.');
    const f = document.getElementById('pg-frecuencia').value;
    const { error } = await clienteSupabase.rpc('guardar_programacion', {
        p_id_empresa: window.miEmpresaId, p_id: DS.editandoEnvio, p_id_sucursal: document.getElementById('pg-sucursal').value, p_tipo: document.getElementById('pg-tipo').value,
        p_frecuencia: f, p_dia_semana: f === 'semanal' ? parseInt(document.getElementById('pg-dia-semana').value) : null,
        p_dia_mes: f === 'mensual' ? parseInt(document.getElementById('pg-dia-mes').value) : null, p_rango: document.getElementById('pg-rango').value, p_correos: correos, p_activo: true });
    if (error) return alert(error.message);
    document.getElementById('ds-form-envio').classList.add('hidden'); dsCargarEnvios();
}
async function dsCargarEnvios() {
    const { data } = await clienteSupabase.from('export_programaciones').select('*').eq('id_empresa', window.miEmpresaId).order('created_at');
    const nom = {}; DS.sucursales.forEach(s => nom[s.id] = s.nombre);
    DS.envios = data || [];
    document.getElementById('ds-lista-envios').innerHTML = DS.envios.map(p => {
        const cuando = p.frecuencia === 'diaria' ? 'Todos los días' : p.frecuencia === 'semanal' ? `Todos los ${DIAS[p.dia_semana]}` : `El día ${p.dia_mes} de cada mes`;
        return `<li class="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div><p class="font-bold text-slate-700">${p.tipo === 'ventas' ? 'Ventas' : 'Cierres de caja'} · ${dsEsc(nom[p.id_sucursal] || '')}</p>
            <p class="text-xs text-slate-500">${cuando}, con ${RANGOS[p.rango]} · a ${dsEsc(p.correos.join(', '))}${p.ultimo_envio ? ' · último envío ' + dsFecha(p.ultimo_envio) : ''}</p></div>
            <div class="flex gap-3 text-xs font-bold whitespace-nowrap"><button onclick="dsAlternarEnvio('${p.id}')" class="${p.activo ? 'text-emerald-600' : 'text-slate-400'}">${p.activo ? '● Activo' : '○ Pausado'}</button>
            <button onclick="dsEliminarEnvio('${p.id}')" class="text-red-500 hover:text-red-700">Eliminar</button></div></li>`; }).join('')
        || '<li class="py-3 text-slate-400">Aún no hay envíos programados.</li>';
}
async function dsAlternarEnvio(id) {
    const p = DS.envios.find(x => x.id === id); if (!p) return;
    const { error } = await clienteSupabase.rpc('guardar_programacion', { p_id_empresa: window.miEmpresaId, p_id: p.id, p_id_sucursal: p.id_sucursal, p_tipo: p.tipo, p_frecuencia: p.frecuencia,
        p_dia_semana: p.dia_semana, p_dia_mes: p.dia_mes, p_rango: p.rango, p_correos: p.correos, p_activo: !p.activo });
    if (error) return alert(error.message); dsCargarEnvios();
}
async function dsEliminarEnvio(id) {
    if (!confirm('¿Eliminar este envío programado? El historial de lo ya enviado se conserva.')) return;
    const { error } = await clienteSupabase.rpc('eliminar_programacion', { p_id: id });
    if (error) return alert(error.message); dsCargarEnvios();
}
