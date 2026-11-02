// ==========================================================
// IMPORTAR VENTAS (CSV de Mercado Libre, Shopify, otro sistema o formato Buddy)
// Una sola herramienta, accesible desde Ventas e Inventario.
// El trabajo pesado (duplicados, stock, recetas, deshacer) lo hace la base de datos.
// ==========================================================

const IV_ORIGENES = ['Mercado Libre', 'Shopify', 'WooCommerce', 'Formato Buddy'];
const IV_OTRO = '__otro__';

const IV_CAMPOS = [
    { k: 'pedido',      t: 'Nº de pedido',      alias: ['pedido', 'order', 'orden', 'folio', 'nº', 'numero', 'número', 'number', 'name', 'id de venta', 'venta'] },
    { k: 'fecha',       t: 'Fecha',             alias: ['fecha', 'date', 'created', 'creado', 'creada'] },
    { k: 'cliente',     t: 'Cliente',           alias: ['cliente', 'customer', 'comprador', 'buyer', 'billing name', 'email'] },
    { k: 'metodo_pago', t: 'Método de pago',    alias: ['metodo', 'método', 'pago', 'payment'] },
    { k: 'producto',    t: 'Producto',          alias: ['producto', 'product', 'lineitem name', 'item', 'articulo', 'artículo', 'titulo', 'título', 'descripcion', 'descripción'] },
    { k: 'sku',         t: 'SKU / código',      alias: ['sku', 'codigo', 'código', 'code'] },
    { k: 'cantidad',    t: 'Cantidad',          alias: ['cantidad', 'quantity', 'qty', 'unidades'] },
    { k: 'precio',      t: 'Precio unitario',   alias: ['precio unit', 'precio', 'price', 'unit'] },
    { k: 'total_linea', t: 'Total de la línea', alias: ['total', 'subtotal', 'importe', 'amount'] }
];

let IV = null;   // estado de la importación en curso

const ivEsc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ivNorm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ivAdmin = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);

// ---------- Entrada ----------
window.cargarImportarVentas = async function () {
    IV = null;
    if (!ivAdmin()) {
        document.getElementById('iv-contenido').classList.add('hidden');
        document.getElementById('iv-sin-permiso').classList.remove('hidden');
        return;
    }
    const [{ data: sucs }, { data: emp }, { data: previos }] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('empresas').select('monedas').eq('id', window.miEmpresaId).maybeSingle(),
        clienteSupabase.from('importaciones_ventas').select('origen').eq('id_empresa', window.miEmpresaId)
    ]);
    document.getElementById('iv-sucursal').innerHTML = (sucs || []).map(s => `<option value="${s.id}">${ivEsc(s.nombre)}</option>`).join('');

    const propios = [...new Set((previos || []).map(p => p.origen))].filter(o => !IV_ORIGENES.includes(o));
    document.getElementById('iv-origen').innerHTML =
        [...IV_ORIGENES, ...propios].map(o => `<option value="${ivEsc(o)}">${ivEsc(o)}</option>`).join('') +
        `<option value="${IV_OTRO}">Otro sistema…</option>`;

    const monedas = (emp?.monedas && emp.monedas.length) ? emp.monedas : ['CLP'];
    document.getElementById('iv-moneda').innerHTML =
        monedas.map(m => `<option value="${ivEsc(m)}">${ivEsc(m)}</option>`).join('') + `<option value="${IV_OTRO}">Otra…</option>`;

    window.ivCargarHistorial();
}

window.ivCambioOrigen = function () {
    document.getElementById('iv-origen-otro').classList.toggle('hidden', document.getElementById('iv-origen').value !== IV_OTRO);
}
window.ivCambioMoneda = function () {
    document.getElementById('iv-moneda-otra').classList.toggle('hidden', document.getElementById('iv-moneda').value !== IV_OTRO);
}
function ivOrigenElegido() {
    const v = document.getElementById('iv-origen').value;
    return v === IV_OTRO ? document.getElementById('iv-origen-otro').value.trim() : v;
}
function ivMonedaElegida() {
    const v = document.getElementById('iv-moneda').value;
    return (v === IV_OTRO ? document.getElementById('iv-moneda-otra').value : v).trim().toUpperCase();
}

