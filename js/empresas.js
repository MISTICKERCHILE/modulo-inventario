window.empresasDisponibles = [];

window.cargarEmpresas = async function() {
    const contenedor = document.getElementById('lista-mis-empresas') || document.querySelector('#seccion-mis-empresas div.bg-white') || document.querySelector('div:has(> p:contains("Cargando"))');
    
    if (!contenedor) return;
    
    contenedor.innerHTML = '<div class="flex justify-center py-8"><p class="text-slate-500 font-bold animate-pulse">⏳ Cargando tus entornos...</p></div>';

    try {
        const { data: { user }, error: authErr } = await clienteSupabase.auth.getUser();
        if (authErr || !user) throw new Error("No hay usuario activo.");

        // ¡AQUÍ ESTABA EL BUG! La tabla correcta es "usuarios_empresas"
        const { data, error } = await clienteSupabase.from('usuarios_empresas')
            .select('id, id_empresa, nombre_empresa, rol')
            .eq('id_usuario', user.id);

        if (error) throw error;

        if (!data || data.length === 0) {
            contenedor.innerHTML = '<p class="text-slate-500 text-center py-8">No tienes empresas asignadas aún.</p>';
            return;
        }

        // LLENAR EL SELECTOR DEL MODAL "DAR ACCESO"
        const selectModal = document.getElementById('vu-empresa');
        if(selectModal) {
            selectModal.innerHTML = data.map(e => `<option value="${e.id_empresa}|${e.nombre_empresa}">${e.nombre_empresa}</option>`).join('');
        }

        contenedor.innerHTML = data.map(e => `
            <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-emerald-400 transition-colors cursor-pointer mb-3" onclick="cargarUsuariosDeEmpresa('${e.id_empresa}', '${(e.nombre_empresa || 'Empresa').replace(/'/g, "\\'")}')">
                <div>
                    <h4 class="font-bold text-slate-800 text-lg">🏢 ${e.nombre_empresa || 'Empresa'}</h4>
                    <span class="text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded mt-1 inline-block">Rol: ${e.rol}</span>
                </div>
                <span class="text-slate-400 hover:text-emerald-600 text-xl font-bold">→</span>
            </div>
        `).join('');
        
    } catch (err) {
        console.error("Error al cargar empresas:", err);
        contenedor.innerHTML = `<p class="text-red-500 text-center py-8 font-bold">❌ Error: ${err.message}</p>`;
    }
}

// Alias para evitar errores si el botón HTML llama a cargarMisEmpresas
window.cargarMisEmpresas = window.cargarEmpresas;

window.cargarUsuariosDeEmpresa = async function(idEmpresa, nombreEmpresa) {
    const lista = document.getElementById('lista-usuarios-empresa');
    lista.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold">⏳ Buscando equipo...</li>';

    const { data: accesos, error } = await clienteSupabase.from('usuarios_empresas')
        .select('id, id_usuario, rol')
        .eq('id_empresa', idEmpresa);

    if(error || !accesos || accesos.length === 0) {
        lista.innerHTML = `<li class="p-8 text-center text-slate-400">Nadie tiene acceso a ${nombreEmpresa} aún.</li>`;
        return;
    }

    const idsUsuarios = accesos.map(a => a.id_usuario);
    const { data: perfiles } = await clienteSupabase.from('perfiles')
        .select('id_usuario, nombre, apellido')
        .in('id_usuario', idsUsuarios);

    lista.innerHTML = `
        <li class="px-6 py-3 bg-slate-200/50 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Equipo en: ${nombreEmpresa}
        </li>
    ` + accesos.map(acceso => {
        const perfil = (perfiles || []).find(p => p.id_usuario === acceso.id_usuario);
        const nombreStr = perfil?.nombre || 'Usuario';
        const apellidoStr = perfil?.apellido || '';
        const nombreCompleto = `${nombreStr} ${apellidoStr}`.trim();
        const iniciales = (nombreStr.substring(0,1) + (apellidoStr ? apellidoStr.substring(0,1) : nombreStr.substring(1,2))).toUpperCase();

        return `
        <li class="px-6 py-4 hover:bg-white transition-colors flex justify-between items-center bg-slate-50/50">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs uppercase shadow-sm">
                    ${iniciales}
                </div>
                <div class="flex flex-col">
                    <span class="font-bold text-slate-800">${nombreCompleto}</span>
                    <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">${acceso.rol || 'Operador'}</span>
                </div>
            </div>
            <button onclick="eliminarAcceso('${acceso.id}')" class="text-red-400 hover:text-red-600 font-bold text-xs bg-red-50 px-3 py-1.5 rounded shadow-sm transition-transform hover:scale-105" title="Revocar Acceso">Revocar</button>
        </li>
        `;
    }).join('');
}

