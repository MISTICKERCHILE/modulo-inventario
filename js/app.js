window.miEmpresaId = null;
window.productoActualParaReceta = null;

// --- LOGIN ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    
    if (error) return alert("❌ Credenciales incorrectas");

    const { data: perfil } = await clienteSupabase.from('perfiles').select('id_empresa').eq('id_usuario', data.user.id).single();
    if (!perfil) return alert("Usuario sin empresa asignada");

    window.miEmpresaId = perfil.id_empresa;
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    cambiarVista('catalogos');
});

function cerrarSesion() { location.reload(); }

// --- NAVEGACIÓN PRINCIPAL ---
function cambiarVista(v) {
    if(!window.miEmpresaId) return; // Evita errores 400 si se recarga la página
    
    ['catalogos', 'productos', 'recetas'].forEach(vis => {
        document.getElementById(`vista-${vis}`).classList.add('hidden');
        document.getElementById(`btn-menu-${vis}`).className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70';
    });
    
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    document.getElementById(`btn-menu-${v}`).className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100';
    
    if(v === 'catalogos') cambiarTab('categorias');
    if(v === 'productos') { cargarDatosSelects(); cargarProductos(); }
}

function cambiarTab(tab) {
    if(!window.miEmpresaId) return;

    ['categorias', 'unidades', 'proveedores', 'sucursales', 'ubicaciones'].forEach(t => {
        document.getElementById(`seccion-${t}`).style.display = tab === t ? 'block' : 'none';
        document.getElementById(`tab-${t}`).className = tab === t 
            ? 'px-6 py-3 font-medium border-b-2 border-emerald-600 text-emerald-600 bg-emerald-50/50' 
            : 'px-6 py-3 font-medium text-gray-500 hover:text-gray-700';
    });
    
    if(tab === 'categorias') cargarCategorias();
    if(tab === 'unidades') cargarUnidades();
    if(tab === 'proveedores') cargarProveedores();
    if(tab === 'sucursales') cargarSucursales();
    if(tab === 'ubicaciones') { cargarSelectSucursales(); cargarUbicaciones(); }
}

// --- LOGICA DE GUARDADO (FORMS) ---
document.getElementById('form-categoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('categorias').insert([{ nombre: document.getElementById('nombre-categoria').value, id_empresa: window.miEmpresaId }]);
    document.getElementById('form-categoria').reset();
    cargarCategorias();
});

document.getElementById('form-unidad').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('unidades').insert([{ nombre: document.getElementById('nombre-unidad').value, abreviatura: document.getElementById('abrev-unidad').value, id_empresa: window.miEmpresaId }]);
    document.getElementById('form-unidad').reset();
    cargarUnidades();
});

document.getElementById('form-proveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('proveedores').insert([{ nombre: document.getElementById('nombre-proveedor').value, nombre_contacto: document.getElementById('contacto-proveedor').value, lapso_entrega_dias: document.getElementById('tiempo-entrega').value || null, id_empresa: window.miEmpresaId }]);
    document.getElementById('form-proveedor').reset();
    cargarProveedores();
});

document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('sucursales').insert([{ nombre: document.getElementById('nombre-sucursal').value, direccion: document.getElementById('dir-sucursal').value, id_empresa: window.miEmpresaId }]);
    document.getElementById('form-sucursal').reset();
    cargarSucursales();
});

document.getElementById('form-ubicacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('ubicaciones_internas').insert([{ nombre: document.getElementById('nombre-ubicacion').value, id_sucursal: document.getElementById('sel-sucursal-ubi').value, id_empresa: window.miEmpresaId }]);
    document.getElementById('form-ubicacion').reset();
    cargarUbicaciones();
});

// --- LOGICA DE CARGA (CATALOGOS) ---
async function cargarCategorias() {
    const { data } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-categorias').innerHTML = (data||[]).map(c => `<li class="p-4 flex justify-between border-b"><span>${c.nombre}</span><button onclick="eliminarReg('categorias','${c.id}')" class="text-red-500 text-sm">Borrar</button></li>`).join('');
}

async function cargarUnidades() {
    const { data } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-unidades').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b"><span>${u.nombre} (${u.abreviatura})</span><button onclick="eliminarReg('unidades','${u.id}')" class="text-red-500 text-sm">Borrar</button></li>`).join('');
}

async function cargarProveedores() {
    const { data } = await clienteSupabase.from('proveedores').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-proveedores').innerHTML = (data||[]).map(p => `<li class="p-4 flex justify-between border-b"><div><p class="font-bold">${p.nombre}</p><p class="text-xs text-gray-500">${p.nombre_contacto||''} - ${p.lapso_entrega_dias||''} días</p></div><button onclick="eliminarReg('proveedores','${p.id}')" class="text-red-500 text-sm">Borrar</button></li>`).join('');
}

