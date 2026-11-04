// ==========================================================
// AGENDA DE TRABAJO: pedidos, reservas e instalaciones
// ==========================================================
const AG = { lista: [], saldos: {}, vista: 'lista', mes: new Date(), sucursales: [], clientes: [], productos: [], metodos: [], monedas: ['CLP'], items: [], clienteId: null };
const agEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agDec = (m) => ['CLP', 'COP', 'PYG', 'JPY'].includes(m) ? 0 : 2;
const agFmt = (n, m) => (m || 'CLP') + ' ' + Number(n || 0).toLocaleString('es-CL', { minimumFractionDigits: agDec(m), maximumFractionDigits: agDec(m) });
const AG_TIPO = { pedido: ['📦', 'Pedido'], reserva: ['🗓️', 'Reserva'], instalacion: ['🛠️', 'Instalación'] };
const AG_ESTADOS = { pendiente: 'Pendiente', confirmado: 'Confirmado', en_curso: 'En curso', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };
const AG_COLOR = { pendiente: 'bg-slate-100 text-slate-600', confirmado: 'bg-blue-100 text-blue-700', en_curso: 'bg-amber-100 text-amber-700', listo: 'bg-emerald-100 text-emerald-700', entregado: 'bg-purple-100 text-purple-700', cancelado: 'bg-red-100 text-red-700' };
const agNum = (n) => String(n).padStart(4, '0');
const agFechaHora = (d) => new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const agParaInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

async function agBase() {
    const [su, cl, pr, mp, em] = await Promise.all([
        clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('clientes').select('id, nombre, telefono, direccion').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('productos').select('id, nombre, precio_venta_iva').eq('id_empresa', window.miEmpresaId).order('nombre'),
        clienteSupabase.from('metodos_pago').select('id, nombre, tipo, activo').eq('id_empresa', window.miEmpresaId),
        clienteSupabase.from('empresas').select('monedas').eq('id', window.miEmpresaId).maybeSingle()
    ]);
    AG.sucursales = su.data || []; AG.clientes = cl.data || []; AG.productos = pr.data || [];
    AG.metodos = (mp.data || []).filter(m => m.activo !== false && String(m.tipo || '').toUpperCase() !== 'CREDITO');
    AG.monedas = (em.data && em.data.monedas && em.data.monedas.length) ? em.data.monedas : ['CLP'];
}

window.cargarAgenda = async function () {
    await agBase();
    const { data } = await clienteSupabase.from('agenda_trabajos').select('*').eq('id_empresa', window.miEmpresaId).order('fecha_inicio', { ascending: true });
    AG.lista = data || [];
    const ids = AG.lista.map(a => a.id_cuenta).filter(Boolean);
    AG.saldos = {};
    if (ids.length) {
        const { data: cu } = await clienteSupabase.from('cuentas_por_cobrar').select('id, monto_deuda, monto_pagado').in('id', ids);
        (cu || []).forEach(c => AG.saldos[c.id] = Number(c.monto_deuda) - Number(c.monto_pagado));
    }
    agVista(AG.vista);
};