// Delegador global de Formularios de Empresa (Evita recarga de página)
if(!window.eventosEmpresasAtados) {
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'form-nueva-empresa') {
            e.preventDefault();
            const { data: { user } } = await clienteSupabase.auth.getUser();
            const nombre = document.getElementById('ne-nombre').value;
            const nuevoIdEmpresa = crypto.randomUUID(); 

            const { error } = await clienteSupabase.from('usuarios_empresas').insert({
                id_usuario: user.id,
                id_empresa: nuevoIdEmpresa,
                nombre_empresa: nombre,
                rol: 'Admin'
            });

            if(error) return alert("❌ Error: " + error.message);
            
            alert(`✅ ¡Entorno "${nombre}" creado con éxito!`);
            document.getElementById('modal-nueva-empresa').classList.add('hidden');
            document.getElementById('form-nueva-empresa').reset();
            window.cargarEmpresas();

        } else if (e.target.id === 'form-vincular-usuario') {
            e.preventDefault();
            
            const seleccion = document.getElementById('vu-empresa').value.split('|');
            const idEmpresa = seleccion[0];
            const nombreEmpresa = seleccion[1];
            const emailTarget = document.getElementById('vu-email').value.trim();
            const rolAsignado = document.getElementById('vu-rol').value;

            // 1. Armamos la URL Mágica con los parámetros seguros
            // window.location.origin saca tu dominio actual (ej: https://tudominio.vercel.app)
            const baseUrl = window.location.origin + window.location.pathname; 
            const urlMagica = `${baseUrl}?invite=true&emp_id=${idEmpresa}&emp_nom=${encodeURIComponent(nombreEmpresa)}&email=${encodeURIComponent(emailTarget)}&rol=${rolAsignado}`;

            // 2. Ponemos la URL en el input para que el usuario la copie
            document.getElementById('vu-link-generado').value = urlMagica;

            // 3. Ocultamos el formulario y mostramos el resultado
            document.getElementById('vu-step-1').classList.add('hidden');
            document.getElementById('vu-step-2').classList.remove('hidden');
        }
    });
    window.eventosEmpresasAtados = true;
}

window.eliminarAcceso = async function(idRegistro) {
    if(confirm("¿Seguro que deseas revocar el acceso a este usuario para esta empresa?")) {
        await clienteSupabase.from('usuarios_empresas').delete().eq('id', idRegistro);
        document.getElementById('lista-usuarios-empresa').innerHTML = '<li class="p-8 text-center text-slate-400 font-medium text-sm">👈 Selecciona una empresa a la izquierda para ver su equipo.</li>';
        window.cargarEmpresas();
    }
}

// --- UTILIDADES PARA EL MODAL DE INVITACIONES ---
window.cerrarModalInvitacion = function() {
    document.getElementById('modal-vincular-usuario').classList.add('hidden');
    // Reseteamos el modal a su estado original para la próxima vez
    document.getElementById('form-vincular-usuario').reset();
    document.getElementById('vu-step-1').classList.remove('hidden');
    document.getElementById('vu-step-2').classList.add('hidden');
}

window.copiarEnlaceInvitacion = function() {
    const inputLink = document.getElementById('vu-link-generado');
    inputLink.select();
    inputLink.setSelectionRange(0, 99999); // Para celulares
    navigator.clipboard.writeText(inputLink.value);
    alert("✅ ¡Enlace copiado al portapapeles!");
}