async function cargarSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-sucursales').innerHTML = (data||[]).map(s => `<li class="p-4 flex justify-between border-b"><span>${s.nombre}</span><button onclick="eliminarReg('sucursales','${s.id}')" class="text-red-500 text-sm">Borrar</button></li>`).join('');
}

async function cargarSelectSucursales() {
    const { data } = await clienteSupabase.from('sucursales').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('sel-sucursal-ubi').innerHTML = '<option value="">Elegir Sucursal...</option>' + (data||[]).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

async function cargarUbicaciones() {
    const { data } = await clienteSupabase.from('ubicaciones_internas').select('*, sucursales(nombre)').eq('id_empresa', window.miEmpresaId);
    document.getElementById('lista-ubicaciones').innerHTML = (data||[]).map(u => `<li class="p-4 flex justify-between border-b"><span>${u.nombre} <b class="text-emerald-600">@${u.sucursales?.nombre}</b></span><button onclick="eliminarReg('ubicaciones_internas','${u.id}')" class="text-red-500 text-sm">Borrar</button></li>`).join('');
}

async function eliminarReg(tabla, id) {
    if(confirm("¿Seguro de eliminar?")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla==='sucursales') cargarSucursales(); else cambiarVista('catalogos');
    }
}

// --- PRODUCTOS ---
function mostrarFormProducto() { document.getElementById('panel-form-producto').classList.toggle('hidden'); }

