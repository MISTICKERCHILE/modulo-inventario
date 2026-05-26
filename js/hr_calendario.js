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
            if(t.lleva_once_cena) comidasHtml.push('🌆 Once/Cena');
            
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

window.duplicarPlantillaTurno = async function(id) {
    const t = window.plantillasTurnosMemoria.find(x => x.id === id);
    if (!t) return;

    document.getElementById('hr-id-turno-plantilla').value = '';
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
            const { error } = await clienteSupabase.from('hr_turnos_plantillas').update(payload).eq('id', idFicha);
            if (error) throw error;
        } else {
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
// ADMINISTRACIÓN DE HORARIOS DE SUCURSALES (CON BLOQUES MÚLTIPLES)
// ============================================================================
window.sucursalesMemoriaHR = [];
window.horariosSucursalesMemoria = [];
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

window.cargarHorariosSucursales = async function() {
    const contenedor = document.getElementById('hr-lista-sucursales-horarios');
    if (!contenedor) return;

    try {
        const { data: sucursales, error: errSuc } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
        if (errSuc) throw errSuc;
        window.sucursalesMemoriaHR = sucursales || [];

        const { data: horarios, error: errHor } = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
        if (errHor) throw errHor;
        window.horariosSucursalesMemoria = horarios || [];

        if (window.sucursalesMemoriaHR.length === 0) {
            contenedor.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm italic col-span-full">No tienes sucursales creadas. Ve a Catálogos -> Sucursales.</div>`;
            return;
        }

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

    // Generar la estructura de Lunes a Domingo
    contDias.innerHTML = DIAS_SEMANA.map(dia => {
        const diaData = configGuardada[dia] || { abierto: true, bloques: [{ apertura: '09:00', cierre: '18:00' }] };
        const bloques = diaData.bloques || [{ apertura: diaData.apertura || '09:00', cierre: diaData.cierre || '18:00' }];

        return `
            <div class="bg-white p-3 rounded-md border border-slate-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3" id="fila-dia-${dia}">
                <div class="flex items-center gap-3 pt-1.5 sm:w-1/4 shrink-0">
                    <input type="checkbox" id="chk-dia-${dia}" ${diaData.abierto ? 'checked' : ''} onchange="toggleInputsDia('${dia}')" class="w-4 h-4 accent-emerald-600 cursor-pointer shadow-sm">
                    <span class="font-black text-sm text-slate-700 w-24">${dia}</span>
                </div>
                
                <div class="flex-1 space-y-2 ${!diaData.abierto ? 'opacity-25 pointer-events-none' : ''}" id="contenedor-bloques-${dia}">
                    <div id="lista-bloques-físicos-${dia}" class="space-y-2 flex flex-col items-end sm:items-start">
                        ${bloques.map((b, index) => window.generarHtmlBloqueHorario(dia, index, b.apertura, b.cierre)).join('')}
                    </div>
                    <button type="button" onclick="agregarBloqueHorarioDia('${dia}')" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-1 transition-colors w-full sm:w-auto justify-end sm:justify-start">
                        ➕ Añadir segundo tramo (Horario Cortado)
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Preparar contenedor de clonado
    const contClonar = document.getElementById('hr-contenedor-clonar-sucursales');
    const otrasSucursales = window.sucursalesMemoriaHR.filter(s => s.id !== id_sucursal);
    
    if (otrasSucursales.length === 0) {
        contClonar.innerHTML = '<p class="text-[10px] text-slate-500 italic">No tienes otras sucursales para clonar este horario.</p>';
    } else {
        contClonar.innerHTML = otrasSucursales.map(s => `
            <label class="flex items-center gap-2 p-1.5 bg-white border border-blue-100 rounded cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" name="hr-chk-clonar-horario" value="${s.id}" class="w-3.5 h-3.5 accent-blue-600">
                <span class="text-[11px] font-bold text-blue-800">${s.nombre}</span>
            </label>
        `).join('');
    }

    document.getElementById('modal-hr-horario-sucursal').classList.remove('hidden');
};

// Generador de la fila de horas (Entrada -> Salida -> Botón Eliminar)
window.generarHtmlBloqueHorario = function(dia, index, apertura = '09:00', cierre = '18:00') {
    return `
        <div class="flex items-center gap-2 item-bloque-${dia}" data-index="${index}">
            <input type="time" value="${apertura}" class="input-apertura px-2 py-1.5 border border-slate-300 rounded text-xs font-bold text-slate-700 bg-slate-50 focus:bg-white w-28 shadow-inner">
            <span class="text-xs text-slate-400 font-bold">a</span>
            <input type="time" value="${cierre}" class="input-cierre px-2 py-1.5 border border-slate-300 rounded text-xs font-bold text-slate-700 bg-slate-50 focus:bg-white w-28 shadow-inner">
            
            ${index > 0 ? `
                <button type="button" onclick="removerBloqueHorarioDia('${dia}', ${index}, this)" class="text-red-500 hover:text-red-700 font-bold text-base px-2 transition-colors" title="Eliminar tramo">&times;</button>
            ` : '<span class="w-8"></span>'}
        </div>
    `;
};

window.agregarBloqueHorarioDia = function(dia) {
    const lista = document.getElementById(`lista-bloques-físicos-${dia}`);
    if(!lista) return;
    
    const indexSiguiente = lista.children.length;
    const nuevoBloqueHtml = window.generarHtmlBloqueHorario(dia, indexSiguiente, '16:00', '20:00');
    
    const divTemporal = document.createElement('div');
    divTemporal.innerHTML = nuevoBloqueHtml;
    lista.appendChild(divTemporal.firstElementChild);
};

window.removerBloqueHorarioDia = function(dia, index, boton) {
    const contenedorBloque = boton.parentElement;
    if(contenedorBloque) {
        contenedorBloque.remove();
    }
};

window.toggleInputsDia = function(dia) {
    const isChecked = document.getElementById(`chk-dia-${dia}`).checked;
    const divInputs = document.getElementById(`contenedor-bloques-${dia}`);
    if (isChecked) {
        divInputs.classList.remove('opacity-25', 'pointer-events-none');
    } else {
        divInputs.classList.add('opacity-25', 'pointer-events-none');
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
    
    // Recolectar la información avanzada del molde
    let configDiasJSON = {};
    
    DIAS_SEMANA.forEach(dia => {
        const isAbierto = document.getElementById(`chk-dia-${dia}`).checked;
        let bloquesArr = [];
        
        if (isAbierto) {
            const bloquesFisicos = document.querySelectorAll(`#lista-bloques-físicos-${dia} .item-bloque-${dia}`);
            bloquesFisicos.forEach(bloque => {
                const hApertura = bloque.querySelector('.input-apertura').value;
                const hCierre = bloque.querySelector('.input-cierre').value;
                bloquesArr.push({ apertura: hApertura, cierre: hCierre });
            });
        }

        configDiasJSON[dia] = {
            abierto: isAbierto,
            bloques: bloquesArr.length > 0 ? bloquesArr : [{ apertura: '09:00', cierre: '18:00' }]
        };
    });

    const checkboxesClonar = document.querySelectorAll('input[name="hr-chk-clonar-horario"]:checked');
    let listaSucursalesAfectadas = [idSucursalActiva];
    checkboxesClonar.forEach(cb => listaSucursalesAfectadas.push(cb.value));

    try {
        const promesas = listaSucursalesAfectadas.map(async (idSuc) => {
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
        await window.cargarHorariosSucursales();

    } catch (err) {
        console.error("Error guardando horario:", err);
        alert("Ocurrió un error al guardar el horario.");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Horario";
    }
};

// ============================================================================
// EL PROGRAMADOR MATRICIAL (CON DRAG AND DROP)
// ============================================================================

window.abrirModalProgramador = function() {
    const modal = document.getElementById('modal-hr-programador');
    const selectSuc = document.getElementById('prog-sucursal');
    
    // Llenar select de sucursales (usamos la memoria que ya teníamos)
    selectSuc.innerHTML = '<option value="">Seleccionar Sucursal...</option>' + 
        window.sucursalesMemoriaHR.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    // Setear fechas por defecto (Hoy y en 6 días)
    const hoy = new Date();
    const proximaSemana = new Date(hoy);
    proximaSemana.setDate(hoy.getDate() + 6);

    document.getElementById('prog-fecha-inicio').value = hoy.toISOString().split('T')[0];
    document.getElementById('prog-fecha-fin').value = proximaSemana.toISOString().split('T')[0];

    document.getElementById('prog-tabla-head').innerHTML = '';
    document.getElementById('prog-tabla-body').innerHTML = `<tr><td class="p-8 text-center text-slate-400 font-medium italic" colspan="100%">Haz clic en "Generar Plantilla" para comenzar.</td></tr>`;

    modal.classList.remove('hidden');
};

window.cerrarModalProgramador = function() {
    document.getElementById('modal-hr-programador').classList.add('hidden');
};

// Genera la cuadrícula visual para el Drag & Drop
window.generarMatrizProgramador = function() {
    const thead = document.getElementById('prog-tabla-head');
    const tbody = document.getElementById('prog-tabla-body');
    
    // Simulamos 3 días para la prueba visual
    thead.innerHTML = `
        <tr>
            <th class="px-4 py-3 text-left font-bold text-slate-600 uppercase text-xs w-64 bg-slate-200">Colaborador</th>
            <th class="px-2 py-3 text-center font-bold text-slate-600 uppercase text-[10px] border-l border-slate-300">Lunes 10</th>
            <th class="px-2 py-3 text-center font-bold text-slate-600 uppercase text-[10px] border-l border-slate-300">Martes 11</th>
            <th class="px-2 py-3 text-center font-bold text-slate-600 uppercase text-[10px] border-l border-slate-300 bg-slate-50">Miércoles 12 (Cerrado)</th>
        </tr>
    `;

    // Simulamos 3 trabajadores para probar el drag and drop
    const simulados = [
        { id: '1', nombre: 'Valentina Nunez', cargo: 'Gerente' },
        { id: '2', nombre: 'Juan Pérez', cargo: 'Cajero' },
        { id: '3', nombre: 'María Gómez', cargo: 'Vendedora' }
    ];

    tbody.innerHTML = simulados.map(p => `
        <tr class="hover:bg-blue-50 transition-colors border-b border-slate-100 bg-white cursor-move group" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)">
            <td class="px-4 py-2 border-r border-slate-200 flex items-center gap-3">
                <span class="text-slate-300 group-hover:text-blue-500 cursor-grab text-lg">☰</span>
                <div>
                    <p class="font-bold text-slate-800 text-xs">${p.nombre}</p>
                    <p class="text-[9px] text-slate-400">${p.cargo}</p>
                </div>
            </td>
            <td class="px-2 py-2 border-r border-slate-200 text-center">
                <select class="w-full text-[10px] p-1 border border-slate-200 rounded outline-none cursor-pointer focus:border-blue-500"><option>+ Asignar</option><option>Turno AM</option></select>
            </td>
            <td class="px-2 py-2 border-r border-slate-200 text-center">
                <div class="bg-blue-100 text-blue-800 text-[10px] font-bold p-1 rounded border border-blue-200 shadow-sm cursor-pointer hover:bg-blue-200">08:00 a 15:30</div>
            </td>
            <td class="px-2 py-2 text-center bg-slate-50">
                <span class="text-[10px] text-slate-400 italic">Libre</span>
            </td>
        </tr>
    `).join('');
};

// --- LÓGICA NATIVA DE DRAG AND DROP ---
let filaArrastrada = null;

window.dragStart = function(e) {
    filaArrastrada = e.target.closest('tr');
    e.dataTransfer.effectAllowed = 'move';
    // Efecto visual al agarrar
    setTimeout(() => filaArrastrada.classList.add('opacity-50'), 0);
};

window.dragOver = function(e) {
    e.preventDefault(); // Necesario para permitir el drop
    e.dataTransfer.dropEffect = 'move';
    const trObjetivo = e.target.closest('tr');
    
    if (trObjetivo && trObjetivo !== filaArrastrada && trObjetivo.parentNode === filaArrastrada.parentNode) {
        // Calculamos si soltamos arriba o abajo del elemento
        const rect = trObjetivo.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        trObjetivo.parentNode.insertBefore(filaArrastrada, next ? trObjetivo.nextSibling : trObjetivo);
    }
};

window.drop = function(e) {
    e.stopPropagation();
    if (filaArrastrada) {
        filaArrastrada.classList.remove('opacity-50');
        filaArrastrada = null;
    }
    return false;
};