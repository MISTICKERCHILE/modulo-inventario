// ==========================================================
// COTIZACIONES: lista, editor, duplicar, adjuntos, PDF profesional
// y modal "Logo y datos de mi empresa" (usado también desde Parámetros).
// El PDF NO lleva ninguna marca de Buddy.
// ==========================================================
const CZ = { lista: [], id: null, estado: 'borrador', bloqueada: false, clientes: [], productos: [], datos: {}, monedas: ['CLP'], clienteId: null, items: [] };
const czAdmin = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);
const czEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const czDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const czFmt = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: czDec(m), maximumFractionDigits: czDec(m) });
const czNum = (n) => String(n).padStart(4, '0');
const czHoy = () => new Date().toISOString().slice(0, 10);
const czFechaTxt = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
const czEstadoEfectivo = (c) => (['borrador', 'enviada'].includes(c.estado) && c.fecha_vencimiento < czHoy()) ? 'vencida' : c.estado;
const CZ_COLOR = { borrador: 'bg-slate-100 text-slate-600', enviada: 'bg-blue-100 text-blue-700', aceptada: 'bg-emerald-100 text-emerald-700', rechazada: 'bg-red-100 text-red-700', vencida: 'bg-amber-100 text-amber-700', convertida: 'bg-purple-100 text-purple-700' };

// ---------- Carga ----------
async function cargarDatosEmpresaDoc() {
    const { data } = await clienteSupabase.from('empresas').select('datos_documentos, monedas, nombre_comercial').eq('id', window.miEmpresaId).maybeSingle();
    CZ.datos = (data && data.datos_documentos) || {};
    CZ.nombreEmpresa = data?.nombre_comercial || '';
    CZ.monedas = (data && data.monedas && data.monedas.length) ? data.monedas : ['CLP'];
}

window.cargarCotizaciones = async function () {
    czVolver(true);
    await cargarDatosEmpresaDoc();
    const { data, error } = await clienteSupabase.from('cotizaciones').select('*').eq('id_empresa', window.miEmpresaId).order('numero', { ascending: false });
    if (error) { console.error(error); CZ.lista = []; } else CZ.lista = data || [];
    czPintarLista();
    if (window.czAbrirNuevaAlEntrar) { window.czAbrirNuevaAlEntrar = false; czNueva(); }
};

function czPintarLista() {
    const q = (document.getElementById('cz-buscar')?.value || '').toLowerCase().trim();
    const f = document.getElementById('cz-filtro')?.value || '';
    const filas = CZ.lista.filter(c => {
        const ef = czEstadoEfectivo(c);
        if (f && ef !== f) return false;
        return !q || (`${czNum(c.numero)} ${c.cliente_nombre} ${c.titulo || ''}`).toLowerCase().includes(q);
    });
    const tb = document.getElementById('cz-tabla'); if (!tb) return;
    tb.innerHTML = filas.map(c => {
        const ef = czEstadoEfectivo(c);
        return `<tr class="hover:bg-slate-50 cursor-pointer" onclick="czAbrir('${c.id}')">
            <td class="px-3 py-2 font-black">${czNum(c.numero)}${c.revision > 1 ? `<span class="text-xs text-slate-400 font-normal"> rev.${c.revision}</span>` : ''}</td>
            <td class="px-3 py-2">${czEsc(c.cliente_nombre)}</td>
            <td class="px-3 py-2 text-slate-500">${czEsc(c.titulo || '')}</td>
            <td class="px-3 py-2 text-slate-500">${czFechaTxt(c.fecha_emision)}</td>
            <td class="px-3 py-2 text-slate-500">${czFechaTxt(c.fecha_vencimiento)}</td>
            <td class="px-3 py-2 text-right font-bold">${czFmt(c.total, c.moneda)}</td>
            <td class="px-3 py-2 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${CZ_COLOR[ef]}">${ef}</span></td>
            <td class="px-3 py-2 text-right whitespace-nowrap" onclick="event.stopPropagation()">
                <button title="Descargar PDF" onclick="czPdfDesdeLista('${c.id}')" class="px-2 hover:text-blue-600">📄</button>
                <button title="Duplicar" onclick="czDuplicarDesdeLista('${c.id}')" class="px-2 hover:text-blue-600">⧉</button>
                ${['borrador', 'rechazada'].includes(c.estado) ? `<button title="Eliminar" onclick="czEliminar('${c.id}')" class="px-2 hover:text-red-600">🗑</button>` : ''}
            </td></tr>`;
    }).join('');
    document.getElementById('cz-vacio').classList.toggle('hidden', filas.length > 0);
}

