window.fichasMemoria = [];
window.cargosMemoria = [];

// ============================================================================
// MANEJO DE PESTAÑAS (TABS)
// ============================================================================
window.cambiarTabHR = function(tab) {
    const tabFichas = document.getElementById('hr-tab-fichas');
    const tabCargos = document.getElementById('hr-tab-cargos');
    const panelFichas = document.getElementById('hr-panel-fichas');
    const panelCargos = document.getElementById('hr-panel-cargos');
    const btnColab = document.getElementById('hr-btn-nuevo-colaborador');
    const btnCargo = document.getElementById('hr-btn-nuevo-cargo');

    if (tab === 'fichas') {
        tabFichas.className = 'py-3 font-bold text-sm border-b-2 border-emerald-600 text-emerald-600 outline-none transition-all';
        tabCargos.className = 'py-3 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-600 outline-none transition-all';
        panelFichas.classList.remove('hidden');
        panelCargos.classList.add('hidden');
        btnColab.classList.remove('hidden');
        btnCargo.classList.add('hidden');
        window.cargarFichasLaborales();
    } else {
        tabCargos.className = 'py-3 font-bold text-sm border-b-2 border-blue-600 text-blue-600 outline-none transition-all';
        tabFichas.className = 'py-3 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-600 outline-none transition-all';
        panelCargos.classList.remove('hidden');
        panelFichas.classList.add('hidden');
        btnCargo.classList.remove('hidden');
        btnColab.classList.add('hidden');
        window.cargarCargos();
    }
};

