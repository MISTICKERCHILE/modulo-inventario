-- =====================================================================
-- Buddy ERP · Fase 1 · Grupo B · Paso 1 — Funciones seguras (aditivo)
-- Fecha: 2026-10-28
--
-- Este paso SOLO AGREGA. No elimina ni modifica políticas existentes,
-- por lo que la app actual (main) sigue funcionando igual.
--
-- Reemplazos que habilita (el código los adoptará en el Paso 2):
--   Navegador inserta en usuarios_empresas  → aceptar_invitacion()
--   Navegador inserta/borra invitaciones    → crear_invitacion(), cancelar_invitacion()
--   Navegador lee invitación sin sesión     → ver_invitacion()
--   Navegador inserta empresa "fantasma"    → crear_empresa()
--   Navegador borra membresías              → quitar_miembro()
--   Login POS lee PIN de todos los perfiles → validar_pin()
--   Panel POS edita PIN (hoy falla)         → asignar_pin(), listar_equipo_pos()
--
-- PIN: se agrega perfiles.pin_hash (bcrypt). Un trigger lo mantiene
-- sincronizado mientras el código antiguo siga usando pin_seguridad.
-- En el Paso 3 se elimina el PIN en texto plano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers internos
-- ---------------------------------------------------------------------

-- Rol del usuario actual en una empresa (NULL si no pertenece).
create or replace function public.mi_rol_en_empresa(p_id_empresa uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ue.rol::text
  from public.usuarios_empresas ue
  where ue.id_usuario = auth.uid() and ue.id_empresa = p_id_empresa
  limit 1;
$$;

create or replace function public.es_admin_de_empresa(p_id_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.mi_rol_en_empresa(p_id_empresa) in ('Dueño', 'Admin'), false);
$$;

-- ---------------------------------------------------------------------
-- 1. PIN cifrado
-- ---------------------------------------------------------------------
alter table public.perfiles add column if not exists pin_hash text;

create or replace function public.sincronizar_pin_hash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin_seguridad is not null and new.pin_seguridad <> ''
     and (tg_op = 'INSERT' or new.pin_seguridad is distinct from old.pin_seguridad) then
    new.pin_hash := extensions.crypt(new.pin_seguridad, extensions.gen_salt('bf'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_pin_hash on public.perfiles;
create trigger trg_sincronizar_pin_hash
  before insert or update of pin_seguridad on public.perfiles
  for each row execute function public.sincronizar_pin_hash();

-- Backfill de los PIN existentes.
update public.perfiles
set pin_hash = extensions.crypt(pin_seguridad, extensions.gen_salt('bf'))
where pin_seguridad is not null and pin_seguridad <> '' and pin_hash is null;

-- ---------------------------------------------------------------------
-- 2. Invitaciones
-- ---------------------------------------------------------------------

-- Lectura pública de UNA invitación por su id (el link es el secreto).
-- Devuelve solo lo necesario para la pantalla de bienvenida.
create or replace function public.ver_invitacion(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inv public.invitaciones%rowtype;
begin
  select * into v_inv from public.invitaciones where id = p_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id',             v_inv.id,
    'id_empresa',     v_inv.id_empresa,
    'nombre_empresa', v_inv.nombre_empresa,
    'email_invitado', v_inv.email_invitado,
    'rol',            v_inv.rol,
    'estado',         v_inv.estado,
    'usuario_existe', exists (
      select 1 from auth.users u
      where lower(u.email) = lower(v_inv.email_invitado))
  );
end;
$$;

create or replace function public.crear_invitacion(
  p_id_empresa uuid,
  p_email      text,
  p_rol        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(p_email));
  v_nombre text;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo Dueños y Administradores pueden invitar' using errcode = '42501';
  end if;
  if p_rol not in ('Operador', 'Admin') then
    raise exception 'Rol no permitido: %', p_rol using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo inválido' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.usuarios_empresas ue
    join auth.users u on u.id = ue.id_usuario
    where ue.id_empresa = p_id_empresa and lower(u.email) = v_email
  ) then
    raise exception 'Este usuario ya es parte de la empresa' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.invitaciones
    where id_empresa = p_id_empresa and lower(email_invitado) = v_email and estado = 'Pendiente'
  ) then
    raise exception 'Ya existe una invitación pendiente para este correo' using errcode = '23505';
  end if;

  select nombre into v_nombre from public.empresas where id = p_id_empresa;

  insert into public.invitaciones (id_empresa, nombre_empresa, email_invitado, rol, estado)
  values (p_id_empresa, v_nombre, v_email, p_rol, 'Pendiente')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cancelar_invitacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select id_empresa into v_empresa
  from public.invitaciones where id = p_id and estado = 'Pendiente';

  if v_empresa is null then
    raise exception 'Invitación no encontrada o ya utilizada' using errcode = 'P0002';
  end if;
  if not public.es_admin_de_empresa(v_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  delete from public.invitaciones where id = p_id;
end;
$$;

-- Acepta una invitación para el usuario actual.
-- p_perfil (opcional, para usuarios recién registrados):
--   { "nombre", "apellido", "rut", "pin" }
create or replace function public.aceptar_invitacion(p_id uuid, p_perfil jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.invitaciones%rowtype;
  v_pin   text := nullif(trim(p_perfil->>'pin'), '');
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  -- Bloqueo de fila: evita aceptar la misma invitación dos veces en paralelo.
  select * into v_inv from public.invitaciones where id = p_id for update;
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;
  if v_inv.estado <> 'Pendiente' then
    raise exception 'Esta invitación ya fue utilizada' using errcode = '22023';
  end if;
  if lower(v_inv.email_invitado) <> v_email then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;
  if v_pin is not null and v_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos' using errcode = '22023';
  end if;

  -- Perfil: se crea si no existe (registro nuevo). Si existe, no se pisa.
  insert into public.perfiles (id_usuario, id_empresa, nombre, apellido, email, rut_o_identificacion, pin_seguridad)
  values (
    v_uid,
    v_inv.id_empresa,
    coalesce(nullif(trim(p_perfil->>'nombre'), ''), split_part(v_email, '@', 1)),
    nullif(trim(p_perfil->>'apellido'), ''),
    v_email,
    nullif(upper(regexp_replace(coalesce(p_perfil->>'rut', ''), '[.\-\s]', '', 'g')), ''),
    v_pin
  )
  on conflict (id_usuario) do nothing;

  if not exists (
    select 1 from public.usuarios_empresas
    where id_usuario = v_uid and id_empresa = v_inv.id_empresa
  ) then
    insert into public.usuarios_empresas (id_usuario, id_empresa, nombre_empresa, rol)
    values (v_uid, v_inv.id_empresa, v_inv.nombre_empresa, v_inv.rol);
  end if;

  update public.invitaciones set estado = 'Aceptada' where id = p_id;

  return jsonb_build_object(
    'id_empresa',     v_inv.id_empresa,
    'nombre_empresa', v_inv.nombre_empresa,
    'rol',            v_inv.rol
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Empresas y miembros
-- ---------------------------------------------------------------------

-- Crea una empresa completa (empresa + Casa Matriz + membresía Dueño).
-- Reemplaza el insert de membresía "fantasma" sin fila en empresas.
create or replace function public.crear_empresa(
  p_nombre           text,
  p_rut              text default null,
  p_pais             text default null,
  p_nombre_comercial text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la empresa es obligatorio' using errcode = '22023';
  end if;

  insert into public.empresas (nombre, rut_o_identificacion, pais, nombre_comercial, configuracion)
  values (
    trim(p_nombre), nullif(trim(p_rut), ''), nullif(trim(p_pais), ''),
    coalesce(nullif(trim(p_nombre_comercial), ''), trim(p_nombre)),
    '{"operador":{"recetas":true,"reportes":true,"catalogos":true}}'::jsonb
  )
  returning id into v_id;

  insert into public.sucursales (id_empresa, nombre, direccion, nombre_comercial)
  values (v_id, 'Casa Matriz', 'Sin dirección registrada',
          coalesce(nullif(trim(p_nombre_comercial), ''), trim(p_nombre)));

  insert into public.usuarios_empresas (id_usuario, id_empresa, nombre_empresa, rol)
  values (v_uid, v_id, trim(p_nombre), 'Dueño');

  return v_id;
end;
$$;

create or replace function public.quitar_miembro(p_id_registro uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg     public.usuarios_empresas%rowtype;
  v_mi_rol  text;
begin
  select * into v_reg from public.usuarios_empresas where id = p_id_registro;
  if not found then
    raise exception 'Registro no encontrado' using errcode = 'P0002';
  end if;

  v_mi_rol := public.mi_rol_en_empresa(v_reg.id_empresa);
  if v_mi_rol is null or v_mi_rol not in ('Dueño', 'Admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_reg.rol = 'Dueño' and v_mi_rol <> 'Dueño' then
    raise exception 'Solo un Dueño puede quitar a otro Dueño' using errcode = '42501';
  end if;
  if v_reg.rol = 'Dueño' and (
    select count(*) from public.usuarios_empresas
    where id_empresa = v_reg.id_empresa and rol = 'Dueño') <= 1 then
    raise exception 'La empresa debe conservar al menos un Dueño' using errcode = '22023';
  end if;

  delete from public.usuarios_empresas where id = p_id_registro;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. POS: PIN
-- ---------------------------------------------------------------------

-- Equipo de la empresa para el panel POS, sin exponer el PIN.
create or replace function public.listar_equipo_pos(p_id_empresa uuid)
returns table (id_usuario uuid, nombre text, rol text, tiene_pin boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select ue.id_usuario,
         coalesce(p.nombre, split_part(u.email, '@', 1))::text,
         ue.rol::text,
         (p.pin_hash is not null)
  from public.usuarios_empresas ue
  join auth.users u on u.id = ue.id_usuario
  left join public.perfiles p on p.id_usuario = ue.id_usuario
  where ue.id_empresa = p_id_empresa
  order by 2;
end;
$$;

-- Valida un PIN entre los miembros de la empresa.
-- Devuelve { id_usuario, nombre, rol } o NULL si no coincide.
create or replace function public.validar_pin(p_id_empresa uuid, p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_coincidencias int;
  v_res jsonb;
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    return null;
  end if;

  select count(*), min(jsonb_build_object(
           'id_usuario', ue.id_usuario,
           'nombre',     coalesce(p.nombre, ''),
           'rol',        ue.rol)::text)::jsonb
  into v_coincidencias, v_res
  from public.usuarios_empresas ue
  join public.perfiles p on p.id_usuario = ue.id_usuario
  where ue.id_empresa = p_id_empresa
    and p.pin_hash is not null
    and p.pin_hash = extensions.crypt(p_pin, p.pin_hash);

  if v_coincidencias > 1 then
    raise exception 'PIN duplicado en la empresa: pide a un administrador que lo cambie'
      using errcode = '23505';
  end if;

  return v_res;
end;
$$;

-- Asigna/cambia el PIN de un miembro.
-- Permitido: el propio usuario, o un Dueño/Admin de la empresa.
create or replace function public.asignar_pin(p_id_empresa uuid, p_id_usuario uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if not (p_id_usuario = auth.uid() and public.tiene_acceso_a_empresa(p_id_empresa))
     and not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.usuarios_empresas
    where id_empresa = p_id_empresa and id_usuario = p_id_usuario) then
    raise exception 'El usuario no pertenece a la empresa' using errcode = '22023';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.usuarios_empresas ue
    join public.perfiles p on p.id_usuario = ue.id_usuario
    where ue.id_empresa = p_id_empresa
      and ue.id_usuario <> p_id_usuario
      and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)) then
    raise exception 'Ese PIN ya lo usa otra persona de la empresa' using errcode = '23505';
  end if;

  -- El trigger trg_sincronizar_pin_hash calcula pin_hash.
  -- (Paso 3: dejará de guardarse pin_seguridad en texto plano.)
  update public.perfiles set pin_seguridad = p_pin where id_usuario = p_id_usuario;
  if not found then
    raise exception 'El usuario no tiene perfil' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke all on function public.mi_rol_en_empresa(uuid)                 from public, anon;
revoke all on function public.es_admin_de_empresa(uuid)               from public, anon;
revoke all on function public.sincronizar_pin_hash()                  from public, anon, authenticated;
revoke all on function public.ver_invitacion(uuid)                    from public;
revoke all on function public.crear_invitacion(uuid, text, text)      from public, anon;
revoke all on function public.cancelar_invitacion(uuid)               from public, anon;
revoke all on function public.aceptar_invitacion(uuid, jsonb)         from public, anon;
revoke all on function public.crear_empresa(text, text, text, text)   from public, anon;
revoke all on function public.quitar_miembro(uuid)                    from public, anon;
revoke all on function public.listar_equipo_pos(uuid)                 from public, anon;
revoke all on function public.validar_pin(uuid, text)                 from public, anon;
revoke all on function public.asignar_pin(uuid, uuid, text)           from public, anon;

grant execute on function public.mi_rol_en_empresa(uuid)               to authenticated;
grant execute on function public.es_admin_de_empresa(uuid)             to authenticated;
grant execute on function public.ver_invitacion(uuid)                  to anon, authenticated;
grant execute on function public.crear_invitacion(uuid, text, text)    to authenticated;
grant execute on function public.cancelar_invitacion(uuid)             to authenticated;
grant execute on function public.aceptar_invitacion(uuid, jsonb)       to authenticated;
grant execute on function public.crear_empresa(text, text, text, text) to authenticated;
grant execute on function public.quitar_miembro(uuid)                  to authenticated;
grant execute on function public.listar_equipo_pos(uuid)               to authenticated;
grant execute on function public.validar_pin(uuid, text)               to authenticated;
grant execute on function public.asignar_pin(uuid, uuid, text)         to authenticated;
