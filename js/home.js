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
        // Conteo seguro de compras en tránsito (Igual que en tu dashboard original)
        const { data: transitoData, error } = await clienteSupabase
            .from('compras_detalles')
            .select('id, compras!inner(id_empresa)')
            .eq('compras.id_empresa', window.miEmpresaId)
            .eq('estado', 'En Tránsito');
        
        if (error) throw error;
        
        const mCompras = document.getElementById('hm-metrica-compras');
        if(mCompras) mCompras.innerText = transitoData ? transitoData.length : 0;

        // Simuladas por ahora
        document.getElementById('hm-metrica-ventas').innerText = "Próx.";
        document.getElementById('hm-metrica-inventario').innerText = "Activo";

    } catch (error) {
        console.error("Error cargando métricas home:", error.message);
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

window.cargarHome = async function() {
    console.log("🏠 Cargando Home ERP...");

    // 1. Saludo Inteligente
    const hora = new Date().getHours();
    let saludo = "Buenas noches";
    if (hora >= 5 && hora < 12) saludo = "Buenos días";
    else if (hora >= 12 && hora < 19) saludo = "Buenas tardes";

    const elSaludo = document.getElementById('home-saludo');
    if(elSaludo) {
        elSaludo.innerHTML = `${saludo}, <span class="text-emerald-600">${window.usuarioActual}!</span>`;
    }

    cargarMetricasHome();
    cargarNotasHome();
}

window.borrarNotaHome = async function(id) {
    if(!confirm("¿Borrar esta nota?")) return;
    await clienteSupabase.from('notas_home').delete().eq('id', id);
    cargarNotasHome();
}