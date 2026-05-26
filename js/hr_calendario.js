window.modoVistaCalendarioActual = 'semana';
window.fechaReferenciaCalendario = new Date();
window.mostrarColaboradoresDetalle = true;

// ============================================================================
// NAVEGACIÓN PRINCIPAL
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
        sub.innerText = 'Administra horarios de sucursales, turnos y políticas de permisos';
        
        // Cargar datos de configuración (funciones en hr_configuracion.js)
        if(typeof window.cargarPlantillasTurnos === 'function') window.cargarPlantillasTurnos();
        if(typeof window.cargarHorariosSucursales === 'function') window.cargarHorariosSucursales(); 
        if(typeof window.cargarPermisosTipos === 'function') window.cargarPermisosTipos();
    } else {
        panelConfig.classList.add('hidden');
        panelVisor.classList.remove('hidden');
        btnVolver.classList.add('hidden');
        controlesCal.classList.remove('hidden');
        btnEntrar.classList.remove('hidden');
        titulo.innerText = '📅 Calendario Operativo';
        sub.innerText = 'Control de turnos y asistencia del personal';
        
        window.cargarCalendarioPrincipal(); 
    }
};

window.cambiarModoVistaCalendario = function(modo) {
    window.modoVistaCalendarioActual = modo;
    console.log("Filtro cambiado a:", modo);
};

// ============================================================================
// VISUALIZADOR DEL CALENDARIO PRINCIPAL (VISTA SEMANAL)
// ============================================================================
window.cambiarSemanaCalendario = function(offset) {
    window.fechaReferenciaCalendario.setDate(window.fechaReferenciaCalendario.getDate() + (offset * 7));
    window.cargarCalendarioPrincipal();
};

window.irAHoyCalendario = function() {
    window.fechaReferenciaCalendario = new Date();
    window.cargarCalendarioPrincipal();
};

