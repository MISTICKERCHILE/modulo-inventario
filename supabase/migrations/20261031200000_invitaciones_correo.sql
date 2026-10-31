-- =====================================================================
-- Buddy ERP · Invitaciones de equipo por correo
-- Fecha: 2026-10-31
--
-- 1. invitaciones: quién invitó y control de envíos (anti-spam).
-- 2. crear_invitacion(): registra quién invita.
-- 3. preparar_envio_invitacion(): la usa api/invitacion.js. Verifica que
--    quien envía sea Dueño/Admin de la empresa, limita reenvíos (1 por
--    minuto, máximo 5) y devuelve los datos para armar el correo.
-- 4. mis_invitaciones_pendientes(): invitaciones a mi correo, para avisar
--    al iniciar sesión a quien llegó sin el link.
-- =====================================================================

alter table public.invitaciones add column if not exists invitado_por uuid references auth.users(id) on delete set null;
alter table public.invitaciones add column if not exists enviada_en   timestamptz;
alter table public.invitaciones add column if not exists envios       int not null default 0;

-- 2. crear_invitacion con invitado_por
create or replace function public.crear_invitacion(p_id_empresa uuid, p_email text, p_rol text)
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
    select 1 from public.usuarios_empresas ue join auth.users u on u.id = ue.id_usuario
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

  insert into public.invitaciones (id_empresa, nombre_empresa, email_invitado, rol, estado, invitado_por)
  values (p_id_empresa, v_nombre, v_email, p_rol, 'Pendiente', auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- 3. Preparar el envío del correo (verifica permiso y limita reenvíos)
create or replace function public.preparar_envio_invitacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     public.invitaciones%rowtype;
  v_nombre  text;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select * into v_inv from public.invitaciones where id = p_id for update;
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;
  if not public.es_admin_de_empresa(v_inv.id_empresa) then
    raise exception 'Solo Dueños y Administradores pueden enviar invitaciones' using errcode = '42501';
  end if;
  if v_inv.estado <> 'Pendiente' then
    raise exception 'Esta invitación ya fue utilizada' using errcode = '22023';
  end if;
  if v_inv.enviada_en is not null and v_inv.enviada_en > now() - interval '60 seconds' then
    raise exception 'Espera un minuto antes de reenviar la invitación' using errcode = '22023';
  end if;
  if v_inv.envios >= 5 then
    raise exception 'Se alcanzó el máximo de 5 envíos para esta invitación' using errcode = '22023';
  end if;

  update public.invitaciones
  set enviada_en = now(), envios = envios + 1
  where id = p_id;

  select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), u.email
  into v_nombre, v_email
  from auth.users u
  left join public.perfiles p on p.id_usuario = u.id
  where u.id = auth.uid();

  return jsonb_build_object(
    'id',                 v_inv.id,
    'email_invitado',     v_inv.email_invitado,
    'nombre_empresa',     v_inv.nombre_empresa,
    'rol',                v_inv.rol,
    'usuario_existe',     exists (select 1 from auth.users u where lower(u.email) = lower(v_inv.email_invitado)),
    'invitado_por',       nullif(v_nombre, ''),
    'invitado_por_email', v_email
  );
end;
$$;

-- 4. Invitaciones pendientes para el usuario actual
create or replace function public.mis_invitaciones_pendientes()
returns table (id uuid, nombre_empresa text, rol text, invitado_por text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.nombre_empresa::text, i.rol::text,
         nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '')
  from public.invitaciones i
  left join public.perfiles p on p.id_usuario = i.invitado_por
  where i.estado = 'Pendiente'
    and lower(i.email_invitado) = (select lower(email) from auth.users where id = auth.uid())
    and not exists (
      select 1 from public.usuarios_empresas ue
      where ue.id_usuario = auth.uid() and ue.id_empresa = i.id_empresa)
  order by i.fecha_creacion desc;
$$;

revoke all on function public.preparar_envio_invitacion(uuid) from public, anon;
revoke all on function public.mis_invitaciones_pendientes()    from public, anon;
grant execute on function public.preparar_envio_invitacion(uuid) to authenticated;
grant execute on function public.mis_invitaciones_pendientes()    to authenticated;
