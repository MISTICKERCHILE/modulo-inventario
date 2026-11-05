// ============================================================
// Calendario del Inicio: Día / Semana / Mes / Año, eventos por colores,
// y exportación a Google, Outlook y .ics (Apple y cualquier otra app).
// ============================================================
(function () {
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const DIAS = ['lun','mar','mié','jue','vie','sáb','dom'];
    const DIAS_LARGOS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
    const FUENTES = {
        evento:      { nombre: 'Mis eventos',        color: '#10b981' },
        agenda:      { nombre: 'Agenda de trabajo',  color: '#3b82f6' },
        cotizacion:  { nombre: 'Cotizaciones por vencer', color: '#f59e0b' },
        cobro:       { nombre: 'Cobros por vencer',  color: '#e11d48' },
        feriado:     { nombre: 'Feriados',           color: '#7c3aed' }
    };
    const PALETA = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#64748b'];

    const S = window.__cal = { vista: 'mes', ref: new Date(), eventos: [], ocultos: new Set(), cargando: false, modal: null };
    S.ref.setHours(0, 0, 0, 0);
    try { const o = JSON.parse(localStorage.getItem('cal_ocultos') || '[]'); if (Array.isArray(o)) o.forEach(x => S.ocultos.add(x)); } catch (e) {}
    try { const v = localStorage.getItem('cal_vista'); if (['dia','semana','mes','anio'].includes(v)) S.vista = v; } catch (e) {}

    const pad = n => String(n).padStart(2, '0');
    const clave = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const deClave = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
    const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const lunesDe = d => sumarDias(d, -((d.getDay() + 6) % 7));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hex = c => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#64748b');
    const hora = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // ---------- Normalización ----------
    function normalizar(e) {
        const todo = !!e.todo_el_dia;
        let ini, fin;
        if (todo) { ini = deClave(e.inicio); fin = deClave(e.fin || e.inicio); }
        else { ini = new Date(e.inicio); fin = e.fin ? new Date(e.fin) : new Date(ini.getTime() + 3600000); }
        if (isNaN(ini) || isNaN(fin)) return null;
        const key = e.fuente === 'vencimiento' ? e.subtipo : e.fuente;
        const color = e.fuente === 'evento' ? hex(e.color) : (FUENTES[key] ? FUENTES[key].color : '#64748b');
        const diaIni = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
        let diaFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
        if (!todo && fin > ini && fin.getHours() === 0 && fin.getMinutes() === 0 && diaFin > diaIni) diaFin = sumarDias(diaFin, -1);
        if (diaFin < diaIni) diaFin = diaIni;
        return { ...e, key, color, todo, ini, fin, diaIni, diaFin };
    }
    function eventosDelDia(k) {
        const d = deClave(k);
        return S.eventos.filter(e => !S.ocultos.has(e.key) && e.diaIni <= d && e.diaFin >= d)
            .sort((a, b) => (b.todo - a.todo) || (a.ini - b.ini) || a.titulo.localeCompare(b.titulo));
    }

    // ---------- Rango y carga ----------
    function rango() {
        const r = S.ref;
        if (S.vista === 'dia') return [r, r];
        if (S.vista === 'semana') { const l = lunesDe(r); return [l, sumarDias(l, 6)]; }
        if (S.vista === 'anio') return [new Date(r.getFullYear(), 0, 1), new Date(r.getFullYear(), 11, 31)];
        const l = lunesDe(new Date(r.getFullYear(), r.getMonth(), 1));
        return [l, sumarDias(l, 41)];
    }
    async function cargar() {
        if (!window.clienteSupabase || !window.miEmpresaId) return;
        const [d, h] = rango();
        S.cargando = true; pintar();
        try {
            const { data, error } = await clienteSupabase.rpc('calendario_rango', { p_id_empresa: window.miEmpresaId, p_desde: clave(d), p_hasta: clave(h) });
            if (error) throw error;
            S.eventos = (data || []).map(normalizar).filter(Boolean);
            S.error = null;
        } catch (err) { S.eventos = []; S.error = 'No se pudo cargar el calendario.'; }
        S.cargando = false; pintar();
    }

    // ---------- Pintado ----------
    function titulo() {
        const r = S.ref;
        if (S.vista === 'dia') return `${DIAS_LARGOS[(r.getDay() + 6) % 7]} ${r.getDate()} de ${MESES[r.getMonth()]} ${r.getFullYear()}`;
        if (S.vista === 'semana') { const l = lunesDe(r), f = sumarDias(l, 6); return `${l.getDate()} ${MESES[l.getMonth()].slice(0, 3)} – ${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)} ${f.getFullYear()}`; }
        if (S.vista === 'anio') return String(r.getFullYear());
        return `${MESES[r.getMonth()]} ${r.getFullYear()}`;
    }
    function chip(e, compacto) {
        const hh = e.todo ? '' : hora(e.ini) + ' ';
        const lock = e.ambito === 'personal' ? '🔒 ' : '';
        if (compacto) return `<span title="${esc(e.titulo)}" data-ev="${esc(e.key + '|' + e.id)}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin:1px;cursor:pointer"></span>`;
        return `<div data-ev="${esc(e.key + '|' + e.id)}" title="${esc(e.titulo)}" style="background:${e.color}1f;border-left:3px solid ${e.color};color:#1e293b;font-size:11px;line-height:1.2;padding:2px 4px;margin-bottom:2px;border-radius:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer">${lock}${esc(hh)}${esc(e.titulo)}</div>`;
    }
    function celdaDia(k, opts) {
        const d = deClave(k), hoy = k === clave(new Date()), evs = eventosDelDia(k);
        const feriado = evs.some(e => e.key === 'feriado');
        const fuera = opts.mes != null && d.getMonth() !== opts.mes;
        const movil = window.innerWidth < 640;
        const max = opts.max || 3;
        let html = `<div style="min-height:${opts.alto}px;padding:4px;border:1px solid #e2e8f0;background:${fuera ? '#f8fafc' : '#fff'};min-width:0;overflow:hidden">`;
        html += `<div data-dia="${k}" style="cursor:pointer;font-size:12px;font-weight:700;margin-bottom:2px;${hoy ? 'background:#10b981;color:#fff;border-radius:999px;display:inline-block;min-width:22px;text-align:center;padding:1px 4px' : 'color:' + (feriado ? '#7c3aed' : fuera ? '#94a3b8' : '#334155')}">${d.getDate()}</div>`;
        if (movil) html += `<div>${evs.slice(0, 8).map(e => chip(e, true)).join('')}</div>`;
        else {
            html += evs.slice(0, max).map(e => chip(e, false)).join('');
            if (evs.length > max) html += `<div data-dia="${k}" style="font-size:10px;color:#64748b;cursor:pointer;font-weight:700">+${evs.length - max} más</div>`;
        }
        return html + '</div>';
    }
    function vistaMes() {
        const [ini] = rango(), mes = S.ref.getMonth();
        let h = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr))">`;
        h += DIAS.map(n => `<div style="text-align:center;font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;padding:4px 0">${n}</div>`).join('');
        for (let i = 0; i < 42; i++) h += celdaDia(clave(sumarDias(ini, i)), { mes, alto: window.innerWidth < 640 ? 54 : 92 });
        return h + '</div>';
    }
    function vistaSemana() {
        const [ini] = rango();
        let h = `<div style="display:grid;grid-template-columns:repeat(${window.innerWidth < 640 ? 1 : 7},minmax(0,1fr))">`;
        for (let i = 0; i < 7; i++) {
            const k = clave(sumarDias(ini, i)), d = deClave(k);
            h += `<div>${window.innerWidth < 640 ? `<div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;padding:6px 4px 0">${DIAS_LARGOS[i]}</div>` : `<div style="text-align:center;font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;padding:4px 0">${DIAS[i]}</div>`}${celdaDia(k, { alto: 150, max: 20 })}</div>`;
        }
        return h + '</div>';
    }
    function vistaDia() {
        const k = clave(S.ref), evs = eventosDelDia(k);
        if (!evs.length) return `<div style="text-align:center;color:#94a3b8;font-size:13px;padding:40px 0">Sin eventos este día.</div>`;
        return `<div style="display:flex;flex-direction:column;gap:6px;padding:4px">` + evs.map(e => `
            <div data-ev="${esc(e.key + '|' + e.id)}" style="display:flex;gap:10px;align-items:flex-start;background:${e.color}1a;border-left:4px solid ${e.color};border-radius:8px;padding:8px 10px;cursor:pointer">
                <div style="min-width:78px;font-size:12px;font-weight:800;color:#475569">${e.todo ? 'Todo el día' : hora(e.ini) + ' – ' + hora(e.fin)}</div>
                <div style="min-width:0"><div style="font-size:13px;font-weight:700;color:#1e293b">${e.ambito === 'personal' ? '🔒 ' : ''}${esc(e.titulo)}</div>
                ${e.lugar ? `<div style="font-size:11px;color:#64748b">📍 ${esc(e.lugar)}</div>` : ''}${e.fuente !== 'evento' ? `<div style="font-size:11px;color:#64748b">${esc((FUENTES[e.key] || {}).nombre || '')}${e.detalle ? ' · ' + esc(e.detalle) : ''}</div>` : ''}</div>
            </div>`).join('') + '</div>';
    }
    function vistaAnio() {
        const y = S.ref.getFullYear(), hoyK = clave(new Date());
        let h = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">`;
        for (let m = 0; m < 12; m++) {
            const primero = new Date(y, m, 1), l = lunesDe(primero);
            h += `<div><div data-mes="${m}" style="cursor:pointer;font-size:12px;font-weight:800;text-transform:capitalize;color:#334155;margin-bottom:2px">${MESES[m]}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px">`;
            for (let i = 0; i < 42; i++) {
                const d = sumarDias(l, i), k = clave(d);
                if (d.getMonth() !== m) { h += '<div></div>'; continue; }
                const evs = eventosDelDia(k), hay = evs.length, fer = evs.some(e => e.key === 'feriado');
                const col = hay ? evs[0].color : '';
                h += `<div data-dia="${k}" title="${hay ? esc(evs.map(e => e.titulo).join(' · ')) : ''}" style="cursor:pointer;text-align:center;font-size:9px;line-height:16px;border-radius:4px;${k === hoyK ? 'outline:2px solid #10b981;' : ''}${hay ? `background:${col};color:#fff;font-weight:700` : 'color:#64748b'}${fer && !hay ? ';color:#7c3aed' : ''}">${d.getDate()}</div>`;
            }
            h += '</div></div>';
        }
        return h + '</div>';
    }

    function pintar() {
        const cont = document.getElementById('cal-home');
        if (!cont) return;
        const tabs = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']].map(([v, t]) =>
            `<button data-vista="${v}" style="padding:4px 12px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;${S.vista === v ? 'background:#fff;color:#1e293b;box-shadow:0 1px 2px rgba(0,0,0,.15)' : 'color:#64748b'}">${t}</button>`).join('');
        const leyenda = Object.entries(FUENTES).map(([k, f]) =>
            `<button data-fuente="${k}" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;margin:2px 8px 2px 0;color:${S.ocultos.has(k) ? '#cbd5e1' : '#475569'};${S.ocultos.has(k) ? 'text-decoration:line-through' : ''}"><span style="width:10px;height:10px;border-radius:3px;background:${S.ocultos.has(k) ? '#e2e8f0' : f.color}"></span>${f.nombre}</button>`).join('');
        const cuerpo = S.vista === 'dia' ? vistaDia() : S.vista === 'semana' ? vistaSemana() : S.vista === 'anio' ? vistaAnio() : vistaMes();
        cont.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:4px">
                <button data-nav="-1" aria-label="Anterior" style="width:28px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-weight:800">‹</button>
                <button data-nav="0" style="height:28px;padding:0 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:800">Hoy</button>
                <button data-nav="1" aria-label="Siguiente" style="width:28px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-weight:800">›</button>
                <span style="margin-left:6px;font-size:14px;font-weight:900;color:#1e293b">${esc(titulo().charAt(0).toUpperCase() + titulo().slice(1))}</span>
                ${S.cargando ? '<span style="font-size:11px;color:#94a3b8">cargando…</span>' : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <div style="display:flex;background:#f1f5f9;padding:3px;border-radius:8px">${tabs}</div>
                <button data-accion="nuevo" style="height:28px;padding:0 12px;border-radius:999px;background:#d1fae5;color:#047857;font-size:11px;font-weight:800">+ Evento</button>
                <button data-accion="exportar" title="Descargar los eventos que ves en pantalla (.ics)" style="height:28px;padding:0 12px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:800">⬇ .ics</button>
            </div>
        </div>
        <div>${leyenda}</div>
        ${S.error ? `<div style="color:#b91c1c;font-size:12px;padding:6px 0">${esc(S.error)}</div>` : ''}
        <div style="margin-top:6px">${cuerpo}</div>`;
    }

    // ---------- Navegación ----------
    function mover(n) {
        const r = new Date(S.ref);
        if (n === 0) { S.ref = new Date(); S.ref.setHours(0, 0, 0, 0); }
        else if (S.vista === 'dia') S.ref = sumarDias(r, n);
        else if (S.vista === 'semana') S.ref = sumarDias(r, 7 * n);
        else if (S.vista === 'anio') S.ref = new Date(r.getFullYear() + n, 0, 1);
        else S.ref = new Date(r.getFullYear(), r.getMonth() + n, 1);
        cargar();
    }
    function irAVista(v, fecha) {
        S.vista = v; if (fecha) S.ref = fecha;
        try { localStorage.setItem('cal_vista', v); } catch (e) {}
        cargar();
    }

    // ---------- Exportación ----------
    const icsFecha = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const icsDia = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const icsTxt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function plegar(l) { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
    function vevento(e) {
        const L = ['BEGIN:VEVENT', `UID:${e.key}-${e.id}@buddyerp.com`, `DTSTAMP:${icsFecha(new Date())}`];
        if (e.todo) { L.push(`DTSTART;VALUE=DATE:${icsDia(e.diaIni)}`, `DTEND;VALUE=DATE:${icsDia(sumarDias(e.diaFin, 1))}`); }
        else { L.push(`DTSTART:${icsFecha(e.ini)}`, `DTEND:${icsFecha(e.fin)}`); }
        L.push(`SUMMARY:${icsTxt(e.titulo)}`);
        const det = [e.detalle, e.fuente !== 'evento' ? (FUENTES[e.key] || {}).nombre : ''].filter(Boolean).join(' · ');
        if (det) L.push(`DESCRIPTION:${icsTxt(det)}`);
        if (e.lugar) L.push(`LOCATION:${icsTxt(e.lugar)}`);
        L.push('END:VEVENT');
        return L.map(plegar).join('\r\n');
    }
    function descargarIcs(evs, nombre) {
        const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Buddy ERP//Calendario//ES', 'CALSCALE:GREGORIAN', ...evs.map(vevento), 'END:VCALENDAR'].join('\r\n') + '\r\n';
        const url = URL.createObjectURL(new Blob([txt], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function enlaceGoogle(e) {
        const f = e.todo ? `${icsDia(e.diaIni)}/${icsDia(sumarDias(e.diaFin, 1))}` : `${icsFecha(e.ini)}/${icsFecha(e.fin)}`;
        const p = new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: f, details: e.detalle || '', location: e.lugar || '' });
        return 'https://calendar.google.com/calendar/render?' + p.toString();
    }
    function enlaceOutlook(e) {
        const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.titulo, body: e.detalle || '', location: e.lugar || '' });
        if (e.todo) { p.set('startdt', clave(e.diaIni)); p.set('enddt', clave(sumarDias(e.diaFin, 1))); p.set('allday', 'true'); }
        else { p.set('startdt', e.ini.toISOString()); p.set('enddt', e.fin.toISOString()); }
        return 'https://outlook.live.com/calendar/0/deeplink/compose?' + p.toString();
    }

    // ---------- Modales ----------
    function cerrarModal() { const m = document.getElementById('cal-modal'); if (m) m.remove(); S.modal = null; document.removeEventListener('keydown', escModal); }
    function escModal(ev) { if (ev.key === 'Escape') cerrarModal(); }
    function abrirModal(html) {
        cerrarModal();
        const m = document.createElement('div');
        m.id = 'cal-modal';
        m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:210;display:flex;align-items:center;justify-content:center;padding:16px';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;width:100%;max-width:420px;max-height:92vh;overflow:auto;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3)">${html}</div>`;
        m.addEventListener('mousedown', ev => { if (ev.target === m) cerrarModal(); });
        document.body.appendChild(m);
        document.addEventListener('keydown', escModal);
        return m;
    }
    const btnEst = 'display:block;width:100%;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:800;margin-top:6px;';

    function verEvento(clv) {
        const [key, ...r] = clv.split('|'); const id = r.join('|');
        const e = S.eventos.find(x => x.key === key && String(x.id) === id);
        if (!e) return;
        S.modal = e;
        const cuando = e.todo
            ? (e.diaIni.getTime() === e.diaFin.getTime() ? e.diaIni.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : `${e.diaIni.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${e.diaFin.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`)
            : `${e.ini.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}, ${hora(e.ini)} – ${hora(e.fin)}`;
        const m = abrirModal(`
            <div style="border-left:5px solid ${e.color};padding-left:10px">
                <div style="font-size:16px;font-weight:900;color:#1e293b">${esc(e.titulo)}</div>
                <div style="font-size:12px;color:#64748b;text-transform:capitalize;margin-top:2px">${esc(cuando)}</div>
            </div>
            ${e.lugar ? `<div style="font-size:12px;color:#475569;margin-top:10px">📍 ${esc(e.lugar)}</div>` : ''}
            ${e.detalle ? `<div style="font-size:12px;color:#475569;margin-top:8px;white-space:pre-wrap">${esc(e.detalle)}</div>` : ''}
            <div style="font-size:11px;color:#94a3b8;margin-top:8px">${esc((FUENTES[e.key] || {}).nombre || '')}${e.fuente === 'evento' ? (e.ambito === 'personal' ? ' · 🔒 solo tú lo ves' : ' · visible para la empresa') : ''}</div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-top:14px">Llevar a mi calendario</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
                <a href="${esc(enlaceGoogle(e))}" target="_blank" rel="noopener" style="${btnEst}background:#eff6ff;color:#1d4ed8">Google</a>
                <a href="${esc(enlaceOutlook(e))}" target="_blank" rel="noopener" style="${btnEst}background:#e0f2fe;color:#0369a1">Outlook</a>
                <button data-x="ics" style="${btnEst}background:#f1f5f9;color:#334155">.ics (Apple)</button>
            </div>
            ${e.vista ? `<button data-x="abrir" style="${btnEst}background:#ecfdf5;color:#047857">Abrir en Buddy</button>` : ''}
            ${e.editable ? `<div style="display:flex;gap:6px"><button data-x="editar" style="${btnEst}background:#f1f5f9;color:#334155">Editar</button><button data-x="borrar" style="${btnEst}background:#fee2e2;color:#b91c1c">Eliminar</button></div>` : ''}
            <button data-x="cerrar" style="${btnEst}color:#64748b">Cerrar</button>`);
        m.addEventListener('click', async ev => {
            const b = ev.target.closest('[data-x]'); if (!b) return;
            const x = b.dataset.x;
            if (x === 'cerrar') cerrarModal();
            else if (x === 'ics') descargarIcs([e], 'evento-buddy.ics');
            else if (x === 'abrir') { cerrarModal(); if (typeof window.cambiarVista === 'function') window.cambiarVista(e.vista); }
            else if (x === 'editar') formulario(e);
            else if (x === 'borrar') {
                if (!confirm('¿Eliminar este evento?')) return;
                const { error } = await clienteSupabase.rpc('eliminar_evento_cal', { p_id: e.id });
                if (error) return alert('No se pudo eliminar: ' + error.message);
                cerrarModal(); cargar();
            }
        });
    }

    function aLocalInput(d, soloDia) { return soloDia ? clave(d) : `${clave(d)}T${hora(d)}`; }
    function formulario(e, diaSugerido) {
        const base = diaSugerido ? deClave(diaSugerido) : new Date(S.ref);
        const ahora = new Date(); base.setHours(Math.min(ahora.getHours() + 1, 22), 0, 0, 0);
        const ini = e ? (e.todo ? e.diaIni : e.ini) : base;
        const fin = e ? (e.todo ? e.diaFin : e.fin) : new Date(base.getTime() + 3600000);
        const todo = e ? e.todo : false, color = e ? hex(e.color) : PALETA[0], amb = e ? e.ambito : 'personal';
        const inp = 'width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:3px;background:#f8fafc';
        const lab = 'font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;display:block;margin-top:10px';
        const m = abrirModal(`
            <div style="font-size:16px;font-weight:900;color:#1e293b">${e ? 'Editar evento' : 'Nuevo evento'}</div>
            <label style="${lab}">Título</label><input id="cal-f-tit" maxlength="120" value="${esc(e ? e.titulo : '')}" style="${inp}" placeholder="Ej: Reunión con proveedor">
            <label style="${lab};display:flex;align-items:center;gap:6px"><input type="checkbox" id="cal-f-todo" ${todo ? 'checked' : ''}> Todo el día</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div><label style="${lab}">Inicio</label><input id="cal-f-ini" type="${todo ? 'date' : 'datetime-local'}" value="${aLocalInput(ini, todo)}" style="${inp}"></div>
                <div><label style="${lab}">Término</label><input id="cal-f-fin" type="${todo ? 'date' : 'datetime-local'}" value="${aLocalInput(fin, todo)}" style="${inp}"></div>
            </div>
            <label style="${lab}">Color</label>
            <div id="cal-f-colores" style="display:flex;gap:8px;margin-top:4px">${PALETA.map(c => `<button type="button" data-color="${c}" aria-label="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};outline:${c === color ? '3px solid #1e293b' : 'none'};outline-offset:2px"></button>`).join('')}</div>
            <label style="${lab}">¿Quién lo ve?</label>
            <select id="cal-f-amb" style="${inp}"><option value="personal" ${amb === 'personal' ? 'selected' : ''}>🔒 Personal (solo yo)</option><option value="empresa" ${amb === 'empresa' ? 'selected' : ''}>🏢 De la empresa (todo el equipo)</option></select>
            <label style="${lab}">Lugar (opcional)</label><input id="cal-f-lug" maxlength="200" value="${esc(e ? e.lugar : '')}" style="${inp}">
            <label style="${lab}">Notas (opcional)</label><textarea id="cal-f-det" rows="3" maxlength="2000" style="${inp}">${esc(e ? e.detalle : '')}</textarea>
            <div id="cal-f-err" style="color:#b91c1c;font-size:12px;margin-top:6px"></div>
            <button data-x="guardar" style="${btnEst}background:#10b981;color:#fff">Guardar</button>
            <button data-x="cerrar" style="${btnEst}color:#64748b">Cancelar</button>`);
        let colorSel = color;
        m.querySelector('#cal-f-todo').addEventListener('change', ev => {
            const t = ev.target.checked, i = m.querySelector('#cal-f-ini'), f = m.querySelector('#cal-f-fin');
            const vi = i.value, vf = f.value;
            i.type = f.type = t ? 'date' : 'datetime-local';
            i.value = t ? vi.slice(0, 10) : (vi.length === 10 ? vi + 'T09:00' : vi);
            f.value = t ? vf.slice(0, 10) : (vf.length === 10 ? vf + 'T10:00' : vf);
        });
        m.addEventListener('click', async ev => {
            const c = ev.target.closest('[data-color]');
            if (c) { colorSel = c.dataset.color; m.querySelectorAll('[data-color]').forEach(b => b.style.outline = b === c ? '3px solid #1e293b' : 'none'); return; }
            const b = ev.target.closest('[data-x]'); if (!b) return;
            if (b.dataset.x === 'cerrar') return cerrarModal();
            const err = m.querySelector('#cal-f-err'); err.textContent = '';
            const t = m.querySelector('#cal-f-todo').checked, vi = m.querySelector('#cal-f-ini').value, vf = m.querySelector('#cal-f-fin').value;
            const datos = { titulo: m.querySelector('#cal-f-tit').value.trim(), todo_el_dia: t, color: colorSel, ambito: m.querySelector('#cal-f-amb').value,
                ubicacion: m.querySelector('#cal-f-lug').value.trim(), descripcion: m.querySelector('#cal-f-det').value.trim() };
            if (!datos.titulo) { err.textContent = 'Ponle un título al evento.'; return; }
            if (!vi) { err.textContent = 'Indica la fecha de inicio.'; return; }
            if (t) { datos.dia_inicio = vi; datos.dia_fin = vf || vi; if (datos.dia_fin < datos.dia_inicio) { err.textContent = 'El término no puede ser antes del inicio.'; return; } }
            else {
                const di = new Date(vi), df = vf ? new Date(vf) : null;
                if (isNaN(di) || (df && isNaN(df))) { err.textContent = 'Revisa las fechas.'; return; }
                if (df && df < di) { err.textContent = 'El término no puede ser antes del inicio.'; return; }
                datos.inicio = di.toISOString(); if (df) datos.fin = df.toISOString();
            }
            b.disabled = true; b.textContent = 'Guardando…';
            const { error } = await clienteSupabase.rpc('guardar_evento_cal', { p_id_empresa: window.miEmpresaId, p_id: e ? e.id : null, p_datos: datos });
            if (error) { err.textContent = error.message; b.disabled = false; b.textContent = 'Guardar'; return; }
            cerrarModal(); cargar();
        });
        setTimeout(() => { const i = m.querySelector('#cal-f-tit'); if (i) i.focus(); }, 0);
    }

    // ---------- Eventos de la interfaz ----------
    function enlazar() {
        const cont = document.getElementById('cal-home');
        if (!cont || cont.dataset.listo) return;
        cont.dataset.listo = '1';
        cont.addEventListener('click', ev => {
            const t = ev.target;
            let el;
            if ((el = t.closest('[data-vista]'))) return irAVista(el.dataset.vista);
            if ((el = t.closest('[data-nav]'))) return mover(Number(el.dataset.nav));
            if ((el = t.closest('[data-fuente]'))) {
                const k = el.dataset.fuente; S.ocultos.has(k) ? S.ocultos.delete(k) : S.ocultos.add(k);
                try { localStorage.setItem('cal_ocultos', JSON.stringify([...S.ocultos])); } catch (e) {}
                return pintar();
            }
            if ((el = t.closest('[data-accion]'))) {
                if (el.dataset.accion === 'nuevo') return formulario(null, S.vista === 'dia' ? clave(S.ref) : null);
                const [d, h] = rango();
                const evs = S.eventos.filter(e => !S.ocultos.has(e.key) && e.diaFin >= d && e.diaIni <= h);
                if (!evs.length) return alert('No hay eventos en el período que estás viendo.');
                return descargarIcs(evs, `calendario-buddy-${clave(d)}.ics`);
            }
            if ((el = t.closest('[data-ev]'))) return verEvento(el.dataset.ev);
            if ((el = t.closest('[data-mes]'))) return irAVista('mes', new Date(S.ref.getFullYear(), Number(el.dataset.mes), 1));
            if ((el = t.closest('[data-dia]'))) return irAVista('dia', deClave(el.dataset.dia));
        });
        if (S.resizeListo) return;
        S.resizeListo = true;
        let ancho = window.innerWidth;
        window.addEventListener('resize', () => { if ((ancho < 640) !== (window.innerWidth < 640) && document.getElementById('cal-home')) { ancho = window.innerWidth; pintar(); } });
    }

    window.cargarCalendarioHome = function () {
        enlazar();
        cargar();
    };
    window.__calUtil = { vevento, enlaceGoogle, enlaceOutlook, normalizar };
})();
