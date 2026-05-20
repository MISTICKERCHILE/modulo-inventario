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
    lista.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold animate-pulse">⏳ Buscando equipo e invitaciones...</li>';

    // 1. Buscamos los usuarios activos
    const { data: accesos, error: errAcc } = await clienteSupabase.from('usuarios_empresas')
        .select('id, id_usuario, rol')
        .eq('id_empresa', idEmpresa);

    // 2. Buscamos las invitaciones pendientes
    const { data: invitaciones, error: errInv } = await clienteSupabase.from('invitaciones')
        .select('id, email_invitado, rol, estado')
        .eq('id_empresa', idEmpresa)
        .eq('estado', 'Pendiente');

    if(errAcc) {
        lista.innerHTML = `<li class="p-8 text-center text-red-400">Error cargando el equipo.</li>`;
        return;
    }

    let htmlFinal = `
        <li class="px-6 py-3 bg-slate-200/50 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Equipo en: ${nombreEmpresa}
        </li>
    `;

    // Renderizamos a los usuarios ACTIVOS
    if (accesos && accesos.length > 0) {
        const idsUsuarios = accesos.map(a => a.id_usuario);
        const { data: perfiles } = await clienteSupabase.from('perfiles')
            .select('id_usuario, nombre, apellido, email')
            .in('id_usuario', idsUsuarios);

        htmlFinal += accesos.map(acceso => {
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
                        <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">${acceso.rol || 'Operador'} • <span class="text-slate-400 normal-case">${perfil?.email || ''}</span></span>
                    </div>
                </div>
                <button onclick="eliminarAcceso('${acceso.id}')" class="text-red-400 hover:text-red-600 font-bold text-xs bg-red-50 px-3 py-1.5 rounded shadow-sm transition-transform hover:scale-105" title="Revocar Acceso">Revocar</button>
            </li>
            `;
        }).join('');
    } else {
        htmlFinal += `<li class="p-4 text-center text-slate-400 text-sm">No hay usuarios activos aún.</li>`;
    }

    // Renderizamos las invitaciones PENDIENTES
    if (invitaciones && invitaciones.length > 0) {
        htmlFinal += `
            <li class="px-6 py-3 bg-orange-100/50 text-xs font-bold text-orange-600 uppercase tracking-wider border-t border-orange-100">
                Invitaciones Pendientes
            </li>
        `;
        htmlFinal += invitaciones.map(inv => {
            return `
            <li class="px-6 py-4 hover:bg-white transition-colors flex justify-between items-center bg-orange-50/30">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-600 font-bold text-xl shadow-sm">
                        ⏳
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-700">${inv.email_invitado}</span>
                        <span class="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Esperando registro como ${inv.rol}</span>
                    </div>
                </div>
                <button onclick="cancelarInvitacion('${inv.id}')" class="text-slate-400 hover:text-slate-600 font-bold text-xs bg-white border border-slate-200 px-3 py-1.5 rounded shadow-sm transition-transform hover:scale-105" title="Cancelar Invitación">Cancelar</button>
            </li>
            `;
        }).join('');
    }

    lista.innerHTML = htmlFinal;
}

// Nueva función para cancelar una invitación que aún no ha sido aceptada
window.cancelarInvitacion = async function(idInvitacion) {
    if(confirm("¿Seguro que deseas cancelar esta invitación? El enlace dejará de funcionar.")) {
        await clienteSupabase.from('invitaciones').delete().eq('id', idInvitacion);
        // Recargamos la lista (usamos un truco para re-simular el click en la empresa actual)
        window.cargarEmpresas(); 
        document.getElementById('lista-usuarios-empresa').innerHTML = '<li class="p-8 text-center text-slate-400 font-medium text-sm">👈 Selecciona una empresa a la izquierda para ver su equipo.</li>';
    }
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
            const emailTarget = document.getElementById('vu-email').value.trim().toLowerCase(); // Aseguramos minúsculas
            const rolAsignado = document.getElementById('vu-rol').value;

            // 1. Verificamos si ese usuario YA está en la empresa (para no invitarlo doble)
            const { data: perfilExistente } = await clienteSupabase.from('perfiles').select('id_usuario').eq('email', emailTarget).maybeSingle();
            
            if (perfilExistente) {
                const { data: yaExiste } = await clienteSupabase.from('usuarios_empresas').select('id').eq('id_usuario', perfilExistente.id_usuario).eq('id_empresa', idEmpresa).maybeSingle();
                if (yaExiste) return alert("⚠️ Este usuario ya es parte activa de esta empresa.");
            }

            // 2. Verificamos si ya hay una invitación pendiente para él
            const { data: invPendiente } = await clienteSupabase.from('invitaciones').select('id').eq('email_invitado', emailTarget).eq('id_empresa', idEmpresa).eq('estado', 'Pendiente').maybeSingle();
            if (invPendiente) return alert("⏳ Ya hay una invitación pendiente enviada a este correo para esta empresa.");

            // 3. GUARDAMOS LA INVITACIÓN EN LA BASE DE DATOS
            const { data: nuevaInv, error: errInv } = await clienteSupabase.from('invitaciones').insert({
                id_empresa: idEmpresa,
                nombre_empresa: nombreEmpresa,
                email_invitado: emailTarget,
                rol: rolAsignado,
                estado: 'Pendiente'
            }).select('id').single();

            if (errInv) return alert("❌ Error al crear la invitación: " + errInv.message);

            // 4. Armamos el Link Mágico CORTITO con el ID de la invitación
            const baseUrl = window.location.origin + window.location.pathname; 
            const urlMagica = `${baseUrl}?invite=${nuevaInv.id}`;

            // 5. Ponemos la URL en el input para que el usuario la copie
            document.getElementById('vu-link-generado').value = urlMagica;

            // 6. Ocultamos el formulario y mostramos el resultado
            document.getElementById('vu-step-1').classList.add('hidden');
            document.getElementById('vu-step-2').classList.remove('hidden');
            
            // Refrescamos la lista para que el dueño vea la invitación "Pendiente"
            window.cargarUsuariosDeEmpresa(idEmpresa, nombreEmpresa);
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
    const inputLink = document.getElementById('vu-link-generado').value;
    const seleccion = document.getElementById('vu-empresa').value.split('|');
    const nombreEmpresa = seleccion[1] || 'nuestra empresa';
    const rol = document.getElementById('vu-rol').value;
    
    // Armamos el mensaje bonito
    const mensaje = `👋 ¡Hola! Te invito a unirte al equipo de *${nombreEmpresa}* en Buddy ERP como ${rol}.\n\nIngresa a este enlace seguro para crear tu cuenta y contraseña:\n${inputLink}\n\n¡Nos vemos adentro! 🚀`;
    
    // Lo copiamos al portapapeles
    navigator.clipboard.writeText(mensaje).then(() => {
        alert("✅ ¡Invitación y enlace copiados al portapapeles! Pégalo y envíalo a tu Colaborador.");
    }).catch(err => {
        alert("❌ Error copiando. Por favor, copia el enlace manualmente.");
    });
}