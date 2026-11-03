// =====================================================================
// Buddy ERP · Envío de los CSV programados
// Lo llama Vercel Cron una vez al día (ver vercel.json) con  Authorization: Bearer <CRON_SECRET>.
//
// Para cada envío que toca hoy: arma el CSV con las columnas guardadas de la sucursal,
// lo manda por Resend como adjunto y deja el resultado en el historial.
//
// Variables de entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
// RESEND_API_KEY y (opcional) CORREO_REMITENTE.
// La clave de servicio NUNCA se expone al navegador: solo se usa aquí.
// =====================================================================

import { timingSafeEqual } from 'node:crypto';

const ETIQUETAS = {
    ventas: { fecha: 'Fecha', hora: 'Hora', ticket: 'N° ticket', origen: 'Origen', estado: 'Estado', cliente: 'Cliente', forma_pago: 'Forma de pago', moneda: 'Moneda', total: 'Total', cajero: 'Cajero', productos: 'Productos', unidades: 'Unidades', id_externo: 'ID externo' },
    cierres: { fecha: 'Fecha', sucursal: 'Sucursal', modo: 'Modo', forma_pago: 'Forma de pago', moneda: 'Moneda', sistema: 'Sistema', otros: 'Otros cobros', declarado: 'Declarado', diferencia: 'Diferencia', responsable: 'Responsable', cuadrado: 'Cuadrado', comentario: 'Comentario', otros_cobros: 'Detalle otros cobros' },
};

const celda = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function armarCsv(tipo, columnas, filas) {
    const et = ETIQUETAS[tipo] || {};
    const lineas = [columnas.map(k => celda(et[k] || k)).join(';')];
    for (const f of filas) lineas.push(columnas.map(k => celda(f[k])).join(';'));
    return '﻿' + lineas.join('\r\n');
}
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fechaTxt = (d) => { const [y, m, dd] = String(d).split('-'); return `${dd}-${m}-${y}`; };

function autorizado(req) {
    const secreto = process.env.CRON_SECRET || '';
    const dado = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!secreto || !dado) return false;
    const a = Buffer.from(secreto), b = Buffer.from(dado);
    return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
    if (!autorizado(req)) return res.status(401).json({ ok: false, error: 'no_autorizado' });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY, resendKey = process.env.RESEND_API_KEY;
    if (!url || !clave || !resendKey) return res.status(503).json({ ok: false, error: 'no_configurado' });

    // Las claves nuevas (sb_secret_...) van solo en 'apikey'; las antiguas (JWT) también como Bearer
    const cabecerasBase = { apikey: clave, 'Content-Type': 'application/json', ...(clave.startsWith('eyJ') ? { Authorization: `Bearer ${clave}` } : {}) };
    const rpc = async (nombre, args) => {
        const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: cabecerasBase, body: JSON.stringify(args || {}) });
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error((json && json.message) || `rpc ${nombre}: ${r.status}`);
        return json;
    };

    let pendientes;
    try { pendientes = await rpc('programaciones_pendientes'); }
    catch (e) { console.error(e); return res.status(502).json({ ok: false, error: 'base_no_disponible' }); }

    const resultados = [];
    for (const { id } of pendientes || []) {
        let d;
        try {
            d = await rpc('datos_programacion', { p_id: id });
            const columnas = (d.columnas || []).filter(k => (ETIQUETAS[d.tipo] || {})[k]);
            const filas = d.filas || [];
            const csv = armarCsv(d.tipo, columnas, filas);
            const nombre = `${d.tipo === 'ventas' ? 'Ventas' : 'Cierres'} ${d.sucursal} ${d.desde} a ${d.hasta}.csv`.replace(/[\\/:*?"<>|]+/g, '');
            const asunto = `${d.tipo === 'ventas' ? 'Ventas' : 'Cierres de caja'} · ${d.sucursal} · ${fechaTxt(d.desde)}${d.desde === d.hasta ? '' : ' al ' + fechaTxt(d.hasta)}`;
            const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:520px"><p style="font-size:12px;font-weight:bold;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">${esc(d.empresa)}</p>
<h2 style="margin:0 0 10px;font-size:18px">${esc(asunto)}</h2><p style="font-size:14px;color:#475569">Adjuntamos el archivo CSV con ${filas.length} fila(s) del período indicado (${fechaTxt(d.desde)} → ${fechaTxt(d.hasta)}). Las columnas están en el orden que configuraste para esta sucursal.</p>
<p style="font-size:11px;color:#94a3b8">Envío programado desde Buddy ERP. Puedes cambiarlo o desactivarlo en Ventas → Descargas.</p></div>`;
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: process.env.CORREO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>', to: d.correos, subject: asunto, html,
                    attachments: [{ filename: nombre, content: Buffer.from(csv, 'utf8').toString('base64') }] }) });
            if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
            await rpc('registrar_envio_programado', { p_id: id, p_estado: 'ok', p_detalle: null, p_filas: filas.length, p_desde: d.desde, p_hasta: d.hasta, p_columnas: columnas });
            resultados.push({ id, ok: true, filas: filas.length });
        } catch (e) {
            console.error('Envío programado falló:', id, e.message);
            try { await rpc('registrar_envio_programado', { p_id: id, p_estado: 'error', p_detalle: e.message, p_filas: 0, p_desde: d?.desde || new Date().toISOString().slice(0, 10), p_hasta: d?.hasta || new Date().toISOString().slice(0, 10), p_columnas: d?.columnas || [] }); } catch { /* sin más */ }
            resultados.push({ id, ok: false });
        }
    }
    return res.status(200).json({ ok: true, procesados: resultados.length, resultados });
}
