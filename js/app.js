let productoActualParaReceta = null;

// --- LOGIN Y NAVEGACIÓN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) return alert("❌ Credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    miEmpresaId = perfil.id_empresa;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    cargarDatosSelects(); // Pre-cargar listas
});

function cerrarSesion() { location.reload(); }

function cambiarVista(v) {
    const vistas = ['catalogos', 'productos', 'recetas'];
    vistas.forEach(vis => document.getElementById(`vista-${vis}`).classList.add('hidden'));
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    
    if(v === 'productos') cargarProductos();
}

// --- PRODUCTOS ---
function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.remove('hidden'); }

async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', miEmpresaId).order('nombre');
    const tbody = document.getElementById('lista-productos');
    tbody.innerHTML = data.map(p => `
        <tr class="hover:bg-slate-50">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4">
                ${p.tiene_receta ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Con Receta</span>' : '<span class="text-gray-400 text-xs italic">Simple</span>'}
            </td>
            <td class="px-6 py-4 text-right">
                ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-600 font-bold text-sm hover:underline">Gestionar Receta →</button>` : ''}
                <button onclick="eliminarProducto('${p.id}')" class="ml-4 text-red-400 text-xs hover:text-red-600">Borrar</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevo = {
        id_empresa: miEmpresaId,
        nombre: document.getElementById('prod-nombre').value,
        sku: document.getElementById('prod-sku').value,
        id_categoria: document.getElementById('prod-categoria').value,
        tiene_receta: document.getElementById('prod-tiene-receta').checked
    };
    await clienteSupabase.from('productos').insert([nuevo]);
    document.getElementById('form-producto').reset();
    document.getElementById('panel-form-producto').classList.add('hidden');
    cargarProductos();
});

// --- RECETAS ---
async function abrirReceta(idProducto, nombre) {
    productoActualParaReceta = idProducto;
    document.getElementById('receta-titulo').innerText = "Receta de: " + nombre;
    cambiarVista('recetas');
    cargarIngredientesReceta();
}

async function cargarIngredientesReceta() {
    const { data, error } = await clienteSupabase
        .from('recetas')
        .select('id, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))')
        .eq('id_producto_padre', productoActualParaReceta);

    const tbody = document.getElementById('lista-ingredientes-receta');
    tbody.innerHTML = data.map(r => `
        <tr class="border-b">
            <td class="py-3 text-sm font-medium text-slate-700">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold text-slate-600">${r.cantidad_neta} ${r.id_ingrediente.id_unidad_receta.abreviatura}</td>
            <td class="py-3 text-right">
                <button onclick="quitarIngrediente('${r.id}')" class="text-red-500 hover:text-red-700 font-bold">✕</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('form-ingrediente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevo = {
        id_empresa: miEmpresaId,
        id_producto_padre: productoActualParaReceta,
        id_ingrediente: document.getElementById('sel-ingrediente').value,
        cantidad_neta: document.getElementById('ing-cantidad').value
    };
    await clienteSupabase.from('recetas').insert([nuevo]);
    document.getElementById('ing-cantidad').value = '';
    cargarIngredientesReceta();
});

async function quitarIngrediente(id) {
    await clienteSupabase.from('recetas').delete().eq('id', id);
    cargarIngredientesReceta();
}

// --- AUXILIARES ---
async function cargarDatosSelects() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = cat.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    const { data: prods } = await clienteSupabase.from('productos').select('*').eq('id_empresa', miEmpresaId);
    document.getElementById('sel-ingrediente').innerHTML = prods.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}
