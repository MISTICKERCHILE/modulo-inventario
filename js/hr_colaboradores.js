window.fichasMemoria = [];

// --- CARGAR LA TABLA PRINCIPAL ---
window.cargarFichasLaborales = async function() {
    const tbody = document.getElementById('hr-tabla-fichas');
    if (!tbody) return;

    try {
        // Hacemos un JOIN manual: Traemos las fichas y cruzamos con perfiles para el nombre
        const { data: fichas, error: errFichas } = await clienteSupabase
            .from('hr_fichas_laborales')
            .select('*')
            .eq('id_empresa', window.miEmpresaId);

        if (errFichas) throw errFichas;

        // Traemos todos los perfiles de la empresa para sacar los nombres
        const { data: perfiles, error: errPerfiles } = await clienteSupabase
            .from('perfiles')
            .select('id_usuario, nombre, apellido, email, rut_o_identificacion')
            .eq('id_empresa', window.miEmpresaId);

        if (errPerfiles) throw errPerfiles;

        // Mezclamos la información
        window.fichasMemoria = fichas.map(ficha => {
            const perfil = perfiles.find(p => p.id_usuario === ficha.id_usuario) || {};
            return { ...ficha, perfil };
        });

        window.renderizarTablaFichas(window.fichasMemoria);

    } catch (error) {
        console.error("Error cargando fichas:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold">❌ Error al cargar los datos.</td></tr>`;
    }
};

window.renderizarTablaFichas = function(datos) {
    const tbody = document.getElementById('hr-tabla-fichas');
    if (!tbody) return;

    if (datos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 font-medium">No hay colaboradores con ficha laboral creada.</td></tr>`;
        return;
    }

    tbody.innerHTML = datos.map(f => `
        <tr class="hover:bg-slate-50 transition-colors group">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    <div class="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shadow-inner border border-emerald-200">
                        ${f.perfil.nombre ? f.perfil.nombre.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${f.perfil.nombre || 'Desconocido'} ${f.perfil.apellido || ''}</p>
                        <p class="text-[10px] text-slate-400 font-medium">${f.perfil.email || 'Sin correo'}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <p class="text-sm font-bold text-slate-600">${f.cargo || '<span class="text-slate-400 font-normal italic">Sin cargo asignado</span>'}</p>
                <p class="text-[10px] font-bold text-slate-400">${f.tipo_contrato || ''}</p>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center hidden md:table-cell text-sm font-medium text-slate-600">
                ${f.fecha_ingreso ? f.fecha_ingreso.split('-').reverse().join('/') : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <span class="px-3 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider ${f.estado === 'Activo' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'}">
                    ${f.estado}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <button onclick="editarFicha('${f.id}')" class="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-1.5 rounded-md font-bold text-sm transition-colors shadow-sm">Editar</button>
            </td>
        </tr>
    `).join('');
};

window.filtrarFichasLaborales = function() {
    const texto = document.getElementById('hr-buscador-fichas').value.toLowerCase();
    const filtrados = window.fichasMemoria.filter(f => 
        (f.perfil.nombre && f.perfil.nombre.toLowerCase().includes(texto)) || 
        (f.perfil.apellido && f.perfil.apellido.toLowerCase().includes(texto)) ||
        (f.cargo && f.cargo.toLowerCase().includes(texto))
    );
    window.renderizarTablaFichas(filtrados);
};

// --- ABRIR MODAL INTELIGENTE (EL FILTRO) ---
window.abrirModalNuevaFicha = async function() {
    document.getElementById('form-hr-ficha').reset();
    document.getElementById('hr-id-ficha').value = '';
    document.getElementById('hr-ficha-titulo').innerHTML = '👤 Nueva Ficha Laboral';
    
    const selectUsuarios = document.getElementById('hr-select-usuario');
    const contSucursales = document.getElementById('hr-contenedor-sucursales');
    
    selectUsuarios.innerHTML = '<option value="">Buscando usuarios disponibles...</option>';
    contSucursales.innerHTML = '<p class="text-xs text-slate-500">Cargando sucursales...</p>';
    selectUsuarios.disabled = false; // Permitimos elegir
    document.getElementById('modal-hr-ficha').classList.remove('hidden');

    try {
        // 1. Buscar Sucursales
        const { data: sucursales, error: errSuc } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
        if (errSuc) throw errSuc;
        
        contSucursales.innerHTML = sucursales.map(s => `
            <label class="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white cursor-pointer hover:bg-emerald-50 transition-colors">
                <input type="checkbox" name="hr-checkbox-sucursal" value="${s.id}" class="w-4 h-4 accent-emerald-600 cursor-pointer">
                <span class="text-xs font-bold text-slate-700">${s.nombre}</span>
            </label>
        `).join('');

        // 2. Buscar Usuarios que NO tengan ficha
        const fichasActuales = window.fichasMemoria.map(f => f.id_usuario);
        
        const { data: usuariosEmpresa, error: errUsu } = await clienteSupabase
            .from('usuarios_empresas')
            .select('id_usuario, rol')
            .eq('id_empresa', window.miEmpresaId);
            
        if (errUsu) throw errUsu;

        // Cruzamos con perfiles para ver los nombres
        const { data: perfilesTodos } = await clienteSupabase.from('perfiles').select('id_usuario, nombre, apellido, email').eq('id_empresa', window.miEmpresaId);

        // Filtramos: Solo los que están en la empresa y NO están en el array de fichasActuales
        const usuariosSinFicha = usuariosEmpresa.filter(u => !fichasActuales.includes(u.id_usuario));

        if (usuariosSinFicha.length === 0) {
            selectUsuarios.innerHTML = '<option value="">Todos los usuarios invitados ya tienen ficha.</option>';
            selectUsuarios.disabled = true;
        } else {
            selectUsuarios.innerHTML = '<option value="">-- Selecciona a quién asignar la ficha --</option>' + 
                usuariosSinFicha.map(u => {
                    const p = perfilesTodos.find(per => per.id_usuario === u.id_usuario) || {};
                    return `<option value="${u.id_usuario}">${p.nombre || 'Desconocido'} ${p.apellido || ''} (${p.email || 'Sin correo'}) - Rol: ${u.rol}</option>`;
                }).join('');
        }

    } catch (error) {
        console.error("Error al preparar modal:", error);
    }
};

window.cerrarModalFicha = function() {
    document.getElementById('modal-hr-ficha').classList.add('hidden');
};

// --- GUARDAR FICHA ---
window.guardarFichaLaboral = async function(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btn-guardar-ficha');
    const textoOriginal = btn.innerText;
    btn.innerText = "Guardando..."; 
    btn.disabled = true;

    const idFicha = document.getElementById('hr-id-ficha').value;
    const idUsuario = document.getElementById('hr-select-usuario').value;

    if (!idUsuario) {
        alert("Debes seleccionar un usuario válido.");
        btn.innerText = textoOriginal; btn.disabled = false;
        return;
    }

    // Recolectar sucursales marcadas
    const checkboxes = document.querySelectorAll('input[name="hr-checkbox-sucursal"]:checked');
    const sucursalesSeleccionadas = Array.from(checkboxes).map(cb => cb.value);

    // Valores opcionales
    const sueldoVal = document.getElementById('hr-ficha-sueldo').value;
    const ingresoVal = document.getElementById('hr-ficha-ingreso').value;

    const payload = {
        id_empresa: window.miEmpresaId,
        id_usuario: idUsuario,
        cargo: document.getElementById('hr-ficha-cargo').value || null,
        tipo_contrato: document.getElementById('hr-ficha-contrato').value || null,
        sueldo_base: sueldoVal ? parseFloat(sueldoVal) : null,
        fecha_ingreso: ingresoVal ? ingresoVal : null,
        sucursales: sucursalesSeleccionadas.length > 0 ? sucursalesSeleccionadas : null
    };

    try {
        if (idFicha) {
            // No dejamos que cambien el usuario si es edición
            delete payload.id_usuario; 
            const { error } = await clienteSupabase.from('hr_fichas_laborales').update(payload).eq('id', idFicha);
            if (error) throw error;
        } else {
            const { error } = await clienteSupabase.from('hr_fichas_laborales').insert([payload]);
            if (error) throw error;
        }

        window.cerrarModalFicha();
        await window.cargarFichasLaborales(); 

    } catch (error) {
        console.error("Error al guardar ficha:", error);
        alert("❌ Error al guardar. Intenta nuevamente.");
    } finally {
        btn.innerText = textoOriginal; 
        btn.disabled = false;
    }
};