// ==========================================================
// ASISTENTES DE CONFIGURACIÓN
// Un motor único; cada asistente es solo una definición de pasos.
// Para sumar el de otro módulo (Inventario, Personas...) basta agregar
// una definición aquí y su nombre en la lista de la función guardar_asistente.
// ==========================================================

const MONEDAS_COMUNES = ['CLP', 'USD', 'VES', 'EUR', 'ARS', 'COP', 'PEN', 'MXN', 'BRL'];

window.ASISTENTES = {
    inicial: {
        titulo: 'Configuremos tu empresa',
        pasos: [
            { clave: 'nombre_comercial', tipo: 'texto', pregunta: '¿Cómo se llama tu negocio?', ayuda: 'El nombre con que lo conocen tus clientes.', placeholder: 'Ej: Café Central' },
            { clave: 'rubro', tipo: 'unica', pregunta: '¿A qué se dedica?', opciones: [
                ['Restaurante / cafetería', '🍽️ Restaurante / cafetería'], ['Tienda / comercio', '🛍️ Tienda / comercio'], ['Servicios', '🛠️ Servicios'],
                ['Agrícola / productor', '🌱 Agrícola / productor'], ['Producción / manufactura', '🏭 Producción / manufactura'], ['Otro', '✨ Otro'] ] },
            { clave: 'monedas', tipo: 'monedas', pregunta: '¿En qué monedas trabajas?', ayuda: 'Puedes elegir más de una. La primera que marques será la principal.' },
            { clave: 'tipo_sucursales', tipo: 'sucursales', pregunta: '¿Tienes una sola sucursal o varias?', ayuda: 'Siempre puedes agregar más después, en Catálogos.' },
            { clave: 'modulos_interes', tipo: 'multiple', pregunta: '¿Qué quieres usar de Buddy?', ayuda: 'Solo ordena tu menú durante la prueba. Nada se cobra por esta elección.', opciones: [
                ['ventas', '💰 Ventas'], ['inventario', '📦 Inventario'], ['personas', '👥 Personas'] ] },
            { clave: 'equipo', tipo: 'unica', pregunta: '¿Quieres invitar a tu equipo ahora?', opciones: [
                ['ahora', '✉️ Sí, invitar ahora'], ['despues', '⏭️ Lo hago después'] ] }
        ]
    },
    ventas: {
        titulo: 'Configuremos Ventas',
        pasos: [
            { clave: 'canal', tipo: 'unica', pregunta: '¿Cómo registras tus ventas?', opciones: [
                ['pos', '🛒 Vendo con el POS de Buddy'], ['importacion', '📥 Importo ventas de otro sistema'], ['ambas', '🔀 Ambas'] ] },
            { clave: 'cotizaciones', tipo: 'unica', pregunta: '¿Trabajas con cotizaciones?', opciones: [['si', '📄 Sí'], ['no', '🚫 No']] },
            { clave: 'agenda', tipo: 'multiple', exclusivo: 'ninguno', pregunta: '¿Trabajas con pedidos, reservas o instalaciones?', ayuda: 'Puedes marcar varias.', opciones: [
                ['pedidos', '📦 Pedidos'], ['reservas', '📅 Reservas'], ['instalaciones', '🔧 Instalaciones'], ['ninguno', '🚫 Ninguno'] ] }
        ]
    }
};

window.configVentas = null;      // respuestas del asistente de Ventas (null = mostrar todo)
let _asist = null;               // estado del asistente abierto

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const puedeConfigurar = () => ['Dueño', 'Admin', 'Administrador Supremo'].includes(window.miRol);

// ---------- Carga inicial al entrar a la empresa ----------
window.cargarConfigAsistentes = async function () {
    window.configVentas = null;
    try {
        const { data } = await clienteSupabase.rpc('mi_asistente', { p_id_empresa: window.miEmpresaId, p_asistente: 'ventas' });
        window.configVentas = (data && data.estado === 'completado') ? data.respuestas : null;
    } catch (e) { /* sin configuración: se muestra todo */ }
    window.aplicarConfigVentas();

    // Empresas nuevas (menos de 30 días) ven el asistente inicial una vez
    if (!puedeConfigurar()) return;
    try {
        const [{ data: ini }, { data: emp }] = await Promise.all([
            clienteSupabase.rpc('mi_asistente', { p_id_empresa: window.miEmpresaId, p_asistente: 'inicial' }),
            clienteSupabase.from('empresas').select('fecha_creacion').eq('id', window.miEmpresaId).maybeSingle()
        ]);
        const dias = emp?.fecha_creacion ? (Date.now() - new Date(emp.fecha_creacion).getTime()) / 86400000 : 999;
        if (!ini && dias < 30) window.abrirAsistente('inicial');
    } catch (e) { /* no bloquea */ }
}

