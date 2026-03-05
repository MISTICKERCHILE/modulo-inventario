window.empresasDisponibles = [];

window.cargarVistaEmpresas = async function() {
    await window.cargarMisEmpresas();
}

window.cargarMisEmpresas = async function() {
    const { data: { user } } = await clienteSupabase.auth.getUser();
    if(!user) return;

    // Traemos las empresas a las que este usuario tiene acceso
    const { data: misEmpresas } = await clienteSupabase.from('usuarios_empresas')
        .select('id_empresa, nombre_empresa')
        .eq('id_usuario', user.id)
        .order('nombre_empresa');

    window.empresasDisponibles = misEmpresas || [];
    
    // Llenar el panel izquierdo
    const lista = document.getElementById('lista-mis-empresas');
    if(window.empresasDisponibles.length === 0) {
        lista.innerHTML = '<li class="p-8 text-center text-slate-400">No tienes empresas asignadas.</li>';
    } else {
        lista.innerHTML = window.empresasDisponibles.map(e => `
            <li class="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center cursor-pointer group" onclick="cargarUsuariosDeEmpresa('${e.id_empresa}', '${e.nombre_empresa}')">
                <div class="flex items-center gap-3">
                    <span class="text-2xl opacity-50 group-hover:opacity-100 transition-opacity">🏢</span>
                    <span class="font-bold text-slate-700 text-lg">${e.nombre_empresa}</span>
                </div>
                <span class="text-sm font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-50 px-2 py-1 rounded">Ver Equipo →</span>
            </li>
        `).join('');
    }

    // Llenar el select del modal de vinculación
    const select = document.getElementById('vu-empresa');
    if(select) {
        select.innerHTML = '<option value="" disabled selected>Selecciona un entorno...</option>' + 
            window.empresasDisponibles.map(e => `<option value="${e.id_empresa}|${e.nombre_empresa}">${e.nombre_empresa}</option>`).join('');
    }
}

window.cargarUsuariosDeEmpresa = async function(idEmpresa, nombreEmpresa) {
    const lista = document.getElementById('lista-usuarios-empresa');
    lista.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold">⏳ Buscando equipo...</li>';

    // Buscamos quién más tiene asignada esta ID de empresa
    const { data: usuarios } = await clienteSupabase.from('usuarios_empresas')
        .select('id, id_usuario, rol, perfiles(nombre)')
        .eq('id_empresa', idEmpresa);

    if(!usuarios || usuarios.length === 0) {
        lista.innerHTML = `<li class="p-8 text-center text-slate-400">Nadie tiene acceso a ${nombreEmpresa} aún.</li>`;
        return;
    }

    lista.innerHTML = `
        <li class="px-6 py-3 bg-slate-200/50 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Equipo en: ${nombreEmpresa}
        </li>
    ` + usuarios.map(u => `
        <li class="px-6 py-4 hover:bg-white transition-colors flex justify-between items-center bg-slate-50/50">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs uppercase shadow-sm">
                    ${u.perfiles?.nombre ? u.perfiles.nombre.substring(0,2) : 'US'}
                </div>
                <div class="flex flex-col">
                    <span class="font-bold text-slate-800">${u.perfiles?.nombre || 'Usuario nuevo ('+u.id_usuario.substring(0,8)+'...)'}</span>
                    <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">${u.rol || 'Operador'}</span>
                </div>
            </div>
            <button onclick="eliminarAcceso('${u.id}')" class="text-red-400 hover:text-red-600 font-bold text-xs bg-red-50 px-3 py-1.5 rounded shadow-sm transition-transform hover:scale-105" title="Revocar Acceso">Revocar</button>
        </li>
    `).join('');
}

// FUNCIONES DE LOS FORMULARIOS
document.addEventListener('submit', async (e) => {
    if (e.target.id === 'form-nueva-empresa') {
        e.preventDefault();
        const { data: { user } } = await clienteSupabase.auth.getUser();
        const nombre = document.getElementById('ne-nombre').value;
        const nuevoIdEmpresa = crypto.randomUUID(); // Generamos un ID único

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
        window.cargarMisEmpresas();

    } else if (e.target.id === 'form-vincular-usuario') {
        e.preventDefault();
        const seleccion = document.getElementById('vu-empresa').value.split('|');
        const idEmpresa = seleccion[0];
        const nombreEmpresa = seleccion[1];
        const emailTarget = document.getElementById('vu-email').value.trim();
        const rolAsignado = document.getElementById('vu-rol').value;

        // 1. Buscamos el ID del usuario usando su correo
        const { data: perfilEncontrado } = await clienteSupabase.from('perfiles').select('id_usuario, nombre').eq('email', emailTarget).maybeSingle();

        if(!perfilEncontrado) {
            return alert("❌ No encontramos ningún usuario con ese correo. Pídele que vaya a la página principal y se cree una cuenta primero.");
        }

        // 2. Revisamos que no esté vinculado ya a esta empresa
        const { data: yaExiste } = await clienteSupabase.from('usuarios_empresas').select('id').eq('id_usuario', perfilEncontrado.id_usuario).eq('id_empresa', idEmpresa).maybeSingle();
        if(yaExiste) return alert("⚠️ Este usuario ya tiene acceso a esta empresa.");

        // 3. Lo vinculamos
        const { error } = await clienteSupabase.from('usuarios_empresas').insert({
            id_usuario: perfilEncontrado.id_usuario,
            id_empresa: idEmpresa,
            nombre_empresa: nombreEmpresa,
            rol: rolAsignado
        });

        if(error) return alert("❌ Error al vincular.");
        
        alert(`✅ ${perfilEncontrado.nombre || emailTarget} ha sido vinculado a ${nombreEmpresa} como ${rolAsignado}.`);
        document.getElementById('modal-vincular-usuario').classList.add('hidden');
        document.getElementById('form-vincular-usuario').reset();
        window.cargarUsuariosDeEmpresa(idEmpresa, nombreEmpresa);
    }
});

window.eliminarAcceso = async function(idRegistro) {
    if(confirm("¿Seguro que deseas revocar el acceso a este usuario para esta empresa?")) {
        await clienteSupabase.from('usuarios_empresas').delete().eq('id', idRegistro);
        document.getElementById('lista-usuarios-empresa').innerHTML = '<li class="p-8 text-center text-slate-400 font-medium text-sm">👈 Selecciona una empresa a la izquierda para ver su equipo.</li>';
        window.cargarMisEmpresas();
    }
}
