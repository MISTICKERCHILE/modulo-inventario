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
        // MODO CONFIGURACIÓN (Ocultamos el calendario)
        panelVisor.classList.add('hidden');
        panelConfig.classList.remove('hidden');
        controlesCal.classList.add('hidden');
        btnEntrar.classList.add('hidden');
        btnVolver.classList.remove('hidden');
        titulo.innerText = '⚙️ Configuración Operativa';
        sub.innerText = 'Administra los horarios de sucursales, plantillas de turnos y feriados';
        
        // Cargamos las tablas de configuración
        window.cargarPlantillasTurnos();
        window.cargarHorariosSucursales(); 
    } else {
        // MODO CALENDARIO (Volvemos a la vista principal)
        panelConfig.classList.add('hidden');
        panelVisor.classList.remove('hidden');
        btnVolver.classList.add('hidden');
        controlesCal.classList.remove('hidden');
        btnEntrar.classList.remove('hidden');
        titulo.innerText = '📅 Calendario Operativo';
        sub.innerText = 'Control de turnos y asistencia del personal';
        
        // --- AQUÍ ES DONDE DEBE IR ---
        window.cargarCalendarioPrincipal(); 
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

    // Vemos si está marcado el check "Sin horario"
    const esAusencia = document.getElementById('hr-chk-ausencia').checked;

    const payload = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('hr-turno-nombre').value.trim(),
        // Si es ausencia, mandamos null, sino mandamos la hora
        hora_inicio: esAusencia ? null : document.getElementById('hr-turno-entrada').value,
        hora_fin: esAusencia ? null : document.getElementById('hr-turno-salida').value,
        descanso_minutos: esAusencia ? 0 : (document.getElementById('hr-turno-descanso').value ? parseInt(document.getElementById('hr-turno-descanso').value) : 0),
        es_ausencia: esAusencia, // Guardamos la bandera en Supabase
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

        // SI ESTAMOS EN MEDIO DE UNA PROGRAMACIÓN, REGENERAMOS LA TABLA
        if (!document.getElementById('modal-hr-programador').classList.contains('hidden')) {
            window.generarMatrizProgramador();
        }

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
// EL PROGRAMADOR MATRICIAL (CONECTADO A LA REALIDAD + DRAG AND DROP)
// ============================================================================

window.abrirModalProgramador = async function() {
    const modal = document.getElementById('modal-hr-programador');
    const selectSuc = document.getElementById('prog-sucursal');
    
    // Cambiamos el botón visualmente para que se sepa que está cargando
    const btnAbrir = document.querySelector('button[onclick="abrirModalProgramador()"]');
    if (btnAbrir) { btnAbrir.disabled = true; btnAbrir.innerHTML = '<span>⏳</span> <span class="hidden sm:inline">Cargando...</span>'; }

    try {
        // FORZAMOS LA CARGA DE DATOS PARA QUE NUNCA ESTÉ VACÍO
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.sucursalesMemoriaHR = sucursales || [];

        const { data: horarios } = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
        window.horariosSucursalesMemoria = horarios || [];

        const { data: turnos } = await clienteSupabase.from('hr_turnos_plantillas').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.plantillasTurnosMemoria = turnos || [];

    } catch (e) {
        console.error("Error al cargar datos del programador:", e);
    } finally {
        // Restauramos el botón
        if (btnAbrir) { btnAbrir.disabled = false; btnAbrir.innerHTML = '<span>➕</span> <span class="hidden sm:inline">Programar Turnos</span>'; }
    }
    
    // Ahora sí, llenamos el select con los datos frescos
    selectSuc.innerHTML = '<option value="">Seleccionar Sucursal...</option>' + 
        window.sucursalesMemoriaHR.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    // Setear fechas por defecto (Hoy y en 6 días)
    const hoy = new Date();
    const proximaSemana = new Date(hoy);
    proximaSemana.setDate(hoy.getDate() + 6);

    document.getElementById('prog-fecha-inicio').value = hoy.toISOString().split('T')[0];
    document.getElementById('prog-fecha-fin').value = proximaSemana.toISOString().split('T')[0];

    document.getElementById('prog-tabla-head').innerHTML = '';
    document.getElementById('prog-tabla-body').innerHTML = `<tr><td class="p-8 text-center text-slate-400 font-medium italic" colspan="100%">Selecciona una sucursal y haz clic en "Generar Plantilla".</td></tr>`;

    modal.classList.remove('hidden');
};

window.cerrarModalProgramador = function() {
    document.getElementById('modal-hr-programador').classList.add('hidden');
};

// Función para ocultar/mostrar horas si es ausencia
window.toggleHorasAusencia = function(esAusencia) {
    const contHoras = document.getElementById('hr-contenedor-horas-turno');
    const inputEntrada = document.getElementById('hr-turno-entrada');
    const inputSalida = document.getElementById('hr-turno-salida');
    const inputDescanso = document.getElementById('hr-turno-descanso');
    
    if (esAusencia) {
        contHoras.classList.add('opacity-30', 'pointer-events-none');
        inputEntrada.value = ''; inputSalida.value = ''; inputDescanso.value = '';
    } else {
        contHoras.classList.remove('opacity-30', 'pointer-events-none');
    }
};

window.generarMatrizProgramador = async function() {
    const idSucursal = document.getElementById('prog-sucursal').value;
    const fInicio = document.getElementById('prog-fecha-inicio').value;
    const fFin = document.getElementById('prog-fecha-fin').value;

    if(!idSucursal || !fInicio || !fFin) {
        alert("⚠️ Por favor, selecciona la sucursal y el rango de fechas.");
        return;
    }

    const btn = document.querySelector('button[onclick="generarMatrizProgramador()"]');
    btn.innerText = "Generando..."; btn.disabled = true;

    try {
        const start = new Date(fInicio + 'T00:00:00');
        const end = new Date(fFin + 'T00:00:00');
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));

        if(diffDays > 6) {
            alert("⚠️ Para mantener la visual limpia, el rango máximo es de 7 días.");
            btn.innerText = "Generar Plantilla"; btn.disabled = false;
            return;
        }

        let fechasGrid = [];
        for(let i=0; i<=diffDays; i++) {
            let d = new Date(start); d.setDate(d.getDate() + i); fechasGrid.push(d);
        }

        // ==========================================
        // 🚀 MAGIA: GUARDAR ESTADO PREVIO DE LA GRILLA
        // ==========================================
        let estadoPrevio = {};
        const selectsAnteriores = document.querySelectorAll('.select-turno-matriz');
        selectsAnteriores.forEach((sel) => {
            if(sel.value && sel.value !== 'CREAR_NUEVO') {
                const fila = sel.closest('tr');
                if(fila) {
                    const idFicha = fila.getAttribute('data-idficha');
                    // Buscamos en qué índice de columna estaba el select
                    const selectsEnFila = Array.from(fila.querySelectorAll('.select-turno-matriz'));
                    const colIndex = selectsEnFila.indexOf(sel);
                    estadoPrevio[`${idFicha}-${colIndex}`] = sel.value;
                }
            }
        });

        const { data: fichas } = await clienteSupabase.from('hr_fichas_laborales').select('*').eq('id_empresa', window.miEmpresaId).eq('estado', 'Activo');
        const fichasSucursal = (fichas || []).filter(f => f.sucursales && f.sucursales.includes(idSucursal));

        if(fichasSucursal.length === 0) {
            document.getElementById('prog-tabla-body').innerHTML = `<tr><td class="p-8 text-center text-slate-400 font-medium italic" colspan="100%">No hay colaboradores activos asignados a esta sucursal.</td></tr>`;
            document.getElementById('prog-tabla-head').innerHTML = '';
            btn.innerText = "Generar Plantilla"; btn.disabled = false; return;
        }

        const { data: perfiles } = await clienteSupabase.from('perfiles').select('id_usuario, nombre, apellido').eq('id_empresa', window.miEmpresaId);
        const { data: cargos } = await clienteSupabase.from('hr_cargos').select('id, nombre').eq('id_empresa', window.miEmpresaId);

        window.turnosValidosMatriz = window.plantillasTurnosMemoria.filter(t => !t.sucursales_disponibles || t.sucursales_disponibles.length === 0 || t.sucursales_disponibles.includes(idSucursal));

        const horarioSucursal = window.horariosSucursalesMemoria.find(h => h.id_sucursal === idSucursal);
        const configDias = horarioSucursal ? horarioSucursal.config_dias : {};
        const diasStr = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        let headHtml = `<tr><th class="px-4 py-3 text-left font-bold text-slate-600 uppercase text-xs w-64 bg-slate-200">Colaborador</th>`;
        fechasGrid.forEach(f => {
            const nombreDia = diasStr[f.getDay()];
            const diaAbierto = configDias[nombreDia] ? configDias[nombreDia].abierto : true;
            const dateStr = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth()+1).padStart(2, '0')}`;
            headHtml += `<th class="px-2 py-3 text-center font-bold text-slate-600 uppercase text-[10px] border-l border-slate-300 ${!diaAbierto ? 'bg-slate-50 text-slate-400' : ''}">
                ${nombreDia} ${dateStr} ${!diaAbierto ? '<br>(Cerrado)' : ''}
            </th>`;
        });
        headHtml += `</tr>`;
        document.getElementById('prog-tabla-head').innerHTML = headHtml;

        let bodyHtml = fichasSucursal.map(ficha => {
            const perfil = (perfiles || []).find(p => p.id_usuario === ficha.id_usuario) || {};
            const cargoObj = (cargos || []).find(c => c.id === ficha.cargo);
            const nombreCorto = `${perfil.nombre || 'Sin'} ${perfil.apellido || 'Nombre'}`;
            
            let celdasDias = fechasGrid.map((f, indexColumna) => {
                const nombreDia = diasStr[f.getDay()];
                const diaAbierto = configDias[nombreDia] ? configDias[nombreDia].abierto : true;

                if(!diaAbierto) return `<td class="px-2 py-2 border-r border-slate-200 text-center bg-slate-50"><span class="text-[10px] text-slate-400 italic">Cerrado</span></td>`;

                // Vemos si en el estado previo había un turno seleccionado para esta celda
                const celdaKey = `${ficha.id}-${indexColumna}`;
                const turnoSeleccionadoPrevio = estadoPrevio[celdaKey];

                let opcionesTurnos = `<option value="">-- Libre --</option>`;
                window.turnosValidosMatriz.forEach(t => {
                    // Si es ausencia, le ponemos otra etiqueta
                    const etiqueta = t.es_ausencia ? `⚪ ${t.nombre}` : `${t.nombre} (${t.hora_inicio ? t.hora_inicio.slice(0,5) : ''})`;
                    const seleccionado = (t.id === turnoSeleccionadoPrevio) ? 'selected' : '';
                    opcionesTurnos += `<option value="${t.id}" ${seleccionado}>${etiqueta}</option>`;
                });
                opcionesTurnos += `<option value="CREAR_NUEVO" class="font-bold text-blue-600">➕ Crear Nuevo Turno</option>`;

                return `
                <td class="px-2 py-2 border-r border-slate-200 text-center">
                    <select onchange="manejarAccionTurnoMatriz(this)" class="select-turno-matriz w-full text-[10px] p-1.5 border border-slate-200 rounded outline-none cursor-pointer focus:border-blue-500 font-medium text-slate-700 bg-slate-50 hover:bg-white transition-colors">
                        ${opcionesTurnos}
                    </select>
                </td>`;
            }).join('');

            return `
            <tr class="hover:bg-blue-50 transition-colors border-b border-slate-100 bg-white cursor-move group" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)" data-idficha="${ficha.id}">
                <td class="px-4 py-2 border-r border-slate-200 flex items-center gap-3">
                    <span class="text-slate-300 group-hover:text-blue-500 cursor-grab text-lg">☰</span>
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 text-xs truncate w-40">${nombreCorto}</span>
                        <span class="text-[9px] text-slate-400 truncate w-40 text-emerald-600">${cargoObj ? cargoObj.nombre : 'Sin Cargo'}</span>
                    </div>
                </td>
                ${celdasDias}
            </tr>`;
        }).join('');

        document.getElementById('prog-tabla-body').innerHTML = bodyHtml;

    } catch(e) {
        console.error(e); alert("❌ Error al generar matriz.");
    } finally {
        btn.innerText = "Generar Plantilla"; btn.disabled = false;
    }
};

window.manejarAccionTurnoMatriz = function(selectEl) {
    if (selectEl.value === 'CREAR_NUEVO') {
        selectEl.value = "";
        // Al abrir, desmarcamos el check de ausencia por defecto
        document.getElementById('hr-chk-ausencia').checked = false;
        window.toggleHorasAusencia(false);
        window.abrirModalTurnoPlantilla(); 
    }
};

// ============================================================================
// 💾 GUARDAR LA PROGRAMACIÓN MASIVA A LA BASE DE DATOS
// ============================================================================
window.guardarProgramacionMasiva = async function() {
    const idSucursal = document.getElementById('prog-sucursal').value;
    const fInicio = document.getElementById('prog-fecha-inicio').value;
    const fFin = document.getElementById('prog-fecha-fin').value;
    const btn = document.querySelector('button[onclick="guardarProgramacionMasiva()"]');

    if(!idSucursal || !fInicio || !fFin) { alert("Datos incompletos."); return; }

    btn.disabled = true; btn.innerText = "Guardando...";

    try {
        // Reconstruimos las fechas para saber qué columna es qué día
        const start = new Date(fInicio + 'T00:00:00');
        const end = new Date(fFin + 'T00:00:00');
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        let fechasGrid = [];
        for(let i=0; i<=diffDays; i++) {
            let d = new Date(start); d.setDate(d.getDate() + i); fechasGrid.push(d);
        }

        let payloadInsert = [];
        const filas = document.querySelectorAll('#prog-tabla-body tr[data-idficha]');

        filas.forEach(fila => {
            const idFicha = fila.getAttribute('data-idficha');
            const selects = fila.querySelectorAll('.select-turno-matriz');
            
            selects.forEach((sel, indexCol) => {
                const idTurno = sel.value;
                if (idTurno && idTurno !== 'CREAR_NUEVO') {
                    payloadInsert.push({
                        id_empresa: window.miEmpresaId,
                        id_ficha: idFicha,
                        id_sucursal: idSucursal,
                        fecha: fechasGrid[indexCol].toISOString().split('T')[0],
                        id_turno_plantilla: idTurno,
                        estado: 'Programado'
                    });
                }
            });
        });

        // 1. Borramos la programación existente de esta sucursal en este rango (Sobreescribimos limpio)
        await clienteSupabase.from('hr_turnos_asignados')
            .delete()
            .eq('id_sucursal', idSucursal)
            .gte('fecha', fInicio)
            .lte('fecha', fFin);

        // 2. Insertamos la nueva malla
        if(payloadInsert.length > 0) {
            const { error } = await clienteSupabase.from('hr_turnos_asignados').insert(payloadInsert);
            if (error) throw error;
        }

        alert("✅ ¡Programación de turnos guardada con éxito!");
        window.cerrarModalProgramador();

    } catch (e) {
        console.error(e);
        alert("❌ Error al guardar la programación.");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Programación";
    }
};

// --- LÓGICA NATIVA DE DRAG AND DROP ---
let filaArrastrada = null;

window.dragStart = function(e) {
    filaArrastrada = e.target.closest('tr');
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => filaArrastrada.classList.add('opacity-50'), 0);
};

window.dragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const trObjetivo = e.target.closest('tr');
    if (trObjetivo && trObjetivo !== filaArrastrada && trObjetivo.parentNode === filaArrastrada.parentNode) {
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

// ============================================================================
// VISUALIZADOR DEL CALENDARIO PRINCIPAL (VISTA SEMANAL)
// ============================================================================

window.fechaReferenciaCalendario = new Date(); // Guarda en qué semana estamos parados

window.cambiarSemanaCalendario = function(offset) {
    window.fechaReferenciaCalendario.setDate(window.fechaReferenciaCalendario.getDate() + (offset * 7));
    window.cargarCalendarioPrincipal();
};

window.irAHoyCalendario = function() {
    window.fechaReferenciaCalendario = new Date();
    window.cargarCalendarioPrincipal();
};

// Función para obtener el lunes de la semana actual
window.obtenerLunes = function(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

window.mostrarColaboradoresDetalle = true;

window.toggleDetalleColaboradores = function() {
    window.mostrarColaboradoresDetalle = !window.mostrarColaboradoresDetalle;
    const btnTexto = document.getElementById('hr-texto-toggle');
    const btnIcono = document.getElementById('hr-icono-toggle');
    
    if (window.mostrarColaboradoresDetalle) {
        btnTexto.innerText = "Ocultar Personal";
        btnIcono.innerText = "👁️‍🗨️";
    } else {
        btnTexto.innerText = "Mostrar Personal";
        btnIcono.innerText = "👤";
    }
    window.cargarCalendarioPrincipal();
};

window.cargarCalendarioPrincipal = async function() {
    const tbody = document.getElementById('hr-visor-body');
    const thead = document.getElementById('hr-visor-head');
    const labelRango = document.getElementById('hr-rango-fechas-visor');
    const filtroSucursal = document.getElementById('hr-filtro-sucursal').value;
    
    const lunes = window.obtenerLunes(window.fechaReferenciaCalendario);
    let fechasSemana = [];
    for(let i=0; i<7; i++) {
        let dia = new Date(lunes); dia.setDate(dia.getDate() + i); fechasSemana.push(dia);
    }
    
    const fInicio = fechasSemana[0].toISOString().split('T')[0];
    const fFin = fechasSemana[6].toISOString().split('T')[0];
    
    labelRango.innerText = `${fechasSemana[0].toLocaleDateString('es-ES', {month:'short', day:'numeric'})} - ${fechasSemana[6].toLocaleDateString('es-ES', {month:'short', day:'numeric'})}`;
    tbody.innerHTML = `<tr><td class="p-12 text-center text-slate-400 italic" colspan="100%">Cargando turnos...</td></tr>`;

    try {
        let queryFichas = clienteSupabase.from('hr_fichas_laborales').select('*').eq('id_empresa', window.miEmpresaId).eq('estado', 'Activo');
        const { data: fichas } = await queryFichas;
        let fichasFiltradas = fichas || [];

        if(filtroSucursal) fichasFiltradas = fichasFiltradas.filter(f => f.sucursales && f.sucursales.includes(filtroSucursal));

        if(fichasFiltradas.length === 0) {
            tbody.innerHTML = `<tr><td class="p-12 text-center text-slate-400 italic" colspan="100%">Selecciona una sucursal con personal.</td></tr>`;
            thead.innerHTML = ''; return;
        }

        const { data: perfiles } = await clienteSupabase.from('perfiles').select('id_usuario, nombre, apellido').eq('id_empresa', window.miEmpresaId);
        const { data: plantillas } = await clienteSupabase.from('hr_turnos_plantillas').select('*').eq('id_empresa', window.miEmpresaId);
        const { data: turnosAsignados } = await clienteSupabase.from('hr_turnos_asignados').select('*').eq('id_empresa', window.miEmpresaId).gte('fecha', fInicio).lte('fecha', fFin);
        
        const horarioSucursal = window.horariosSucursalesMemoria.find(h => h.id_sucursal === filtroSucursal);
        const configDias = horarioSucursal ? horarioSucursal.config_dias : {};
        const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // === CABECERA (Con soporte futuro para Feriados) ===
        let headHtml = `<tr><th class="px-4 py-4 text-left font-black text-slate-700 uppercase text-xs w-56 bg-slate-50 border-r border-b border-slate-200 sticky left-0 z-20">Colaborador</th>`;
        fechasSemana.forEach(f => {
            const esHoy = f.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
            const colorBg = esHoy ? 'bg-blue-50/50 text-blue-800 border-b-2 border-b-blue-400' : 'bg-white text-slate-500 border-b border-slate-200';
            
            // Aquí en el futuro inyectaremos si es feriado desde la base de datos
            const esFeriadoSimulado = false; // Cambiar a lógica real después
            
            headHtml += `<th class="px-2 py-3 text-center font-bold uppercase text-[10px] border-l border-slate-200 ${colorBg}">
                <span class="block text-[13px] font-black mb-0.5">${f.getDate()}</span>
                <span>${diasNombres[f.getDay()].slice(0,3)}</span>
                ${esFeriadoSimulado ? `<div class="mt-1 bg-orange-100 text-orange-700 text-[8px] rounded px-1">Feriado</div>` : ''}
            </th>`;
        });
        headHtml += `</tr>`;
        thead.innerHTML = headHtml;

        // === MODO RESUMEN (SI SE OCULTAN LOS COLABORADORES) ===
        if (!window.mostrarColaboradoresDetalle) {
            let celdasResumen = fechasSemana.map(f => {
                const fStr = f.toISOString().split('T')[0];
                const turnosDelDia = (turnosAsignados || []).filter(t => t.fecha === fStr && fichasFiltradas.some(ficha => ficha.id === t.id_ficha));
                
                if(turnosDelDia.length === 0) return `<td class="border-l border-slate-200 p-2 text-center align-middle"><span class="text-[10px] text-slate-300">-</span></td>`;
                
                return `<td class="border-l border-slate-200 p-2 align-middle">
                    <div class="bg-blue-50 border border-blue-100 rounded text-center py-1">
                        <span class="text-xs font-black text-blue-700">${turnosDelDia.length}</span><span class="text-[9px] text-blue-500 font-bold ml-1">Turnos</span>
                    </div>
                </td>`;
            }).join('');

            tbody.innerHTML = `<tr class="bg-white"><td class="px-4 py-4 sticky left-0 z-10 border-r border-slate-200 font-black text-slate-600 text-xs">Resumen Sucursal</td>${celdasResumen}</tr>`;
            return;
        }

        // === MODO DETALLE (EXPANDIDO CON ESTILOS SUTILES) ===
        let bodyHtml = fichasFiltradas.map((ficha) => {
            const perfil = (perfiles || []).find(p => p.id_usuario === ficha.id_usuario) || {};
            const nombreCompleto = `${perfil.nombre || ''} ${perfil.apellido || ''}`;
            
            let celdasHTML = fechasSemana.map(f => {
                const fStr = f.toISOString().split('T')[0];
                const nombreDia = diasNombres[f.getDay()];
                const configDiaMolde = configDias[nombreDia];
                
                let fondoMolde = (configDiaMolde && configDiaMolde.abierto) 
                    ? `<div class="absolute inset-1.5 border border-slate-200 border-dashed rounded z-0 opacity-40"></div>` 
                    : `<div class="absolute inset-0 bg-slate-50 z-0"></div>`; // Cerrado
                
                const turnoDia = (turnosAsignados || []).find(t => t.id_ficha === ficha.id && t.fecha === fStr);
                let frenteTurno = '';

                if (turnoDia) {
                    const plantilla = (plantillas || []).find(p => p.id === turnoDia.id_turno_plantilla);
                    if (plantilla) {
                        // LÓGICA DE COLOR SUTIL (AM vs PM vs Ausencia)
                        let estiloChip = '';
                        if (plantilla.es_ausencia) {
                            // Ausencias: Gris muy sutil
                            estiloChip = 'bg-slate-100 text-slate-600 border border-slate-200';
                        } else {
                            // Determinar si es AM o PM
                            const horaInt = plantilla.hora_inicio ? parseInt(plantilla.hora_inicio.split(':')[0]) : 9;
                            if (horaInt < 13) {
                                // AM: Muy translúcido (Azul claro)
                                estiloChip = 'bg-blue-50/60 text-blue-700 border border-blue-100/80';
                            } else {
                                // PM: Un poco más relleno (Azul un poco más fuerte)
                                estiloChip = 'bg-blue-100/90 text-blue-800 border border-blue-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]';
                            }
                        }

                        frenteTurno = `
                            <div class="relative z-10 rounded px-2 py-1.5 m-1.5 ${estiloChip} cursor-pointer hover:brightness-95 transition-all flex flex-col justify-center min-h-[36px]">
                                <p class="text-[9.5px] font-bold leading-tight truncate">${plantilla.nombre}</p>
                                ${!plantilla.es_ausencia ? `<p class="text-[8.5px] opacity-80 mt-0.5 font-medium tracking-wide">${plantilla.hora_inicio.slice(0,5)} - ${plantilla.hora_fin.slice(0,5)}</p>` : ''}
                            </div>`;
                    }
                }

                return `<td class="relative border-l border-slate-200 h-[60px] min-w-[110px] align-middle">
                    ${fondoMolde}
                    ${frenteTurno}
                </td>`;
            }).join('');

            return `
            <tr class="border-b border-slate-100 bg-white hover:bg-slate-50/50 transition-colors cursor-move" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)">
                <td class="px-4 py-3 sticky left-0 z-10 border-r border-slate-100 bg-inherit flex items-center gap-2.5 h-[60px]">
                    <span class="text-slate-300 hover:text-slate-500 cursor-grab text-base">⋮⋮</span>
                    <p class="font-bold text-slate-700 text-[11px] truncate w-40">${nombreCompleto}</p>
                </td>
                ${celdasHTML}
            </tr>`;
        }).join('');

        tbody.innerHTML = bodyHtml;

    } catch (e) {
        console.error(e); tbody.innerHTML = `<tr><td class="p-12 text-center text-red-500 font-bold" colspan="100%">Error al cargar.</td></tr>`;
    }
};