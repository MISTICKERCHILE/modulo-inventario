-- =====================================================================
-- Buddy ERP · Perfil completo de usuario
-- Fecha: 2026-10-30
--
-- 1. aceptar_invitacion(): ahora también guarda teléfono y fecha de
--    nacimiento del registro por invitación (antes no se pedían).
-- 2. actualizar_mi_perfil(): cada usuario completa o edita sus propios
--    datos (perfiles no tiene permiso de UPDATE directo desde la API).
-- 3. perfil_incompleto(): indica si al usuario le faltan datos, para
--    mostrarle el formulario "Completa tu perfil" al entrar.
-- =====================================================================

-- 1. Invitaciones: perfil con teléfono y fecha de nacimiento
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
  v_nac   date;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

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

  begin
    v_nac := nullif(trim(p_perfil->>'fecha_nacimiento'), '')::date;
  exception when others then
    v_nac := null;
  end;

  insert into public.perfiles (id_usuario, id_empresa, nombre, apellido, email, telefono,
                               fecha_nacimiento, rut_o_identificacion, pin_seguridad)
  values (
    v_uid,
    v_inv.id_empresa,
    coalesce(nullif(trim(p_perfil->>'nombre'), ''), split_part(v_email, '@', 1)),
    nullif(trim(p_perfil->>'apellido'), ''),
    v_email,
    nullif(left(trim(coalesce(p_perfil->>'telefono', '')), 30), ''),
    v_nac,
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

-- 2. El usuario actualiza sus propios datos
create or replace function public.actualizar_mi_perfil(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_nombre   text := nullif(left(trim(coalesce(p_datos->>'nombre', '')), 80), '');
  v_apellido text := nullif(left(trim(coalesce(p_datos->>'apellido', '')), 80), '');
  v_telefono text := nullif(left(trim(coalesce(p_datos->>'telefono', '')), 30), '');
  v_rut      text := nullif(left(upper(regexp_replace(coalesce(p_datos->>'rut', ''), '[.\-\s]', '', 'g')), 20), '');
  v_nac      date;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if v_nombre is null then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;

  begin
    v_nac := nullif(trim(coalesce(p_datos->>'fecha_nacimiento', '')), '')::date;
  exception when others then
    raise exception 'Fecha de nacimiento inválida' using errcode = '22023';
  end;
  if v_nac is not null and (v_nac > current_date - interval '14 years' or v_nac < date '1900-01-01') then
    raise exception 'Fecha de nacimiento fuera de rango' using errcode = '22023';
  end if;

  insert into public.perfiles (id_usuario, nombre, apellido, email, telefono, fecha_nacimiento, rut_o_identificacion, pin_seguridad)
  values (v_uid, v_nombre, v_apellido, (select lower(email) from auth.users where id = v_uid),
          v_telefono, v_nac, v_rut, null)
  on conflict (id_usuario) do update set
    nombre               = excluded.nombre,
    apellido             = excluded.apellido,
    telefono             = excluded.telefono,
    fecha_nacimiento     = excluded.fecha_nacimiento,
    rut_o_identificacion = excluded.rut_o_identificacion;

  return jsonb_build_object('ok', true);
end;
$$;

-- 3. ¿Le faltan datos al usuario actual?
create or replace function public.perfil_incompleto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.apellido is null or trim(p.apellido) = ''
        or p.telefono is null or trim(p.telefono) = ''
        or p.fecha_nacimiento is null
        or p.rut_o_identificacion is null or trim(p.rut_o_identificacion) = ''
        or p.nombre is null or lower(p.nombre) = lower(split_part(p.email, '@', 1))
    from public.perfiles p
    where p.id_usuario = auth.uid()
  ), true);
$$;

revoke all on function public.actualizar_mi_perfil(jsonb) from public, anon;
revoke all on function public.perfil_incompleto()         from public, anon;
grant execute on function public.actualizar_mi_perfil(jsonb) to authenticated;
grant execute on function public.perfil_incompleto()         to authenticated;
