window.plantillasTurnosMemoria = [];
window.modoVistaCalendarioActual = 'semana';

// ============================================================================
// NAVEGACIÓN PRINCIPAL: CALENDARIO vs CONFIGURACIÓN
// ============================================================================
window.toggleConfiguracionHR = function(mostrarConfig) {
    const panelVisor = document.getElementById('hr-panel-visor');
    const panelConfig = document.getElementById('hr-panel-config');
    const controlesCal = document.getElementById('hr-controles-calendario');
    const btnEntrar = document.getElementById('hr-btn-entrar-config');
    const btnVolver = document.getElementById('hr-btn-volver-cal');
    const titulo = document.getElementById('hr-cal-titulo');
    const sub = document.getElementById('hr-cal-sub');

    if (mostrarConfig) {
        panelVisor.classList.add('hidden');
        panelConfig.classList.remove('hidden');
        controlesCal.classList.add('hidden');
        btnEntrar.classList.add('hidden');
        btnVolver.classList.remove('hidden');
        titulo.innerText = '⚙️ Configuración Operativa';
        sub.innerText = 'Administra los horarios de sucursales, plantillas de turnos y feriados';
        
        // --- LLAMAMOS A LAS DOS FUNCIONES DE CARGA ---
        window.cargarPlantillasTurnos();
        window.cargarHorariosSucursales(); 
    } else {
        panelConfig.classList.add('hidden');
        panelVisor.classList.remove('hidden');
        btnVolver.classList.add('hidden');
        controlesCal.classList.remove('hidden');
        btnEntrar.classList.remove('hidden');
        titulo.innerText = '📅 Calendario Operativo';
        sub.innerText = 'Control de turnos y asistencia del personal';
    }
};

window.cambiarModoVistaCalendario = function(modo) {
    window.modoVistaCalendarioActual = modo;
    console.log("Filtro de vista cambiado a:", modo);
};

