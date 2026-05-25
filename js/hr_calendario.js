window.plantillasTurnosMemoria = [];
window.modoVistaCalendarioActual = 'semana'; // Guardará 'dia', 'semana', 'mes', 'ano'

// ============================================================================
// MANEJO DE PESTAÑAS INTERNAS Y CONTROLES VISTA
// ============================================================================
window.cambiarTabCalendario = function(tab) {
    const tabVisor = document.getElementById('hr-tab-visor');
    const tabConfig = document.getElementById('hr-tab-config');
    const panelVisor = document.getElementById('hr-panel-visor');
    const panelConfig = document.getElementById('hr-panel-config');
    const controlesCal = document.getElementById('hr-controles-calendario');

    if (tab === 'visor') {
        tabVisor.className = 'py-3 font-bold text-sm border-b-2 border-emerald-600 text-emerald-600 outline-none transition-all';
        tabConfig.className = 'py-3 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all';
        panelVisor.classList.remove('hidden');
        panelConfig.classList.add('hidden');
        controlesCal.classList.remove('hidden'); // Muestra filtros en calendario
    } else {
        tabConfig.className = 'py-3 font-bold text-sm border-b-2 border-blue-600 text-blue-600 outline-none transition-all';
        tabVisor.className = 'py-3 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-all';
        panelConfig.classList.remove('hidden');
        panelVisor.classList.add('hidden');
        controlesCal.classList.add('hidden'); // Esconde controles en config
        window.cargarPlantillasTurnos();
    }
};

window.cambiarModoVistaCalendario = function(modo) {
    window.modoVistaCalendarioActual = modo;
    console.log("Filtro de vista cambiado a:", modo);
    // Cambiaremos los estilos de los botones en el futuro cuando rendericemos la malla
};

// ============================================================================
// ADMINISTRACIÓN DE PLANTILLAS DE TURNOS BASE
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
            // Mapeamos íconos bonitos para saber de un vistazo qué comidas incluye
            let comidasHtml = [];
            if(t.lleva_desayuno) comidasHtml.push('🍳 Desayuno');
            if(t.lleva_almuerzo) comidasHtml.push('🍲 Almuerzo');
            if(t.lleva_once_cena) comidasHtml.push('🌆 Once/Cena');
            
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-bold text-slate-800 text-sm">${t.nombre}</td>
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
                        <button onclick="eliminarPlantillaTurno('${t.id}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 border border-red-100 shadow-sm px-3 py-1.5 rounded-md">Eliminar</button>
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
    
    const contSucursales = document.getElementById('hr-turno-sucursales');
    contSucursales.innerHTML = '<p class="text-xs text-slate-500">Cargando sucursales...</p>';
    
    document.getElementById('modal-hr-turno-plantilla').classList.remove('hidden');

    try {
        const { data: sucursales, error } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
        if (error) throw error;
        
        contSucursales.innerHTML = sucursales.map(s => `
            <label class="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white cursor-pointer hover:bg-emerald-50 transition-colors">
                <input type="checkbox" name="hr-chk-sucursal-turno" value="${s.id}" class="w-4 h-4 accent-emerald-600">
                <span class="text-xs font-bold text-slate-700">${s.nombre}</span>
            </label>
        `).join('');
    } catch (err) {
        contSucursales.innerHTML = '<p class="text-xs text-red-500 font-bold">Error cargando sucursales</p>';
    }
};

window.cerrarModalTurnoPlantilla = function() {
    document.getElementById('modal-hr-turno-plantilla').classList.add('hidden');
};

window.guardarTurnoPlantilla = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-plantilla-turno');
    btn.disabled = true; btn.innerText = "Guardando...";

    // Recolectar sucursales seleccionadas
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
        sucursales_disponibles: sucursalesArr // Guardamos el array de UUIDs
    };

    try {
        const { error } = await clienteSupabase.from('hr_turnos_plantillas').insert([payload]);
        if (error) throw error;
        
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