function czVolver(silencioso) {
    document.getElementById('cz-editor')?.classList.add('hidden');
    document.getElementById('cz-lista')?.classList.remove('hidden');
    if (!silencioso) window.cargarCotizaciones();
}

// ---------- Editor ----------
async function czPrepararEditor() {
    const [cl, pr] = await Promise.all([
        clienteSupabase.from('clientes').select('id, nombre, documento, correo, telefono, direccion').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('productos').select('id, nombre, sku, precio_venta_iva').eq('id_empresa', window.miEmpresaId).order('nombre')
    ]);
    CZ.clientes = cl.data || []; CZ.productos = pr.data || [];
    document.getElementById('cz-lista-clientes').innerHTML = CZ.clientes.map(c => `<option value="${czEsc(c.nombre)}"></option>`).join('');
    document.getElementById('cz-lista-productos').innerHTML = CZ.productos.map(p => `<option value="${czEsc(p.nombre)}"></option>`).join('');
    document.getElementById('cz-moneda').innerHTML = CZ.monedas.map(m => `<option>${m}</option>`).join('');
    document.getElementById('cz-lista').classList.add('hidden');
    document.getElementById('cz-editor').classList.remove('hidden');
}

async function czNueva() {
    await cargarDatosEmpresaDoc();
    await czPrepararEditor();
    CZ.id = null; CZ.estado = 'borrador'; CZ.bloqueada = false; CZ.clienteId = null;
    const d = CZ.datos;
    document.getElementById('cz-titulo-editor').innerText = 'Nueva cotización';
    document.getElementById('cz-subtitulo').innerText = '';
    ['cli-nombre', 'cli-doc', 'cli-correo', 'cli-tel', 'cli-dir', 'asunto', 'notas'].forEach(k => document.getElementById('cz-' + k).value = '');
    document.getElementById('cz-emision').value = czHoy();
    document.getElementById('cz-validez').value = d.validez_dias ?? 15;
    document.getElementById('cz-moneda').value = (d.moneda && CZ.monedas.includes(d.moneda)) ? d.moneda : CZ.monedas[0];
    document.getElementById('cz-estado').value = 'borrador';
    document.getElementById('cz-dto').value = 0;
    document.getElementById('cz-iva').value = d.iva_pct ?? 19;
    document.getElementById('cz-condiciones').value = d.condiciones || '';
    CZ.items = []; czAgregarItem(); czEstadoEditor();
    czPintarAdjuntos();
}

