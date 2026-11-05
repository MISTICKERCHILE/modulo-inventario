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
        cumple:      { nombre: 'Cumpleaños',         color: '#ec4899' },
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
        let base = null;
        if (e.repite && e.repite !== 'ninguna' && e.inicio0) {
            const bi = todo ? deClave(e.inicio0) : new Date(e.inicio0), bf = todo ? deClave(e.fin0 || e.inicio0) : (e.fin0 ? new Date(e.fin0) : new Date(bi.getTime() + 3600000));
            base = { ini: bi, fin: bf, diaIni: new Date(bi.getFullYear(), bi.getMonth(), bi.getDate()), diaFin: new Date(bf.getFullYear(), bf.getMonth(), bf.getDate()) };
        }
        return { ...e, key, color, todo, ini, fin, diaIni, diaFin, base };
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
        const arr = e.editable && e.fuente === 'evento' && (!e.repite || e.repite === 'ninguna') ? ' draggable="true"' : '';
        if (compacto) return `<span title="${esc(e.titulo)}" data-ev="${esc(e.key + '|' + (e.uid || e.id))}" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${e.color};margin:1px;cursor:pointer"></span>`;
        return `<div data-ev="${esc(e.key + '|' + (e.uid || e.id))}"${arr} title="${esc(e.titulo)}" style="background:${e.color}1a;border-left:2px solid ${e.color};color:#334155;font-size:11px;font-weight:500;line-height:1.25;padding:2px 5px;margin-bottom:2px;border-radius:5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer">${lock}${esc(hh)}${esc(e.titulo)}</div>`;
    }
    function celdaDia(k, opts) {
        const d = deClave(k), hoy = k === clave(new Date()), evs = eventosDelDia(k);
        const feriado = evs.some(e => e.key === 'feriado');
        const fuera = opts.mes != null && d.getMonth() !== opts.mes;
        const movil = window.innerWidth < 640;
        const max = opts.max || 3;
        let html = `<div data-celda="${k}" style="min-height:${opts.alto}px;padding:4px;border-top:1px solid #eef1f5;border-left:1px solid #f1f5f9;background:${fuera ? 'rgba(248,250,252,.6)' : 'transparent'};min-width:0;overflow:hidden;cursor:pointer">`;
        html += `<div data-dia="${k}" style="cursor:pointer;font-size:11px;font-weight:600;margin-bottom:3px;${hoy ? 'background:#10b981;color:#fff;border-radius:999px;display:inline-block;min-width:20px;text-align:center;padding:1px 3px' : 'color:' + (feriado ? '#7c3aed' : fuera ? '#cbd5e1' : '#64748b')}">${d.getDate()}</div>`;
        if (movil) html += `<div>${evs.slice(0, 8).map(e => chip(e, true)).join('')}</div>`;
        else {
            html += evs.slice(0, max).map(e => chip(e, false)).join('');
            if (evs.length > max) html += `<div data-dia="${k}" style="font-size:10px;color:#94a3b8;cursor:pointer;font-weight:600">+${evs.length - max} más</div>`;
        }
        return html + '</div>';
    }
    function vistaMes() {
        const [ini] = rango(), mes = S.ref.getMonth();
        let h = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr))">`;
        h += DIAS.map(n => `<div style="text-align:center;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a8b3c2;padding:4px 0">${n}</div>`).join('');
        for (let i = 0; i < 42; i++) h += celdaDia(clave(sumarDias(ini, i)), { mes, alto: window.innerWidth < 640 ? 54 : 92 });
        return h + '</div>';
    }
    function vistaSemana() {
        const [ini] = rango();
        let h = `<div style="display:grid;grid-template-columns:repeat(${window.innerWidth < 640 ? 1 : 7},minmax(0,1fr))">`;
        for (let i = 0; i < 7; i++) {
            const k = clave(sumarDias(ini, i)), d = deClave(k);
            h += `<div>${window.innerWidth < 640 ? `<div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a8b3c2;padding:6px 4px 0">${DIAS_LARGOS[i]}</div>` : `<div style="text-align:center;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a8b3c2;padding:4px 0">${DIAS[i]}</div>`}${celdaDia(k, { alto: 150, max: 20 })}</div>`;
        }
        return h + '</div>';
    }
    const HORA_PX = 46;
    function vistaDia() {
        const k = clave(S.ref), hoyK = clave(new Date()), esHoy = k === hoyK, evs = eventosDelDia(k);
        const todos = evs.filter(e => e.todo), con = evs.filter(e => !e.todo);
        let h0 = esHoy ? new Date().getHours() : 7;
        con.forEach(e => { const hi = e.diaIni < deClave(k) ? 0 : e.ini.getHours(); if (hi < h0) h0 = hi; });
        S.h0 = h0;
        const filas = 24 - h0;
        // columnas para eventos que se superponen
        const orden = con.slice().sort((a, b) => a.ini - b.ini || b.fin - a.fin), cols = [], pos = new Map();
        orden.forEach(e => { let c = cols.findIndex(f => f <= e.ini); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = e.fin; pos.set(e, c); });
        let h = '';
        if (todos.length) h += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;padding-left:46px">${todos.map(e => `<div data-ev="${esc(e.key + '|' + (e.uid || e.id))}" style="background:${e.color}1f;border-left:2px solid ${e.color};color:#334155;font-size:11px;font-weight:500;padding:3px 8px;border-radius:5px;cursor:pointer">${e.ambito === 'personal' ? '🔒 ' : ''}${esc(e.titulo)}</div>`).join('')}</div>`;
        h += `<div style="position:relative;height:${filas * HORA_PX}px;margin-left:46px" id="cal-grilla" data-dia-grilla="${k}">`;
        for (let i = 0; i < filas; i++) h += `<div style="position:absolute;left:0;right:0;top:${i * HORA_PX}px;height:${HORA_PX}px;border-top:1px solid #eef1f5"><span style="position:absolute;left:-44px;top:-7px;font-size:10px;font-weight:500;color:#a8b3c2">${pad(h0 + i)}:00</span></div>`;
        con.forEach(e => {
            const ini = e.diaIni < deClave(k) ? 0 : e.ini.getHours() * 60 + e.ini.getMinutes();
            const finMin = e.diaFin > deClave(k) ? 1440 : Math.max(ini + 20, e.fin.getHours() * 60 + e.fin.getMinutes());
            const top = (ini - h0 * 60) / 60 * HORA_PX, alto = Math.max(20, (finMin - ini) / 60 * HORA_PX - 2), c = pos.get(e);
            const ncols = Math.max(...orden.filter(o => o.ini < e.fin && o.fin > e.ini).map(o => pos.get(o))) + 1;
            const arr = e.editable && e.fuente === 'evento' && (!e.repite || e.repite === 'ninguna') ? ' draggable="true"' : '';
            h += `<div data-ev="${esc(e.key + '|' + (e.uid || e.id))}"${arr} title="${esc(e.titulo)}" style="position:absolute;top:${top}px;height:${alto}px;left:calc(${c * 100 / ncols}% + 2px);width:calc(${100 / ncols}% - 4px);box-sizing:border-box;background:${e.color}1f;border-left:2px solid ${e.color};border-radius:6px;padding:3px 6px;overflow:hidden;cursor:pointer;backdrop-filter:blur(2px)"><div style="font-size:11px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.ambito === 'personal' ? '🔒 ' : ''}${esc(e.titulo)}</div><div style="font-size:10px;color:#64748b">${hora(e.ini)} – ${hora(e.fin)}${e.lugar ? ' · ' + esc(e.lugar) : ''}</div></div>`;
        });
        if (esHoy) { const n = new Date(), y = ((n.getHours() * 60 + n.getMinutes()) - h0 * 60) / 60 * HORA_PX; if (y >= 0) h += `<div style="position:absolute;left:-4px;right:0;top:${y}px;height:0;border-top:1.5px solid #ef4444;pointer-events:none"><span style="position:absolute;left:-2px;top:-4px;width:7px;height:7px;border-radius:50%;background:#ef4444"></span></div>`; }
        h += '</div>';
        if (!evs.length) h += `<div style="text-align:center;color:#a8b3c2;font-size:12px;padding:10px 0 0">Sin eventos. Toca una hora para agregar uno.</div>`;
        return h;
    }
    function vistaAnio() {
        const y = S.ref.getFullYear(), hoyK = clave(new Date());
        let h = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">`;
        for (let m = 0; m < 12; m++) {
            const primero = new Date(y, m, 1), l = lunesDe(primero);
            h += `<div><div data-mes="${m}" style="cursor:pointer;font-size:12px;font-weight:600;text-transform:capitalize;color:#475569;margin-bottom:2px">${MESES[m]}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px">`;
            for (let i = 0; i < 42; i++) {
                const d = sumarDias(l, i), k = clave(d);
                if (d.getMonth() !== m) { h += '<div></div>'; continue; }
                const evs = eventosDelDia(k), hay = evs.length, fer = evs.some(e => e.key === 'feriado');
                const col = hay ? evs[0].color : '';
                h += `<div data-dia="${k}" title="${hay ? esc(evs.map(e => e.titulo).join(' · ')) : ''}" style="cursor:pointer;text-align:center;font-size:9px;line-height:16px;border-radius:4px;${k === hoyK ? 'outline:2px solid #10b981;' : ''}${hay ? `background:${col};color:#fff;font-weight:600` : 'color:#94a3b8'}${fer && !hay ? ';color:#7c3aed' : ''}">${d.getDate()}</div>`;
            }
            h += '</div></div>';
        }
        return h + '</div>';
    }

    function pintar() {
        const cont = document.getElementById('cal-home');
        if (!cont) return;
        const tabs = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']].map(([v, t]) =>
            `<button data-vista="${v}" style="padding:3px 11px;border-radius:7px;font-size:11px;font-weight:500;${S.vista === v ? 'background:#fff;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.08)' : 'color:#94a3b8'}">${t}</button>`).join('');
        const leyenda = Object.entries(FUENTES).map(([k, f]) =>
            `<button data-fuente="${k}" style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:500;margin:2px 10px 2px 0;color:${S.ocultos.has(k) ? '#cbd5e1' : '#64748b'};${S.ocultos.has(k) ? 'text-decoration:line-through' : ''}"><span style="width:8px;height:8px;border-radius:50%;background:${S.ocultos.has(k) ? '#e2e8f0' : f.color}"></span>${f.nombre}</button>`).join('');
        const cuerpo = S.vista === 'dia' ? vistaDia() : S.vista === 'semana' ? vistaSemana() : S.vista === 'anio' ? vistaAnio() : vistaMes();
        const nb = 'width:26px;height:26px;border-radius:8px;border:1px solid #e6eaf0;color:#64748b;font-size:14px;background:rgba(255,255,255,.6)';
        const tit = titulo();
        cont.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:4px">
                <button data-nav="-1" aria-label="Anterior" style="${nb}">‹</button>
                <button data-nav="0" style="${nb};width:auto;padding:0 10px;font-size:11px;font-weight:500">Hoy</button>
                <button data-nav="1" aria-label="Siguiente" style="${nb}">›</button>
                <span style="margin-left:8px;font-size:15px;font-weight:600;color:#1e293b">${esc(tit.charAt(0).toUpperCase() + tit.slice(1))}</span>
                ${S.cargando ? '<span style="font-size:11px;color:#a8b3c2">cargando…</span>' : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <div style="display:flex;background:rgba(241,245,249,.8);padding:2px;border-radius:9px">${tabs}</div>
                <button data-accion="nuevo" style="height:26px;padding:0 12px;border-radius:999px;background:rgba(209,250,229,.7);color:#047857;font-size:11px;font-weight:600">+ Evento</button>
                <button data-accion="exportar" title="Descargar los eventos que ves en pantalla (.ics)" style="height:26px;padding:0 10px;border-radius:999px;background:rgba(241,245,249,.8);color:#64748b;font-size:11px;font-weight:500">⬇ .ics</button>
            </div>
        </div>
        <div>${leyenda}</div>
        ${S.error ? `<div style="color:#b91c1c;font-size:12px;padding:6px 0">${esc(S.error)}</div>` : ''}
        <div style="margin-top:6px">${cuerpo}</div>`;
        if (S.vista === 'dia' && !S.cargando && !S.scrolled) S.scrolled = true;
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
    const FREQ = { diaria: 'DAILY', semanal: 'WEEKLY', mensual: 'MONTHLY', anual: 'YEARLY' };
    function reglaRep(e) {
        if (!e.repite || e.repite === 'ninguna') return null;
        let r = 'RRULE:FREQ=' + FREQ[e.repite];
        if (e.repite_hasta) { const d = deClave(e.repite_hasta); r += ';UNTIL=' + (e.todo ? icsDia(d) : icsFecha(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59))); }
        return r;
    }
    function vevento(e0) {
        const e = e0.base ? { ...e0, ...e0.base } : e0;
        const L = ['BEGIN:VEVENT', `UID:${e.key}-${e.id}@buddyerp.com`, `DTSTAMP:${icsFecha(new Date())}`];
        if (e.todo) { L.push(`DTSTART;VALUE=DATE:${icsDia(e.diaIni)}`, `DTEND;VALUE=DATE:${icsDia(sumarDias(e.diaFin, 1))}`); }
        else { L.push(`DTSTART:${icsFecha(e.ini)}`, `DTEND:${icsFecha(e.fin)}`); }
        const rr = reglaRep(e); if (rr) L.push(rr);
        L.push(`SUMMARY:${icsTxt(e.titulo)}`);
        const det = [e.detalle, e.fuente !== 'evento' ? (FUENTES[e.key] || {}).nombre : ''].filter(Boolean).join(' · ');
        if (det) L.push(`DESCRIPTION:${icsTxt(det)}`);
        if (e.lugar) L.push(`LOCATION:${icsTxt(e.lugar)}`);
        L.push('END:VEVENT');
        return L.map(plegar).join('\r\n');
    }
    function descargarIcs(evs0, nombre) {
        const vistos = new Set(), evs = evs0.filter(e => { if (!e.base) return true; if (vistos.has(e.id)) return false; vistos.add(e.id); return true; });
        const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Buddy ERP//Calendario//ES', 'CALSCALE:GREGORIAN', ...evs.map(vevento), 'END:VCALENDAR'].join('\r\n') + '\r\n';
        const url = URL.createObjectURL(new Blob([txt], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function enlaceGoogle(e) {
        const f = e.todo ? `${icsDia(e.diaIni)}/${icsDia(sumarDias(e.diaFin, 1))}` : `${icsFecha(e.ini)}/${icsFecha(e.fin)}`;
        const p = new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: f, details: e.detalle || '', location: e.lugar || '' });
        const rr = reglaRep(e); if (rr) p.set('recur', rr);
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
        m.innerHTML = `<div style="background:rgba(255,255,255,.97);border-radius:16px;width:100%;max-width:420px;max-height:92vh;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;padding:20px;box-shadow:0 20px 50px rgba(15,23,42,.25)">${html}</div>`;
        m.addEventListener('mousedown', ev => { if (ev.target === m) cerrarModal(); });
        document.body.appendChild(m);
        document.addEventListener('keydown', escModal);
        return m;
    }
    const btnEst = 'display:block;width:100%;box-sizing:border-box;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:600;margin-top:6px;';

    function verEvento(clv) {
        const [key, ...r] = clv.split('|'); const id = r.join('|');
        const e = S.eventos.find(x => x.key === key && String(x.uid || x.id) === id);
        if (!e) return;
        S.modal = e;
        const cuando = e.todo
            ? (e.diaIni.getTime() === e.diaFin.getTime() ? e.diaIni.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : `${e.diaIni.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${e.diaFin.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`)
            : `${e.ini.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}, ${hora(e.ini)} – ${hora(e.fin)}`;
        const m = abrirModal(`
            <div style="border-left:3px solid ${e.color};padding-left:10px">
                <div style="font-size:16px;font-weight:600;color:#1e293b">${esc(e.titulo)}</div>
                <div style="font-size:12px;color:#64748b;text-transform:capitalize;margin-top:2px">${esc(cuando)}</div>
            </div>
            ${e.repite && e.repite !== 'ninguna' ? `<div style="font-size:12px;color:#475569;margin-top:10px">🔁 Se repite ${({ diaria: 'cada día', semanal: 'cada semana', mensual: 'cada mes', anual: 'cada año' })[e.repite]}${e.repite_hasta ? ' hasta el ' + deClave(e.repite_hasta).toLocaleDateString('es-CL') : ''}. Editar o eliminar cambia toda la serie.</div>` : ''}
            ${e.lugar ? `<div style="font-size:12px;color:#475569;margin-top:10px">📍 ${esc(e.lugar)}</div>` : ''}
            ${e.detalle ? `<div style="font-size:12px;color:#475569;margin-top:8px;white-space:pre-wrap">${esc(e.detalle)}</div>` : ''}
            <div style="font-size:11px;color:#94a3b8;margin-top:8px">${esc((FUENTES[e.key] || {}).nombre || '')}${e.fuente === 'evento' ? (e.ambito === 'personal' ? ' · 🔒 solo tú lo ves' : ' · visible para la empresa') : ''}</div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-top:14px">Llevar a mi calendario</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">
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
        let base;
        if (diaSugerido instanceof Date) base = new Date(diaSugerido);
        else {
            base = diaSugerido ? deClave(diaSugerido) : new Date(S.ref);
            const ahora = new Date(); base.setHours(Math.min(ahora.getHours() + 1, 22), 0, 0, 0);
        }
        const src = e ? (e.base ? { ...e, ...e.base } : e) : null;
        const ini = src ? (src.todo ? src.diaIni : src.ini) : base;
        const fin = src ? (src.todo ? src.diaFin : src.fin) : new Date(base.getTime() + 3600000);
        const todo = e ? e.todo : false, color = e ? hex(e.color) : PALETA[0], amb = e ? e.ambito : 'personal';
        const inp = 'width:100%;min-width:0;box-sizing:border-box;border:1px solid #e6eaf0;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:3px;background:#f8fafc';
        const lab = 'font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#a8b3c2;display:block;margin-top:10px';
        const m = abrirModal(`
            <div style="font-size:16px;font-weight:600;color:#1e293b">${e ? 'Editar evento' : 'Nuevo evento'}</div>
            <label style="${lab}">Título</label><input id="cal-f-tit" maxlength="120" value="${esc(e ? e.titulo : '')}" style="${inp}" placeholder="Ej: Reunión con proveedor">
            <label style="${lab};display:flex;align-items:center;gap:6px"><input type="checkbox" id="cal-f-todo" ${todo ? 'checked' : ''}> Todo el día</label>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">
                <div style="min-width:0"><label style="${lab}">Inicio</label><input id="cal-f-ini" type="${todo ? 'date' : 'datetime-local'}" value="${aLocalInput(ini, todo)}" style="${inp}"></div>
                <div style="min-width:0"><label style="${lab}">Término</label><input id="cal-f-fin" type="${todo ? 'date' : 'datetime-local'}" value="${aLocalInput(fin, todo)}" style="${inp}"></div>
            </div>
            <label style="${lab}">Color</label>
            <div id="cal-f-colores" style="display:flex;gap:8px;margin-top:4px">${PALETA.map(c => `<button type="button" data-color="${c}" aria-label="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};outline:${c === color ? '3px solid #1e293b' : 'none'};outline-offset:2px"></button>`).join('')}</div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">
                <div style="min-width:0"><label style="${lab}">Repetir</label><select id="cal-f-rep" style="${inp}">${[['ninguna', 'No se repite'], ['diaria', 'Cada día'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes'], ['anual', 'Cada año']].map(([v, t]) => `<option value="${v}" ${(e && e.repite || 'ninguna') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                <div style="min-width:0"><label style="${lab}">Hasta (opcional)</label><input id="cal-f-hasta" type="date" value="${e && e.repite_hasta ? esc(e.repite_hasta) : ''}" style="${inp}"></div>
            </div>
            <label style="${lab}">¿Quién lo ve?</label>
            <select id="cal-f-amb" style="${inp}"><option value="personal" ${amb === 'personal' ? 'selected' : ''}>🔒 Personal (solo yo)</option><option value="empresa" ${amb === 'empresa' ? 'selected' : ''}>🏢 De la empresa (todo el equipo)</option></select>
            <label style="${lab}">Lugar (opcional)</label><input id="cal-f-lug" list="cal-lugares" maxlength="200" autocomplete="off" value="${esc(e ? e.lugar : '')}" style="${inp}" placeholder="Escribe o elige una dirección de Buddy"><datalist id="cal-lugares">${(S.lugares || []).map(l => `<option value="${esc(l.valor)}" label="${esc(l.origen)}"></option>`).join('')}</datalist>
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
                ubicacion: m.querySelector('#cal-f-lug').value.trim(), descripcion: m.querySelector('#cal-f-det').value.trim(),
                repite: m.querySelector('#cal-f-rep').value, repite_hasta: m.querySelector('#cal-f-hasta').value || null };
            if (!datos.titulo) { err.textContent = 'Ponle un título al evento.'; return; }
            if (!vi) { err.textContent = 'Indica la fecha de inicio.'; return; }
            if (datos.repite === 'ninguna') datos.repite_hasta = null;
            else if (datos.repite_hasta && datos.repite_hasta < vi.slice(0, 10)) { err.textContent = 'La repetición no puede terminar antes de empezar.'; return; }
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

    // ---------- Mover (arrastrar) ----------
    async function moverEvento(e, dias, nuevaHoraMin) {
        const datos = { titulo: e.titulo, todo_el_dia: e.todo, color: e.color, ambito: e.ambito, ubicacion: e.lugar || '', descripcion: e.detalle || '' };
        if (e.todo) { datos.dia_inicio = clave(sumarDias(e.diaIni, dias)); datos.dia_fin = clave(sumarDias(e.diaFin, dias)); }
        else {
            const ini = new Date(e.ini), fin = new Date(e.fin), dur = fin - ini;
            ini.setDate(ini.getDate() + dias);
            if (nuevaHoraMin != null) ini.setHours(Math.floor(nuevaHoraMin / 60), nuevaHoraMin % 60, 0, 0);
            const f = new Date(ini.getTime() + dur);
            datos.inicio = ini.toISOString(); datos.fin = f.toISOString();
        }
        const { error } = await clienteSupabase.rpc('guardar_evento_cal', { p_id_empresa: window.miEmpresaId, p_id: e.id, p_datos: datos });
        if (error) alert('No se pudo mover el evento: ' + error.message);
        cargar();
    }
    function buscarEv(clv) { const [key, ...r] = String(clv).split('|'); const id = r.join('|'); return S.eventos.find(x => x.key === key && String(x.uid || x.id) === id); }
    function minutosEnGrilla(ev) {
        const g = document.getElementById('cal-grilla'); if (!g) return null;
        const r = g.getBoundingClientRect(), y = Math.max(0, Math.min(ev.clientY - r.top, r.height - 1));
        return Math.max(0, Math.min(1425, Math.round((S.h0 * 60 + y / HORA_PX * 60) / 15) * 15));
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
            if ((el = t.closest('[data-celda]'))) return formulario(null, el.dataset.celda);
            if ((el = t.closest('[data-dia-grilla]'))) {
                const m = minutosEnGrilla(ev); if (m == null) return;
                const f = deClave(el.dataset.diaGrilla); f.setHours(Math.floor(m / 60), m % 60 - (m % 30), 0, 0);
                return formulario(null, f);
            }
        });
        // arrastrar y soltar
        cont.addEventListener('dragstart', ev => {
            const el = ev.target.closest && ev.target.closest('[data-ev][draggable="true"]'); if (!el) return;
            S.arrastrando = el.dataset.ev; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', el.dataset.ev);
        });
        cont.addEventListener('dragover', ev => {
            if (!S.arrastrando) return;
            if (ev.target.closest('[data-celda],[data-dia-grilla]')) ev.preventDefault();
        });
        cont.addEventListener('drop', async ev => {
            if (!S.arrastrando) return;
            const e = buscarEv(S.arrastrando); S.arrastrando = null; if (!e) return;
            const celda = ev.target.closest('[data-celda]'), grilla = ev.target.closest('[data-dia-grilla]');
            ev.preventDefault();
            if (celda) { const dias = Math.round((deClave(celda.dataset.celda) - e.diaIni) / 86400000); if (dias) await moverEvento(e, dias); }
            else if (grilla && !e.todo) {
                const m = minutosEnGrilla(ev); if (m == null) return;
                const dias = Math.round((deClave(grilla.dataset.diaGrilla) - e.diaIni) / 86400000);
                await moverEvento(e, dias, m);
            }
        });
        cont.addEventListener('dragend', () => { S.arrastrando = null; });
        if (S.resizeListo) return;
        S.resizeListo = true;
        let ancho = window.innerWidth;
        window.addEventListener('resize', () => { if ((ancho < 640) !== (window.innerWidth < 640) && document.getElementById('cal-home')) { ancho = window.innerWidth; pintar(); } });
    }

    async function cargarLugares() {
        try { const { data } = await clienteSupabase.rpc('calendario_lugares', { p_id_empresa: window.miEmpresaId }); S.lugares = Array.isArray(data) ? data : []; } catch (e) { S.lugares = []; }
    }
    window.cargarCalendarioHome = function () {
        enlazar();
        cargar();
        cargarLugares();
    };
    window.__calUtil = { vevento, enlaceGoogle, enlaceOutlook, normalizar };
})();
