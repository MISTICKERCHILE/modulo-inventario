// =====================================================================
// Buddy ERP · Correo con el resumen diario al cerrar el día
// POST /api/resumen-cierre   body: { id }   header: Authorization: Bearer <token de sesión>
//
// 1. preparar_resumen_cierre() (con el token del usuario) valida permisos, que no se haya enviado
//    antes y entrega los datos del cierre y los destinatarios que eligió el dueño.
// 2. Envía un correo a cada destinatario vía Resend y marca el cierre como enviado.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, RESEND_API_KEY,
// y opcionales CORREO_REMITENTE, APP_URL.
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIN_DECIMALES = ['CLP', 'COP', 'PYG', 'JPY'];
const fmt = (n, m) => `${m} ${Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: SIN_DECIMALES.includes(m) ? 0 : 2 })}`;
const fechaTxt = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };

function urlBase(req) {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.buddyerp.com';
    const permitido = /(^|\.)buddyerp\.com$/i.test(host) || /-mscerp-projects\.vercel\.app$/i.test(host);
    return `https://${permitido ? host : 'www.buddyerp.com'}`;
}

export function plantillaResumen(d, enlace) {
    const manual = d.modo !== 'POS';
    const filas = (d.desglose || []).map(x => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${esc(x.nombre)}</td>
        ${manual ? '' : `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(x.sistema, x.moneda)}</td>`}
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(x.declarado, x.moneda)}</td>
        ${manual ? '' : `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:${Number(x.diferencia) === 0 ? '#059669' : '#dc2626'}">${fmt(x.diferencia, x.moneda)}</td>`}</tr>`).join('');
    const totales = Object.entries(d.totales || {}).map(([m, t]) => `<p style="margin:2px 0;font-size:14px"><strong>${esc(m)}</strong>: declarado ${fmt(t.declarado, m)}${manual ? '' : ` · sistema ${fmt(t.sistema, m)}`}</p>`).join('');
    const otros = (d.otros_cobros || []).map(o => `<li style="margin:2px 0">${fmt(o.monto, o.moneda)} · ${esc(o.nombre)} — ${esc(o.motivo)}</li>`).join('');
    const estado = d.cuadrado ? '<span style="color:#059669;font-weight:bold">Cuadrado</span>' : '<span style="color:#dc2626;font-weight:bold">Con diferencia</span>';
    const asunto = `Resumen del ${fechaTxt(d.fecha)} · ${d.sucursal} · ${d.cuadrado ? 'cuadrado' : 'con diferencia'}`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:16px">
<tr><td style="padding:24px 28px 8px 28px">
  <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#059669;text-transform:uppercase;letter-spacing:1px">Resumen diario · ${esc(d.empresa)}</p>
  <h1 style="margin:0 0 6px 0;font-size:20px">${esc(d.sucursal)} · ${fechaTxt(d.fecha)}</h1>
  <p style="margin:0 0 16px 0;font-size:14px;color:#475569">Estado: ${estado} · Responsable: <strong>${esc(d.responsable)}</strong> · ${manual ? 'Ventas declaradas' : 'Cierre con POS'}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;font-size:14px;border-collapse:separate">
    <tr style="background:#f1f5f9;font-size:12px;text-transform:uppercase;color:#64748b"><th style="padding:8px 10px;text-align:left">Forma de pago</th>${manual ? '' : '<th style="padding:8px 10px;text-align:right">Sistema</th>'}<th style="padding:8px 10px;text-align:right">Declarado</th>${manual ? '' : '<th style="padding:8px 10px;text-align:right">Diferencia</th>'}</tr>
    ${filas}
  </table>
  <div style="margin:14px 0 0 0">${totales}</div>
  ${manual && d.total_dia_declarado != null ? `<p style="margin:6px 0 0 0;font-size:13px;color:#475569">Total del día según su sistema: ${Number(d.total_dia_declarado).toLocaleString('es-CL')}</p>` : ''}
  ${otros ? `<p style="margin:16px 0 4px 0;font-size:13px;font-weight:bold;color:#334155">Otros cobros</p><ul style="margin:0;padding-left:18px;font-size:13px;color:#475569">${otros}</ul>` : ''}
  ${d.comentario ? `<p style="margin:16px 0 4px 0;font-size:13px;font-weight:bold;color:#334155">Comentario del responsable</p><p style="margin:0;font-size:14px;color:#475569;white-space:pre-wrap">${esc(d.comentario)}</p>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td style="border-radius:10px;background:#059669"><a href="${enlace}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#fff;text-decoration:none">Ver ventas en el Laboratorio</a></td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 24px 28px"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 12px 0"><p style="margin:0;font-size:11px;color:#94a3b8">Recibes este correo porque estás en la lista de resumen diario de ${esc(d.empresa)} en Buddy ERP.</p></td></tr>
</table></td></tr></table></body></html>`;
    const texto = [`Resumen diario · ${d.empresa}`, `${d.sucursal} · ${fechaTxt(d.fecha)} · ${d.cuadrado ? 'Cuadrado' : 'Con diferencia'}`, `Responsable: ${d.responsable}`,
        ...(d.desglose || []).map(x => `- ${x.nombre}: declarado ${fmt(x.declarado, x.moneda)}${manual ? '' : ` (sistema ${fmt(x.sistema, x.moneda)}, diferencia ${fmt(x.diferencia, x.moneda)})`}`),
        ...(d.comentario ? ['', `Comentario: ${d.comentario}`] : []), '', enlace].join('\n');
    return { asunto, html, texto };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'metodo_no_permitido' }); }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'sin_sesion', mensaje: 'Debes iniciar sesión.' });
    let cuerpo = req.body;
    if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = {}; } }
    const id = String(cuerpo?.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'id_invalido', mensaje: 'Cierre inválido.' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, resendKey = process.env.RESEND_API_KEY;
    if (!supabaseUrl || !supabaseKey || !resendKey) return res.status(503).json({ ok: false, error: 'no_configurado', mensaje: 'El envío de correos no está configurado.' });

    const rpc = async (nombre, args) => {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
    };

    let datos;
    try {
        const r = await rpc('preparar_resumen_cierre', { p_id_cierre: id });
        if (!r.ok) return res.status(r.status === 401 ? 401 : (r.json.code === '42501' ? 403 : 400)).json({ ok: false, error: 'rechazado', mensaje: r.json.message || 'No se pudo preparar el resumen.' });
        datos = r.json;
    } catch (e) { console.error(e); return res.status(502).json({ ok: false, error: 'base_no_disponible', mensaje: 'No se pudo conectar con la base de datos.' }); }

    const destinatarios = Array.isArray(datos.destinatarios) ? datos.destinatarios : [];
    if (!destinatarios.length) return res.status(200).json({ ok: true, enviados: 0, mensaje: 'No hay destinatarios configurados.' });

    const enlace = `${urlBase(req)}/app?v=ranking`;
    const { asunto, html, texto } = plantillaResumen(datos, enlace);
    let enviados = 0;
    for (const correo of destinatarios) {
        try {
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: process.env.CORREO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>', to: [correo], subject: asunto, html, text: texto }) });
            if (r.ok) enviados++; else console.error('Resend rechazó el resumen:', r.status, await r.text());
        } catch (e) { console.error('Error enviando resumen:', e); }
    }
    await rpc('marcar_resumen_enviado', { p_id_cierre: id, p_estado: enviados ? 'enviado' : 'error' }).catch(() => {});
    return res.status(200).json({ ok: enviados > 0, enviados, total: destinatarios.length });
}