async function czAbrir(id) {
    await cargarDatosEmpresaDoc();
    await czPrepararEditor();
    const c = CZ.lista.find(x => x.id === id); if (!c) return;
    const { data: its } = await clienteSupabase.from('cotizaciones_items').select('*').eq('id_cotizacion', id).order('orden');
    CZ.id = id; CZ.estado = c.estado; CZ.bloqueada = c.estado === 'convertida'; CZ.clienteId = c.id_cliente;
    document.getElementById('cz-titulo-editor').innerText = `Cotización N° ${czNum(c.numero)}`;
    document.getElementById('cz-subtitulo').innerText = `Revisión ${c.revision}${c.id_origen ? ' · duplicada de otra cotización' : ''}`;
    const set = (k, v) => document.getElementById('cz-' + k).value = v ?? '';
    set('cli-nombre', c.cliente_nombre); set('cli-doc', c.cliente_documento); set('cli-correo', c.cliente_correo);
    set('cli-tel', c.cliente_telefono); set('cli-dir', c.cliente_direccion); set('asunto', c.titulo);
    set('emision', c.fecha_emision); set('validez', c.validez_dias); set('notas', c.notas); set('condiciones', c.condiciones);
    set('dto', c.descuento_pct); set('iva', c.impuesto_pct);
    const sel = document.getElementById('cz-moneda');
    if (![...sel.options].some(o => o.value === c.moneda)) sel.insertAdjacentHTML('beforeend', `<option>${czEsc(c.moneda)}</option>`);
    sel.value = c.moneda;
    document.getElementById('cz-estado').value = c.estado === 'convertida' ? 'aceptada' : c.estado;
    CZ.items = (its || []).map(i => ({ id_producto: i.id_producto, descripcion: i.descripcion, unidad: i.unidad, cantidad: Number(i.cantidad), precio: Number(i.precio_unitario), dto: Number(i.descuento_pct) }));
    czEstadoEditor(); czPintarItems(); czRecalcular();
    await czCargarAdjuntos();
}

function czEstadoEditor() {
    document.getElementById('cz-btn-duplicar').classList.toggle('hidden', !CZ.id);
    document.getElementById('cz-aviso-bloqueo').classList.toggle('hidden', !CZ.bloqueada);
    document.querySelectorAll('#cz-editor input, #cz-editor select, #cz-editor textarea').forEach(el => { if (el.id !== 'cz-archivo') el.disabled = CZ.bloqueada; });
    document.getElementById('cz-adjuntos-aviso').classList.toggle('hidden', !!CZ.id);
    czPintarItems(); czRecalcular();
}

function czElegirCliente() {
    const n = document.getElementById('cz-cli-nombre').value;
    const c = CZ.clientes.find(x => x.nombre === n);
    CZ.clienteId = c ? c.id : null;
    if (c) {
        document.getElementById('cz-cli-doc').value = c.documento || '';
        document.getElementById('cz-cli-correo').value = c.correo || '';
        document.getElementById('cz-cli-tel').value = c.telefono || '';
        document.getElementById('cz-cli-dir').value = c.direccion || '';
    }
}

