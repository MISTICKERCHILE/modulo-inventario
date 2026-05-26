window.plantillasTurnosMemoria = [];
window.sucursalesMemoriaHR = [];
window.horariosSucursalesMemoria = [];
window.permisosTiposMemoria = [];

// ============================================================================
// ADMINISTRACIÓN DE PLANTILLAS DE TURNOS
// ============================================================================
window.cargarPlantillasTurnos = async function() {
    const tbody = document.getElementById('hr-tabla-plantillas-turnos');
    if (!tbody) return;
    try {
        const { data } = await clienteSupabase.from('hr_turnos_plantillas').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.plantillasTurnosMemoria = data || [];
        if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No hay turnos creados.</td></tr>`; return; }

        tbody.innerHTML = data.map(t => {
            let comidas = [];
            if(t.lleva_desayuno) comidas.push('🍳 Desayuno');
            if(t.lleva_almuerzo) comidas.push('🍲 Almuerzo');
            if(t.lleva_once_cena) comidas.push('🌆 Once/Cena');
            
            let horarioHtml = t.es_ausencia 
                ? `<span class="bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded text-[10px]">⚪ Sin Horario</span>` 
                : `<span class="bg-blue-50 text-blue-700 font-mono font-bold px-2 py-1 rounded text-xs">${t.hora_inicio.slice(0,5)} a ${t.hora_fin.slice(0,5)}</span>`;

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-bold text-slate-800 text-xs">${t.nombre}</td>
                    <td class="px-6 py-4 text-center">${horarioHtml}</td>
                    <td class="px-6 py-4 text-center text-[10px]">${comidas.join(', ') || '-'}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="editarPlantillaTurno('${t.id}')" class="text-blue-600 font-bold px-2 py-1 text-xs hover:bg-blue-50 rounded">✏️</button>
                        <button onclick="eliminarPlantillaTurno('${t.id}')" class="text-red-500 font-bold px-2 py-1 text-xs hover:bg-red-50 rounded">🗑️</button>
                    </td>
                </tr>`;
        }).join('');
    } catch (e) { console.error(e); }
};

window.abrirModalTurnoPlantilla = async function() {
    document.getElementById('form-hr-turno-plantilla').reset();
    document.getElementById('hr-id-turno-plantilla').value = '';
    window.toggleHorasAusencia(false);
    await window.cargarSucursalesEnModalTurno([]);
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');
};

window.cerrarModalTurnoPlantilla = function() { document.getElementById('modal-hr-turno-plantilla').classList.add('hidden'); };

window.toggleHorasAusencia = function(esAusencia) {
    const contHoras = document.getElementById('hr-contenedor-horas-turno');
    if (esAusencia) {
        contHoras.classList.add('opacity-30', 'pointer-events-none');
        document.getElementById('hr-turno-entrada').value = ''; 
        document.getElementById('hr-turno-salida').value = '';
    } else { contHoras.classList.remove('opacity-30', 'pointer-events-none'); }
};

window.cargarSucursalesEnModalTurno = async function(seleccionadas) {
    const cont = document.getElementById('hr-turno-sucursales');
    const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
    cont.innerHTML = sucursales.map(s => `<label class="flex items-center gap-2 p-2 border border-slate-200 rounded text-xs cursor-pointer"><input type="checkbox" name="hr-chk-sucursal-turno" value="${s.id}" ${seleccionadas.includes(s.id)?'checked':''}>${s.nombre}</label>`).join('');
};

window.editarPlantillaTurno = async function(id) {
    const t = window.plantillasTurnosMemoria.find(x => x.id === id);
    document.getElementById('hr-id-turno-plantilla').value = t.id;
    document.getElementById('hr-turno-nombre').value = t.nombre;
    document.getElementById('hr-chk-ausencia').checked = t.es_ausencia;
    window.toggleHorasAusencia(t.es_ausencia);
    if(!t.es_ausencia) {
        document.getElementById('hr-turno-entrada').value = t.hora_inicio.slice(0,5);
        document.getElementById('hr-turno-salida').value = t.hora_fin.slice(0,5);
        document.getElementById('hr-turno-descanso').value = t.descanso_minutos || '';
    }
    await window.cargarSucursalesEnModalTurno(t.sucursales_disponibles || []);
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');
};

