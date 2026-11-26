// ============================================================
// Compras · Organización: razones sociales, sucursales y centros de costo
// ============================================================
(function () {
    const esc = (s) => window.cpEsc ? cpEsc(s) : String(s ?? '');
    const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold';

    window.orgPintar = function () {
        const cont = document.getElementById('cp-organizacion'); if (!cont) return;
        const admin = cpEsAdmin();
        const razones = CP.razones || [], sucs = CP.sucursales || [];
        const tarjeta = (r) => {
            const susR = sucs.filter(s => s.id_razon_social === r.id);
            const ctas = CP.cuentas.filter(c => c.id_razon_social === r.id);
            return `<div class="border border-slate-200 rounded-xl p-4 space-y-2 ${r.activo ? '' : 'opacity-60'}">
                <div class="flex items-start justify-between gap-2">
                    <div><p class="font-black text-slate-800">${esc(r.nombre)} ${r.principal ? '<span class="ml-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-black align-middle">PRINCIPAL</span>' : ''}</p>
                        <p class="text-xs text-slate-500">${r.rut ? 'RUT ' + esc(r.rut) : 'Sin RUT'}${r.giro ? ' · ' + esc(r.giro) : ''}</p></div>
                    ${admin ? `<button onclick="orgEditarRazon('${r.id}')" class="text-xs font-bold text-teal-700 hover:underline">Editar</button>` : ''}</div>
                <div><p class="text-[11px] font-bold text-slate-400 uppercase">Sucursales</p>
                    <p class="text-sm text-slate-700">${susR.map(s => esc(s.nombre)).join(' · ') || '<span class="text-slate-400">—</span>'}</p></div>
                <div><p class="text-[11px] font-bold text-slate-400 uppercase">Cuentas</p>
                    <p class="text-sm text-slate-700">${ctas.map(c => esc(c.nombre)).join(' · ') || '<span class="text-slate-400">—</span>'}</p></div></div>`;
        };
        const nivel = (padre, prof) => (CP.centros || []).filter(c => (c.id_padre || null) === padre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => `
            <div class="flex items-center justify-between gap-2 py-2 ${prof ? 'pl-6 border-l-2 border-slate-100 ml-2' : ''} ${c.activo ? '' : 'opacity-50'}">
                <p class="text-sm text-slate-700"><b>${esc(c.nombre)}</b>${c.codigo ? ` <span class="text-xs text-slate-400">${esc(c.codigo)}</span>` : ''}${c.activo ? '' : ' <span class="text-[11px] text-slate-400">(inactivo)</span>'}</p>
                ${admin ? `<span class="flex gap-3"><button onclick="orgEditarCentro('${c.id}')" class="text-xs font-bold text-teal-700 hover:underline">Editar</button>
                    <button onclick="orgActivarCentro('${c.id}', ${!c.activo})" class="text-xs font-bold text-slate-400 hover:text-slate-700">${c.activo ? 'Desactivar' : 'Activar'}</button></span>` : ''}</div>
            ${nivel(c.id, prof + 1)}`).join('');
        cont.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div><h3 class="font-black text-slate-800">Razones sociales</h3>
                    <p class="text-xs text-slate-500">Cada RUT con el que opera la empresa. Las sucursales y las cuentas bancarias pertenecen a una razón social.</p></div>
                ${admin ? `<button onclick="orgEditarRazon()" class="${btn} bg-emerald-600 text-white hover:bg-emerald-700">+ Razón social</button>` : ''}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${razones.map(tarjeta).join('')}</div>
            ${sucs.length && admin ? `<details class="text-sm"><summary class="cursor-pointer font-bold text-slate-600">Asignar sucursales a una razón social</summary>
                <div class="mt-3 space-y-2">${sucs.map(s => `<div class="flex items-center gap-3"><span class="w-48 font-bold text-slate-700">${esc(s.nombre)}</span>
                    <select onchange="orgSucursalRazon('${s.id}', this.value)" class="flex-1 px-2 py-1.5 border rounded-lg bg-white text-sm">${razones.map(r => `<option value="${r.id}" ${r.id === s.id_razon_social ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></div>`).join('')}</div></details>` : ''}
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div><h3 class="font-black text-slate-800">Centros de costo</h3>
                    <p class="text-xs text-slate-500">Áreas a las que asignas o repartes los gastos (Producción, Marketing, Administración…). Pueden tener sub-niveles.</p></div>
                ${admin ? `<button onclick="orgEditarCentro()" class="${btn} bg-emerald-600 text-white hover:bg-emerald-700">+ Centro de costo</button>` : ''}</div>
            <div class="divide-y divide-slate-100">${nivel(null, 0) || '<p class="text-sm text-slate-400 py-3">Aún no tienes centros de costo. Son opcionales: si no los usas, Buddy no te los pide.</p>'}</div>
        </div>`;
    };

    window.orgEditarRazon = async function (id) {
        const r = id ? CP.razones.find(x => x.id === id) : {};
        const nombre = prompt('Nombre de la razón social:', r.nombre || ''); if (nombre === null || !nombre.trim()) return;
        const rut = prompt('RUT (opcional):', r.rut || ''); if (rut === null) return;
        const giro = prompt('Giro (opcional):', r.giro || ''); if (giro === null) return;
        const datos = { nombre: nombre.trim(), rut: rut.trim() || null, giro: giro.trim() || null };
        const res = id ? await clienteSupabase.from('razones_sociales').update(datos).eq('id', id)
            : await clienteSupabase.from('razones_sociales').insert({ ...datos, id_empresa: window.miEmpresaId });
        if (res.error) return alert(res.error.message);
        await cpCargarBase(); orgPintar();
    };
    window.orgSucursalRazon = async function (idSuc, idRazon) {
        const { error } = await clienteSupabase.from('sucursales').update({ id_razon_social: idRazon }).eq('id', idSuc);
        if (error) { alert(error.message); return orgPintar(); }
        await cpCargarBase(); orgPintar();
    };
    window.orgEditarCentro = async function (id) {
        const c = id ? CP.centros.find(x => x.id === id) : {};
        const nombre = prompt('Nombre del centro de costo:', c.nombre || ''); if (nombre === null || !nombre.trim()) return;
        const codigo = prompt('Código (opcional, ej: MKT-01):', c.codigo || ''); if (codigo === null) return;
        const posibles = CP.centros.filter(x => x.id !== id && !x.id_padre);
        let padre = c.id_padre || null;
        if (posibles.length) {
            const lista = posibles.map((x, i) => `${i + 1}. ${x.nombre}`).join('\n');
            const elegido = prompt(`¿Va dentro de otro centro? Escribe el número, o déjalo vacío si es principal:\n\n${lista}`, padre ? String(posibles.findIndex(x => x.id === padre) + 1) : '');
            if (elegido === null) return;
            padre = elegido.trim() ? posibles[Number(elegido) - 1]?.id || null : null;
        }
        const datos = { nombre: nombre.trim(), codigo: codigo.trim() || null, id_padre: padre };
        const res = id ? await clienteSupabase.from('centros_costo').update(datos).eq('id', id)
            : await clienteSupabase.from('centros_costo').insert({ ...datos, id_empresa: window.miEmpresaId });
        if (res.error) return alert(res.error.message);
        await cpCargarBase(); orgPintar();
    };
    window.orgActivarCentro = async function (id, on) {
        const { error } = await clienteSupabase.from('centros_costo').update({ activo: on }).eq('id', id);
        if (error) return alert(error.message);
        await cpCargarBase(); orgPintar();
    };
})();
