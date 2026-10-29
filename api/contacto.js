// =====================================================================
// Buddy ERP · Formulario de contacto
// POST /api/contacto  →  envía el mensaje a CONTACTO_DESTINO vía Resend.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY     (obligatoria)  clave de API de Resend
//   CONTACTO_DESTINO   (opcional)     por defecto hola@buddyerp.com
//   CONTACTO_REMITENTE (opcional)     por defecto "Buddy ERP <hola@buddyerp.com>"
//                                     (el dominio debe estar verificado en Resend)
//
// Si RESEND_API_KEY no está configurada responde 503 y la página ofrece
// enviar el mensaje desde el correo del visitante (mailto).
// =====================================================================

const ASUNTOS = ['General', 'Agendar Demo', 'Planes y precios', 'Soporte', 'Sugerencia', 'Otros'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpiar(valor, max) {
    return String(valor ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function escaparHTML(texto) {
    return texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ ok: false, error: 'metodo_no_permitido' });
    }

    let cuerpo = req.body;
    if (typeof cuerpo === 'string') {
        try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = {}; }
    }
    cuerpo = cuerpo || {};

    // Anti-spam: campo trampa invisible y tiempo mínimo de llenado
    if (limpiar(cuerpo.sitio_web, 200) !== '') return res.status(200).json({ ok: true });
    const msLlenado = Number(cuerpo.ms_llenado) || 0;
    if (msLlenado > 0 && msLlenado < 3000) return res.status(200).json({ ok: true });

    const datos = {
        nombre: limpiar(cuerpo.nombre, 120),
        empresa: limpiar(cuerpo.empresa, 160),
        email: limpiar(cuerpo.email, 254).toLowerCase(),
        asunto: limpiar(cuerpo.asunto, 40),
        mensaje: limpiar(cuerpo.mensaje, 5000),
    };

    const errores = [];
    if (datos.nombre.length < 2) errores.push('nombre');
    if (!EMAIL_RE.test(datos.email)) errores.push('email');
    if (!ASUNTOS.includes(datos.asunto)) errores.push('asunto');
    if (datos.mensaje.length < 10) errores.push('mensaje');
    if (errores.length) return res.status(400).json({ ok: false, error: 'datos_invalidos', campos: errores });

    const clave = process.env.RESEND_API_KEY;
    if (!clave) return res.status(503).json({ ok: false, error: 'no_configurado' });

    const destino = process.env.CONTACTO_DESTINO || 'hola@buddyerp.com';
    const remitente = process.env.CONTACTO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>';
    const titulo = `[Web] ${datos.asunto} · ${datos.nombre}${datos.empresa ? ' (' + datos.empresa + ')' : ''}`;

    const texto = [
        `Nombre: ${datos.nombre}`,
        `Empresa: ${datos.empresa || '—'}`,
        `Correo: ${datos.email}`,
        `Asunto: ${datos.asunto}`,
        '',
        datos.mensaje,
    ].join('\n');

    const html = `
        <h2 style="font-family:sans-serif;color:#0f172a">Nuevo mensaje desde buddyerp.com</h2>
        <table style="font-family:sans-serif;font-size:14px;color:#334155">
            <tr><td><b>Nombre</b></td><td>${escaparHTML(datos.nombre)}</td></tr>
            <tr><td><b>Empresa</b></td><td>${escaparHTML(datos.empresa || '—')}</td></tr>
            <tr><td><b>Correo</b></td><td>${escaparHTML(datos.email)}</td></tr>
            <tr><td><b>Asunto</b></td><td>${escaparHTML(datos.asunto)}</td></tr>
        </table>
        <p style="font-family:sans-serif;font-size:14px;color:#0f172a;white-space:pre-wrap">${escaparHTML(datos.mensaje)}</p>`;

    try {
        const respuesta = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${clave}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: remitente,
                to: [destino],
                reply_to: datos.email,
                subject: titulo,
                text: texto,
                html,
            }),
        });

        if (!respuesta.ok) {
            console.error('Resend rechazó el envío:', respuesta.status, await respuesta.text());
            return res.status(502).json({ ok: false, error: 'envio_fallido' });
        }
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Error enviando correo de contacto:', error);
        return res.status(502).json({ ok: false, error: 'envio_fallido' });
    }
}
