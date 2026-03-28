window.cargarHome = async function() {
    console.log("🏠 Cargando Home ERP...");

    // 1. Saludo Inteligente (Primer nombre con mayúscula)
    const hora = new Date().getHours();
    let saludo = "Buenas noches";
    if (hora >= 5 && hora < 12) saludo = "Buenos días";
    else if (hora >= 12 && hora < 19) saludo = "Buenas tardes";

    // Lógica para extraer el primer nombre
    let nombreLimpio = window.usuarioActual || "Equipo";
    // Si viene como "Maria Jose", separamos por espacio y agarramos "Maria"
    let primerNombre = nombreLimpio.split(' ')[0]; 
    // Aseguramos que la primera letra sea mayúscula (por si se registraron en minúsculas)
    primerNombre = primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();

    const elSaludo = document.getElementById('home-saludo');
    if(elSaludo) {
        elSaludo.innerHTML = `${saludo}, <span class="text-emerald-600">${primerNombre}!</span>`;
    }

    // 2. Cargar Métricas y Notas
    cargarMetricasHome();
    cargarNotasHome();
}

async function cargarMetricasHome() {
    try {
        // Conteo seguro de compras en tránsito
        const { data: transitoData, error } = await clienteSupabase
            .from('compras_detalles')
            .select('id, compras!inner(id_empresa)')
            .eq('compras.id_empresa', window.miEmpresaId)
            .eq('estado', 'En Tránsito');
        
        if (error) throw error;
        
        // Escudos protectores (solo intentan cambiar el texto si el elemento existe en el HTML)
        const mCompras = document.getElementById('hm-metrica-compras');
        if (mCompras) mCompras.innerText = transitoData ? transitoData.length : 0;

        const mVentas = document.getElementById('hm-metrica-ventas');
        if (mVentas) mVentas.innerText = "Próx.";

        const mInventario = document.getElementById('hm-metrica-inventario');
        if (mInventario) mInventario.innerText = "Activo";

    } catch (error) {
        console.error("Error cargando métricas home:", error.message);
    }
}

async function cargarNotasHome() {
    const grid = document.getElementById('home-notas-grid');
    if(!grid) return;
    grid.innerHTML = '<p class="text-slate-400 text-sm col-span-full">Cargando...</p>';

    // Obtenemos el usuario actual
    const { data: { user } } = await clienteSupabase.auth.getUser();

    // Buscamos SOLO las notas de esta empresa Y de este usuario
    const { data: notas, error } = await clienteSupabase
        .from('notas_home')
        .select('*')
        .eq('id_empresa', window.miEmpresaId)
        .eq('id_usuario', user.id)
        .order('creado_at', { ascending: false });

    if (error) {
        grid.innerHTML = `<p class="text-red-500 text-sm col-span-full">Error al cargar notas.</p>`;
        return;
    }

    if (!notas || notas.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <p class="text-slate-400 text-sm font-medium">No hay notas. Haz clic en "+ Nueva Nota".</p>
            </div>`;
        return;
    }

    grid.innerHTML = notas.map(nota => `
        <div class="${nota.color} p-4 rounded-xl shadow-sm min-h-[120px] flex flex-col justify-between group relative transform transition-transform hover:scale-105">
            <button onclick="borrarNotaHome('${nota.id}')" class="absolute top-2 right-2 w-6 h-6 bg-black/5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-slate-600 hover:bg-red-500 hover:text-white transition-all text-xs font-bold pb-0.5">x</button>
            <p class="text-slate-800 font-medium text-sm leading-snug whitespace-pre-wrap">${nota.contenido}</p>
            <span class="text-[9px] text-slate-500/80 uppercase font-bold mt-4">${new Date(nota.creado_at).toLocaleDateString()}</span>
        </div>
    `).join('');
}

window.crearNotaHome = async function() {
    const contenido = prompt("Escribe tu nueva nota rápida (Privada):");
    if (!contenido || contenido.trim() === '') return;

    const colores = ['bg-yellow-100', 'bg-blue-100', 'bg-pink-100', 'bg-emerald-100', 'bg-purple-100'];
    const colorElegido = colores[Math.floor(Math.random() * colores.length)];
    const { data: { user } } = await clienteSupabase.auth.getUser();

    const { error } = await clienteSupabase.from('notas_home').insert({
        id_empresa: window.miEmpresaId,
        id_usuario: user.id, // <- Le estampamos la firma del dueño
        contenido: contenido,
        color: colorElegido
    });

    if (error) {
        alert("Error al guardar la nota. Revisa los permisos.");
        console.error(error);
        return;
    }
    cargarNotasHome();
}

window.borrarNotaHome = async function(id) {
    if(!confirm("¿Seguro que deseas borrar esta nota?")) return;
    
    // El RLS que configuramos en la base de datos ya asegura que 
    // Supabase solo borre la nota si le pertenece a este usuario.
    const { error } = await clienteSupabase
        .from('notas_home')
        .delete()
        .eq('id', id);
        
    if (error) {
        alert("❌ Error al borrar: " + error.message);
        return;
    }
    
    // Recargamos la cartelera visualmente
    cargarNotasHome();
}