window.obtenerLunes = function(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

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
        
        // Si no está en memoria, buscarlo. (A veces el calendario se carga directo)
        let horariosMem = window.horariosSucursalesMemoria || [];
        if(horariosMem.length === 0 && filtroSucursal) {
             const {data: hrs} = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
             window.horariosSucursalesMemoria = hrs || [];
        }
        const horarioSucursal = window.horariosSucursalesMemoria.find(h => h.id_sucursal === filtroSucursal);
        const configDias = horarioSucursal ? horarioSucursal.config_dias : {};
        const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // === CABECERA ===
        let headHtml = `<tr><th class="px-4 py-4 text-left font-black text-slate-700 uppercase text-xs w-56 bg-slate-50 border-r border-b border-slate-200 sticky left-0 z-20">Colaborador</th>`;
        fechasSemana.forEach(f => {
            const esHoy = f.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
            const colorBg = esHoy ? 'bg-blue-50/50 text-blue-800 border-b-2 border-b-blue-400' : 'bg-white text-slate-500 border-b border-slate-200';
            headHtml += `<th class="px-2 py-3 text-center font-bold uppercase text-[10px] border-l border-slate-200 ${colorBg}">
                <span class="block text-[13px] font-black mb-0.5">${f.getDate()}</span><span>${diasNombres[f.getDay()].slice(0,3)}</span>
            </th>`;
        });
        headHtml += `</tr>`;
        thead.innerHTML = headHtml;

        // === MODO RESUMEN ===
        if (!window.mostrarColaboradoresDetalle) {
            let celdasResumen = fechasSemana.map(f => {
                const fStr = f.toISOString().split('T')[0];
                const turnosDelDia = (turnosAsignados || []).filter(t => t.fecha === fStr && fichasFiltradas.some(ficha => ficha.id === t.id_ficha));
                if(turnosDelDia.length === 0) return `<td class="border-l border-slate-200 p-2 text-center align-middle"><span class="text-[10px] text-slate-300">-</span></td>`;
                return `<td class="border-l border-slate-200 p-2 align-middle"><div class="bg-blue-50 border border-blue-100 rounded text-center py-1"><span class="text-xs font-black text-blue-700">${turnosDelDia.length}</span><span class="text-[9px] text-blue-500 font-bold ml-1">Turnos</span></div></td>`;
            }).join('');
            tbody.innerHTML = `<tr class="bg-white"><td class="px-4 py-4 sticky left-0 z-10 border-r border-slate-200 font-black text-slate-600 text-xs">Resumen Sucursal</td>${celdasResumen}</tr>`;
            return;
        }

        // === MODO DETALLE ===
        let bodyHtml = fichasFiltradas.map((ficha) => {
            const perfil = (perfiles || []).find(p => p.id_usuario === ficha.id_usuario) || {};
            const nombreCompleto = `${perfil.nombre || ''} ${perfil.apellido || ''}`;
            
            let celdasHTML = fechasSemana.map(f => {
                const fStr = f.toISOString().split('T')[0];
                const nombreDia = diasNombres[f.getDay()];
                const configDiaMolde = configDias[nombreDia];
                
                let fondoMolde = (configDiaMolde && configDiaMolde.abierto) ? `<div class="absolute inset-1.5 border border-slate-200 border-dashed rounded z-0 opacity-40"></div>` : `<div class="absolute inset-0 bg-slate-50 z-0"></div>`;
                const turnoDia = (turnosAsignados || []).find(t => t.id_ficha === ficha.id && t.fecha === fStr);
                let frenteTurno = '';

                if (turnoDia) {
                    const plantilla = (plantillas || []).find(p => p.id === turnoDia.id_turno_plantilla);
                    if (plantilla) {
                        let estiloChip = '';
                        if (plantilla.es_ausencia) {
                            estiloChip = 'bg-slate-100 text-slate-600 border border-slate-200';
                        } else {
                            const horaInt = plantilla.hora_inicio ? parseInt(plantilla.hora_inicio.split(':')[0]) : 9;
                            if (horaInt < 13) estiloChip = 'bg-blue-50/60 text-blue-700 border border-blue-100/80';
                            else estiloChip = 'bg-blue-100/90 text-blue-800 border border-blue-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]';
                        }
                        frenteTurno = `<div class="relative z-10 rounded px-2 py-1.5 m-1.5 ${estiloChip} cursor-pointer hover:brightness-95 transition-all flex flex-col justify-center min-h-[36px]">
                                <p class="text-[9.5px] font-bold leading-tight truncate">${plantilla.nombre}</p>
                                ${!plantilla.es_ausencia ? `<p class="text-[8.5px] opacity-80 mt-0.5 font-medium tracking-wide">${plantilla.hora_inicio.slice(0,5)} - ${plantilla.hora_fin.slice(0,5)}</p>` : ''}
                            </div>`;
                    }
                }
                return `<td class="relative border-l border-slate-200 h-[60px] min-w-[110px] align-middle">${fondoMolde}${frenteTurno}</td>`;
            }).join('');

            return `<tr class="border-b border-slate-100 bg-white hover:bg-slate-50/50 transition-colors cursor-move" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)">
                <td class="px-4 py-3 sticky left-0 z-10 border-r border-slate-100 bg-inherit flex items-center gap-2.5 h-[60px]">
                    <span class="text-slate-300 hover:text-slate-500 cursor-grab text-base">⋮⋮</span>
                    <p class="font-bold text-slate-700 text-[11px] truncate w-40">${nombreCompleto}</p>
                </td>${celdasHTML}</tr>`;
        }).join('');

        tbody.innerHTML = bodyHtml;
    } catch (e) {
        console.error(e); tbody.innerHTML = `<tr><td class="p-12 text-center text-red-500 font-bold" colspan="100%">Error al cargar.</td></tr>`;
    }
};

// ============================================================================
// EL PROGRAMADOR MATRICIAL
// ============================================================================
window.abrirModalProgramador = async function() {
    const modal = document.getElementById('modal-hr-programador');
    const selectSuc = document.getElementById('prog-sucursal');
    const btnAbrir = document.querySelector('button[onclick="abrirModalProgramador()"]');
    if (btnAbrir) { btnAbrir.disabled = true; btnAbrir.innerHTML = '<span>⏳</span> <span class="hidden sm:inline">Cargando...</span>'; }

    try {
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.sucursalesMemoriaHR = sucursales || [];
        const { data: horarios } = await clienteSupabase.from('hr_sucursal_horarios').select('*').eq('id_empresa', window.miEmpresaId);
        window.horariosSucursalesMemoria = horarios || [];
        const { data: turnos } = await clienteSupabase.from('hr_turnos_plantillas').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
        window.plantillasTurnosMemoria = turnos || [];
    } catch (e) { console.error(e); } finally {
        if (btnAbrir) { btnAbrir.disabled = false; btnAbrir.innerHTML = '<span>➕</span> <span class="hidden sm:inline">Programar Turnos</span>'; }
    }
    
    selectSuc.innerHTML = '<option value="">Seleccionar Sucursal...</option>' + window.sucursalesMemoriaHR.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    const hoy = new Date(); const proximaSemana = new Date(hoy); proximaSemana.setDate(hoy.getDate() + 6);
    document.getElementById('prog-fecha-inicio').value = hoy.toISOString().split('T')[0];
    document.getElementById('prog-fecha-fin').value = proximaSemana.toISOString().split('T')[0];
    document.getElementById('prog-tabla-head').innerHTML = '';
    document.getElementById('prog-tabla-body').innerHTML = `<tr><td class="p-8 text-center text-slate-400 font-medium italic" colspan="100%">Selecciona una sucursal y haz clic en "Generar Plantilla".</td></tr>`;
    modal.classList.remove('hidden');
};