// ---------- Lectura del archivo ----------
async function ivTextoDelArchivo(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }          // UTF-8
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }               // Excel en español
}

window.ivLeerArchivo = async function () {
    const origen = ivOrigenElegido();
    if (!origen) return alert('Indica de qué sistema vienen las ventas.');
    if (!ivMonedaElegida()) return alert('Indica la moneda del archivo.');
    const file = document.getElementById('iv-archivo').files[0];
    if (!file) return alert('Selecciona un archivo CSV.');

    const texto = (await ivTextoDelArchivo(file)).replace(/^﻿/, '');
    const res = Papa.parse(texto, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
    const headers = res.meta.fields || [];
    if (headers.length < 2 || res.data.length === 0) return alert('No pude leer filas en ese archivo. Revisa que sea un CSV con encabezados.');
    if (res.data.length > 20000) return alert('El archivo tiene más de 20.000 filas. Divídelo en partes.');

    // Columnas: lo recordado para este origen, o propuesta automática
    let guardado = {};
    try {
        const { data } = await clienteSupabase.from('importacion_mapeos').select('mapeo').eq('id_empresa', window.miEmpresaId).eq('origen', origen).maybeSingle();
        guardado = data?.mapeo || {};
    } catch (e) { /* sin memoria */ }

    const mapeo = {};
    const usados = new Set();
    IV_CAMPOS.forEach(c => {
        if (guardado[c.k] && headers.includes(guardado[c.k])) { mapeo[c.k] = guardado[c.k]; usados.add(guardado[c.k]); }
    });
    IV_CAMPOS.forEach(c => {
        if (mapeo[c.k] !== undefined) return;
        const h = headers.find(h => !usados.has(h) && c.alias.some(a => ivNorm(h).includes(ivNorm(a))));
        if (h) { mapeo[c.k] = h; usados.add(h); }
    });

    IV = { origen, moneda: ivMonedaElegida(), sucursal: document.getElementById('iv-sucursal').value,
           archivo: file.name, headers, filas: res.data, mapeo, productos: [], pedidos: [] };
    ['iv-paso-productos', 'iv-paso-revision'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ivPintarColumnas();
    document.getElementById('iv-paso-columnas').classList.remove('hidden');
    document.getElementById('iv-paso-columnas').scrollIntoView({ behavior: 'smooth' });
}

function ivPintarColumnas() {
    document.getElementById('iv-columnas').innerHTML = IV_CAMPOS.map(c => `
        <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">${c.t}${(c.k === 'cantidad') ? ' *' : ''}</label>
            <select data-campo="${c.k}" onchange="ivCambioColumna(this)" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">
                <option value="">— no viene en el archivo —</option>
                ${IV.headers.map(h => `<option value="${ivEsc(h)}" ${IV.mapeo[c.k] === h ? 'selected' : ''}>${ivEsc(h)}</option>`).join('')}
            </select>
        </div>`).join('');
    ivActualizarAgrupacion();
}
window.ivCambioColumna = function (sel) {
    if (sel.value) IV.mapeo[sel.dataset.campo] = sel.value; else delete IV.mapeo[sel.dataset.campo];
    ivActualizarAgrupacion();
}

// ---------- Lectura de valores ----------
function ivNumero(s) {
    let t = String(s ?? '').trim().replace(/[^\d.,-]/g, '');
    if (!t || t === '-') return NaN;
    const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (coma >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    return parseFloat(t);
}
function ivFecha(s) {
    const t = String(s ?? '').trim();
    if (!t) return null;
    let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) {
        const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
        const d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
        return isNaN(d) ? null : d.toISOString();
    }
    const d = new Date(t);
    return isNaN(d) ? null : d.toISOString();
}
const ivVal = (fila, campo) => IV.mapeo[campo] ? String(fila[IV.mapeo[campo]] ?? '').trim() : '';

// ---------- Agrupar filas en pedidos ----------
function ivAgrupar() {
    const grupos = new Map();
    let ignoradas = 0, fechasMalas = 0;
    IV.filas.forEach((fila, i) => {
        const nombre = ivVal(fila, 'producto'), sku = ivVal(fila, 'sku');
        const cant = ivNumero(ivVal(fila, 'cantidad'));
        if ((!nombre && !sku) || !(cant > 0)) { ignoradas++; return; }
        let precio = ivNumero(ivVal(fila, 'precio'));
        if (!(precio >= 0)) { const tl = ivNumero(ivVal(fila, 'total_linea')); precio = tl >= 0 ? tl / cant : 0; }

        const pedido = ivVal(fila, 'pedido'), cliente = ivVal(fila, 'cliente'), pago = ivVal(fila, 'metodo_pago');
        const fechaIso = ivFecha(ivVal(fila, 'fecha'));
        if (IV.mapeo.fecha && !fechaIso) fechasMalas++;
        let clave;
        if (IV.mapeo.pedido && pedido) clave = 'p:' + pedido;
        else if (cliente && fechaIso) clave = `c:${fechaIso.slice(0, 16)}|${ivNorm(cliente)}|${ivNorm(pago)}`;
        else clave = 'f:' + i;

        if (!grupos.has(clave)) grupos.set(clave, { clave, id_externo: clave.startsWith('p:') ? pedido : '', fecha: fechaIso, cliente, metodo_pago: pago, lineas: [] });
        const g = grupos.get(clave);
        g.fecha = g.fecha || fechaIso; g.cliente = g.cliente || cliente; g.metodo_pago = g.metodo_pago || pago;   // Shopify: solo la 1ª fila trae estos datos
        g.lineas.push({ nombre, sku, cantidad: cant, precio });
    });
    const pedidos = [...grupos.values()];
    const modo = IV.mapeo.pedido ? 'pedido' : (IV.mapeo.cliente && IV.mapeo.fecha) ? 'cliente' : 'fila';
    return { pedidos, ignoradas, fechasMalas, modo };
}

function ivActualizarAgrupacion() {
    const el = document.getElementById('iv-agrupacion');
    if (!IV.mapeo.cantidad || (!IV.mapeo.producto && !IV.mapeo.sku)) {
        el.className = 'text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3';
        el.innerText = 'Falta indicar al menos la columna de Cantidad y la de Producto o SKU.';
        return;
    }
    const r = ivAgrupar();
    const como = r.modo === 'pedido' ? 'por número de pedido'
               : r.modo === 'cliente' ? 'por cliente, fecha y método de pago (el archivo no trae número de pedido)'
               : 'una venta por fila (el archivo no trae número de pedido ni cliente con fecha)';
    el.className = 'text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3';
    el.innerText = `${r.pedidos.length} pedidos a partir de ${IV.filas.length} filas, agrupados ${como}.` +
        (r.ignoradas ? ` ${r.ignoradas} filas sin producto o cantidad se omiten.` : '') +
        (r.fechasMalas ? ` ⚠️ ${r.fechasMalas} fechas no se pudieron leer (se usará la fecha de hoy).` : '');
}

// ---------- Paso 3: vincular productos ----------
window.ivAnalizar = async function () {
    if (!IV.mapeo.cantidad || (!IV.mapeo.producto && !IV.mapeo.sku)) return alert('Indica la columna de Cantidad y la de Producto o SKU.');
    const r = ivAgrupar();
    if (r.pedidos.length === 0) return alert('No encontré ventas válidas en el archivo.');
    IV.pedidos = r.pedidos; IV.ignoradas = r.ignoradas; IV.modo = r.modo;

    const [{ data: prods }, { data: homo }] = await Promise.all([
        clienteSupabase.from('productos').select('id, nombre, sku').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('homologacion_ventas').select('clave, id_producto').eq('id_empresa', window.miEmpresaId).eq('origen', IV.origen)
    ]);
    IV.catalogo = prods || [];
    const memoria = new Map((homo || []).map(h => [h.clave, h.id_producto]));
    const porSku = new Map(IV.catalogo.filter(p => p.sku).map(p => [ivNorm(p.sku), p]));
    const porNombre = new Map(IV.catalogo.map(p => [ivNorm(p.nombre), p]));

    // Productos distintos del archivo
    const mapa = new Map();
    IV.pedidos.forEach(p => p.lineas.forEach(l => {
        const clave = l.sku ? 'sku:' + ivNorm(l.sku) : 'nom:' + ivNorm(l.nombre);
        l.clave = clave;
        if (!mapa.has(clave)) mapa.set(clave, { clave, nombre: l.nombre, sku: l.sku, unidades: 0, id: null, estado: 'sin', ignorar: false, clave2: l.sku && l.nombre ? 'nom:' + ivNorm(l.nombre) : null });
        mapa.get(clave).unidades += l.cantidad;
    }));
    IV.productos = [...mapa.values()];

    IV.productos.forEach(pr => {
        const recordado = memoria.get(pr.clave) || (pr.clave2 && memoria.get(pr.clave2));
        if (recordado && IV.catalogo.some(c => c.id === recordado)) { pr.id = recordado; pr.estado = 'vinculado'; return; }
        const porCodigo = pr.sku && porSku.get(ivNorm(pr.sku));
        const porNom = porNombre.get(ivNorm(pr.nombre)) ||
            (ivNorm(pr.nombre).length >= 4 ? IV.catalogo.find(c => ivNorm(c.nombre).includes(ivNorm(pr.nombre)) || ivNorm(pr.nombre).includes(ivNorm(c.nombre))) : null);
        const sug = porCodigo || porNom;
        if (sug) { pr.id = sug.id; pr.estado = 'sugerido'; }
    });

    document.getElementById('iv-lista-productos').innerHTML = IV.catalogo.map(c => `<option value="${ivEsc(ivEtiqueta(c))}"></option>`).join('');
    ivPintarProductos();
    document.getElementById('iv-paso-productos').classList.remove('hidden');
    document.getElementById('iv-paso-revision').classList.add('hidden');
    document.getElementById('iv-paso-productos').scrollIntoView({ behavior: 'smooth' });
}

const ivEtiqueta = (c) => c.sku ? `${c.nombre} · ${c.sku}` : c.nombre;

function ivPintarProductos() {
    document.getElementById('iv-tabla-productos').innerHTML = IV.productos.map((pr, i) => {
        const cat = IV.catalogo.find(c => c.id === pr.id);
        const chip = pr.ignorar ? '<span class="text-slate-400 font-bold text-xs">ignorado</span>'
            : pr.estado === 'vinculado' ? '<span class="text-emerald-600 font-bold text-xs">✓ vinculado</span>'
            : pr.estado === 'sugerido' ? '<span class="text-amber-600 font-bold text-xs">sugerido</span>'
            : '<span class="text-red-500 font-bold text-xs">sin vincular</span>';
        const fondo = pr.ignorar ? 'opacity-50' : pr.estado === 'sin' ? 'bg-red-50' : '';
        return `<tr class="${fondo}">
            <td class="px-3 py-2"><div class="font-bold text-slate-800">${ivEsc(pr.nombre || '(sin nombre)')}</div><div class="text-xs text-slate-400">${pr.sku ? 'SKU ' + ivEsc(pr.sku) : ''}</div></td>
            <td class="px-3 py-2 text-center font-mono">${pr.unidades}</td>
            <td class="px-3 py-2"><div class="flex items-center gap-2">
                <input list="iv-lista-productos" value="${ivEsc(cat ? ivEtiqueta(cat) : '')}" ${pr.ignorar ? 'disabled' : ''} onchange="ivElegirProducto(${i}, this.value)"
                  placeholder="Buscar producto…" class="flex-1 px-3 py-2 border rounded-lg text-sm bg-white">${chip}</div></td>
            <td class="px-3 py-2 text-center"><input type="checkbox" ${pr.ignorar ? 'checked' : ''} onchange="ivIgnorar(${i}, this.checked)" class="w-4 h-4"></td>
        </tr>`;
    }).join('');
}
window.ivElegirProducto = function (i, texto) {
    const c = IV.catalogo.find(c => ivEtiqueta(c) === texto) || IV.catalogo.find(c => ivNorm(c.nombre) === ivNorm(texto));
    const pr = IV.productos[i];
    if (c) { pr.id = c.id; pr.estado = 'vinculado'; } else { pr.id = null; pr.estado = 'sin'; }
    ivPintarProductos();
}
window.ivIgnorar = function (i, v) { IV.productos[i].ignorar = v; ivPintarProductos(); }
window.ivConfirmarSugeridos = function () {
    IV.productos.forEach(p => { if (p.estado === 'sugerido') p.estado = 'vinculado'; });
    ivPintarProductos();
}

// ---------- Paso 4: revisar ----------
function ivPedidosFinales() {
    const estado = new Map(IV.productos.map(p => [p.clave, p]));
    const salida = [];
    IV.pedidos.forEach(ped => {
        const items = ped.lineas.filter(l => { const p = estado.get(l.clave); return p && !p.ignorar && p.id; })
            .map(l => ({ id_producto: estado.get(l.clave).id, cantidad: l.cantidad, precio_unitario: l.precio }));
        if (items.length === 0) return;
        const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
        const huella = ped.id_externo ? '' :
            [ped.fecha || '', ivNorm(ped.cliente), ivNorm(ped.metodo_pago), total,
             items.map(it => `${it.id_producto}:${it.cantidad}:${it.precio_unitario}`).sort().join(',')].join('|');
        salida.push({ id_externo: ped.id_externo, huella, fecha: ped.fecha, cliente: ped.cliente, metodo_pago: ped.metodo_pago, items, _total: total });
    });
    return salida;
}

window.ivIrARevision = function () {
    const sinVincular = IV.productos.filter(p => !p.ignorar && p.estado === 'sin').length;
    const sugeridos = IV.productos.filter(p => !p.ignorar && p.estado === 'sugerido').length;
    if (sinVincular) return alert(`Faltan ${sinVincular} producto(s) por vincular. Vincúlalos o márcalos como "Ignorar".`);
    if (sugeridos) return alert(`Confirma los ${sugeridos} producto(s) sugeridos (botón "Confirmar todos los sugeridos") o corrígelos.`);

    const finales = ivPedidosFinales();
    if (finales.length === 0) return alert('No quedó ninguna venta para importar (todo está ignorado).');
    IV.finales = finales;
    const total = finales.reduce((s, p) => s + p._total, 0);
    const fechas = finales.map(p => p.fecha).filter(Boolean).sort();
    const rango = fechas.length ? `${new Date(fechas[0]).toLocaleDateString('es-CL')} – ${new Date(fechas[fechas.length - 1]).toLocaleDateString('es-CL')}` : 'sin fechas';
    const tarjeta = (t, v) => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3"><div class="text-[10px] uppercase font-bold text-slate-400">${t}</div><div class="text-lg font-black text-slate-800">${v}</div></div>`;
    document.getElementById('iv-resumen').innerHTML =
        tarjeta('Ventas a importar', finales.length) + tarjeta('Total', `${IV.moneda} ${Math.round(total * 100) / 100 === Math.round(total) ? Math.round(total).toLocaleString('es-CL') : total.toFixed(2)}`) +
        tarjeta('Período', rango) + tarjeta('Origen', ivEsc(IV.origen));
    const avisos = [];
    if (IV.modo === 'fila') avisos.push('⚠️ El archivo no trae número de pedido: cada fila se importa como una venta. Si lo subes otra vez, Buddy detecta las repetidas por fecha, cliente y productos.');
    if (IV.modo === 'cliente') avisos.push('ℹ️ Sin número de pedido: agrupé por cliente, fecha y método de pago. Dos compras idénticas del mismo cliente en el mismo minuto se leerían como una sola.');
    if (IV.ignoradas) avisos.push(`ℹ️ ${IV.ignoradas} filas sin producto o cantidad no se importan.`);
    document.getElementById('iv-avisos').innerHTML = avisos.map(a => `<p class="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">${a}</p>`).join('');
    document.getElementById('iv-paso-revision').classList.remove('hidden');
    document.getElementById('iv-paso-revision').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Importar ----------
window.ivImportar = async function () {
    if (!IV || !IV.finales) return;
    const descontar = document.getElementById('iv-descontar').checked;
    if (!confirm(`¿Importar ${IV.finales.length} ventas de ${IV.origen}?` + (descontar ? '\n\nTambién se descontará el inventario.' : '\n\nNo se tocará el inventario.'))) return;

    const btn = document.getElementById('iv-btn-importar'), prog = document.getElementById('iv-progreso');
    btn.disabled = true;
    try {
        const { data: idImp, error: e1 } = await clienteSupabase.rpc('crear_importacion', {
            p_id_empresa: window.miEmpresaId, p_id_sucursal: IV.sucursal, p_origen: IV.origen,
            p_archivo: IV.archivo, p_moneda: IV.moneda, p_descontar: descontar, p_filas: IV.filas.length });
        if (e1) throw e1;

        let importadas = 0, duplicadas = 0; const faltantes = new Map();
        const LOTE = 200;
        for (let i = 0; i < IV.finales.length; i += LOTE) {
            prog.innerText = `Importando… ${Math.min(i + LOTE, IV.finales.length)} de ${IV.finales.length}`;
            const lote = IV.finales.slice(i, i + LOTE).map(({ _total, ...resto }) => resto);
            const { data, error } = await clienteSupabase.rpc('importar_ventas', { p_id_importacion: idImp, p_ventas: lote });
            if (error) throw new Error(`${error.message}\n\nSe importaron ${importadas} ventas antes del error. Puedes deshacer esta importación desde el historial y volver a intentar.`);
            importadas += data.importadas; duplicadas += data.duplicadas;
            (data.sin_stock || []).forEach(s => faltantes.set(s.producto, (faltantes.get(s.producto) || 0) + Number(s.cantidad_ua)));
        }

        // Recordar columnas y vínculos para la próxima vez
        await clienteSupabase.from('importacion_mapeos').upsert({ id_empresa: window.miEmpresaId, origen: IV.origen, mapeo: IV.mapeo });
        const filasHomo = [];
        IV.productos.filter(p => !p.ignorar && p.id).forEach(p => {
            filasHomo.push({ id_empresa: window.miEmpresaId, origen: IV.origen, clave: p.clave, id_producto: p.id });
            if (p.clave2) filasHomo.push({ id_empresa: window.miEmpresaId, origen: IV.origen, clave: p.clave2, id_producto: p.id });
        });
        if (filasHomo.length) await clienteSupabase.from('homologacion_ventas').upsert(filasHomo);

        prog.innerText = '';
        let msg = `✅ Importación lista.\n\n• Ventas importadas: ${importadas}\n• Repetidas (omitidas): ${duplicadas}`;
        if (faltantes.size) msg += `\n\n⚠️ Se vendió sin stock suficiente de: ${[...faltantes.keys()].join(', ')}.\nQuedó como deuda de stock hasta que ingrese mercadería.`;
        alert(msg);
        ['iv-paso-columnas', 'iv-paso-productos', 'iv-paso-revision'].forEach(id => document.getElementById(id).classList.add('hidden'));
        document.getElementById('iv-archivo').value = '';
        document.getElementById('iv-descontar').checked = false;
        IV = null;
        window.ivCargarHistorial();
    } catch (e) {
        console.error(e);
        prog.innerText = '';
        alert('❌ No se pudo completar la importación.\n\n' + (e.message || ''));
        window.ivCargarHistorial();
    } finally {
        btn.disabled = false;
    }
}

// ---------- Historial y deshacer ----------
window.ivCargarHistorial = async function () {
    const tb = document.getElementById('iv-historial');
    if (!tb) return;
    const { data } = await clienteSupabase.from('importaciones_ventas').select('*').eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: false }).limit(50);
    if (!data || data.length === 0) { tb.innerHTML = '<tr><td colspan="8" class="px-3 py-4 text-center text-slate-400 italic">Aún no has importado ventas.</td></tr>'; return; }
    tb.innerHTML = data.map(i => `<tr>
        <td class="px-3 py-2 whitespace-nowrap">${new Date(i.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td class="px-3 py-2 font-bold">${ivEsc(i.origen)}</td>
        <td class="px-3 py-2 text-slate-500">${ivEsc(i.archivo || '')}</td>
        <td class="px-3 py-2 text-center">${i.ventas_importadas}</td>
        <td class="px-3 py-2 text-center">${i.duplicadas}</td>
        <td class="px-3 py-2 text-center">${i.descontar_stock ? 'Descontado' : '—'}</td>
        <td class="px-3 py-2 text-center">${i.estado === 'activa' ? '<span class="text-emerald-600 font-bold">Activa</span>' : '<span class="text-slate-400 font-bold">Deshecha</span>'}</td>
        <td class="px-3 py-2 text-right">${i.estado === 'activa' ? `<button onclick="ivDeshacer('${i.id}')" class="text-red-600 font-bold text-xs hover:underline">Deshacer</button>` : ''}</td>
    </tr>`).join('');
}
window.ivDeshacer = async function (id) {
    if (!confirm('¿Deshacer esta importación?\n\nSe borrarán las ventas que trajo y, si descontó inventario, el stock vuelve a su lugar.')) return;
    const { data, error } = await clienteSupabase.rpc('revertir_importacion', { p_id_importacion: id });
    if (error) return alert('❌ No se pudo deshacer: ' + error.message);
    alert(`✅ Importación deshecha. Ventas eliminadas: ${data.ventas_borradas}.`);
    window.ivCargarHistorial();
}

// ---------- Plantilla y descarga ----------
function ivDescargar(nombre, filas) {
    const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
}
window.ivDescargarPlantilla = function () {
    ivDescargar('plantilla_importar_ventas.csv', [
        ['pedido', 'fecha', 'cliente', 'producto', 'sku', 'cantidad', 'precio_unitario', 'metodo_pago'],
        ['1001', '2026-11-02 14:30', 'Ana Pérez', 'Hamburguesa clásica', 'HAM-001', 2, 5500, 'Tarjeta'],
        ['1001', '2026-11-02 14:30', 'Ana Pérez', 'Bebida 350cc', 'BEB-010', 2, 1500, 'Tarjeta'],
        ['1002', '2026-11-02 15:10', 'Luis Soto', 'Hamburguesa clásica', 'HAM-001', 1, 5500, 'Efectivo']
    ]);
}
window.ivDescargarMisVentas = async function () {
    const { data, error } = await clienteSupabase.from('ventas')
        .select('numero_ticket, id_externo, created_at, metodo_pago, origen, moneda, clientes(nombre), sucursales(nombre), ventas_detalles(cantidad, precio_unitario, productos(nombre, sku))')
        .eq('id_empresa', window.miEmpresaId).order('created_at', { ascending: false }).limit(5000);
    if (error) return alert('❌ No se pudieron descargar las ventas: ' + error.message);
    const filas = [['pedido', 'ticket_buddy', 'fecha', 'cliente', 'producto', 'sku', 'cantidad', 'precio_unitario', 'metodo_pago', 'origen', 'moneda', 'sucursal']];
    (data || []).forEach(v => (v.ventas_detalles || []).forEach(d => filas.push([
        v.id_externo || '', v.numero_ticket || '', v.created_at, v.clientes?.nombre || '', d.productos?.nombre || '', d.productos?.sku || '',
        d.cantidad, d.precio_unitario, v.metodo_pago || '', v.origen || '', v.moneda || '', v.sucursales?.nombre || ''])));
    ivDescargar('mis_ventas.csv', filas);
}