function czAgregarItem() { CZ.items.push({ id_producto: null, descripcion: '', unidad: '', cantidad: 1, precio: 0, dto: 0 }); czPintarItems(); }
function czQuitarItem(i) { CZ.items.splice(i, 1); if (!CZ.items.length) CZ.items.push({ id_producto: null, descripcion: '', unidad: '', cantidad: 1, precio: 0, dto: 0 }); czPintarItems(); czRecalcular(); }
function czCambioItem(i, campo, el) {
    const it = CZ.items[i];
    if (campo === 'descripcion') {
        it.descripcion = el.value;
        const p = CZ.productos.find(x => x.nombre === el.value);
        it.id_producto = p ? p.id : null;
        if (p) {
            const iva = parseFloat(document.getElementById('cz-iva').value) || 0;
            const m = document.getElementById('cz-moneda').value;
            it.precio = Math.round(((p.precio_venta_iva || 0) / (1 + iva / 100)) * Math.pow(10, czDec(m))) / Math.pow(10, czDec(m));
            czPintarItems();
        }
    } else it[campo] = parseFloat(el.value) || 0;
    czRecalcular();
}
function czPintarItems() {
    const dis = CZ.bloqueada ? 'disabled' : '';
    document.getElementById('cz-items').innerHTML = CZ.items.map((it, i) => `<tr>
        <td class="px-2 py-2"><input ${dis} list="cz-lista-productos" value="${czEsc(it.descripcion)}" maxlength="300" onchange="czCambioItem(${i},'descripcion',this)" oninput="CZ.items[${i}].descripcion=this.value" class="w-full px-2 py-1.5 border rounded" placeholder="Producto o descripción libre"></td>
        <td class="px-2 py-2"><input ${dis} type="number" min="0" step="any" value="${it.cantidad}" oninput="czCambioItem(${i},'cantidad',this)" class="w-full px-2 py-1.5 border rounded text-right"></td>
        <td class="px-2 py-2"><input ${dis} type="number" min="0" step="any" value="${it.precio}" oninput="czCambioItem(${i},'precio',this)" class="w-full px-2 py-1.5 border rounded text-right"></td>
        <td class="px-2 py-2"><input ${dis} type="number" min="0" max="100" step="any" value="${it.dto}" oninput="czCambioItem(${i},'dto',this)" class="w-full px-2 py-1.5 border rounded text-right"></td>
        <td class="px-2 py-2 text-right font-bold" id="cz-lt-${i}"></td>
        <td class="px-1">${CZ.bloqueada ? '' : `<button onclick="czQuitarItem(${i})" class="text-slate-400 hover:text-red-600">✕</button>`}</td></tr>`).join('');
    czRecalcular();
}
function czTotales() {
    const m = document.getElementById('cz-moneda').value, d = czDec(m), r = (n) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
    const sub = r(CZ.items.reduce((s, it) => s + it.cantidad * it.precio * (1 - (it.dto || 0) / 100), 0));
    const dp = parseFloat(document.getElementById('cz-dto').value) || 0, ip = parseFloat(document.getElementById('cz-iva').value) || 0;
    const desc = r(sub * dp / 100), imp = r((sub - desc) * ip / 100);
    return { m, sub, dp, desc, ip, imp, total: sub - desc + imp };
}
function czRecalcular() {
    if (!document.getElementById('cz-items')) return;
    CZ.items.forEach((it, i) => { const e = document.getElementById('cz-lt-' + i); if (e) e.innerText = czFmt(it.cantidad * it.precio * (1 - (it.dto || 0) / 100), document.getElementById('cz-moneda').value); });
    const t = czTotales();
    document.getElementById('cz-t-sub').innerText = czFmt(t.sub, t.m);
    document.getElementById('cz-t-imp').innerText = czFmt(t.imp, t.m);
    document.getElementById('cz-t-total').innerText = czFmt(t.total, t.m);
}

function czLeerFormulario() {
    const v = (k) => document.getElementById('cz-' + k).value.trim();
    return {
        datos: {
            id_cliente: CZ.clienteId, cliente_nombre: v('cli-nombre'), cliente_documento: v('cli-doc'), cliente_correo: v('cli-correo'),
            cliente_telefono: v('cli-tel'), cliente_direccion: v('cli-dir'), titulo: v('asunto'), fecha_emision: v('emision'),
            validez_dias: parseInt(v('validez')) || 0, moneda: document.getElementById('cz-moneda').value,
            descuento_pct: parseFloat(v('dto')) || 0, impuesto_pct: parseFloat(v('iva')) || 0, notas: v('notas'), condiciones: v('condiciones')
        },
        items: CZ.items.filter(it => it.descripcion.trim()).map(it => ({ id_producto: it.id_producto, descripcion: it.descripcion.trim(), unidad: it.unidad || null, cantidad: it.cantidad, precio_unitario: it.precio, descuento_pct: it.dto || 0 }))
    };
}

