-- =====================================================================
-- Buddy ERP · Panel Zeus (control de membresías de clientes)
-- Fecha: 2026-10-28
--
-- 1. Solo buddyerp@outlook.com es Zeus por ahora.
-- 2. Nadie puede auto-otorgarse es_zeus (trigger de protección).
-- 3. Funciones Zeus (verifican es_zeus en la base, no en el navegador):
--      soy_zeus()                       → ¿el usuario actual es Zeus?
--      zeus_resumen_empresas()          → overview de todos los clientes
--      zeus_equipo_empresa(id)          → equipo de un cliente (soporte)
--      zeus_cambiar_modulo(id, mod, on) → activa/desactiva módulos
-- 4. Auditoría: cada cambio de módulo queda registrado en zeus_auditoria.
-- =====================================================================

-- 1. Zeus: solo buddyerp@outlook.com
update public.perfiles p
set es_zeus = (lower(u.email) = 'buddyerp@outlook.com')
from auth.users u
where u.id = p.id_usuario
  and p.es_zeus is distinct from (lower(u.email) = 'buddyerp@outlook.com');

-- 2. Protección: es_zeus solo cambia desde SQL Editor / backend
create or replace function public.proteger_es_zeus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and coalesce(new.es_zeus, false) then
      raise exception 'No autorizado para otorgar acceso Zeus' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.es_zeus is distinct from old.es_zeus then
      raise exception 'No autorizado para modificar acceso Zeus' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_es_zeus on public.perfiles;
create trigger trg_proteger_es_zeus
  before insert or update of es_zeus on public.perfiles
  for each row execute function public.proteger_es_zeus();

-- 3. Funciones Zeus
create or replace function public.soy_zeus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_zeus from public.perfiles where id_usuario = auth.uid()), false);
$$;

create or replace function public.zeus_resumen_empresas()
returns table (
  id                      uuid,
  nombre                  text,
  rut                     text,
  pais                    text,
  fecha_creacion          timestamptz,
  suscripciones           jsonb,
  duenos                  text,
  miembros                int,
  invitaciones_pendientes int,
  sucursales              int,
  productos               int,
  ventas_30d              int,
  monto_30d               numeric,
  ultima_venta            timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.soy_zeus() then
    raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.nombre::text,
    e.rut_o_identificacion::text,
    e.pais::text,
    e.fecha_creacion,
    coalesce(e.suscripciones, '{}'::jsonb),
    (select string_agg(u.email, ', ' order by u.email)
       from public.usuarios_empresas ue join auth.users u on u.id = ue.id_usuario
      where ue.id_empresa = e.id and ue.rol = 'Dueño')::text,
    (select count(*) from public.usuarios_empresas ue where ue.id_empresa = e.id)::int,
    (select count(*) from public.invitaciones i where i.id_empresa = e.id and i.estado = 'Pendiente')::int,
    (select count(*) from public.sucursales s where s.id_empresa = e.id)::int,
    (select count(*) from public.productos p where p.id_empresa = e.id)::int,
    (select count(*) from public.ventas v where v.id_empresa = e.id and v.created_at >= now() - interval '30 days')::int,
    (select coalesce(sum(v.total), 0) from public.ventas v where v.id_empresa = e.id and v.created_at >= now() - interval '30 days'),
    (select max(v.created_at) from public.ventas v where v.id_empresa = e.id)
  from public.empresas e
  order by e.fecha_creacion desc nulls last;
end;
$$;

create or replace function public.zeus_equipo_empresa(p_id_empresa uuid)
returns table (
  nombre        text,
  email         text,
  rol           text,
  tiene_pin     boolean,
  desde         timestamptz,
  ultimo_acceso timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.soy_zeus() then
    raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
  end if;

  return query
  select
    trim(coalesce(p.nombre, split_part(u.email, '@', 1)) || ' ' || coalesce(p.apellido, ''))::text,
    u.email::text,
    ue.rol::text,
    (p.pin_hash is not null),
    ue.created_at,
    u.last_sign_in_at
  from public.usuarios_empresas ue
  join auth.users u on u.id = ue.id_usuario
  left join public.perfiles p on p.id_usuario = ue.id_usuario
  where ue.id_empresa = p_id_empresa
  order by case ue.rol when 'Dueño' then 0 when 'Admin' then 1 else 2 end, 1;
end;
$$;

-- 4. Auditoría de cambios de módulos
create table if not exists public.zeus_auditoria (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  id_usuario  uuid not null,
  email       text,
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  accion      text not null,
  detalle     jsonb
);

alter table public.zeus_auditoria enable row level security;
-- Sin políticas: solo se escribe y lee mediante funciones Zeus.

create or replace function public.zeus_cambiar_modulo(p_id_empresa uuid, p_modulo text, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subs jsonb;
begin
  if not public.soy_zeus() then
    raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
  end if;
  if p_modulo not in ('ventas', 'inventario', 'personas') then
    raise exception 'Módulo desconocido: %', p_modulo using errcode = '22023';
  end if;

  update public.empresas
  set suscripciones = jsonb_set(
        coalesce(suscripciones, '{}'::jsonb),
        array[p_modulo],
        coalesce(suscripciones -> p_modulo, '{}'::jsonb) || jsonb_build_object('activo', p_activo),
        true)
  where id = p_id_empresa
  returning suscripciones into v_subs;

  if not found then
    raise exception 'Empresa no encontrada' using errcode = 'P0002';
  end if;

  insert into public.zeus_auditoria (id_usuario, email, id_empresa, accion, detalle)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_id_empresa,
          'cambiar_modulo', jsonb_build_object('modulo', p_modulo, 'activo', p_activo));

  return v_subs;
end;
$$;

-- Permisos de ejecución
revoke all on function public.proteger_es_zeus()                          from public, anon, authenticated;
revoke all on function public.soy_zeus()                                  from public, anon;
revoke all on function public.zeus_resumen_empresas()                     from public, anon;
revoke all on function public.zeus_equipo_empresa(uuid)                   from public, anon;
revoke all on function public.zeus_cambiar_modulo(uuid, text, boolean)    from public, anon;
grant execute on function public.soy_zeus()                               to authenticated;
grant execute on function public.zeus_resumen_empresas()                  to authenticated;
grant execute on function public.zeus_equipo_empresa(uuid)                to authenticated;
grant execute on function public.zeus_cambiar_modulo(uuid, text, boolean) to authenticated;
