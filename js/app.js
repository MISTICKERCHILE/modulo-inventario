window.miEmpresaId = null;
window.productoActualParaReceta = null;
window.unidadesMemoria = []; 
window.modoEdicion = { activo: false, id: null, form: null };

// --- LOGIN Y SESIÓN ---
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
    document.getElementById('user-email-display').innerText = data.user.email;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    window.cambiarVista('catalogos');
});

window.cerrarSesion = function() { location.reload(); }

window.toggleMenu = function() {
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar.classList.contains('w-64')) {
        sidebar.classList.remove('w-64', 'p-4'); sidebar.classList.add('w-0', 'p-0');
    } else {
        sidebar.classList.remove('w-0', 'p-0'); sidebar.classList.add('w-64', 'p-4');
    }
}

// --- NAVEGACIÓN GLOBAL ---
window.cambiarVista = function(v) {
    if(!window.miEmpresaId) return; 
    
    // Agregamos 'movimientos' a la lista de vistas
    ['catalogos', 'productos', 'recetas', 'movimientos', 'inventario', 'compras'].forEach(vis => {
        const el = document.getElementById(`vista-${vis}`);
        if(el) el.classList.add('hidden');
        const btn = document.getElementById(`btn-menu-${vis}`);
        if(btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 rounded-lg font-medium text-white opacity-70 transition-colors';
    });
    
    const activeEl = document.getElementById(`vista-${v}`);
    if(activeEl) activeEl.classList.remove('hidden');
    const activeBtn = document.getElementById(`btn-menu-${v}`);
    if(activeBtn) activeBtn.className = 'w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 rounded-lg font-medium text-white opacity-100 transition-colors';
    
    // Disparadores según la vista
    if(v === 'catalogos') window.cambiarTab('categorias');
    if(v === 'productos') { window.cargarDatosSelects(); window.cargarProductos(); }
    if(v === 'recetas') { window.cargarBuscadorRecetas(); }
    if(v === 'movimientos') { window.cambiarTabMovimientos('pedidos'); } // Lo crearemos luego
    if(v === 'inventario') { window.cargarInventario(); }
    if(v === 'compras') { window.cargarCompras(); } // Eventualmente lo mudaremos a movimientos
}

// --- SISTEMA DE EDICIÓN GLOBAL ---
window.cancelarEdicion = function(formName) {
    window.modoEdicion = { activo: false, id: null, form: null };
    const formEl = document.getElementById(`form-${formName}`);
    if(formEl) {
        formEl.reset();
        const btnSubmit = formEl.querySelector('button[type="submit"]');
        if(btnSubmit) { 
            btnSubmit.innerText = formName === 'producto' ? 'Guardar Producto' : 'Guardar'; 
            btnSubmit.classList.replace('bg-blue-600', formName === 'ingrediente' || formName === 'producto' ? 'bg-emerald-600' : 'bg-slate-800'); 
        }
        const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}

window.activarEdicionGlobal = function(formName, id, objJS) {
    window.modoEdicion = { activo: true, id: id, form: formName };
    for (const [inputId, valor] of Object.entries(objJS)) { document.getElementById(inputId).value = valor; }
    
    const btnSubmit = document.querySelector(`#form-${formName} button[type="submit"]`);
    if(btnSubmit) {
        btnSubmit.innerText = 'Actualizar ✏️';
        btnSubmit.classList.replace('bg-slate-800', 'bg-blue-600');
        btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600'); 
    }
    const btnCancel = document.getElementById(`btn-cancelar-${formName}`);
    if(btnCancel) btnCancel.classList.remove('hidden');
};

window.eliminarReg = async function(tabla, id) {
    if(confirm("¿Seguro de eliminar este registro definitivamente? 🗑️")) {
        await clienteSupabase.from(tabla).delete().eq('id', id);
        if(tabla === 'sucursales') window.cargarSucursales(); 
        else if (tabla === 'tipos_movimiento') window.cargarTiposMovimiento();
        else window.cambiarVista(document.querySelector('.bg-emerald-600').id.replace('btn-menu-',''));
    }
}
