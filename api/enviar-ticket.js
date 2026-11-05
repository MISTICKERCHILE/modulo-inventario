// =====================================================================
// Buddy ERP · Ticket de venta por correo (comprobante simple, NO tributario)
// POST /api/enviar-ticket   body: { id_venta, correo }   header: Authorization: Bearer <token de sesión>
//
// 1. preparar_ticket() (con el token del usuario) valida permisos, el correo y los límites,
//    y entrega los datos de la venta.
// 2. Envía el correo vía Resend y marca el envío como enviado / error.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, RESEND_API_KEY, opcional CORREO_REMITENTE.
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIN_DECIMALES = ['CLP', 'COP', 'PYG', 'JPY'];
const num = (n, m) => Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: SIN_DECIMALES.includes(m) ? 0 : 2, maximumFractionDigits: SIN_DECIMALES.includes(m) ? 0 : 2 });
const fmt = (n, m) => `${m} ${num(n, m)}`;
const cant = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 3 });

export function plantillaTicket(d) {
    const m = d.moneda || 'CLP', emp = d.empresa || {};
    const nombre = emp.razon_social || emp.nombre || '';
    const cabecera = [emp.rut ? `RUT: ${emp.rut}` : '', emp.giro || '', emp.direccion || '', emp.telefono ? `Tel: ${emp.telefono}` : ''].filter(Boolean);
    const linea = 'border-top:1px dashed #000;margin:10px 0';
    const filas = (d.lineas || []).map(l => `<tr><td colspan="2" style="padding-top:6px">${esc(l.nombre)}</td></tr>
        <tr><td style="color:#444">${cant(l.cantidad)} x ${num(l.precio, m)}</td><td style="text-align:right">${num(l.subtotal, m)}</td></tr>`).join('');
    const asunto = `Ticket de venta N° ${d.ticket} · ${nombre}`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:16px 8px;background:#f1f1f1;font-family:'Courier New',Courier,monospace;color:#000;font-size:13px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:340px;background:#fff;border:1px solid #ddd"><tr><td style="padding:18px 16px">
  <p style="margin:0;text-align:center;font-weight:bold;font-size:15px">${esc(nombre)}</p>
  ${cabecera.map(c => `<p style="margin:2px 0 0 0;text-align:center">${esc(c)}</p>`).join('')}
  <div style="${linea}"></div>
  <p style="margin:0;text-align:center;font-weight:bold">TICKET DE VENTA N° ${esc(d.ticket)}</p>
  <p style="margin:4px 0 0 0;text-align:center">${esc(d.fecha)}</p>
  ${d.sucursal ? `<p style="margin:2px 0 0 0;text-align:center">${esc(d.sucursal)}</p>` : ''}
  ${d.cliente ? `<p style="margin:2px 0 0 0;text-align:center">Cliente: ${esc(d.cliente)}</p>` : ''}
  <div style="${linea}"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">${filas}</table>
  <div style="${linea}"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;font-weight:bold"><tr><td>TOTAL</td><td style="text-align:right">${esc(fmt(d.total, m))}</td></tr></table>
  <p style="margin:6px 0 0 0">${d.por_cobrar ? 'Venta a crédito (por cobrar)' : `Pago: ${esc(d.metodo || '')}`}</p>
  ${d.cajero ? `<p style="margin:2px 0 0 0">Atendió: ${esc(d.cajero)}</p>` : ''}
  <div style="${linea}"></div>
  <p style="margin:0;text-align:center;font-size:11px;color:#444">Documento no tributario.<br>No reemplaza a una boleta o factura.</p>
  <p style="margin:10px 0 0 0;text-align:center;font-size:11px">¡Gracias por tu compra!</p>
</td></tr></table></td></tr></table></body></html>`;
    const texto = [nombre, ...cabecera, '', `TICKET DE VENTA N° ${d.ticket}`, d.fecha, d.sucursal || '', '',
        ...(d.lineas || []).map(l => `${l.nombre}\n  ${cant(l.cantidad)} x ${num(l.precio, m)} = ${num(l.subtotal, m)}`),
        '', `TOTAL: ${fmt(d.total, m)}`, d.por_cobrar ? 'Venta a crédito (por cobrar)' : `Pago: ${d.metodo || ''}`, '',
        'Documento no tributario. No reemplaza a una boleta o factura.'].filter(x => x !== undefined).join('\n');
    return { asunto, html, texto };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'metodo_no_permitido' }); }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'sin_sesion', mensaje: 'Debes iniciar sesión.' });
    let cuerpo = req.body;
    if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = {}; } }
    const id = String(cuerpo?.id_venta || ''), correo = String(cuerpo?.correo || '').slice(0, 254);
    if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'id_invalido', mensaje: 'Venta inválida.' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, resendKey = process.env.RESEND_API_KEY;
    if (!supabaseUrl || !supabaseKey || !resendKey) return res.status(503).json({ ok: false, error: 'no_configurado', mensaje: 'El envío de correos no está configurado.' });

    const rpc = async (nombre, args) => {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
    };

    let datos;
    try {
        const r = await rpc('preparar_ticket', { p_id_venta: id, p_correo: correo });
        if (!r.ok) return res.status(r.status === 401 ? 401 : (r.json.code === '42501' ? 403 : 400)).json({ ok: false, error: 'rechazado', mensaje: r.json.message || 'No se pudo preparar el ticket.' });
        datos = r.json;
    } catch (e) { console.error(e); return res.status(502).json({ ok: false, error: 'base_no_disponible', mensaje: 'No se pudo conectar con la base de datos.' }); }

    const { asunto, html, texto } = plantillaTicket(datos);
    let enviado = false;
    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.CORREO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>', to: [datos.correo], subject: asunto, html, text: texto }) });
        enviado = r.ok;
        if (!r.ok) console.error('Resend rechazó el ticket:', r.status, await r.text());
    } catch (e) { console.error('Error enviando ticket:', e); }
    await rpc('marcar_ticket_enviado', { p_id_envio: datos.id_envio, p_estado: enviado ? 'enviado' : 'error' }).catch(() => {});
    if (!enviado) return res.status(502).json({ ok: false, error: 'envio_fallido', mensaje: 'No se pudo enviar el correo. Inténtalo de nuevo.' });
    return res.status(200).json({ ok: true });
}