window.eliminarPlantillaTurno = async function(id) {
    if(confirm("¿Seguro?")) { await clienteSupabase.from('hr_turnos_plantillas').delete().eq('id', id); window.cargarPlantillasTurnos(); }
};

window.guardarTurnoPlantilla = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-plantilla-turno'); btn.disabled = true;
    const esAusencia = document.getElementById('hr-chk-ausencia').checked;
    const sucursalesArr = Array.from(document.querySelectorAll('input[name="hr-chk-sucursal-turno"]:checked')).map(cb => cb.value);

    // RECUPERAMOS LOS CAMPOS CORRECTOS
    const descansoInput = document.getElementById('hr-turno-descanso');
    const chkDesayuno = document.getElementById('hr-chk-desayuno');
    const chkAlmuerzo = document.getElementById('hr-chk-almuerzo');
    const chkOnce = document.getElementById('hr-chk-once');

    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-turno-nombre').value,
        es_ausencia: esAusencia,
        hora_inicio: esAusencia ? null : document.getElementById('hr-turno-entrada').value,
        hora_fin: esAusencia ? null : document.getElementById('hr-turno-salida').value,
        descanso_minutos: esAusencia ? 0 : (descansoInput.value ? parseInt(descansoInput.value) : 0),
        lleva_desayuno: chkDesayuno ? chkDesayuno.checked : false,
        lleva_almuerzo: chkAlmuerzo ? chkAlmuerzo.checked : false,
        lleva_once_cena: chkOnce ? chkOnce.checked : false,
        sucursales_disponibles: sucursalesArr
    };

    const idFicha = document.getElementById('hr-id-turno-plantilla').value;
    try {
        if (idFicha) await clienteSupabase.from('hr_turnos_plantillas').update(payload).eq('id', idFicha);
        else await clienteSupabase.from('hr_turnos_plantillas').insert([payload]);
        
        window.cerrarModalTurnoPlantilla();
        window.cargarPlantillasTurnos();
        if (!document.getElementById('modal-hr-programador').classList.contains('hidden')) { window.generarMatrizProgramador(); }
    } catch (err) {
        console.error(err);
    } finally {
        btn.disabled = false;
    }
};