window.cerrarModalProgramador = function() { document.getElementById('modal-hr-programador').classList.add('hidden'); };

window.generarMatrizProgramador = async function() {
    const idSucursal = document.getElementById('prog-sucursal').value;
    const fInicio = document.getElementById('prog-fecha-inicio').value;
    const fFin = document.getElementById('prog-fecha-fin').value;
    if(!idSucursal || !fInicio || !fFin) { alert("⚠️ Selecciona sucursal y fechas."); return; }

    const btn = document.querySelector('button[onclick="generarMatrizProgramador()"]');
    btn.innerText = "Generando..."; btn.disabled = true;

    try {
        const start = new Date(fInicio + 'T00:00:00'); const end = new Date(fFin + 'T00:00:00');
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        if(diffDays > 6) { alert("Rango máximo 7 días."); btn.innerText = "Generar Plantilla"; btn.disabled = false; return; }

        let fechasGrid = []; for(let i=0; i<=diffDays; i++) { let d = new Date(start); d.setDate(d.getDate() + i); fechasGrid.push(d); }

        let estadoPrevio = {};
        document.querySelectorAll('.select-turno-matriz').forEach((sel) => {
            if(sel.value && sel.value !== 'CREAR_NUEVO') {
                const fila = sel.closest('tr');
                if(fila) {
                    const colIndex = Array.from(fila.querySelectorAll('.select-turno-matriz')).indexOf(sel);
                    estadoPrevio[`${fila.getAttribute('data-idficha')}-${colIndex}`] = sel.value;
                }
            }
        });

        const { data: fichas } = await clienteSupabase.from('hr_fichas_laborales').select('*').eq('id_empresa', window.miEmpresaId).eq('estado', 'Activo');
        const fichasSucursal = (fichas || []).filter(f => f.sucursales && f.sucursales.includes(idSucursal));

        if(fichasSucursal.length === 0) {
            document.getElementById('prog-tabla-body').innerHTML = `<tr><td class="p-8 text-center text-slate-400 italic" colspan="100%">No hay colaboradores en esta sucursal.</td></tr>`;
            document.getElementById('prog-tabla-head').innerHTML = ''; btn.innerText = "Generar Plantilla"; btn.disabled = false; return;
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
            headHtml += `<th class="px-2 py-3 text-center font-bold text-slate-600 uppercase text-[10px] border-l border-slate-300 ${!diaAbierto ? 'bg-slate-50 text-slate-400' : ''}">${nombreDia} ${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth()+1).padStart(2, '0')} ${!diaAbierto ? '<br>(Cerrado)' : ''}</th>`;
        });
        headHtml += `</tr>`; document.getElementById('prog-tabla-head').innerHTML = headHtml;

        let bodyHtml = fichasSucursal.map(ficha => {
            const perfil = (perfiles || []).find(p => p.id_usuario === ficha.id_usuario) || {};
            const cargoObj = (cargos || []).find(c => c.id === ficha.cargo);
            let celdasDias = fechasGrid.map((f, indexColumna) => {
                const nombreDia = diasStr[f.getDay()];
                if(configDias[nombreDia] && !configDias[nombreDia].abierto) return `<td class="px-2 py-2 border-r border-slate-200 text-center bg-slate-50"><span class="text-[10px] text-slate-400 italic">Cerrado</span></td>`;
                
                const turnoPrevio = estadoPrevio[`${ficha.id}-${indexColumna}`];
                let opcionesTurnos = `<option value="">-- Libre --</option>`;
                window.turnosValidosMatriz.forEach(t => {
                    const eq = t.es_ausencia ? `⚪ ${t.nombre}` : `${t.nombre} (${t.hora_inicio ? t.hora_inicio.slice(0,5) : ''})`;
                    opcionesTurnos += `<option value="${t.id}" ${(t.id === turnoPrevio) ? 'selected' : ''}>${eq}</option>`;
                });
                return `<td class="px-2 py-2 border-r border-slate-200 text-center"><select onchange="manejarAccionTurnoMatriz(this)" class="select-turno-matriz w-full text-[10px] p-1.5 border border-slate-200 rounded outline-none cursor-pointer focus:border-blue-500 font-medium bg-slate-50 hover:bg-white">${opcionesTurnos}<option value="CREAR_NUEVO" class="font-bold text-blue-600">➕ Crear Nuevo Turno</option></select></td>`;
            }).join('');

            return `<tr class="hover:bg-blue-50 transition-colors border-b border-slate-100 bg-white cursor-move group" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)" data-idficha="${ficha.id}">
                <td class="px-4 py-2 border-r border-slate-200 flex items-center gap-3"><span class="text-slate-300 group-hover:text-blue-500 cursor-grab text-lg">☰</span><div class="flex flex-col"><span class="font-bold text-slate-800 text-xs truncate w-40">${perfil.nombre||''} ${perfil.apellido||''}</span><span class="text-[9px] text-slate-400 truncate w-40 text-emerald-600">${cargoObj ? cargoObj.nombre : 'Sin Cargo'}</span></div></td>${celdasDias}</tr>`;
        }).join('');
        document.getElementById('prog-tabla-body').innerHTML = bodyHtml;
    } catch(e) { console.error(e); alert("Error"); } finally { btn.innerText = "Generar Plantilla"; btn.disabled = false; }
};