async function czGuardar(conPdf) {
    if (CZ.bloqueada) return alert('Esta cotización ya se convirtió en venta.');
    const f = czLeerFormulario();
    if (!f.datos.cliente_nombre) return alert('Indica el cliente.');
    if (!f.items.length) return alert('Agrega al menos una línea con descripción.');
    if (f.items.some(i => !(i.cantidad > 0))) return alert('Todas las líneas deben tener cantidad mayor que cero.');
    const estadoElegido = document.getElementById('cz-estado').value;
    const { data, error } = await clienteSupabase.rpc('guardar_cotizacion', { p_id_empresa: window.miEmpresaId, p_id: CZ.id, p_datos: f.datos, p_items: f.items });
    if (error) return alert('No se pudo guardar: ' + error.message);
    const idNuevo = data.id;
    if (estadoElegido !== (CZ.estado === 'convertida' ? 'aceptada' : CZ.estado) || !CZ.id) {
        if (estadoElegido !== 'borrador') {
            const r = await clienteSupabase.rpc('cambiar_estado_cotizacion', { p_id: idNuevo, p_estado: estadoElegido });
            if (r.error) alert('Se guardó, pero no se pudo cambiar el estado: ' + r.error.message);
        }
    }
    const eraNueva = !CZ.id;
    await window.cargarCotizaciones();
    await czAbrir(idNuevo);
    if (conPdf) await czDescargarPdf(idNuevo);
    else if (eraNueva) alert(`Cotización N° ${czNum(data.numero)} guardada. Ahora puedes adjuntar archivos.`);
}

async function czDuplicar() { if (CZ.id) await czDuplicarDesdeLista(CZ.id); }
async function czDuplicarDesdeLista(id) {
    const { data, error } = await clienteSupabase.rpc('duplicar_cotizacion', { p_id: id });
    if (error) return alert('No se pudo duplicar: ' + error.message);
    await window.cargarCotizaciones();
    await czAbrir(data.id);
}
async function czEliminar(id) {
    if (!confirm('¿Eliminar esta cotización? No se puede deshacer.')) return;
    const { data: adj } = await clienteSupabase.from('cotizaciones_adjuntos').select('ruta').eq('id_cotizacion', id);
    const { error } = await clienteSupabase.rpc('eliminar_cotizacion', { p_id: id });
    if (error) return alert(error.message);
    if (adj && adj.length) await clienteSupabase.storage.from('adjuntos_ventas').remove(adj.map(a => a.ruta));
    window.cargarCotizaciones();
}

// ---------- Adjuntos ----------
async function czCargarAdjuntos() {
    const { data } = await clienteSupabase.from('cotizaciones_adjuntos').select('*').eq('id_cotizacion', CZ.id).order('created_at');
    CZ.adjuntos = data || []; czPintarAdjuntos();
}
function czPintarAdjuntos() {
    const ul = document.getElementById('cz-adjuntos'); if (!ul) return;
    const lista = CZ.id ? (CZ.adjuntos || []) : [];
    ul.innerHTML = lista.length ? lista.map(a => `<li class="py-2 flex items-center justify-between gap-3">
        <button onclick="czAbrirAdjunto('${a.id}')" class="text-blue-600 font-bold hover:underline text-left truncate">📎 ${czEsc(a.nombre)}</button>
        <span class="text-xs text-slate-400 whitespace-nowrap">${((a.tamano || 0) / 1024).toFixed(0)} KB</span>
        <button onclick="czQuitarAdjunto('${a.id}')" class="text-slate-400 hover:text-red-600">✕</button></li>`).join('')
        : '<li class="py-2 text-slate-400">Sin archivos.</li>';
    document.getElementById('cz-archivo').disabled = !CZ.id;
}
async function czSubirAdjuntos(input) {
    if (!CZ.id) return alert('Guarda la cotización primero.');
    for (const f of input.files) {
        if (f.size > 10 * 1024 * 1024) { alert(`“${f.name}” supera los 10 MB.`); continue; }
        const limpio = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
        const ruta = `${window.miEmpresaId}/cotizaciones/${CZ.id}/${crypto.randomUUID()}-${limpio}`;
        const up = await clienteSupabase.storage.from('adjuntos_ventas').upload(ruta, f, { contentType: f.type || 'application/octet-stream' });
        if (up.error) { alert(`No se pudo subir “${f.name}”: ${up.error.message}`); continue; }
        const ins = await clienteSupabase.from('cotizaciones_adjuntos').insert({ id_empresa: window.miEmpresaId, id_cotizacion: CZ.id, nombre: f.name, ruta, tamano: f.size, tipo: f.type });
        if (ins.error) { await clienteSupabase.storage.from('adjuntos_ventas').remove([ruta]); alert(ins.error.message); }
    }
    input.value = ''; await czCargarAdjuntos();
}
async function czAbrirAdjunto(id) {
    const a = CZ.adjuntos.find(x => x.id === id); if (!a) return;
    const { data, error } = await clienteSupabase.storage.from('adjuntos_ventas').createSignedUrl(a.ruta, 120);
    if (error) return alert(error.message);
    window.open(data.signedUrl, '_blank');
}
async function czQuitarAdjunto(id) {
    const a = CZ.adjuntos.find(x => x.id === id); if (!a || !confirm(`¿Quitar “${a.nombre}”?`)) return;
    await clienteSupabase.storage.from('adjuntos_ventas').remove([a.ruta]);
    await clienteSupabase.from('cotizaciones_adjuntos').delete().eq('id', id);
    await czCargarAdjuntos();
}