// ============================================================================
// ADMINISTRACIÓN DE PLANTILLAS DE TURNOS BASE (CRUD + DUPLICAR)
// ============================================================================
window.cargarPlantillasTurnos = async function() {
    const tbody = document.getElementById('hr-tabla-plantillas-turnos');
    if (!tbody) return;

    try {
        const { data, error } = await clienteSupabase
            .from('hr_turnos_plantillas')
            .select('*')
            .eq('id_empresa', window.miEmpresaId)
            .order('nombre', { ascending: true });

        if (error) throw error;
        window.plantillasTurnosMemoria = data || [];

        if (window.plantillasTurnosMemoria.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No hay plantillas de turnos creadas todavía.</td></tr>`;
            return;
        }

        tbody.innerHTML = window.plantillasTurnosMemoria.map(t => {
            let comidasHtml = [];
            if(t.lleva_desayuno) comidasHtml.push('🍳 Desayuno');
            if(t.lleva_almuerzo) comidasHtml.push('🍲 Almuerzo');
            if(t.lleva_once_cena) comidasHtml.push('%;">Once/Cena');
            
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-bold text-slate-800 text-sm">
                        <p>${t.nombre}</p>
                        <p class="text-[9px] text-slate-400 font-medium">Sucursales habilitadas: ${t.sucursales_disponibles ? t.sucursales_disponibles.length : 0}</p>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="bg-blue-50 text-blue-700 font-mono font-bold px-2.5 py-1 rounded-md text-xs border border-blue-100 shadow-sm">
                            ${t.hora_inicio.slice(0,5)} a ${t.hora_fin.slice(0,5)}
                        </span>
                        ${t.descanso_minutos ? `<p class="text-[10px] text-slate-400 font-bold mt-1">⏸ Descanso: ${t.descanso_minutos} min</p>` : ''}
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${comidasHtml.length > 0 ? `<div class="flex flex-wrap justify-center gap-1.5">${comidasHtml.map(c => `<span class="bg-orange-50 text-orange-700 text-[10px] border border-orange-100 font-bold px-2 py-0.5 rounded-md">${c}</span>`).join('')}</div>` : '<span class="text-slate-400 italic text-xs">Ninguno</span>'}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-1.5">
                            <button onclick="editarPlantillaTurno('${t.id}')" class="text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-100 shadow-sm px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors">✏️ Editar</button>
                            <button onclick="duplicarPlantillaTurno('${t.id}')" class="text-slate-600 hover:text-slate-800 bg-slate-100 border border-slate-200 shadow-sm px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors">📋 Duplicar</button>
                            <button onclick="eliminarPlantillaTurno('${t.id}')" class="text-red-500 hover:text-red-700 bg-red-50 border border-red-100 shadow-sm px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors">Eliminar</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 font-bold">❌ Error al cargar los turnos.</td></tr>`;
    }
};

window.abrirModalTurnoPlantilla = async function() {
    document.getElementById('form-hr-turno-plantilla').reset();
    document.getElementById('hr-id-turno-plantilla').value = '';
    document.getElementById('hr-turno-modal-titulo').innerText = '💼 Nueva Plantilla de Turno';
    
    await window.cargarSucursalesEnModalTurno([]);
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');
};

// Carga reutilizable de los checkboxes de sucursales
window.cargarSucursalesEnModalTurno = async function(seleccionadas) {
    const contSucursales = document.getElementById('hr-turno-sucursales');
    if (!contSucursales) return;
    
    try {
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
        contSucursales.innerHTML = sucursales.map(s => {
            const checked = seleccionadas.includes(s.id) ? 'checked' : '';
            return `
                <label class="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white cursor-pointer hover:bg-emerald-50 transition-colors">
                    <input type="checkbox" name="hr-chk-sucursal-turno" value="${s.id}" ${checked} class="w-4 h-4 accent-emerald-600 shadow-sm cursor-pointer">
                    <span class="text-xs font-bold text-slate-700">${s.nombre}</span>
                </label>
            `;
        }).join('');
    } catch (err) {
        contSucursales.innerHTML = '<p class="text-xs text-red-500 font-bold">Error cargando sucursales</p>';
    }
};

window.cerrarModalTurnoPlantilla = function() {
    document.getElementById('modal-hr-turno-plantilla').classList.add('hidden');
};

// --- MÓDULO EDITAR (Mapeo de datos al formulario) ---
window.editarPlantillaTurno = async function(id) {
    const t = window.plantillasTurnosMemoria.find(x => x.id === id);
    if (!t) return;

    document.getElementById('hr-id-turno-plantilla').value = t.id;
    document.getElementById('hr-turno-nombre').value = t.nombre;
    document.getElementById('hr-turno-entrada').value = t.hora_inicio.slice(0,5);
    document.getElementById('hr-turno-salida').value = t.hora_fin.slice(0,5);
    document.getElementById('hr-turno-descanso').value = t.descanso_minutos || '';
    document.getElementById('hr-chk-desayuno').checked = t.lleva_desayuno;
    document.getElementById('hr-chk-almuerzo').checked = t.lleva_almuerzo;
    document.getElementById('hr-chk-once').checked = t.lleva_once_cena;

    document.getElementById('hr-turno-modal-titulo').innerText = '✏️ Editar Plantilla de Turno';
    await window.cargarSucursalesEnModalTurno(t.sucursales_disponibles || []);
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');
};

// --- MÓDULO DUPLICAR (Mapeo rápido de datos clonados) ---
window.duplicarPlantillaTurno = async function(id) {
    const t = window.plantillasTurnosMemoria.find(x => x.id === id);
    if (!t) return;

    document.getElementById('hr-id-turno-plantilla').value = ''; // Vacío para que cree un registro NUEVO
    document.getElementById('hr-turno-nombre').value = `${t.nombre} (Copia)`;
    document.getElementById('hr-turno-entrada').value = t.hora_inicio.slice(0,5);
    document.getElementById('hr-turno-salida').value = t.hora_fin.slice(0,5);
    document.getElementById('hr-turno-descanso').value = t.descanso_minutos || '';
    document.getElementById('hr-chk-desayuno').checked = t.lleva_desayuno;
    document.getElementById('hr-chk-almuerzo').checked = t.lleva_almuerzo;
    document.getElementById('hr-chk-once').checked = t.lleva_once_cena;

    document.getElementById('hr-turno-modal-titulo').innerText = '📋 Duplicar Plantilla de Turno';
    await window.cargarSucursalesEnModalTurno(t.sucursales_disponibles || []);
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');
};

// --- GUARDAR (INSERCIÓN O ACTUALIZACIÓN) ---
window.guardarTurnoPlantilla = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-plantilla-turno');
    const idFicha = document.getElementById('hr-id-turno-plantilla').value;
    btn.disabled = true; btn.innerText = "Guardando...";

    const checkboxes = document.querySelectorAll('input[name="hr-chk-sucursal-turno"]:checked');
    const sucursalesArr = Array.from(checkboxes).map(cb => cb.value);

    if (sucursalesArr.length === 0) {
        alert("Debes seleccionar al menos una sucursal para este turno.");
        btn.disabled = false; btn.innerText = "Guardar Plantilla";
        return;
    }

    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-turno-nombre').value.trim(),
        hora_inicio: document.getElementById('hr-turno-entrada').value,
        hora_fin: document.getElementById('hr-turno-salida').value,
        descanso_minutos: document.getElementById('hr-turno-descanso').value ? parseInt(document.getElementById('hr-turno-descanso').value) : 0,
        lleva_desayuno: document.getElementById('hr-chk-desayuno').checked,
        lleva_almuerzo: document.getElementById('hr-chk-almuerzo').checked,
        lleva_once_cena: document.getElementById('hr-chk-once').checked,
        sucursales_disponibles: sucursalesArr
    };

    try {
        if (idFicha) {
            // Edición
            const { error } = await clienteSupabase.from('hr_turnos_plantillas').update(payload).eq('id', idFicha);
            if (error) throw error;
        } else {
            // Creación o Duplicación
            const { error } = await clienteSupabase.from('hr_turnos_plantillas').insert([payload]);
            if (error) throw error;
        }
        
        window.cerrarModalTurnoPlantilla();
        await window.cargarPlantillasTurnos();
    } catch (err) {
        alert("Error al guardar la plantilla de turno.");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Plantilla";
    }
};

