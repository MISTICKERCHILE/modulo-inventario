// =====================================================================
// Buddy ERP · Envío del correo de invitación de equipo
// POST /api/invitacion   body: { id }   header: Authorization: Bearer <token de sesión>
//
// 1. Llama a preparar_envio_invitacion() en Supabase CON EL TOKEN DEL USUARIO:
//    la base verifica que sea Dueño/Admin de esa empresa y limita reenvíos.
// 2. Envía el correo vía Resend desde hola@buddyerp.com.
//
// Variables de entorno: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// RESEND_API_KEY y (opcional) CORREO_REMITENTE y APP_URL.
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function urlBase(req) {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.buddyerp.com';
    // Solo dominios propios: evita que alguien arme links hacia otro sitio
    const permitido = /(^|\.)buddyerp\.com$/i.test(host) || /-mscerp-projects\.vercel\.app$/i.test(host);
    return `https://${permitido ? host : 'www.buddyerp.com'}`;
}

export function plantillaInvitacion(d, enlace, base) {
    const quien = d.invitado_por || d.invitado_por_email || 'Tu equipo';
    const rol = d.rol === 'Admin' ? 'Administrador' : d.rol;
    const existe = d.usuario_existe === true;

    const titulo = `${quien} te invitó a ${d.nombre_empresa} en Buddy ERP`;
    const intro = existe
        ? `Ya tienes una cuenta en Buddy ERP. Inicia sesión con tu correo y contraseña y quedarás unido al equipo de <strong>${esc(d.nombre_empresa)}</strong>.`
        : `Crea tu cuenta en un par de minutos y quedarás unido al equipo de <strong>${esc(d.nombre_empresa)}</strong>.`;
    const boton = existe ? 'Iniciar sesión y unirme' : 'Crear mi cuenta y unirme';

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 32px 0 32px">
          <img src="${base}/img/img/light%20logo.png" alt="Buddy ERP" height="40" style="display:block;height:40px;border:0">
        </td></tr>
        <tr><td style="padding:24px 32px 8px 32px">
          <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#059669;text-transform:uppercase;letter-spacing:1px">Invitación al equipo</p>
          <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0f172a">${esc(quien)} te invitó a <span style="color:#059669">${esc(d.nombre_empresa)}</span></h1>
          <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#334155">${intro}</p>
          <p style="margin:0 0 24px 0;font-size:14px;color:#64748b">Rol asignado: <strong style="color:#334155">${esc(rol)}</strong></p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#059669">
            <a href="${enlace}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${boton}</a>
          </td></tr></table>
          <p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#94a3b8">¿El botón no funciona? Copia este enlace en tu navegador:<br><a href="${enlace}" style="color:#059669;word-break:break-all">${enlace}</a></p>
        </td></tr>
        <tr><td style="padding:24px 32px 28px 32px">
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px 0">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">Recibiste este correo porque ${esc(quien)} te invitó a usar Buddy ERP. Si no esperabas esta invitación, puedes ignorarla. Si tienes dudas, responde este correo.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8">Buddy ERP · Tu partner en la administración de tu negocio</p>
    </td></tr>
  </table>
</body></html>`;

    const texto = [
        `${quien} te invitó a ${d.nombre_empresa} en Buddy ERP como ${rol}.`,
        '',
        existe ? 'Ya tienes una cuenta: inicia sesión con tu correo y contraseña para unirte.' : 'Crea tu cuenta para unirte al equipo.',
        '',
        enlace,
        '',
        'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n');

    return { asunto: titulo, html, texto };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ ok: false, error: 'metodo_no_permitido' });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'sin_sesion', mensaje: 'Debes iniciar sesión.' });

    let cuerpo = req.body;
    if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = {}; } }
    const id = String(cuerpo?.id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'id_invalido', mensaje: 'Invitación inválida.' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!supabaseUrl || !supabaseKey || !resendKey) {
        return res.status(503).json({ ok: false, error: 'no_configurado', mensaje: 'El envío de correos no está configurado.' });
    }

    // 1. Permisos y datos (la base valida con el token del propio usuario)
    let datos;
    try {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/preparar_envio_invitacion`, {
            method: 'POST',
            headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_id: id }),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
            const status = r.status === 401 ? 401 : (json.code === '42501' ? 403 : 400);
            return res.status(status).json({ ok: false, error: 'rechazado', mensaje: json.message || 'No se pudo preparar la invitación.' });
        }
        datos = json;
    } catch (error) {
        console.error('Error consultando la invitación:', error);
        return res.status(502).json({ ok: false, error: 'base_no_disponible', mensaje: 'No se pudo conectar con la base de datos.' });
    }

    // 2. Correo
    const base = urlBase(req);
    const enlace = `${base}/app?invite=${encodeURIComponent(datos.id)}`;
    const { asunto, html, texto } = plantillaInvitacion(datos, enlace, base);

    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: process.env.CORREO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>',
                to: [datos.email_invitado],
                reply_to: datos.invitado_por_email || undefined,
                subject: asunto,
                html,
                text: texto,
            }),
        });
        if (!r.ok) {
            console.error('Resend rechazó la invitación:', r.status, await r.text());
            return res.status(502).json({ ok: false, error: 'envio_fallido', mensaje: 'No se pudo enviar el correo. Puedes copiar el enlace y enviarlo tú.' });
        }
        return res.status(200).json({ ok: true, enlace, email: datos.email_invitado });
    } catch (error) {
        console.error('Error enviando la invitación:', error);
        return res.status(502).json({ ok: false, error: 'envio_fallido', mensaje: 'No se pudo enviar el correo. Puedes copiar el enlace y enviarlo tú.' });
    }
}
