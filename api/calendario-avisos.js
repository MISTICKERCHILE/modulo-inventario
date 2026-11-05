// =====================================================================
// Buddy ERP · Avisos del calendario por correo (recordatorios y resumen de la mañana)
// Lo llama un programador cada pocos minutos con  Authorization: Bearer <secreto>.
//
// La base de datos decide qué avisos tocan y los "reserva" (para no repetirlos); aquí solo se
// arman los correos y se envían por Resend. Si un envío falla, se libera la reserva y se reintenta.
//
// Variables de entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// CALENDARIO_CRON_SECRET (o CRON_SECRET) y (opcional) CORREO_REMITENTE.
// =====================================================================

import { timingSafeEqual } from 'node:crypto';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function horaTxt(iso, zona) { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }); }
function fechaLarga(iso, zona) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z') : new Date(iso);
    return mayus(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : zona }));
}
function cuando(a) {
    return a.todo_el_dia ? fechaLarga(a.inicio, a.zona) : `${fechaLarga(a.inicio, a.zona)}, ${horaTxt(a.inicio, a.zona)}`;
}
function anticipacion(a) {
    const m = Number(a.minutos) || 0;
    if (a.tipo === 'cotizacion' || a.tipo === 'cobro') {
        const verbo = a.tipo === 'cotizacion' ? 'Vence una cotización' : 'Vence un cobro';
        return m === 0 ? `${verbo} hoy` : m === 1440 ? `${verbo} mañana` : `${verbo} en ${m / 1440} días`;
    }
    if (m === 0) return a.todo_el_dia ? 'Es hoy' : 'Empieza ahora';
    if (m < 60) return `Empieza en ${m} minutos`;
    if (m < 1440) { const h = Math.round(m / 60); return `Empieza en ${h} ${h === 1 ? 'hora' : 'horas'}`; }
    const d = Math.round(m / 1440); return d === 1 ? 'Es mañana' : `Es en ${d} días`;
}

const marco = (empresa, titulo, cuerpo, pie) => `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:520px">
<p style="font-size:12px;font-weight:bold;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">${esc(empresa)}</p>
<h2 style="margin:0 0 10px;font-size:18px">${esc(titulo)}</h2>${cuerpo}
<p style="font-size:11px;color:#94a3b8;margin-top:18px">${esc(pie)}</p></div>`;

export function armarAviso(a) {
    const ant = anticipacion(a);
    const intro = a.nombre ? `Hola ${a.nombre}, ${ant.toLowerCase()}.` : `${ant}.`;
    const filas = [`<p style="font-size:14px;color:#475569;margin:0 0 8px">${esc(intro)}</p>`,
        `<div style="border-left:3px solid #10b981;background:#f0fdf4;padding:10px 12px;border-radius:6px"><div style="font-size:15px;font-weight:bold">${esc(a.titulo)}</div>
<div style="font-size:13px;color:#475569;margin-top:2px">${esc(cuando(a))}</div>${a.lugar ? `<div style="font-size:13px;color:#475569;margin-top:2px">📍 ${esc(a.lugar)}</div>` : ''}</div>`];
    const asunto = `${a.tipo === 'cotizacion' || a.tipo === 'cobro' ? '' : 'Recordatorio: '}${a.titulo} · ${a.todo_el_dia ? fechaLarga(a.inicio, a.zona) : horaTxt(a.inicio, a.zona)}`.slice(0, 150);
    return { asunto, html: marco(a.empresa, 'Recordatorio de tu calendario', filas.join(''), 'Puedes cambiar estos avisos desde el calendario del Inicio, en ⚙ Avisos.') };
}