async function cargarDatosSelects() {
    const { data: cat } = await clienteSupabase.from('categorias').select('*').eq('id_empresa', window.miEmpresaId);
    document.getElementById('prod-categoria').innerHTML = (cat||[]).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    const { data: uni } = await clienteSupabase.from('unidades').select('*').eq('id_empresa', window.miEmpresaId);
    const opcionesUni = '<option value="">Seleccione...</option>' + (uni||[]).map(u => `<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
    ['prod-u-compra', 'prod-u-almacen', 'prod-u-menor', 'prod-u-receta'].forEach(id => document.getElementById(id).innerHTML = opcionesUni);
}

async function cargarProductos() {
    const { data } = await clienteSupabase.from('productos').select('*').eq('id_empresa', window.miEmpresaId).order('nombre');
    document.getElementById('lista-productos').innerHTML = (data||[]).map(p => `
        <tr class="hover:bg-slate-50 border-b">
            <td class="px-6 py-4 font-medium">${p.nombre}</td>
            <td class="px-6 py-4">${p.tiene_receta ? '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Con Receta</span>' : '<span class="text-gray-400 text-xs">Simple</span>'}</td>
            <td class="px-6 py-4 text-right">
                ${p.tiene_receta ? `<button onclick="abrirReceta('${p.id}', '${p.nombre}')" class="text-emerald-600 font-bold mr-4">Gestionar Receta →</button>` : ''}
                <button onclick="eliminarReg('productos', '${p.id}'); cargarProductos();" class="text-red-400">Borrar</button>
            </td>
        </tr>`).join('');
}

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevo = {
        id_empresa: window.miEmpresaId,
        nombre: document.getElementById('prod-nombre').value,
        sku: document.getElementById('prod-sku').value,
        id_categoria: document.getElementById('prod-categoria').value,
        id_unidad_compra: document.getElementById('prod-u-compra').value,
        cant_en_ua_de_uc: parseFloat(document.getElementById('prod-cant-ua').value),
        id_unidad_almacenamiento: document.getElementById('prod-u-almacen').value,
        cant_en_um_de_ua: parseFloat(document.getElementById('prod-cant-um').value),
        id_unidad_menor: document.getElementById('prod-u-menor').value,
        cant_en_ur_de_um: parseFloat(document.getElementById('prod-cant-ur').value),
        id_unidad_receta: document.getElementById('prod-u-receta').value,
        tiene_receta: document.getElementById('prod-tiene-receta').checked
    };
    await clienteSupabase.from('productos').insert([nuevo]);
    document.getElementById('form-producto').reset();
    document.getElementById('panel-form-producto').classList.add('hidden');
    cargarProductos();
});

// --- RECETAS ---
// Guardamos los productos en memoria para mostrar las unidades rápido
window.productosParaRecetaMemoria = []; 

async function abrirReceta(idProducto, nombre) {
    window.productoActualParaReceta = idProducto;
    document.getElementById('receta-titulo').innerText = "Receta de: " + nombre;
    
    // 1. Obtener los detalles del producto final (para saber su rendimiento y unidad)
    const { data: prodFinal } = await clienteSupabase
        .from('productos')
        .select('rendimiento_receta, id_unidad_receta(abreviatura)')
        .eq('id', idProducto)
        .single();
    
    const abrevFinal = prodFinal?.id_unidad_receta?.abreviatura || 'un';
    document.getElementById('receta-unidad-base').innerText = `Se mide en: ${abrevFinal}`;
    document.getElementById('receta-label-rendimiento').innerText = abrevFinal;
    document.getElementById('receta-rendimiento').value = prodFinal?.rendimiento_receta || 1;

    // 2. Cargar los insumos en el selector para poder elegirlos
    const { data: prods } = await clienteSupabase
        .from('productos')
        .select('id, nombre, id_unidad_receta(abreviatura)')
        .eq('id_empresa', window.miEmpresaId)
        .order('nombre');
    
    window.productosParaRecetaMemoria = prods || [];
    document.getElementById('sel-ingrediente').innerHTML = '<option value="">Selecciona insumo...</option>' + 
        window.productosParaRecetaMemoria.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    // Limpiar el label de unidad por defecto
    document.getElementById('label-unidad-ingrediente').innerText = '';

    cambiarVista('recetas');
    cargarIngredientesReceta();
}

// Al seleccionar un ingrediente, mostramos su unidad (gr, ml, etc.) en el input
document.getElementById('sel-ingrediente').addEventListener('change', (e) => {
    const idSeleccionado = e.target.value;
    const producto = window.productosParaRecetaMemoria.find(p => p.id === idSeleccionado);
    document.getElementById('label-unidad-ingrediente').innerText = producto?.id_unidad_receta?.abreviatura || '';
});

// Guardar el rendimiento esperado de la receta
async function guardarRendimiento() {
    const rend = parseFloat(document.getElementById('receta-rendimiento').value);
    await clienteSupabase.from('productos').update({ rendimiento_receta: rend }).eq('id', window.productoActualParaReceta);
    alert("Rendimiento actualizado");
    cargarIngredientesReceta(); // Recalcular costos
}

async function cargarIngredientesReceta() {
    // Obtenemos los ingredientes guardados en esta receta
    const { data } = await clienteSupabase
        .from('recetas')
        .select('id, cantidad_neta, id_ingrediente(nombre, id_unidad_receta(abreviatura))')
        .eq('id_producto_padre', window.productoActualParaReceta);

    // NOTA: Aquí iría la suma matemática de los costos en base a la última compra.
    // Como aún no hay compras, forzamos un costo de 0 para la estructura.
    let costoTotalReceta = 0;

    document.getElementById('lista-ingredientes-receta').innerHTML = (data||[]).map(r => {
        let costoInsumo = 0; // Próximamente esto vendrá de la base de datos
        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-2 text-sm font-medium text-slate-700">${r.id_ingrediente.nombre}</td>
            <td class="py-3 text-center font-bold text-slate-600 bg-slate-100 rounded">${r.cantidad_neta} <span class="text-xs text-slate-400 font-normal">${r.id_ingrediente.id_unidad_receta?.abreviatura || ''}</span></td>
            <td class="py-3 text-right text-slate-500 italic">$${costoInsumo.toFixed(2)}</td>
            <td class="py-3 text-right"><button onclick="quitarIngrediente('${r.id}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors">Borrar</button></td>
        </tr>`
    }).join('');

    // Actualizar totales visuales
    const rendimiento = parseFloat(document.getElementById('receta-rendimiento').value) || 1;
    const costoUnitario = costoTotalReceta / rendimiento;

    document.getElementById('receta-costo-total').innerText = `$${costoTotalReceta.toFixed(2)}`;
    document.getElementById('receta-costo-unitario').innerText = `$${costoUnitario.toFixed(2)}`;
}

document.getElementById('form-ingrediente').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('recetas').insert([{
        id_empresa: window.miEmpresaId,
        id_producto_padre: window.productoActualParaReceta,
        id_ingrediente: document.getElementById('sel-ingrediente').value,
        cantidad_neta: document.getElementById('ing-cantidad').value
    }]);
    document.getElementById('ing-cantidad').value = '';
    
    // Devolver el focus al selector para añadir rápido otro ingrediente
    document.getElementById('sel-ingrediente').focus();
    cargarIngredientesReceta();
});

async function quitarIngrediente(id) {
    await clienteSupabase.from('recetas').delete().eq('id', id);
    cargarIngredientesReceta();
}