window.eliminarPlantillaTurno = async function(id) {
    if(confirm("¿Seguro que deseas borrar esta plantilla de turno?")) {
        await clienteSupabase.from('hr_turnos_plantillas').delete().eq('id', id);
        await window.cargarPlantillasTurnos();
    }
};

// ============================================================================
// ADMINISTRACIÓN DE HORARIOS DE SUCURSALES (Lunes a Domingo)
// ============================================================================
window.sucursalesMemoriaHR = [];
window.horariosSucursalesMemoria = [];
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

window.cargarHorariosSucursales = async function() {
    const contenedor = document.getElementById('hr-lista-sucursales-horarios');
    if (!contenedor) return;

    try {
        // 1. Traemos las sucursales
        const { data: sucursales, error: errSuc } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
        if (errSuc) throw errSuc;
        window.sucursalesMemoriaHR = sucursales || [];

        // 2. Traemos las configuraciones de horario guardadas
        const { data: horarios, error: errHor } = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
        if (errHor) throw errHor;
        window.horariosSucursalesMemoria = horarios || [];

        if (window.sucursalesMemoriaHR.length === 0) {
            contenedor.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm italic col-span-full">No tienes sucursales creadas. Ve a Catálogos -> Sucursales.</div>`;
            return;
        }

        // Renderizamos las tarjetas
        contenedor.innerHTML = window.sucursalesMemoriaHR.map(suc => {
            const horarioGuardado = window.horariosSucursalesMemoria.find(h => h.id_sucursal === suc.id);
            const estadoHtml = horarioGuardado 
                ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded border border-emerald-200">✅ Horario Configurado</span>`
                : `<span class="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded border border-red-200">⚠️ Falta Configurar</span>`;

            return `
                <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between items-start gap-4 hover:shadow-md transition-shadow">
                    <div class="w-full flex justify-between items-start">
                        <div>
                            <h4 class="font-black text-slate-800">${suc.nombre}</h4>
                            <div class="mt-2">${estadoHtml}</div>
                        </div>
                        <div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-xl">🏪</div>
                    </div>
                    <button onclick="abrirModalHorarioSucursal('${suc.id}')" class="w-full mt-2 bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 text-slate-700 font-bold py-2 rounded-lg text-xs shadow-sm transition-colors">
                        ⚙️ Editar Horario
                    </button>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        contenedor.innerHTML = `<div class="p-6 text-center text-red-500 text-sm font-bold col-span-full">Error al cargar las sucursales.</div>`;
    }
};

window.abrirModalHorarioSucursal = function(id_sucursal) {
    const sucursal = window.sucursalesMemoriaHR.find(s => s.id === id_sucursal);
    const horario = window.horariosSucursalesMemoria.find(h => h.id_sucursal === id_sucursal);

    document.getElementById('hr-horario-titulo').innerText = `⚙️ Horario: ${sucursal.nombre}`;
    document.getElementById('hr-id-sucursal-activa').value = id_sucursal;
    document.getElementById('hr-id-horario-sucursal').value = horario ? horario.id : '';

    const configGuardada = horario ? horario.config_dias : {};
    const contDias = document.getElementById('hr-contenedor-dias-semana');

    // Generar las filas de Lunes a Domingo
    contDias.innerHTML = DIAS_SEMANA.map(dia => {
        const diaData = configGuardada[dia] || { abierto: true, apertura: '09:00', cierre: '18:00' };
        return `
            <div class="flex items-center justify-between bg-white p-3 rounded-md border border-slate-200 gap-4">
                <div class="flex items-center gap-3 w-1/3">
                    <input type="checkbox" id="chk-dia-${dia}" ${diaData.abierto ? 'checked' : ''} onchange="toggleInputsDia('${dia}')" class="w-4 h-4 accent-emerald-600 cursor-pointer">
                    <span class="font-bold text-sm text-slate-700 w-20">${dia}</span>
                </div>
                <div class="flex items-center gap-2 w-2/3 justify-end ${!diaData.abierto ? 'opacity-30 pointer-events-none' : ''}" id="inputs-dia-${dia}">
                    <input type="time" id="apertura-${dia}" value="${diaData.apertura}" class="px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 w-24">
                    <span class="text-xs text-slate-400 font-bold">a</span>
                    <input type="time" id="cierre-${dia}" value="${diaData.cierre}" class="px-2 py-1 border border-slate-300 rounded text-xs font-bold text-slate-700 w-24">
                </div>
            </div>
        `;
    }).join('');

    // Preparar contenedor de clonado (Mostrar otras sucursales, excluir la actual)
    const contClonar = document.getElementById('hr-contenedor-clonar-sucursales');
    const otrasSucursales = window.sucursalesMemoriaHR.filter(s => s.id !== id_sucursal);
    
    if (otrasSucursales.length === 0) {
        contClonar.innerHTML = '<p class="text-[10px] text-slate-500 italic">No tienes otras sucursales para clonar este horario.</p>';
    } else {
        contClonar.innerHTML = otrasSucursales.map(s => `
            <label class="flex items-center gap-2 p-1.5 bg-white border border-blue-100 rounded cursor-pointer hover:bg-blue-50">
                <input type="checkbox" name="hr-chk-clonar-horario" value="${s.id}" class="w-3.5 h-3.5 accent-blue-600">
                <span class="text-[11px] font-bold text-blue-800">${s.nombre}</span>
            </label>
        `).join('');
    }

    document.getElementById('modal-hr-horario-sucursal').classList.remove('hidden');
};

window.toggleInputsDia = function(dia) {
    const isChecked = document.getElementById(`chk-dia-${dia}`).checked;
    const divInputs = document.getElementById(`inputs-dia-${dia}`);
    if (isChecked) {
        divInputs.classList.remove('opacity-30', 'pointer-events-none');
    } else {
        divInputs.classList.add('opacity-30', 'pointer-events-none');
    }
};

window.cerrarModalHorarioSucursal = function() {
    document.getElementById('modal-hr-horario-sucursal').classList.add('hidden');
};

window.guardarHorarioSucursal = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-horario-sucursal');
    btn.disabled = true; btn.innerText = "Guardando...";

    const idSucursalActiva = document.getElementById('hr-id-sucursal-activa').value;
    
    // 1. Armar el JSON de los 7 días
    let configDiasJSON = {};
    DIAS_SEMANA.forEach(dia => {
        configDiasJSON[dia] = {
            abierto: document.getElementById(`chk-dia-${dia}`).checked,
            apertura: document.getElementById(`apertura-${dia}`).value,
            cierre: document.getElementById(`cierre-${dia}`).value
        };
    });

    // 2. Revisar a qué sucursales clonar
    const checkboxesClonar = document.querySelectorAll('input[name="hr-chk-clonar-horario"]:checked');
    let listaSucursalesAfectadas = [idSucursalActiva];
    checkboxesClonar.forEach(cb => listaSucursalesAfectadas.push(cb.value));

    try {
        // Para cada sucursal afectada, preparamos el UPSERT (Actualizar si existe, Insertar si no)
        const promesas = listaSucursalesAfectadas.map(async (idSuc) => {
            // Buscamos si ya tiene registro
            const horarioExistente = window.horariosSucursalesMemoria.find(h => h.id_sucursal === idSuc);
            const payload = {
                id_empresa: window.miEmpresaId,
                id_sucursal: idSuc,
                nombre_version: 'Horario Estándar',
                activo: true,
                config_dias: configDiasJSON
            };

            if (horarioExistente) {
                return clienteSupabase.from('hr_sucursal_horarios').update(payload).eq('id', horarioExistente.id);
            } else {
                return clienteSupabase.from('hr_sucursal_horarios').insert([payload]);
            }
        });

        await Promise.all(promesas);

        window.cerrarModalHorarioSucursal();
        await window.cargarHorariosSucursales(); // Refrescamos la vista

    } catch (err) {
        console.error("Error guardando horario:", err);
        alert("Ocurrió un error al guardar el horario.");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Horario";
    }
};