// ---------- Adaptar menú y dashboard de Ventas ----------
window.aplicarConfigVentas = function () {
    const c = window.configVentas;
    const agenda = Array.isArray(c?.agenda) ? c.agenda.filter(a => a !== 'ninguno') : null;
    const visible = {
        pos:           !c || c.canal !== 'importacion',
        importacion:   !c || c.canal !== 'pos',
        cotizaciones:  !c || c.cotizaciones !== 'no',
        agenda:        !c || (agenda && agenda.length > 0),
        cotizacionesOAgenda: !c || c.cotizaciones !== 'no' || (agenda && agenda.length > 0)
    };
    document.querySelectorAll('[data-cfg]').forEach(el => {
        const ok = visible[el.dataset.cfg] !== false;
        el.classList.toggle('cfg-oculto', !ok);
    });
}

// ---------- Motor ----------
window.abrirAsistente = async function (id, opciones) {
    const def = window.ASISTENTES[id];
    if (!def) return;
    _asist = { id, def, paso: 0, manual: !!(opciones && opciones.manual), r: {} };

    // Valores previos (editar) o sugeridos
    try {
        const { data } = await clienteSupabase.rpc('mi_asistente', { p_id_empresa: window.miEmpresaId, p_asistente: id });
        if (data && data.respuestas) _asist.r = { ...data.respuestas };
    } catch (e) { /* vacío */ }
    if (id === 'inicial') {
        try {
            const { data: emp } = await clienteSupabase.from('empresas').select('nombre, nombre_comercial, rubro, monedas, pais').eq('id', window.miEmpresaId).maybeSingle();
            if (emp) {
                if (!_asist.r.nombre_comercial) _asist.r.nombre_comercial = emp.nombre_comercial || emp.nombre || '';
                if (!_asist.r.rubro && emp.rubro) _asist.r.rubro = emp.rubro;
                if (!_asist.r.monedas || !_asist.r.monedas.length) {
                    _asist.r.monedas = (emp.monedas && emp.monedas.length) ? emp.monedas
                        : (/venezuela/i.test(emp.pais || '') ? ['VES', 'USD'] : /chile/i.test(emp.pais || '') ? ['CLP'] : []);
                }
            }
        } catch (e) { /* vacío */ }
    }
    const modal = document.getElementById('modal-asistente');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderPasoAsistente();
}

function renderPasoAsistente() {
    const { def, paso, r } = _asist;
    const p = def.pasos[paso];
    const total = def.pasos.length;
    document.getElementById('asist-titulo').innerText = def.titulo;
    document.getElementById('asist-progreso').innerText = `Paso ${paso + 1} de ${total}`;
    document.getElementById('asist-barra').style.width = `${((paso + 1) / total) * 100}%`;
    document.getElementById('asist-pregunta').innerText = p.pregunta;
    document.getElementById('asist-ayuda').innerText = p.ayuda || '';

    let html = '';
    if (p.tipo === 'texto') {
        html = `<input id="asist-texto" type="text" maxlength="120" value="${esc(r[p.clave] || '')}" placeholder="${esc(p.placeholder || '')}"
                 class="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none">`;
    } else if (p.tipo === 'unica') {
        html = p.opciones.map(([v, t]) => botonOpcion(v, t, r[p.clave] === v, 'elegirUnicaAsistente')).join('');
    } else if (p.tipo === 'multiple') {
        const sel = r[p.clave] || [];
        html = p.opciones.map(([v, t]) => botonOpcion(v, t, sel.includes(v), 'alternarMultipleAsistente')).join('');
    } else if (p.tipo === 'monedas') {
        const sel = r.monedas || [];
        const todas = [...MONEDAS_COMUNES, ...sel.filter(m => !MONEDAS_COMUNES.includes(m))];
        html = `<div class="grid grid-cols-3 gap-2">` + todas.map(m => {
            const idx = sel.indexOf(m);
            return `<button type="button" onclick="alternarMonedaAsistente('${esc(m)}')" class="relative py-3 rounded-xl border-2 font-bold text-sm ${idx >= 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
                ${esc(m)}${idx === 0 ? '<span class="absolute -top-2 -right-2 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">principal</span>' : ''}</button>`;
        }).join('') + `</div>
            <div class="flex gap-2 mt-3"><input id="asist-moneda-otra" maxlength="6" placeholder="Otra (ej: GBP)" class="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-500">
            <button type="button" onclick="agregarMonedaAsistente()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold text-sm hover:bg-slate-200">Agregar</button></div>`;
    } else if (p.tipo === 'sucursales') {
        const varias = r.tipo_sucursales === 'varias';
        html = botonOpcion('una', '🏠 Una sola', r.tipo_sucursales === 'una', 'elegirUnicaAsistente') +
               botonOpcion('varias', '🏢 Varias', varias, 'elegirUnicaAsistente') +
               (varias ? `<label class="block text-sm font-bold text-slate-600 mt-3 mb-1">Escribe el nombre de cada una (una por línea)</label>
                  <textarea id="asist-sucursales" rows="4" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Local Centro&#10;Local Norte">${esc((r.sucursales || []).join('\n'))}</textarea>
                  <p class="text-xs text-slate-400 mt-1">Tu sucursal actual se mantiene; estas se agregan.</p>` : '');
    }
    document.getElementById('asist-cuerpo').innerHTML = html;
    document.getElementById('asist-atras').classList.toggle('invisible', paso === 0);
    document.getElementById('asist-siguiente').innerText = paso === total - 1 ? 'Terminar' : 'Siguiente';
    document.getElementById('asist-omitir').innerText = _asist.manual ? 'Cancelar' : 'Omitir por ahora';
    const input = document.getElementById('asist-texto'); if (input) setTimeout(() => input.focus(), 50);
}