// ============================================================================
// ADMINISTRACIÓN DE HORARIOS DE SUCURSALES
// ============================================================================
window.cargarHorariosSucursales = async function() {
    const tbody = document.getElementById('hr-lista-sucursales-horarios');
    if (!tbody) return;

    try {
        // 1. Traer el nombre real de la empresa (Solo pedimos 'nombre')
        const { data: empresaData, error: errEmpresa } = await clienteSupabase.from('empresas').select('nombre').eq('id', window.miEmpresaId).single();
        
        if (errEmpresa) console.error("Error al buscar empresa:", errEmpresa);

        // Usamos el nombre, y si no hay nada, el texto por defecto
        const nombreEmpresaReal = empresaData ? (empresaData.nombre || 'Empresa Activa') : 'Empresa Activa';

        // 2. Traer sucursales y horarios
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre, direccion').eq('id_empresa', window.miEmpresaId).order('nombre');
        const { data: horarios } = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
        
        window.sucursalesMemoriaHR = sucursales || [];
        window.horariosSucursalesMemoria = horarios || [];

        if (window.sucursalesMemoriaHR.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No hay sucursales.</td></tr>`; 
            return; 
        }

        tbody.innerHTML = window.sucursalesMemoriaHR.map(suc => {
            const h = window.horariosSucursalesMemoria.find(x => x.id_sucursal === suc.id);
            let txt = "<span class='text-red-500 font-bold'>⚠️ Sin configurar</span>";
            if (h && h.config_dias) {
                let ab = []; let ce = [];
                ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].forEach(dia => { 
                    if(h.config_dias[dia] && h.config_dias[dia].abierto) ab.push(dia.slice(0,3)); 
                    else ce.push(dia.slice(0,3)); 
                });
                if (ab.length === 6 && ce.length === 1 && ce[0] === 'Dom') {
                    txt = `<span class="text-emerald-600 font-bold">Lun-Sáb: Abiertos</span> | <span class="text-slate-400 font-bold">Dom: Cerrado</span>`;
                } else {
                    txt = [
                        ab.length>0 ? `<span class="text-emerald-600 font-bold">${ab.join(', ')}: Abierto</span>` : '', 
                        ce.length>0 ? `<span class="text-slate-400 font-bold">${ce.join(', ')}: Cerrado</span>` : ''
                    ].filter(Boolean).join(' | ');
                }
            }
            
            return `<tr onclick="abrirModalHorarioSucursal('${suc.id}')" class="cursor-pointer hover:bg-slate-50 group transition-colors">
                <td class="px-6 py-4 font-black text-slate-800 text-sm group-hover:text-blue-600">${suc.nombre}</td>
                <td class="px-6 py-4 text-xs font-bold text-slate-600">${nombreEmpresaReal}</td>
                <td class="px-6 py-4 text-xs truncate max-w-[200px] text-slate-500">${suc.direccion || '-'}</td>
                <td class="px-6 py-4 text-[11px]">${txt}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error("Error al cargar horarios: ", err);
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500">Error al cargar datos.</td></tr>`;
    }
};

window.abrirModalHorarioSucursal = function(id_sucursal) {
    const s = window.sucursalesMemoriaHR.find(x => x.id === id_sucursal);
    const h = window.horariosSucursalesMemoria.find(x => x.id_sucursal === id_sucursal);
    document.getElementById('hr-horario-titulo').innerText = `⚙️ Horario: ${s.nombre}`;
    document.getElementById('hr-id-sucursal-activa').value = id_sucursal;
    document.getElementById('hr-id-horario-sucursal').value = h ? h.id : '';
    
    const config = h ? h.config_dias : {};
    document.getElementById('hr-contenedor-dias-semana').innerHTML = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(dia => {
        const cd = config[dia] || { abierto: true, bloques: [{ apertura: '09:00', cierre: '18:00' }] };
        const bq = cd.bloques || [{ apertura: cd.apertura || '09:00', cierre: cd.cierre || '18:00' }];
        return `<div class="bg-white p-3 rounded border border-slate-200 flex justify-between gap-3">
            <div class="flex items-center gap-3 pt-1.5 w-1/4">
                <input type="checkbox" id="chk-dia-${dia}" ${cd.abierto ? 'checked' : ''} onchange="toggleInputsDia('${dia}')" class="w-4 h-4 accent-emerald-600 cursor-pointer shadow-sm">
                <span class="font-black text-sm w-24">${dia}</span>
            </div>
            <div class="flex-1 space-y-2 ${!cd.abierto ? 'opacity-25 pointer-events-none' : ''}" id="contenedor-bloques-${dia}">
                <div id="lista-bloques-físicos-${dia}">${bq.map((b, idx) => `<div class="flex items-center gap-2 item-bloque-${dia} mb-1" data-index="${idx}"><input type="time" value="${b.apertura}" class="input-apertura px-2 py-1 text-xs border rounded"><span class="text-xs">a</span><input type="time" value="${b.cierre}" class="input-cierre px-2 py-1 text-xs border rounded">${idx>0?`<button type="button" onclick="this.parentElement.remove()" class="text-red-500 font-bold px-2">&times;</button>`:''}</div>`).join('')}</div>
                <button type="button" onclick="agregarBloqueHorarioDia('${dia}')" class="text-[11px] font-bold text-emerald-600">➕ Añadir segundo tramo</button>
            </div>
        </div>`;
    }).join('');

    const contClonar = document.getElementById('hr-contenedor-clonar-sucursales');
    const otras = window.sucursalesMemoriaHR.filter(x => x.id !== id_sucursal);
    contClonar.innerHTML = otras.map(x => `<label class="flex items-center gap-2 p-1.5 border rounded text-[11px]"><input type="checkbox" name="hr-chk-clonar-horario" value="${x.id}"> ${x.nombre}</label>`).join('');
    document.getElementById('modal-hr-horario-sucursal').classList.remove('hidden');
};

window.cerrarModalHorarioSucursal = function() { document.getElementById('modal-hr-horario-sucursal').classList.add('hidden'); };
window.toggleInputsDia = function(dia) { document.getElementById(`contenedor-bloques-${dia}`).className = document.getElementById(`chk-dia-${dia}`).checked ? 'flex-1 space-y-2' : 'flex-1 space-y-2 opacity-25 pointer-events-none'; };
window.agregarBloqueHorarioDia = function(dia) {
    const l = document.getElementById(`lista-bloques-físicos-${dia}`); const idx = l.children.length;
    const div = document.createElement('div'); div.innerHTML = `<div class="flex items-center gap-2 item-bloque-${dia} mb-1" data-index="${idx}"><input type="time" value="16:00" class="input-apertura px-2 py-1 text-xs border rounded"><span class="text-xs">a</span><input type="time" value="20:00" class="input-cierre px-2 py-1 text-xs border rounded"><button type="button" onclick="this.parentElement.remove()" class="text-red-500 font-bold px-2">&times;</button></div>`;
    l.appendChild(div.firstElementChild);
};

window.guardarHorarioSucursal = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-horario-sucursal'); btn.disabled = true;
    const idActiva = document.getElementById('hr-id-sucursal-activa').value;
    let configJSON = {};
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].forEach(dia => {
        const abierto = document.getElementById(`chk-dia-${dia}`).checked;
        let bq = [];
        if (abierto) {
            document.querySelectorAll(`#lista-bloques-físicos-${dia} .item-bloque-${dia}`).forEach(div => {
                bq.push({ apertura: div.querySelector('.input-apertura').value, cierre: div.querySelector('.input-cierre').value });
            });
        }
        configJSON[dia] = { abierto, bloques: bq.length > 0 ? bq : [{ apertura: '09:00', cierre: '18:00' }] };
    });

    let sucursales = [idActiva, ...Array.from(document.querySelectorAll('input[name="hr-chk-clonar-horario"]:checked')).map(cb => cb.value)];
    try {
        await Promise.all(sucursales.map(async idSuc => {
            const existe = window.horariosSucursalesMemoria.find(h => h.id_sucursal === idSuc);
            const p = { id_empresa: window.miEmpresaId, id_sucursal: idSuc, config_dias: configJSON };
            if (existe) return clienteSupabase.from('hr_sucursal_horarios').update(p).eq('id', existe.id);
            else return clienteSupabase.from('hr_sucursal_horarios').insert([p]);
        }));
        window.cerrarModalHorarioSucursal(); window.cargarHorariosSucursales();
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
};