window.manejarAccionTurnoMatriz = function(selectEl) {
    if (selectEl.value === 'CREAR_NUEVO') {
        selectEl.value = "";
        // Depende de la función global en hr_configuracion.js
        if(typeof window.abrirModalTurnoPlantilla === 'function') {
             document.getElementById('hr-chk-ausencia').checked = false;
             window.toggleHorasAusencia(false);
             window.abrirModalTurnoPlantilla(); 
        }
    }
};

window.guardarProgramacionMasiva = async function() {
    const idSucursal = document.getElementById('prog-sucursal').value;
    const fInicio = document.getElementById('prog-fecha-inicio').value;
    const fFin = document.getElementById('prog-fecha-fin').value;
    const btn = document.querySelector('button[onclick="guardarProgramacionMasiva()"]');
    if(!idSucursal || !fInicio || !fFin) return;

    btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const start = new Date(fInicio + 'T00:00:00'); const diffDays = Math.ceil(Math.abs(new Date(fFin + 'T00:00:00') - start) / (1000 * 60 * 60 * 24));
        let fechasGrid = []; for(let i=0; i<=diffDays; i++) { let d = new Date(start); d.setDate(d.getDate() + i); fechasGrid.push(d); }

        let payloadInsert = [];
        document.querySelectorAll('#prog-tabla-body tr[data-idficha]').forEach(fila => {
            fila.querySelectorAll('.select-turno-matriz').forEach((sel, indexCol) => {
                if (sel.value && sel.value !== 'CREAR_NUEVO') {
                    payloadInsert.push({ id_empresa: window.miEmpresaId, id_ficha: fila.getAttribute('data-idficha'), id_sucursal: idSucursal, fecha: fechasGrid[indexCol].toISOString().split('T')[0], id_turno_plantilla: sel.value, estado: 'Programado' });
                }
            });
        });

        await clienteSupabase.from('hr_turnos_asignados').delete().eq('id_sucursal', idSucursal).gte('fecha', fInicio).lte('fecha', fFin);
        if(payloadInsert.length > 0) { const { error } = await clienteSupabase.from('hr_turnos_asignados').insert(payloadInsert); if(error) throw error; }

        alert("✅ Programación guardada!"); window.cerrarModalProgramador();
        window.cargarCalendarioPrincipal(); // Refrescar el visor
    } catch (e) { console.error(e); alert("Error."); } finally { btn.disabled = false; btn.innerText = "Guardar Programación"; }
};

// --- DRAG AND DROP ---
let filaArrastrada = null;
window.dragStart = function(e) { filaArrastrada = e.target.closest('tr'); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => filaArrastrada.classList.add('opacity-50'), 0); };
window.dragOver = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const trObj = e.target.closest('tr'); if (trObj && trObj !== filaArrastrada && trObj.parentNode === filaArrastrada.parentNode) { const rect = trObj.getBoundingClientRect(); const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5; trObj.parentNode.insertBefore(filaArrastrada, next ? trObj.nextSibling : trObj); } };
window.drop = function(e) { e.stopPropagation(); if (filaArrastrada) { filaArrastrada.classList.remove('opacity-50'); filaArrastrada = null; } return false; };