// ============================================================================
// SECCIÓN 1: LÓGICA DE FICHAS LABORALES
// ============================================================================
window.cargarFichasLaborales = async function() {
    const tbody = document.getElementById('hr-tabla-fichas');
    if (!tbody) return;

    try {
        const { data: fichas, error: errFichas } = await clienteSupabase.from('hr_fichas_laborales').select('*').eq('id_empresa', window.miEmpresaId);
        if (errFichas) throw errFichas;

        const { data: perfiles, error: errPerfiles } = await clienteSupabase.from('perfiles').select('id_usuario, nombre, apellido, email, rut_o_identificacion').eq('id_empresa', window.miEmpresaId);
        if (errPerfiles) throw errPerfiles;

        // Carga rápida paralela de cargos para mapear nombres bonitos
        const { data: cargos } = await clienteSupabase.from('hr_cargos').select('id, nombre').eq('id_empresa', window.miEmpresaId);
        window.cargosMemoria = cargos || [];

        window.fichasMemoria = fichas.map(ficha => {
            const perfil = perfiles.find(p => p.id_usuario === ficha.id_usuario) || {};
            const objetoCargo = window.cargosMemoria.find(c => c.id === ficha.cargo);
            return { ...ficha, perfil, nombreCargoReal: objetoCargo ? objetoCargo.nombre : (ficha.cargo || 'Sin Asignar') };
        });

        window.renderizarTablaFichas(window.fichasMemoria);
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold">❌ Error al cargar fichas.</td></tr>`;
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
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    <div class="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shadow-inner">
                        ${f.perfil.nombre ? f.perfil.nombre.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${f.perfil.nombre || 'Desconocido'} ${f.perfil.apellido || ''}</p>
                        <p class="text-[10px] text-slate-400 font-medium">${f.perfil.email || ''}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-600">${f.nombreCargoReal}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center hidden md:table-cell text-sm font-medium text-slate-500">
                ${f.fecha_ingreso ? f.fecha_ingreso.split('-').reverse().join('/') : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <span class="px-2.5 py-1 text-[10px] font-bold rounded-md uppercase ${f.estado === 'Activo' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">${f.estado}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <button onclick="editarFicha('${f.id}')" class="text-blue-600 hover:text-blue-900 bg-blue-50 border border-blue-100 px-3 py-1 rounded-md font-bold text-xs">Editar</button>
            </td>
        </tr>
    `).join('');
};

window.abrirModalNuevaFicha = async function() {
    document.getElementById('form-hr-ficha').reset();
    document.getElementById('hr-id-ficha').value = '';
    document.getElementById('hr-ficha-titulo').innerHTML = '👤 Nueva Ficha Laboral';
    
    const selectUsuarios = document.getElementById('hr-select-usuario');
    const selectCargos = document.getElementById('hr-ficha-cargo');
    const contSucursales = document.getElementById('hr-contenedor-sucursales');
    
    selectUsuarios.innerHTML = '<option value="">Cargando...</option>';
    selectCargos.innerHTML = '<option value="">Cargando cargos...</option>';
    selectUsuarios.disabled = false;
    document.getElementById('modal-hr-ficha').classList.remove('hidden');

    try {
        // 1. Cargar Sucursales
        const { data: sucursales } = await clienteSupabase.from('sucursales').select('id, nombre').eq('id_empresa', window.miEmpresaId);
        contSucursales.innerHTML = sucursales.map(s => `
            <label class="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white cursor-pointer hover:bg-slate-50">
                <input type="checkbox" name="hr-checkbox-sucursal" value="${s.id}" class="w-4 h-4 accent-emerald-600">
                <span class="text-xs font-bold text-slate-700">${s.nombre}</span>
            </label>
        `).join('');

        // 2. Cargar Selector de Cargos Real desde Supabase
        const { data: cargos } = await clienteSupabase.from('hr_cargos').select('id, nombre').eq('id_empresa', window.miEmpresaId).eq('estado', 'Activo');
        window.cargosMemoria = cargos || [];
        if (window.cargosMemoria.length === 0) {
            selectCargos.innerHTML = '<option value="">-- No hay cargos creados. Ve a la pestaña Cargos --</option>';
        } else {
            selectCargos.innerHTML = '<option value="">-- Seleccionar Cargo --</option>' + window.cargosMemoria.map(c => `<option value="${c.id}">${c.name || c.nombre}</option>`).join('');
        }

        // 3. Cargar Usuarios sin Ficha
        const fichasActuales = window.fichasMemoria.map(f => f.id_usuario);
        const { data: usuariosEmpresa } = await clienteSupabase.from('usuarios_empresas').select('id_usuario, rol').eq('id_empresa', window.miEmpresaId);
        const { data: perfilesTodos } = await clienteSupabase.from('perfiles').select('id_usuario, nombre, apellido, email').eq('id_empresa', window.miEmpresaId);

        const usuariosSinFicha = usuariosEmpresa.filter(u => !fichasActuales.includes(u.id_usuario));

        if (usuariosSinFicha.length === 0) {
            selectUsuarios.innerHTML = '<option value="">Todos los usuarios invitados ya tienen ficha.</option>';
            selectUsuarios.disabled = true;
        } else {
            selectUsuarios.innerHTML = '<option value="">-- Seleccionar Usuario --</option>' + usuariosSinFicha.map(u => {
                const p = perfilesTodos.find(per => per.id_usuario === u.id_usuario) || {};
                return `<option value="${u.id_usuario}">${p.nombre || ''} ${p.apellido || ''} (${p.email || ''})</option>`;
            }).join('');
        }
    } catch (e) { console.error(e); }
};

window.cerrarModalFicha = function() { document.getElementById('modal-hr-ficha').classList.add('hidden'); };

window.guardarFichaLaboral = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-ficha');
    const idFicha = document.getElementById('hr-id-ficha').value;
    btn.disabled = true;

    const checkboxes = document.querySelectorAll('input[name="hr-checkbox-sucursal"]:checked');
    const sucursalesArr = Array.from(checkboxes).map(cb => cb.value);

    const payload = {
        id_empresa: window.miEmpresaId,
        id_usuario: document.getElementById('hr-select-usuario').value,
        cargo: document.getElementById('hr-ficha-cargo').value || null,
        tipo_contrato: document.getElementById('hr-ficha-contrato').value || null,
        sueldo_base: document.getElementById('hr-ficha-sueldo').value ? parseFloat(document.getElementById('hr-ficha-sueldo').value) : null,
        fecha_ingreso: document.getElementById('hr-ficha-ingreso').value || null,
        sucursales: sucursalesArr.length > 0 ? sucursalesArr : null
    };

    try {
        if (idFicha) {
            delete payload.id_usuario;
            await clienteSupabase.from('hr_fichas_laborales').update(payload).eq('id', idFicha);
        } else {
            await clienteSupabase.from('hr_fichas_laborales').insert([payload]);
        }
        window.cerrarModalFicha();
        await window.cargarFichasLaborales();
    } catch (err) { alert("Error al guardar ficha"); }
    finally { btn.disabled = false; }
};

// ============================================================================
// SECCIÓN 2: LÓGICA DEL CATÁLOGO DE CARGOS (STORAGE PRIVADO + URL FIRMADA)
// ============================================================================
window.cargarCargos = async function() {
    const tbody = document.getElementById('hr-tabla-cargos');
    if (!tbody) return;

    try {
        const { data, error } = await clienteSupabase.from('hr_cargos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre', { ascending: true });
        if (error) throw error;
        window.cargosMemoria = data || [];
        
        if (window.cargosMemoria.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-500 font-medium">No hay cargos registrados.</td></tr>`;
            return;
        }

        tbody.innerHTML = window.cargosMemoria.map(c => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap font-bold text-slate-800">${c.nombre}</td>
                <td class="px-6 py-4Doc whitespace-nowrap">
                    ${c.url_descripcion ? `
                        <button onclick="verManualCargo('${c.id}')" class="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100 shadow-sm text-xs">
                            ${c.tipo_origen === 'link' ? '🔗 Ver Enlace' : '📄 Descargar PDF Seguro'}
                        </button>
                    ` : '<span class="text-slate-400 italic text-xs">Sin descripción adjunta</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="px-2.5 py-1 text-[10px] font-bold rounded-md uppercase ${c.estado === 'Activo' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}">${c.estado}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    <button onclick="eliminarCargo('${c.id}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2.5 py-1 rounded border border-red-100 shadow-sm">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500 font-bold">❌ Error al cargar cargos.</td></tr>`;
    }
};

window.alternarCamposOrigenCargo = function(origen) {
    const contenedorLink = document.getElementById('hr-contenedor-cargo-link');
    const contenedorArchivo = document.getElementById('hr-contenedor-cargo-archivo');
    if (origen === 'link') {
        contenedorLink.classList.remove('hidden');
        contenedorArchivo.classList.add('hidden');
    } else {
        contenedorLink.classList.add('hidden');
        contenedorArchivo.classList.remove('hidden');
    }
};

window.abrirModalNuevoCargo = function() {
    document.getElementById('form-hr-cargo').reset();
    document.getElementById('hr-id-cargo').value = '';
    window.alternarCamposOrigenCargo('link');
    document.getElementById('hr-txt-archivo-existente').classList.add('hidden');
    document.getElementById('modal-hr-cargo').classList.remove('hidden');
};

window.cerrarModalCargo = function() { document.getElementById('modal-hr-cargo').classList.add('hidden'); };

// --- GUARDAR CARGO + SUBIDA EN CRIPTO AL STORAGE PRIVADO ---
window.guardarCargo = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-cargo');
    const nombre = document.getElementById('hr-cargo-nombre').value.trim();
    const origen = document.getElementById('hr-cargo-origen').value;
    btn.disabled = true; btn.innerText = "Procesando...";

    let finalUrl = "";

    try {
        if (origen === 'link') {
            finalUrl = document.getElementById('hr-cargo-link').value.trim();
        } else {
            const archivoInput = document.getElementById('hr-cargo-archivo').files[0];
            if (!archivoInput) {
                alert("Debes seleccionar un archivo PDF.");
                btn.disabled = false; btn.innerText = "Guardar Cargo";
                return;
            }
            
            // Ruta ultra segura: carpeta_empresa/id_unico_archivo.pdf
            const extension = archivoInput.name.split('.').pop();
            const nombreSeguroFichero = `${window.miEmpresaId}/${crypto.randomUUID()}.${extension}`;

            // Subimos el archivo de forma cruda al Storage Privado
            const { data: storageData, error: storageErr } = await clienteSupabase.storage
                .from('hr_archivos')
                .upload(nombreSeguroFichero, archivoInput, { cacheControl: '3600', upsert: true });

            if (storageErr) throw storageErr;
            finalUrl = nombreSeguroFichero; // Guardamos el PATH interno, NO un link público
        }

        const payload = {
            id_empresa: window.miEmpresaId,
            nombre: nombre,
            tipo_origen: origen,
            url_descripcion: finalUrl
        };

        const { error } = await clienteSupabase.from('hr_cargos').insert([payload]);
        if (error) throw error;

        window.cerrarModalCargo();
        await window.cargarCargos();
    } catch (err) {
        console.error(err);
        alert("❌ Error al guardar el cargo.");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Cargo";
    }
};

// --- LEER PDF PRIVADO USANDO LINKS FIRMADOS EXPIRABLES ---
window.verManualCargo = async function(id) {
    const cargo = window.cargosMemoria.find(c => c.id === id);
    if (!cargo || !cargo.url_descripcion) return;

    if (cargo.tipo_origen === 'link') {
        window.open(cargo.url_descripcion, '_blank');
    } else {
        try {
            // Le pedimos a Supabase una URL firmada que expire en 15 minutos (900 segundos)
            const { data, error } = await clienteSupabase.storage
                .from('hr_archivos')
                .createSignedUrl(cargo.url_descripcion, 900);

            if (error) throw error;
            // Abrimos el archivo de forma ultra segura
            window.open(data.signedUrl, '_blank');
        } catch (e) {
            alert("No se pudo obtener el archivo seguro. Verifica tus permisos.");
        }
    }
};

window.eliminarCargo = async function(id) {
    if(confirm("¿Seguro que deseas eliminar este cargo?")) {
        const cargo = window.cargosMemoria.find(c => c.id === id);
        if(cargo && cargo.tipo_origen === 'archivo' && cargo.url_descripcion) {
            // Borramos el archivo físico del Storage Privado para no dejar basura
            await clienteSupabase.storage.from('hr_archivos').remove([cargo.url_descripcion]);
        }
        await clienteSupabase.from('hr_cargos').delete().eq('id', id);
        await window.cargarCargos();
    }
};