function agFiltrada() {
    const q = (document.getElementById('ag-buscar').value || '').toLowerCase().trim();
    const t = document.getElementById('ag-f-tipo').value, e = document.getElementById('ag-f-estado').value;
    return AG.lista.filter(a => {
        if (t && a.tipo !== t) return false;
        if (e === 'activos' && ['entregado', 'cancelado'].includes(a.estado)) return false;
        if (e && e !== 'activos' && a.estado !== e) return false;
        return !q || `${agNum(a.numero)} ${a.cliente_nombre} ${a.titulo || ''}`.toLowerCase().includes(q);
    });
}
function agVista(v) {
    AG.vista = v;
    document.getElementById('ag-lista').classList.toggle('hidden', v !== 'lista');
    document.getElementById('ag-cal').classList.toggle('hidden', v !== 'cal');
    document.getElementById('ag-v-lista').className = 'px-4 py-2 ' + (v === 'lista' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600');
    document.getElementById('ag-v-cal').className = 'px-4 py-2 ' + (v === 'cal' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600');
    agPintar();
}
function agMes(d) { AG.mes = new Date(AG.mes.getFullYear(), AG.mes.getMonth() + d, 1); agPintar(); }

function agPintar() {
    const filas = agFiltrada();
    document.getElementById('ag-tabla').innerHTML = filas.map(a => `<tr class="hover:bg-slate-50 cursor-pointer" onclick="agAbrir('${a.id}')">
        <td class="px-3 py-2 whitespace-nowrap">${agFechaHora(a.fecha_inicio)}</td><td class="px-3 py-2">${AG_TIPO[a.tipo][0]} ${AG_TIPO[a.tipo][1]}</td>
        <td class="px-3 py-2 font-black">${agNum(a.numero)}</td><td class="px-3 py-2">${agEsc(a.cliente_nombre)}</td><td class="px-3 py-2 text-slate-500">${agEsc(a.titulo || '')}</td>
        <td class="px-3 py-2 text-right">${agFmt(a.total, a.moneda)}</td><td class="px-3 py-2 text-right font-bold">${a.estado === 'cancelado' ? '—' : agFmt(AG.saldos[a.id_cuenta] ?? 0, a.moneda)}</td>
        <td class="px-3 py-2 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${AG_COLOR[a.estado]}">${AG_ESTADOS[a.estado]}</span></td></tr>`).join('');
    document.getElementById('ag-vacio').classList.toggle('hidden', filas.length > 0);
    if (AG.vista === 'cal') agPintarCalendario(filas);
}

function agPintarCalendario(filas) {
    const y = AG.mes.getFullYear(), m = AG.mes.getMonth();
    document.getElementById('ag-mes-titulo').innerText = AG.mes.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    const primero = new Date(y, m, 1), offset = (primero.getDay() + 6) % 7, dias = new Date(y, m + 1, 0).getDate();
    const porDia = {};
    filas.forEach(a => { const d = new Date(a.fecha_inicio); if (d.getFullYear() === y && d.getMonth() === m) (porDia[d.getDate()] ||= []).push(a); });
    let html = ''; for (let i = 0; i < offset; i++) html += '<div></div>';
    const hoy = new Date();
    for (let d = 1; d <= dias; d++) {
        const es = hoy.getFullYear() === y && hoy.getMonth() === m && hoy.getDate() === d;
        html += `<div class="min-h-[84px] border rounded-lg p-1 ${es ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}"><p class="text-xs font-bold text-slate-400">${d}</p>` +
            (porDia[d] || []).slice(0, 3).map(a => `<button onclick="agAbrir('${a.id}')" class="block w-full text-left truncate text-[11px] font-bold rounded px-1 mb-0.5 ${AG_COLOR[a.estado]}">${new Date(a.fecha_inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} ${agEsc(a.cliente_nombre)}</button>`).join('') +
            ((porDia[d] || []).length > 3 ? `<p class="text-[10px] text-slate-400">+${porDia[d].length - 3} más</p>` : '') + '</div>';
    }
    document.getElementById('ag-grid').innerHTML = html;
}

// ---------- Modal ----------
function agModal(html, ancho) {
    let m = document.getElementById('modal-agenda');
    if (!m) { m = document.createElement('div'); m.id = 'modal-agenda'; m.className = 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4'; document.body.appendChild(m); }
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-xl w-full ${ancho || 'max-w-2xl'} max-h-[92vh] overflow-y-auto p-6 space-y-4">${html}</div>`;
}
const agCerrar = () => document.getElementById('modal-agenda')?.remove();

// ---------- Detalle ----------
async function agAbrir(id) {
    const a = AG.lista.find(x => x.id === id); if (!a) return;
    const { data: its } = await clienteSupabase.from('agenda_items').select('*').eq('id_agenda', id).order('orden');
    const saldo = AG.saldos[a.id_cuenta] ?? 0, cerrado = ['entregado', 'cancelado'].includes(a.estado);
    const orden = ['pendiente', 'confirmado', 'en_curso', 'listo', 'entregado'], idx = orden.indexOf(a.estado);
    const siguiente = idx >= 0 && idx < orden.length - 1 ? orden[idx + 1] : null;
    agModal(`<div class="flex justify-between items-start"><div><p class="text-xs font-bold text-slate-400 uppercase">${AG_TIPO[a.tipo][0]} ${AG_TIPO[a.tipo][1]} N° ${agNum(a.numero)}</p>
        <h3 class="text-xl font-black text-slate-800">${agEsc(a.cliente_nombre)}</h3><p class="text-sm text-slate-500">${agEsc(a.titulo || '')}</p></div>
        <div class="flex items-center gap-2"><span class="px-2 py-1 rounded-full text-xs font-bold ${AG_COLOR[a.estado]}">${AG_ESTADOS[a.estado]}</span><button onclick="agCerrar()" class="text-slate-400 text-xl">✕</button></div></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm"><p>📅 <b>${agFechaHora(a.fecha_inicio)}</b>${a.fecha_fin ? ' → ' + agFechaHora(a.fecha_fin) : ''}</p>
            <p>📍 ${agEsc(a.direccion_trabajo || '—')}</p><p>👤 Responsable: ${agEsc(a.responsable || '—')}</p><p>📞 ${agEsc(a.cliente_telefono || '—')}</p></div>
        ${a.notas ? `<p class="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">${agEsc(a.notas)}</p>` : ''}
        <table class="min-w-full text-sm"><tbody class="divide-y">${(its || []).map(i => `<tr><td class="py-1.5">${agEsc(i.descripcion)}</td><td class="py-1.5 text-right text-slate-500">${Number(i.cantidad)} × ${agFmt(i.precio_unitario, a.moneda)}</td><td class="py-1.5 text-right font-bold">${agFmt(i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100), a.moneda)}</td></tr>`).join('')}</tbody></table>
        <div class="grid grid-cols-2 gap-2 text-center text-sm"><div class="bg-slate-50 rounded-lg p-2"><p class="text-xs text-slate-500">Total</p><p class="font-black">${agFmt(a.total, a.moneda)}</p></div>
            <div class="${a.estado === 'cancelado' ? 'bg-slate-50' : saldo > 0 ? 'bg-orange-50' : 'bg-emerald-50'} rounded-lg p-2"><p class="text-xs text-slate-500">Saldo por cobrar</p><p class="font-black">${a.estado === 'cancelado' ? '—' : agFmt(saldo, a.moneda)}</p></div></div>
        <div class="flex flex-wrap gap-2">
            ${!cerrado && siguiente ? `<button onclick="agEstado('${a.id}','${siguiente}')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Pasar a “${AG_ESTADOS[siguiente]}”</button>` : ''}
            ${!cerrado ? `<button onclick="agEditar('${a.id}')" class="px-4 py-2 border rounded-lg text-sm font-bold">Editar fecha y datos</button>` : ''}
            ${a.estado !== 'cancelado' && saldo > 0 ? `<button onclick="agCerrar(); window.cbTabInicial='cobrar'; cambiarVista('cuentas_cobrar')" class="px-4 py-2 border rounded-lg text-sm font-bold text-orange-700">💸 Ir a cobrar</button>` : ''}
            ${!cerrado ? `<button onclick="agCancelar('${a.id}')" class="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold ml-auto">Cancelar trabajo</button>` : ''}
        </div>
        ${!cerrado ? '<p class="text-[11px] text-slate-400">Para cambiar los productos o montos, cancela este trabajo (el stock se devuelve) y crea uno nuevo.</p>' : ''}`);
}
async function agEstado(id, estado) {
    const { error } = await clienteSupabase.rpc('cambiar_estado_agenda', { p_id: id, p_estado: estado });
    if (error) return alert(error.message);
    agCerrar(); await window.cargarAgenda();
}
async function agCancelar(id) {
    if (!confirm('¿Cancelar este trabajo?\n\nSe devuelve el stock reservado y la deuda pendiente queda anulada. Si el cliente ya dio un anticipo, devolverlo es un trámite aparte.')) return;
    const { data, error } = await clienteSupabase.rpc('cambiar_estado_agenda', { p_id: id, p_estado: 'cancelado' });
    if (error) return alert(error.message);
    if (data && Number(data.abonado_a_devolver) > 0) alert(`Recuerda: el cliente había abonado ${Number(data.abonado_a_devolver).toLocaleString('es-CL')}. Devolverlo queda de tu lado.`);
    agCerrar(); await window.cargarAgenda();
}
function agEditar(id) {
    const a = AG.lista.find(x => x.id === id); if (!a) return;
    agModal(`<div class="flex justify-between"><h3 class="text-lg font-black">Editar ${AG_TIPO[a.tipo][1].toLowerCase()} N° ${agNum(a.numero)}</h3><button onclick="agCerrar()" class="text-slate-400 text-xl">✕</button></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 mb-1">Título</label><input id="ae-titulo" maxlength="200" value="${agEsc(a.titulo || '')}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Inicio</label><input id="ae-inicio" type="datetime-local" value="${agParaInput(a.fecha_inicio)}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Término (opcional)</label><input id="ae-fin" type="datetime-local" value="${a.fecha_fin ? agParaInput(a.fecha_fin) : ''}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Dirección del trabajo</label><input id="ae-dir" maxlength="240" value="${agEsc(a.direccion_trabajo || '')}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Responsable</label><input id="ae-resp" maxlength="80" value="${agEsc(a.responsable || '')}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Teléfono</label><input id="ae-tel" maxlength="40" value="${agEsc(a.cliente_telefono || '')}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 mb-1">Notas</label><textarea id="ae-notas" rows="3" maxlength="4000" class="w-full px-3 py-2 border rounded-lg text-sm">${agEsc(a.notas || '')}</textarea></div></div>
        <button onclick="agGuardarEdicion('${a.id}')" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm">Guardar</button>`);
}
async function agGuardarEdicion(id) {
    const v = (k) => document.getElementById('ae-' + k).value;
    const ini = v('inicio'); if (!ini) return alert('Indica la fecha de inicio.');
    const { error } = await clienteSupabase.rpc('actualizar_agenda', { p_id: id, p_datos: { titulo: v('titulo'), fecha_inicio: new Date(ini).toISOString(),
        fecha_fin: v('fin') ? new Date(v('fin')).toISOString() : null, direccion_trabajo: v('dir'), responsable: v('resp'), cliente_telefono: v('tel'), notas: v('notas') } });
    if (error) return alert(error.message);
    agCerrar(); await window.cargarAgenda();
}

// ---------- Nuevo ----------
function agNuevo() {
    AG.items = [{ id_producto: null, descripcion: '', cantidad: 1, precio: 0, dto: 0 }]; AG.clienteId = null;
    const ahora = new Date(); ahora.setMinutes(0, 0, 0); ahora.setHours(ahora.getHours() + 24);
    agModal(`<div class="flex justify-between"><h3 class="text-lg font-black text-slate-800">Nuevo trabajo</h3><button onclick="agCerrar()" class="text-slate-400 text-xl">✕</button></div>
        <datalist id="ag-dl-clientes">${AG.clientes.map(c => `<option value="${agEsc(c.nombre)}"></option>`).join('')}</datalist>
        <datalist id="ag-dl-productos">${AG.productos.map(p => `<option value="${agEsc(p.nombre)}"></option>`).join('')}</datalist>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Tipo</label><select id="an-tipo" class="w-full px-3 py-2 border rounded-lg bg-white text-sm"><option value="pedido">📦 Pedido</option><option value="reserva">🗓️ Reserva</option><option value="instalacion">🛠️ Instalación</option></select></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Sucursal</label><select id="an-sucursal" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${AG.sucursales.map(s => `<option value="${s.id}">${agEsc(s.nombre)}</option>`).join('')}</select></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Moneda</label><select id="an-moneda" onchange="agRecalcular()" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${AG.monedas.map(m => `<option>${m}</option>`).join('')}</select></div>
            <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 mb-1">Cliente *</label><input id="an-cliente" list="ag-dl-clientes" oninput="agElegirCliente()" maxlength="160" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Busca o escribe uno nuevo"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Teléfono</label><input id="an-tel" maxlength="40" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div class="md:col-span-3"><label class="block text-xs font-bold text-slate-500 mb-1">Título</label><input id="an-titulo" maxlength="200" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Torta de cumpleaños, instalación de cortinas"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Fecha y hora *</label><input id="an-inicio" type="datetime-local" value="${agParaInput(ahora)}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Término (opcional)</label><input id="an-fin" type="datetime-local" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Responsable</label><input id="an-resp" maxlength="80" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div class="md:col-span-3"><label class="block text-xs font-bold text-slate-500 mb-1">Dirección del trabajo</label><input id="an-dir" maxlength="240" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        </div>
        <div><div class="flex justify-between items-center mb-1"><p class="text-xs font-bold text-slate-500 uppercase">Detalle (el stock de los productos se reserva al guardar)</p><button onclick="agAddItem()" class="text-sm font-bold text-blue-600">+ Línea</button></div>
            <div id="an-items" class="space-y-2"></div></div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Descuento global %</label><input id="an-dto" type="number" min="0" max="100" value="0" oninput="agRecalcular()" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Anticipo (opcional)</label><input id="an-anticipo" type="number" min="0" step="any" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 mb-1">Forma de pago del anticipo</label><select id="an-metodo" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${AG.metodos.map(m => `<option value="${m.id}">${agEsc(m.nombre)}</option>`).join('')}</select></div>
        </div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Notas</label><textarea id="an-notas" rows="2" maxlength="4000" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea></div>
        <div class="flex justify-between items-center"><p class="text-lg font-black">Total: <span id="an-total">—</span></p><button onclick="agCrear()" class="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700">Crear</button></div>`, 'max-w-3xl');
    agPintarItems();
}
function agElegirCliente() {
    const c = AG.clientes.find(x => x.nombre === document.getElementById('an-cliente').value);
    AG.clienteId = c ? c.id : null;
    if (c) { if (c.telefono) document.getElementById('an-tel').value = c.telefono; if (c.direccion && !document.getElementById('an-dir').value) document.getElementById('an-dir').value = c.direccion; }
}
function agAddItem() { AG.items.push({ id_producto: null, descripcion: '', cantidad: 1, precio: 0, dto: 0 }); agPintarItems(); }
function agQuitar(i) { AG.items.splice(i, 1); if (!AG.items.length) AG.items.push({ id_producto: null, descripcion: '', cantidad: 1, precio: 0, dto: 0 }); agPintarItems(); }
function agCambioItem(i, k, el) {
    const it = AG.items[i];
    if (k === 'descripcion') {
        it.descripcion = el.value; const p = AG.productos.find(x => x.nombre === el.value);
        it.id_producto = p ? p.id : null; if (p) { it.precio = Number(p.precio_venta_iva || 0); agPintarItems(); }
    } else it[k] = parseFloat(el.value) || 0;
    agRecalcular();
}
function agPintarItems() {
    document.getElementById('an-items').innerHTML = AG.items.map((it, i) => `<div class="grid grid-cols-12 gap-2 items-center">
        <input list="ag-dl-productos" value="${agEsc(it.descripcion)}" maxlength="300" onchange="agCambioItem(${i},'descripcion',this)" oninput="AG.items[${i}].descripcion=this.value" placeholder="Producto o descripción" class="col-span-12 md:col-span-5 px-2 py-2 border rounded-lg text-sm">
        <input type="number" min="0" step="any" value="${it.cantidad}" oninput="agCambioItem(${i},'cantidad',this)" class="col-span-3 md:col-span-2 px-2 py-2 border rounded-lg text-sm text-right" title="Cantidad">
        <input type="number" min="0" step="any" value="${it.precio}" oninput="agCambioItem(${i},'precio',this)" class="col-span-4 md:col-span-3 px-2 py-2 border rounded-lg text-sm text-right" title="Precio">
        <input type="number" min="0" max="100" step="any" value="${it.dto}" oninput="agCambioItem(${i},'dto',this)" class="col-span-3 md:col-span-1 px-2 py-2 border rounded-lg text-sm text-right" title="Dto %">
        <button onclick="agQuitar(${i})" class="col-span-2 md:col-span-1 text-slate-400 hover:text-red-600">✕</button></div>`).join('');
    agRecalcular();
}
function agTotal() {
    const m = document.getElementById('an-moneda').value, f = Math.pow(10, agDec(m));
    const sub = AG.items.reduce((s, it) => s + it.cantidad * it.precio * (1 - (it.dto || 0) / 100), 0);
    return { m, total: Math.round(sub * (1 - (parseFloat(document.getElementById('an-dto').value) || 0) / 100) * f) / f };
}
function agRecalcular() { const t = agTotal(); const e = document.getElementById('an-total'); if (e) e.innerText = agFmt(t.total, t.m); }

async function agCrear() {
    const v = (k) => document.getElementById('an-' + k).value.trim();
    if (!v('cliente')) return alert('Indica el cliente.');
    if (!v('inicio')) return alert('Indica la fecha y hora.');
    const items = AG.items.filter(i => i.descripcion.trim());
    if (!items.length) return alert('Agrega al menos una línea.');
    if (items.some(i => !(i.cantidad > 0))) return alert('Todas las líneas deben tener cantidad mayor que cero.');
    const antic = parseFloat(v('anticipo')) || 0;
    if (antic > 0 && !v('metodo')) return alert('Elige la forma de pago del anticipo (créalas en Parámetros).');
    if (antic > agTotal().total) return alert('El anticipo no puede superar el total.');
    const { data, error } = await clienteSupabase.rpc('crear_agenda', { p_id_empresa: window.miEmpresaId,
        p_datos: { id_sucursal: v('sucursal'), tipo: v('tipo'), id_cliente: AG.clienteId, cliente_nombre: v('cliente'), cliente_telefono: v('tel'), titulo: v('titulo'),
            fecha_inicio: new Date(v('inicio')).toISOString(), fecha_fin: v('fin') ? new Date(v('fin')).toISOString() : null, direccion_trabajo: v('dir'), responsable: v('resp'),
            notas: v('notas'), moneda: v('moneda'), descuento_pct: parseFloat(v('dto')) || 0, impuesto_pct: 0 },
        p_items: items.map(i => ({ id_producto: i.id_producto, descripcion: i.descripcion.trim(), cantidad: i.cantidad, precio_unitario: i.precio, descuento_pct: i.dto || 0 })),
        p_anticipo: antic > 0 ? { monto: antic, id_metodo_pago: v('metodo') } : null, p_id_cotizacion: null });
    if (error) return alert('No se pudo crear: ' + error.message);
    agCerrar(); await window.cargarAgenda();
}

// ---------- Desde una cotización aceptada ----------
window.agDesdeCotizacion = async function (idCot) {
    await agBase();
    const ahora = new Date(); ahora.setMinutes(0, 0, 0); ahora.setHours(ahora.getHours() + 24);
    agModal(`<div class="flex justify-between"><h3 class="text-lg font-black">Pasar la cotización a la agenda</h3><button onclick="agCerrar()" class="text-slate-400 text-xl">✕</button></div>
        <p class="text-xs text-slate-500">Se copian cliente, ítems y totales. Los productos reservan stock y el saldo queda por cobrar.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Tipo</label><select id="ac-tipo" class="w-full px-3 py-2 border rounded-lg bg-white text-sm"><option value="pedido">📦 Pedido</option><option value="reserva">🗓️ Reserva</option><option value="instalacion" selected>🛠️ Instalación</option></select></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Sucursal</label><select id="ac-sucursal" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${AG.sucursales.map(s => `<option value="${s.id}">${agEsc(s.nombre)}</option>`).join('')}</select></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Fecha y hora</label><input id="ac-inicio" type="datetime-local" value="${agParaInput(ahora)}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-bold text-slate-500 mb-1">Anticipo (opcional)</label><input id="ac-anticipo" type="number" min="0" step="any" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 mb-1">Forma de pago del anticipo</label><select id="ac-metodo" class="w-full px-3 py-2 border rounded-lg bg-white text-sm">${AG.metodos.map(m => `<option value="${m.id}">${agEsc(m.nombre)}</option>`).join('')}</select></div></div>
        <button onclick="agConfirmarDesdeCotizacion('${idCot}')" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm">Crear en la agenda</button>`);
};
async function agConfirmarDesdeCotizacion(idCot) {
    const v = (k) => document.getElementById('ac-' + k).value;
    if (!v('inicio')) return alert('Indica la fecha y hora.');
    const antic = parseFloat(v('anticipo')) || 0;
    const { error } = await clienteSupabase.rpc('crear_agenda_desde_cotizacion', { p_id_cotizacion: idCot, p_id_sucursal: v('sucursal'), p_tipo: v('tipo'),
        p_fecha_inicio: new Date(v('inicio')).toISOString(), p_anticipo: antic > 0 ? { monto: antic, id_metodo_pago: v('metodo') } : null });
    if (error) return alert(error.message);
    agCerrar(); alert('Listo: quedó en la Agenda de trabajo.'); if (typeof window.cargarCotizaciones === 'function') window.cargarCotizaciones();
}
