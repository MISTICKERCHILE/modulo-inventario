-- =====================================================================
-- Buddy ERP · Fase 1 · Paso 3 — Cierre de puertas antiguas
-- Fecha: 2026-10-28 (aplicar con producción ya en el código nuevo, PR #19)
--
-- 1. usuarios_empresas: solo lectura desde la API. Altas, bajas y cambios
--    solo mediante funciones (aceptar_invitacion, crear_empresa, quitar_miembro).
-- 2. invitaciones: sin lectura pública; solo Dueños/Admins ven las de su
--    empresa. Escrituras solo mediante funciones.
-- 3. empresas: no se pueden crear directamente (solo crear_empresa o registro).
-- 4. perfiles: cada usuario ve su perfil y el de sus compañeros de empresa
--    (antes: todos los perfiles de Buddy). Las columnas de PIN no son legibles.
-- 5. PIN en texto plano eliminado (queda solo el hash bcrypt). Se limpian
--    también los PIN guardados en metadatos de registros anteriores.
-- 6. Se eliminan reglas antiguas basadas en perfiles.id_empresa, que
--    mantenían el acceso a ex-miembros de una empresa.
-- 7. roles y permisos_roles: solo Dueños/Admins pueden modificarlos.
-- =====================================================================

-- 1. usuarios_empresas
drop policy if exists "Acceso seguro a tabla de usuarios" on public.usuarios_empresas;
create policy lectura_miembros on public.usuarios_empresas
  for select to authenticated
  using (id_usuario = auth.uid() or public.tiene_acceso_a_empresa(id_empresa));

-- 2. invitaciones
drop policy if exists "Permitir lectura publica de invitaciones" on public.invitaciones;
drop policy if exists "acceso a invitaciones" on public.invitaciones;
create policy lectura_admins on public.invitaciones
  for select to authenticated
  using (public.es_admin_de_empresa(id_empresa));

-- 3. empresas
drop policy if exists "Crear nueva empresa" on public.empresas;

-- 4. perfiles
create or replace function public.comparte_empresa_con(p_id_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas yo
    join public.usuarios_empresas otro on otro.id_empresa = yo.id_empresa
    where yo.id_usuario = auth.uid() and otro.id_usuario = p_id_usuario
  );
$$;
revoke all on function public.comparte_empresa_con(uuid) from public, anon;
grant execute on function public.comparte_empresa_con(uuid) to authenticated;

drop policy if exists "Permitir leer perfiles" on public.perfiles;
drop policy if exists "Todos los usuarios autenticados pueden ver perfiles" on public.perfiles;
create policy lectura_propia_y_companeros on public.perfiles
  for select to authenticated
  using (id_usuario = auth.uid() or public.comparte_empresa_con(id_usuario));

-- Columnas de PIN fuera del alcance de la API
revoke all on public.perfiles from anon;
revoke select on public.perfiles from authenticated;
grant select (id_usuario, id_empresa, nombre, apellido, email, telefono,
              fecha_nacimiento, rut_o_identificacion, es_zeus)
  on public.perfiles to authenticated;

-- 5. PIN: solo hash
create or replace function public.sincronizar_pin_hash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin_seguridad is not null and new.pin_seguridad <> '' then
    new.pin_hash := extensions.crypt(new.pin_seguridad, extensions.gen_salt('bf'));
  end if;
  new.pin_seguridad := null;  -- nunca se guarda en texto plano
  return new;
end;
$$;

update public.perfiles set pin_seguridad = null where pin_seguridad is not null;

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'pin_seguridad'
where raw_user_meta_data ? 'pin_seguridad';

-- 6. Reglas antiguas basadas en perfiles.id_empresa
drop policy if exists "Acceso por id_empresa en categorias"  on public.categorias;
drop policy if exists "Acceso por id_empresa en saldos"      on public.inventario_saldos;
drop policy if exists "Acceso por id_empresa en movimientos" on public.movimientos_inventario;
drop policy if exists "Acceso por id_empresa en productos"   on public.productos;
drop policy if exists "Acceso por id_empresa en proveedores" on public.proveedores;
drop policy if exists "Acceso por id_empresa en sucursales"  on public.sucursales;
drop policy if exists "Acceso por id_empresa en unidades"    on public.unidades;
-- Regla muerta (claim id_empresa inexistente en el JWT)
drop policy if exists "Empresas ven sus propias notas"       on public.notas_home;

-- 7. roles y permisos_roles: lectura para miembros, escritura solo Dueño/Admin
drop policy if exists "Usuarios editan roles de sus empresas" on public.roles;
create policy escritura_admins on public.roles
  for all to authenticated
  using (public.es_admin_de_empresa(id_empresa))
  with check (public.es_admin_de_empresa(id_empresa));

drop policy if exists "Usuarios editan permisos de sus empresas" on public.permisos_roles;
create policy escritura_admins on public.permisos_roles
  for all to authenticated
  using (exists (select 1 from public.roles r where r.id = permisos_roles.id_rol and public.es_admin_de_empresa(r.id_empresa)))
  with check (exists (select 1 from public.roles r where r.id = permisos_roles.id_rol and public.es_admin_de_empresa(r.id_empresa)));
