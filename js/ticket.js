// ==========================================================
// Ticket de venta por correo (comprobante simple, no tributario)
// ==========================================================
const TK = { idVenta: null, alTerminar: null };
const tkEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function tkModal(html) {
    let m = document.getElementById('modal-tk');
    if (!m) { m = document.createElement('div'); m.id = 'modal-tk'; m.className = 'fixed inset-0 z-[450] bg-slate-900/70 flex items-center justify-center p-3'; document.body.appendChild(m); }
    m.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[94vh] overflow-y-auto p-5 space-y-3 text-slate-800">${html}</div>`;
}
const tkCerrar = () => document.getElementById('modal-tk')?.remove();

// Pantalla que se muestra después de cobrar en el POS
window.mostrarVentaRegistrada = async function (resultado, mensaje, idCliente) {
    let correo = '';
    if (idCliente) { try { const { data } = await clienteSupabase.from('clientes').select('correo').eq('id', idCliente).maybeSingle(); correo = (data && data.correo) || ''; } catch (e) { /* sin correo guardado */ } }
    TK.idVenta = resultado.id; TK.alTerminar = null;
    tkModal(`<div class="text-center space-y-1"><p class="text-5xl">${resultado.estado === 'POR_COBRAR' ? '📓' : '✅'}</p>
        <p class="font-black text-lg whitespace-pre-line">${tkEsc(mensaje.replace(/^[^\w¡]*/, ''))}</p></div>
        ${tkFormulario(correo)}
        <button onclick="tkCerrar()" class="w-full py-3 rounded-xl font-black bg-slate-800 text-white">Seguir vendiendo</button>`);
};
function tkFormulario(correo) {
    return `<div class="border rounded-xl p-3 space-y-2"><p class="text-sm font-bold">✉️ Enviar ticket por correo <span class="text-xs font-normal text-slate-400">(opcional)</span></p>
        <div class="flex gap-2"><input id="tk-correo" type="email" inputmode="email" maxlength="254" value="${tkEsc(correo)}" placeholder="correo@cliente.cl" class="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm">
        <button id="tk-enviar" onclick="tkEnviar()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Enviar</button></div>
        <p id="tk-msg" class="text-xs"></p></div>`;
}

// Desde el Historial / otras pantallas
window.abrirEnviarTicket = async function (idVenta, idCliente, alTerminar) {
    let correo = '';
    if (idCliente === undefined || idCliente === null) { try { const { data: v } = await clienteSupabase.from('ventas').select('id_cliente').eq('id', idVenta).maybeSingle(); idCliente = v && v.id_cliente; } catch (e) { /* sigue sin cliente */ } }
    if (idCliente) { try { const { data } = await clienteSupabase.from('clientes').select('correo').eq('id', idCliente).maybeSingle(); correo = (data && data.correo) || ''; } catch (e) { /* sin correo guardado */ } }
    TK.idVenta = idVenta; TK.alTerminar = alTerminar || null;
    tkModal(`<div class="flex justify-between"><h3 class="text-lg font-black">Ticket de venta</h3><button onclick="tkCerrar()" class="text-slate-400 text-2xl">✕</button></div>${tkFormulario(correo)}`);
};

window.tkEnviar = async function () {
    const msg = document.getElementById('tk-msg'), btn = document.getElementById('tk-enviar');
    const correo = document.getElementById('tk-correo').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { msg.className = 'text-xs text-red-600'; msg.innerText = 'Escribe un correo válido.'; return; }
    btn.disabled = true; btn.innerText = 'Enviando…'; msg.className = 'text-xs text-slate-500'; msg.innerText = '';
    try {
        const { data: ses } = await clienteSupabase.auth.getSession();
        const token = ses && ses.session && ses.session.access_token;
        const r = await fetch('/api/enviar-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ id_venta: TK.idVenta, correo }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { msg.className = 'text-xs font-bold text-emerald-600'; msg.innerText = '✅ Ticket enviado a ' + correo; btn.innerText = 'Enviado'; if (TK.alTerminar) TK.alTerminar(); return; }
        msg.className = 'text-xs font-bold text-red-600'; msg.innerText = j.mensaje || 'No se pudo enviar el ticket.';
    } catch (e) { msg.className = 'text-xs font-bold text-red-600'; msg.innerText = 'No se pudo conectar. Revisa tu internet.'; }
    btn.disabled = false; btn.innerText = 'Enviar';
};