// ---------- PDF ----------
async function czPdfDesdeLista(id) { await cargarDatosEmpresaDoc(); await czDescargarPdf(id); }

function czHex(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)) : [30, 41, 59]; }

async function czDescargarPdf(id) {
    if (!(window.jspdf && window.jspdf.jsPDF)) return alert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.');
    const c = CZ.lista.find(x => x.id === id); if (!c) return;
    const { data: its } = await clienteSupabase.from('cotizaciones_items').select('*').eq('id_cotizacion', id).order('orden');
    const d = CZ.datos || {}, col = czHex(d.color), m = c.moneda;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mg = 15;
    let y = 15, xTxt = mg;

    if (d.logo) {
        try {
            const p = doc.getImageProperties(d.logo); const maxW = 50, maxH = 22; let w = maxW, h = w * p.height / p.width;
            if (h > maxH) { h = maxH; w = h * p.width / p.height; }
            doc.addImage(d.logo, p.fileType, mg, y, w, h); xTxt = mg + w + 6;
        } catch (e) { console.warn('Logo no válido', e); }
    }
    const nombre = d.razon_social || CZ.nombreEmpresa || '';
    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(nombre, xTxt, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 100, 115);
    let ly = y + 9;
    [d.rut ? 'RUT: ' + d.rut : '', d.giro || '', [d.direccion, d.ciudad].filter(Boolean).join(', '), [d.telefono, d.correo].filter(Boolean).join('  ·  '), d.sitio_web || '']
        .filter(Boolean).forEach(t => { doc.text(String(t), xTxt, ly); ly += 4; });

    // Caja título
    doc.setFillColor(...col); doc.roundedRect(W - mg - 62, y - 2, 62, 22, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('COTIZACIÓN', W - mg - 31, y + 5, { align: 'center' });
    doc.setFontSize(16); doc.text('N° ' + czNum(c.numero) + (c.revision > 1 ? ' · rev.' + c.revision : ''), W - mg - 31, y + 13, { align: 'center' });
    y = Math.max(ly, y + 24) + 4;
    doc.setDrawColor(...col); doc.setLineWidth(0.6); doc.line(mg, y, W - mg, y); y += 7;

    // Cliente y fechas
    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text('CLIENTE', mg, y); doc.text('FECHAS', W - mg - 55, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30, 41, 59);
    let cy = y + 5; doc.setFont('helvetica', 'bold'); doc.text(c.cliente_nombre, mg, cy); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 100, 115);
    [c.cliente_documento ? 'RUT: ' + c.cliente_documento : '', c.cliente_direccion || '', [c.cliente_telefono, c.cliente_correo].filter(Boolean).join('  ·  ')].filter(Boolean).forEach(t => { cy += 4.2; doc.text(doc.splitTextToSize(t, W - 2 * mg - 70)[0], mg, cy); });
    doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text('Emisión: ' + czFechaTxt(c.fecha_emision), W - mg - 55, y + 5); doc.text('Válida hasta: ' + czFechaTxt(c.fecha_vencimiento), W - mg - 55, y + 10);
    y = Math.max(cy, y + 10) + 8;
    if (c.titulo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30, 41, 59); doc.text(doc.splitTextToSize('Asunto: ' + c.titulo, W - 2 * mg), mg, y); y += 7; }

    // Tabla
    doc.autoTable({
        startY: y, margin: { left: mg, right: mg, bottom: 22 },
        head: [['Descripción', 'Cant.', 'Precio neto', 'Dto.', 'Total']],
        body: (its || []).map(i => [i.descripcion, String(Number(i.cantidad)), czFmt(i.precio_unitario, m), Number(i.descuento_pct) ? Number(i.descuento_pct) + '%' : '', czFmt(i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100), m)]),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: [30, 41, 59] },
        headStyles: { fillColor: col, textColor: 255, fontStyle: 'bold' },
        didParseCell: (h) => { if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right'; },
        alternateRowStyles: { fillColor: [247, 248, 250] },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 14 }, 4: { halign: 'right', cellWidth: 34 } },
        didDrawPage: () => { }
    });
    y = doc.lastAutoTable.finalY + 6;

    // Totales
    const filas = [['Subtotal', czFmt(c.subtotal, m)]];
    if (Number(c.descuento) > 0) filas.push([`Descuento (${Number(c.descuento_pct)}%)`, '- ' + czFmt(c.descuento, m)]);
    if (Number(c.impuesto_pct) > 0) filas.push([`IVA (${Number(c.impuesto_pct)}%)`, czFmt(c.impuesto, m)]);
    if (y + filas.length * 6 + 14 > H - 25) { doc.addPage(); y = 20; }
    const tx = W - mg - 80; doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 70, 85);
    filas.forEach(([a, b]) => { doc.text(a, tx, y); doc.text(b, W - mg, y, { align: 'right' }); y += 6; });
    doc.setFillColor(...col); doc.roundedRect(tx - 3, y - 4, 83, 9, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TOTAL', tx, y + 2); doc.text(czFmt(c.total, m), W - mg - 1, y + 2, { align: 'right' });
    y += 14;

    // Notas / condiciones
    const bloque = (tit, txt) => {
        if (!txt) return; const lineas = doc.splitTextToSize(txt, W - 2 * mg);
        if (y + 6 + lineas.length * 4.2 > H - 22) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...col); doc.text(tit, mg, y); y += 4.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 70, 85); doc.text(lineas, mg, y); y += lineas.length * 4.2 + 5;
    };
    bloque('NOTAS', c.notas); bloque('CONDICIONES COMERCIALES', c.condiciones);

    // Pie en todas las páginas (solo datos de la empresa y paginación)
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
        doc.setPage(p); doc.setDrawColor(210, 215, 222); doc.setLineWidth(0.3); doc.line(mg, H - 16, W - mg, H - 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 130, 145);
        const pie = d.pie || [nombre, d.rut ? 'RUT ' + d.rut : '', d.telefono, d.correo].filter(Boolean).join('  ·  ');
        doc.text(doc.splitTextToSize(pie, W - 2 * mg - 25)[0] || '', mg, H - 11);
        doc.text(`Página ${p} de ${n}`, W - mg, H - 11, { align: 'right' });
    }
    const limpio = c.cliente_nombre.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'Cliente';
    doc.save(`Cotización ${czNum(c.numero)} - ${limpio}.pdf`);
}