export function armarResumen(r) {
    const items = r.items || [];
    const seccion = (titulo, lista, fmt) => lista.length ? `<p style="font-size:12px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 4px">${titulo}</p>${lista.map(fmt).join('')}` : '';
    const linea = (txt, sub) => `<div style="padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:14px">${txt}${sub ? `<div style="font-size:12px;color:#94a3b8">${sub}</div>` : ''}</div>`;
    const feriados = items.filter(i => i.fuente === 'feriado'), cumples = items.filter(i => i.fuente === 'cumple');
    const agenda = items.filter(i => (i.fuente === 'evento' || i.fuente === 'agenda'));
    const venc = items.filter(i => i.fuente === 'vencimiento');
    const cuerpo = [
        feriados.length ? `<p style="font-size:14px;color:#7c3aed;margin:0 0 4px">🎌 Hoy es feriado: ${feriados.map(f => esc(f.titulo)).join(', ')}</p>` : '',
        seccion('Cumpleaños de hoy', cumples, i => linea(esc(i.titulo))),
        seccion('Tu agenda de hoy', agenda, i => linea(`<b>${i.todo_el_dia ? 'Todo el día' : horaTxt(i.inicio, r.zona)}</b> · ${esc(i.titulo)}`, i.lugar ? '📍 ' + esc(i.lugar) : '')),
        seccion('Vencimientos de hoy', venc, i => linea(esc(i.titulo))),
    ].join('');
    const n = agenda.length + venc.length + cumples.length;
    const asunto = `Tu día en ${r.empresa}: ${n} ${n === 1 ? 'cosa' : 'cosas'} para hoy`.slice(0, 150);
    return { asunto, html: marco(r.empresa, `${r.nombre ? r.nombre + ', t' : 'T'}u día · ${fechaLarga(r.fecha, r.zona)}`, cuerpo, 'Resumen de la mañana de Buddy ERP. Puedes dejar de recibirlo desde el calendario del Inicio, en ⚙ Avisos.') };
}

function autorizado(req) {
    const dado = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!dado) return false;
    return [process.env.CALENDARIO_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean).some(s => {
        const a = Buffer.from(s), b = Buffer.from(dado);
        return a.length === b.length && timingSafeEqual(a, b);
    });
}

export default async function handler(req, res) {
    if (!autorizado(req)) return res.status(401).json({ ok: false, error: 'no_autorizado' });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY, resendKey = process.env.RESEND_API_KEY;
    if (!url || !clave || !resendKey) return res.status(503).json({ ok: false, error: 'no_configurado' });

    const cab = { apikey: clave, 'Content-Type': 'application/json', ...(clave.startsWith('eyJ') ? { Authorization: `Bearer ${clave}` } : {}) };
    const rpc = async (nombre, args) => {
        const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: cab, body: JSON.stringify(args || {}) });
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error((json && json.message) || `rpc ${nombre}: ${r.status}`);
        return json;
    };

    let avisos = [], resumenes = [];
    try { avisos = (await rpc('calendario_avisos_pendientes')) || []; resumenes = (await rpc('calendario_resumenes_pendientes')) || []; }
    catch (e) { console.error(e); return res.status(502).json({ ok: false, error: 'base_no_disponible' }); }

    const correos = [
        ...avisos.map(a => ({ clave: a.clave, to: a.correo, ...armarAviso(a) })),
        ...resumenes.map(r => ({ clave: r.clave, to: r.correo, ...armarResumen(r) })),
    ];
    const from = process.env.CORREO_REMITENTE || 'Buddy ERP <hola@buddyerp.com>';
    let enviados = 0, fallidos = 0;
    for (let i = 0; i < correos.length; i += 50) {
        const lote = correos.slice(i, i + 50);
        try {
            const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(lote.map(c => ({ from, to: [c.to], subject: c.asunto, html: c.html }))) });
            if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
            enviados += lote.length;
        } catch (e) {
            console.error('Aviso del calendario falló:', e.message);
            fallidos += lote.length;
            try { await rpc('calendario_liberar_avisos', { p_claves: lote.map(c => c.clave) }); } catch { /* se reintenta en la próxima pasada si la ventana sigue abierta */ }
        }
    }
    return res.status(200).json({ ok: true, avisos: avisos.length, resumenes: resumenes.length, enviados, fallidos });
}
