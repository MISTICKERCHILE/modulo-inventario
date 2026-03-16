window.cargarHome = async function() {
    console.log("🏠 Cargando Home ERP...");

    // 1. Saludo Personalizado
    const elSaludo = document.getElementById('home-saludo');
    if(elSaludo) {
        elSaludo.innerHTML = `Buen Día, <span class="text-emerald-600">${window.usuarioActual}!</span>`;
    }

    // 2. Cargar Métricas (Conexión temporal)
    cargarMetricasHome();

    // 3. Cargar Notas desde Supabase
    cargarNotasHome();
}

async function cargarMetricasHome() {
    try {
        // Traemos las compras en tránsito como ejemplo de métrica
        const { count: countCompras } = await clienteSupabase
            .from('compras_detalles')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'En Tránsito')
            .eq('compras.id_empresa', window.miEmpresaId); 
            // Nota: Este .eq requiere un inner join real si tus RLS no lo cubren, 
            // pero para arrancar pondremos un valor por defecto si falla.
        
        const mCompras = document.getElementById('hm-metrica-compras');
        if(mCompras) mCompras.innerText = countCompras || 0;

        // Por ahora dejamos estas simuladas hasta definir tus reglas de ventas/personas
        document.getElementById('hm-metrica-ventas').innerText = "Próx.";
        document.getElementById('hm-metrica-inventario').innerText = "Activo";

    } catch (error) {
        console.error("Error métricas:", error);
    }
}

async function cargarNotasHome() {
    const grid = document.getElementById('home-notas-grid');
    if(!grid) return;

    grid.innerHTML = '<p class="text-slate-400 text-sm col-span-full">Cargando...</p>';

    const { data: notas, error } = await clienteSupabase
        .from('notas_home')
        .select('*')
        .eq('id_empresa', window.miEmpresaId)
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
    const texto = prompt("📝 Escribe tu nota rápida:");
    if(!texto || texto.trim() === '') return;

    const colores = ['bg-yellow-100', 'bg-blue-100', 'bg-emerald-100', 'bg-orange-100'];
    const colorElegido = colores[Math.floor(Math.random() * colores.length)];

    const { error } = await clienteSupabase.from('notas_home').insert([{
        id_empresa: window.miEmpresaId,
        contenido: texto,
        color: colorElegido
    }]);

    if(error) alert("Error guardando: " + error.message);
    else cargarNotasHome(); 
}

window.borrarNotaHome = async function(id) {
    if(!confirm("¿Borrar esta nota?")) return;
    await clienteSupabase.from('notas_home').delete().eq('id', id);
    cargarNotasHome();
}