// ============================================================================
// NUEVO: ADMINISTRACIÓN DE TIPOS DE PERMISOS / AUSENCIAS
// ============================================================================
// ============================================================================
// ADMINISTRACIÓN DE TIPOS DE PERMISOS / AUSENCIAS
// ============================================================================
window.cargarPermisosTipos = async function() {
    const tbody = document.getElementById('hr-tabla-permisos-tipos');
    if (!tbody) return;
    try {
        const { data } = await clienteSupabase.from('hr_permisos_tipos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.permisosTiposMemoria = data || [];
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No has creado políticas de permisos aún.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-bold text-slate-800 text-xs flex items-center gap-2">
                    <span class="w-4 h-4 rounded shadow-sm border border-slate-200 inline-block" style="background-color: ${p.color || '#3b82f6'}"></span> 
                    ${p.nombre}
                </td>
                <td class="px-6 py-4 text-center">
                    ${p.es_remunerado ? '<span class="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold border border-emerald-100">💰 Sí</span>' : '<span class="bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-bold border border-red-100">❌ No</span>'}
                </td>
                <td class="px-6 py-4 text-xs text-slate-500">1 Paso (Admin)</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="editarPermisoTipo('${p.id}')" class="text-blue-600 font-bold px-2 py-1 text-xs hover:bg-blue-50 rounded" title="Editar">✏️</button>
                    <button onclick="duplicarPermisoTipo('${p.id}')" class="text-slate-600 font-bold px-2 py-1 text-xs hover:bg-slate-100 rounded" title="Duplicar">📋</button>
                    <button onclick="eliminarPermisoTipo('${p.id}')" class="text-red-500 font-bold px-2 py-1 text-xs hover:bg-red-50 rounded" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
};

window.abrirModalPermisoTipo = function() {
    document.getElementById('form-hr-permiso-tipo').reset();
    document.getElementById('hr-id-permiso-tipo').value = '';
    document.getElementById('hr-permiso-modal-titulo').innerText = '🏖️ Nuevo Tipo de Permiso';
    document.getElementById('modal-hr-permiso-tipo').classList.remove('hidden');
};

window.editarPermisoTipo = function(id) {
    const p = window.permisosTiposMemoria.find(x => x.id === id);
    if (!p) return;
    document.getElementById('hr-id-permiso-tipo').value = p.id;
    document.getElementById('hr-permiso-nombre').value = p.nombre;
    document.getElementById('hr-permiso-remunerado').checked = p.es_remunerado;
    // Si viene de las clases viejas, ponemos un color por defecto, si es HEX, lo carga.
    document.getElementById('hr-permiso-color').value = p.color?.startsWith('#') ? p.color : '#3b82f6';
    
    document.getElementById('hr-permiso-modal-titulo').innerText = '✏️ Editar Tipo de Permiso';
    document.getElementById('modal-hr-permiso-tipo').classList.remove('hidden');
};

window.duplicarPermisoTipo = function(id) {
    const p = window.permisosTiposMemoria.find(x => x.id === id);
    if (!p) return;
    document.getElementById('hr-id-permiso-tipo').value = ''; // ID vacío para crear nuevo
    document.getElementById('hr-permiso-nombre').value = `${p.nombre} (Copia)`;
    document.getElementById('hr-permiso-remunerado').checked = p.es_remunerado;
    document.getElementById('hr-permiso-color').value = p.color?.startsWith('#') ? p.color : '#3b82f6';
    
    document.getElementById('hr-permiso-modal-titulo').innerText = '📋 Duplicar Tipo de Permiso';
    document.getElementById('modal-hr-permiso-tipo').classList.remove('hidden');
};

window.cerrarModalPermisoTipo = function() {
    document.getElementById('modal-hr-permiso-tipo').classList.add('hidden');
};

window.guardarPermisoTipo = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-permiso'); btn.disabled = true;
    
    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-permiso-nombre').value,
        es_remunerado: document.getElementById('hr-permiso-remunerado').checked,
        color: document.getElementById('hr-permiso-color').value // Guarda el HEX directamente
    };

    const idFicha = document.getElementById('hr-id-permiso-tipo').value;
    try {
        if (idFicha) await clienteSupabase.from('hr_permisos_tipos').update(payload).eq('id', idFicha);
        else await clienteSupabase.from('hr_permisos_tipos').insert([payload]);
        
        window.cerrarModalPermisoTipo();
        window.cargarPermisosTipos();
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
};

window.eliminarPermisoTipo = async function(id) {
    if(confirm("¿Seguro que deseas eliminar este tipo de permiso?")) {
        await clienteSupabase.from('hr_permisos_tipos').delete().eq('id', id);
        window.cargarPermisosTipos();
    }
};

window.abrirModalPermisoTipo = function() {
    document.getElementById('form-hr-permiso-tipo').reset();
    document.getElementById('hr-id-permiso-tipo').value = '';
    document.getElementById('modal-hr-permiso-tipo').classList.remove('hidden');
};

window.cerrarModalPermisoTipo = function() {
    document.getElementById('modal-hr-permiso-tipo').classList.add('hidden');
};

window.guardarPermisoTipo = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-permiso'); btn.disabled = true;
    
    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-permiso-nombre').value,
        es_remunerado: document.getElementById('hr-permiso-remunerado').checked,
        color: document.getElementById('hr-permiso-color').value
    };

    const idFicha = document.getElementById('hr-id-permiso-tipo').value;
    try {
        if (idFicha) await clienteSupabase.from('hr_permisos_tipos').update(payload).eq('id', idFicha);
        else await clienteSupabase.from('hr_permisos_tipos').insert([payload]);
        
        window.cerrarModalPermisoTipo();
        window.cargarPermisosTipos();
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
};