// ---------- Logo y datos de la empresa ----------
window.abrirDatosDocumentos = async function () {
    if (!czAdmin()) return alert('Solo un Dueño o Administrador puede cambiar los datos de la empresa.');
    await cargarDatosEmpresaDoc();
    let m = document.getElementById('modal-datos-doc');
    if (!m) {
        m = document.createElement('div'); m.id = 'modal-datos-doc';
        m.className = 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4';
        document.body.appendChild(m);
    }
    const d = CZ.datos, campo = (k, t, ph = '') => `<div><label class="block text-xs font-bold text-slate-500 mb-1">${t}</label><input id="dd-${k}" value="${czEsc(d[k] || '')}" placeholder="${ph}" maxlength="200" class="w-full px-3 py-2 border rounded-lg text-sm"></div>`;
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div class="flex justify-between items-start"><div><h3 class="text-lg font-black text-slate-800">Logo y datos de mi empresa</h3>
        <p class="text-xs text-slate-500">Aparecen en tus cotizaciones en PDF. Los PDF no llevan publicidad de Buddy.</p></div>
        <button onclick="document.getElementById('modal-datos-doc').remove()" class="text-slate-400 hover:text-slate-700 text-xl">✕</button></div>
        <div class="flex items-center gap-4"><div id="dd-logo-prev" class="w-32 h-16 border border-dashed rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">${d.logo ? `<img src="${d.logo}" class="max-h-full max-w-full">` : '<span class="text-xs text-slate-400">Sin logo</span>'}</div>
            <div class="space-y-1"><input type="file" id="dd-logo-file" accept="image/png,image/jpeg,image/webp" onchange="ddLeerLogo(this)" class="text-xs">
            <button onclick="ddQuitarLogo()" class="block text-xs text-red-600 font-bold">Quitar logo</button></div></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${campo('razon_social', 'Nombre o razón social')}${campo('rut', 'RUT')}${campo('giro', 'Giro o rubro')}${campo('direccion', 'Dirección')}
            ${campo('ciudad', 'Ciudad')}${campo('telefono', 'Teléfono')}${campo('correo', 'Correo')}${campo('sitio_web', 'Sitio web')}
            <div><label class="block text-xs font-bold text-slate-500 mb-1">IVA por defecto (%)</label><input id="dd-iva_pct" type="number" min="0" max="100" value="${d.iva_pct ?? 19}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Validez por defecto (días)</label><input id="dd-validez_dias" type="number" min="0" max="365" value="${d.validez_dias ?? 15}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Color del documento</label><input id="dd-color" type="color" value="${/^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#1e293b'}" class="h-10 w-20 border rounded"></div>
        </div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Condiciones comerciales por defecto</label><textarea id="dd-condiciones" rows="3" maxlength="4000" class="w-full px-3 py-2 border rounded-lg text-sm">${czEsc(d.condiciones || '')}</textarea></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Texto del pie de página (opcional)</label><input id="dd-pie" value="${czEsc(d.pie || '')}" maxlength="200" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div class="flex justify-end gap-2"><button onclick="document.getElementById('modal-datos-doc').remove()" class="px-4 py-2 border rounded-lg text-sm font-bold">Cancelar</button>
        <button onclick="ddGuardar()" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Guardar</button></div></div>`;
    window._ddLogo = d.logo || '';
};
function ddLeerLogo(inp) {
    const f = inp.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
        const max = 500, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        window._ddLogo = cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        document.getElementById('dd-logo-prev').innerHTML = `<img src="${window._ddLogo}" class="max-h-full max-w-full">`;
    };
    img.onerror = () => alert('No se pudo leer la imagen.');
    img.src = url;
}
function ddQuitarLogo() { window._ddLogo = ''; document.getElementById('dd-logo-prev').innerHTML = '<span class="text-xs text-slate-400">Sin logo</span>'; }
async function ddGuardar() {
    const g = (k) => document.getElementById('dd-' + k).value.trim();
    const datos = { logo: window._ddLogo || '', color: g('color'), iva_pct: parseFloat(g('iva_pct')) || 0, validez_dias: parseInt(g('validez_dias')) || 0 };
    ['razon_social', 'rut', 'giro', 'direccion', 'ciudad', 'telefono', 'correo', 'sitio_web', 'condiciones', 'pie'].forEach(k => datos[k] = g(k));
    const { error } = await clienteSupabase.rpc('guardar_datos_documentos', { p_id_empresa: window.miEmpresaId, p_datos: datos });
    if (error) return alert('No se pudo guardar: ' + error.message);
    CZ.datos = datos; document.getElementById('modal-datos-doc').remove();
    alert('Datos guardados.');
}