function botonOpcion(v, t, activo, fn) {
    return `<button type="button" onclick="${fn}('${esc(v)}')" class="w-full text-left px-4 py-3 mb-2 rounded-xl border-2 font-bold text-sm transition-colors ${activo ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'}">${esc(t)}</button>`;
}

function capturarTextoAsistente() {
    const p = _asist.def.pasos[_asist.paso];
    if (p.tipo === 'texto') _asist.r[p.clave] = (document.getElementById('asist-texto')?.value || '').trim();
    if (p.tipo === 'sucursales') {
        const ta = document.getElementById('asist-sucursales');
        _asist.r.sucursales = ta ? ta.value.split('\n').map(s => s.trim()).filter(Boolean) : [];
    }
}

window.elegirUnicaAsistente = function (v) {
    capturarTextoAsistente();
    const p = _asist.def.pasos[_asist.paso];
    _asist.r[p.clave] = v;
    renderPasoAsistente();
}
window.alternarMultipleAsistente = function (v) {
    const p = _asist.def.pasos[_asist.paso];
    let sel = _asist.r[p.clave] || [];
    if (sel.includes(v)) sel = sel.filter(x => x !== v);
    else if (p.exclusivo && v === p.exclusivo) sel = [v];
    else sel = [...sel.filter(x => x !== p.exclusivo), v];
    _asist.r[p.clave] = sel;
    renderPasoAsistente();
}
window.alternarMonedaAsistente = function (m) {
    let sel = _asist.r.monedas || [];
    sel = sel.includes(m) ? sel.filter(x => x !== m) : [...sel, m];
    _asist.r.monedas = sel;
    renderPasoAsistente();
}
window.agregarMonedaAsistente = function () {
    const el = document.getElementById('asist-moneda-otra');
    const m = (el.value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    if (!m) return;
    const sel = _asist.r.monedas || [];
    if (!sel.includes(m)) _asist.r.monedas = [...sel, m];
    renderPasoAsistente();
}

window.asistenteAtras = function () {
    capturarTextoAsistente();
    if (_asist.paso > 0) { _asist.paso--; renderPasoAsistente(); }
}
window.asistenteSiguiente = async function () {
    capturarTextoAsistente();
    const p = _asist.def.pasos[_asist.paso];
    if (_asist.paso < _asist.def.pasos.length - 1) { _asist.paso++; return renderPasoAsistente(); }
    await guardarAsistente('completado');
}
window.asistenteOmitir = async function () {
    if (_asist.manual) return cerrarAsistente();
    await guardarAsistente('omitido');
}
function cerrarAsistente() {
    const modal = document.getElementById('modal-asistente');
    modal.classList.add('hidden'); modal.classList.remove('flex');
    _asist = null;
}

async function guardarAsistente(estado) {
    const { id, r } = _asist;
    const btn = document.getElementById('asist-siguiente');
    btn.disabled = true;
    try {
        const respuestas = estado === 'completado' ? { ...r } : {};
        if (respuestas.tipo_sucursales !== 'varias') delete respuestas.sucursales;
        const { error } = await clienteSupabase.rpc('guardar_asistente', {
            p_id_empresa: window.miEmpresaId, p_asistente: id, p_estado: estado, p_respuestas: respuestas
        });
        if (error) {
            if (/permission denied for function/i.test(error.message || '') && typeof window.cerrarPorSesionVencida === 'function') {
                cerrarAsistente();
                window.cerrarPorSesionVencida();
                return;
            }
            throw error;
        }
        const irAEquipo = id === 'inicial' && estado === 'completado' && r.equipo === 'ahora';
        cerrarAsistente();
        if (id === 'ventas') {
            window.configVentas = estado === 'completado' ? respuestas : null;
            window.aplicarConfigVentas();
        }
        if (id === 'inicial' && estado === 'completado' && typeof window.cargarDatosSelects === 'function') window.cargarDatosSelects();
        if (irAEquipo) window.cambiarVista('empresas');
    } catch (e) {
        console.error(e);
        alert('❌ No se pudo guardar la configuración.\n\n' + (e.message || ''));
    } finally {
        btn.disabled = false;
    }
}

// Al entrar a Ventas por primera vez, el Dueño/Admin ve el asistente de Ventas
window.revisarAsistenteVentas = async function () {
    if (!puedeConfigurar()) return;
    try {
        const { data } = await clienteSupabase.rpc('mi_asistente', { p_id_empresa: window.miEmpresaId, p_asistente: 'ventas' });
        if (!data) window.abrirAsistente('ventas');
    } catch (e) { /* no bloquea */ }
}