window.eliminarPermisoTipo = async function(id) {
    if(confirm("¿Seguro que deseas eliminar este tipo de permiso?")) {
        await clienteSupabase.from('hr_permisos_tipos').delete().eq('id', id);
        window.cargarPermisosTipos();
    }
};

window.feriadosMemoria = [];

// ============================================================================
// ADMINISTRACIÓN DE FERIADOS Y EVENTOS ESPECIALES
// ============================================================================
window.cargarFeriados = async function() {
    const tbody = document.getElementById('hr-tabla-feriados');
    if (!tbody) return;
    try {
        const { data } = await clienteSupabase.from('hr_feriados_eventos').select('*').eq('id_empresa', window.miEmpresaId).order('fecha', { ascending: true });
        window.feriadosMemoria = data || [];
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No hay eventos o feriados registrados.</td></tr>`;
            return;
        }

        const opcionesFecha = { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' };

        tbody.innerHTML = data.map(f => {
            const fechaObj = new Date(f.fecha + 'T00:00:00Z');
            const estadoHtml = f.cierra_sucursal 
                ? '<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold border border-slate-200">🔒 Tiendas Cerradas</span>' 
                : '<span class="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold border border-emerald-100">✅ Operación Normal</span>';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-black text-slate-800 text-xs capitalize">${fechaObj.toLocaleDateString('es-ES', opcionesFecha)}</td>
                    <td class="px-6 py-4">
                        <p class="font-bold text-slate-800 text-xs">${f.nombre}</p>
                        <p class="text-[9px] text-slate-400 font-medium">Aplica a: ${f.sucursales_afectadas ? f.sucursales_afectadas.length : 0} sucursales</p>
                    </td>
                    <td class="px-6 py-4 text-center">${estadoHtml}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="editarFeriado('${f.id}')" class="text-blue-600 font-bold px-2 py-1 text-xs hover:bg-blue-50 rounded" title="Editar">✏️</button>
                        <button onclick="eliminarFeriado('${f.id}')" class="text-red-500 font-bold px-2 py-1 text-xs hover:bg-red-50 rounded" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error(e); }
};

window.cargarSucursalesEnModalFeriado = function(seleccionadas) {
    const cont = document.getElementById('hr-feriado-sucursales');
    // Reutilizamos la memoria de sucursales que ya cargó la configuración
    cont.innerHTML = window.sucursalesMemoriaHR.map(s => `
        <label class="flex items-center gap-2 p-2 border border-slate-200 rounded text-xs cursor-pointer hover:bg-slate-50">
            <input type="checkbox" name="hr-chk-sucursal-feriado" value="${s.id}" ${seleccionadas.includes(s.id)?'checked':''} class="w-3.5 h-3.5 accent-slate-800">
            <span class="font-bold text-slate-700">${s.nombre}</span>
        </label>
    `).join('');
};

window.abrirModalFeriado = function() {
    document.getElementById('form-hr-feriado').reset();
    document.getElementById('hr-id-feriado').value = '';
    document.getElementById('hr-feriado-modal-titulo').innerText = '🎉 Registrar Feriado o Evento';
    document.getElementById('hr-feriado-cierra').checked = true; // Por defecto cierra
    window.cargarSucursalesEnModalFeriado([]);
    document.getElementById('modal-hr-feriado').classList.remove('hidden');
};

window.editarFeriado = function(id) {
    const f = window.feriadosMemoria.find(x => x.id === id);
    if (!f) return;
    document.getElementById('hr-id-feriado').value = f.id;
    document.getElementById('hr-feriado-nombre').value = f.nombre;
    document.getElementById('hr-feriado-fecha').value = f.fecha;
    document.getElementById('hr-feriado-cierra').checked = f.cierra_sucursal;
    
    document.getElementById('hr-feriado-modal-titulo').innerText = '✏️ Editar Evento';
    window.cargarSucursalesEnModalFeriado(f.sucursales_afectadas || []);
    document.getElementById('modal-hr-feriado').classList.remove('hidden');
};

window.cerrarModalFeriado = function() {
    document.getElementById('modal-hr-feriado').classList.add('hidden');
};

window.guardarFeriado = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-feriado'); btn.disabled = true;
    
    const sucursalesArr = Array.from(document.querySelectorAll('input[name="hr-chk-sucursal-feriado"]:checked')).map(cb => cb.value);

    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-feriado-nombre').value,
        fecha: document.getElementById('hr-feriado-fecha').value,
        cierra_sucursal: document.getElementById('hr-feriado-cierra').checked,
        sucursales_afectadas: sucursalesArr
    };

    const idFicha = document.getElementById('hr-id-feriado').value;
    try {
        if (idFicha) await clienteSupabase.from('hr_feriados_eventos').update(payload).eq('id', idFicha);
        else await clienteSupabase.from('hr_feriados_eventos').insert([payload]);
        
        window.cerrarModalFeriado();
        window.cargarFeriados();
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
};

window.eliminarFeriado = async function(id) {
    if(confirm("¿Seguro que deseas eliminar este evento del calendario?")) {
        await clienteSupabase.from('hr_feriados_eventos').delete().eq('id', id);
        window.cargarFeriados();
    }
};