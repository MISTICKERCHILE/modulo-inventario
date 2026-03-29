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

// ==========================================
// MÓDULO DE NOTAS RÁPIDAS (POST-ITS)
// ==========================================

window.notaEditandoId = null;
window.colorNotaSeleccionado = 'bg-yellow-100';
window.sortableNotas = null; // Guardará la instancia de Drag & Drop

window.cargarNotasHome = async function() {
    const grid = document.getElementById('home-notas-grid');
    if(!grid) return;
    grid.innerHTML = '<p class="text-slate-400 text-sm col-span-full animate-pulse">Cargando cartelera...</p>';

    const { data: { user } } = await clienteSupabase.auth.getUser();

    // Traemos las notas ordenadas por la nueva columna "orden"
    const { data: notas, error } = await clienteSupabase
        .from('notas_home')
        .select('*')
        .eq('id_empresa', window.miEmpresaId)
        .eq('id_usuario', user.id)
        .order('orden', { ascending: true })
        .order('creado_at', { ascending: false });

    if (error) {
        grid.innerHTML = `<p class="text-red-500 text-sm col-span-full">Error al cargar notas.</p>`;
        return;
    }

    if (!notas || notas.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <span class="text-3xl mb-2 block">📝</span>
                <p class="text-slate-500 text-sm font-bold">Tu cartelera está vacía.</p>
                <p class="text-slate-400 text-xs mt-1">Crea un post-it para no olvidar nada importante.</p>
            </div>`;
        return;
    }

    // Dibujamos las notas (Añadí el botón de Lápiz ✎ para editar y el atributo data-id para mover)
    grid.innerHTML = notas.map(nota => `
        <div data-id="${nota.id}" class="${nota.color} p-5 rounded-2xl shadow-sm min-h-[140px] flex flex-col justify-between group relative transform transition-all hover:shadow-md cursor-grab active:cursor-grabbing border border-black/5">
            
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="editarNotaHome('${nota.id}', '${nota.contenido.replace(/'/g, "\\'").replace(/\n/g, '\\n')}', '${nota.color}')" class="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center text-slate-600 hover:bg-blue-500 hover:text-white transition-all text-xs shadow-sm" title="Editar">✏️</button>
                <button onclick="borrarNotaHome('${nota.id}')" class="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center text-slate-600 hover:bg-red-500 hover:text-white transition-all text-xs shadow-sm font-bold" title="Borrar">✕</button>
            </div>
            
            <p class="text-slate-800 font-medium text-sm leading-relaxed whitespace-pre-wrap mt-2 select-none">${nota.contenido}</p>
            <span class="text-[10px] text-slate-500/80 uppercase font-black mt-4 select-none flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400/50"></span>
                ${new Date(nota.creado_at).toLocaleDateString()}
            </span>
        </div>
    `).join('');

    // 🔥 ACTIVAMOS EL DRAG & DROP 🔥
    if (window.sortableNotas) window.sortableNotas.destroy(); // Limpiamos si ya existía
    
    window.sortableNotas = new Sortable(grid, {
        animation: 250,
        ghostClass: 'opacity-50', // Se pone transparente mientras lo mueves
        delay: 150, // Pequeño delay en celular para que no se mueva al hacer scroll normal
        delayOnTouchOnly: true,
        onEnd: function () {
            guardarOrdenNotas(); // Cuando lo sueltas, guarda el orden en BD
        }
    });
}

// Guarda el nuevo orden en Supabase silenciosamente
window.guardarOrdenNotas = async function() {
    const grid = document.getElementById('home-notas-grid');
    const tarjetas = grid.querySelectorAll('[data-id]');
    
    // Creamos un arreglo de promesas para actualizar cada nota con su nueva posición
    const promesas = Array.from(tarjetas).map((tarjeta, index) => {
        return clienteSupabase.from('notas_home').update({ orden: index }).eq('id', tarjeta.dataset.id);
    });

    try {
        await Promise.all(promesas); // Ejecutamos todo a la vez
        console.log("✅ Orden de notas guardado");
    } catch (error) {
        console.error("Error guardando orden:", error);
    }
}

// --- LÓGICA DEL MODAL PROFESIONAL ---

window.crearNotaHome = function() {
    window.notaEditandoId = null;
    document.getElementById('modal-nota-titulo').innerText = "Nueva Nota Rápida";
    document.getElementById('nota-contenido').value = "";
    seleccionarColorNota('bg-yellow-100');
    abrirAnimacionModal();
}

window.editarNotaHome = function(id, contenido, color) {
    window.notaEditandoId = id;
    document.getElementById('modal-nota-titulo').innerText = "Editar Nota";
    document.getElementById('nota-contenido').value = contenido;
    seleccionarColorNota(color);
    abrirAnimacionModal();
}

window.seleccionarColorNota = function(colorClass) {
    window.colorNotaSeleccionado = colorClass;
    // Efecto visual de selección en los botones
    document.querySelectorAll('.color-btn').forEach(btn => {
        if(btn.classList.contains(colorClass)) {
            btn.classList.add('ring-slate-400', 'scale-110');
            btn.classList.remove('ring-transparent');
        } else {
            btn.classList.remove('ring-slate-400', 'scale-110');
            btn.classList.add('ring-transparent');
        }
    });
}

window.abrirAnimacionModal = function() {
    const modal = document.getElementById('modal-nota');
    const box = document.getElementById('modal-nota-box');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        document.getElementById('nota-contenido').focus();
    }, 10);
}

window.cerrarModalNota = function() {
    const modal = document.getElementById('modal-nota');
    const box = document.getElementById('modal-nota-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

window.guardarNotaModal = async function() {
    const contenido = document.getElementById('nota-contenido').value.trim();
    if (!contenido) return alert("⚠️ La nota no puede estar vacía.");

    const btn = document.getElementById('btn-guardar-nota');
    btn.innerText = "Guardando..."; btn.disabled = true;

    const { data: { user } } = await clienteSupabase.auth.getUser();

    try {
        if (window.notaEditandoId) {
            // ACTUALIZAR NOTA EXISTENTE
            await clienteSupabase.from('notas_home').update({
                contenido: contenido,
                color: window.colorNotaSeleccionado
            }).eq('id', window.notaEditandoId);
        } else {
            // CREAR NOTA NUEVA
            await clienteSupabase.from('notas_home').insert({
                id_empresa: window.miEmpresaId,
                id_usuario: user.id,
                contenido: contenido,
                color: window.colorNotaSeleccionado,
                orden: 0 // Aparecerá de primera
            });
        }
        cerrarModalNota();
        cargarNotasHome();
    } catch (error) {
        alert("❌ Error al guardar la nota.");
        console.error(error);
    } finally {
        btn.innerText = "Guardar"; btn.disabled = false;
    }
}

window.borrarNotaHome = async function(id) {
    if(!confirm("¿Seguro que deseas borrar esta nota?")) return;
    await clienteSupabase.from('notas_home').delete().eq('id', id);
    cargarNotasHome();
}