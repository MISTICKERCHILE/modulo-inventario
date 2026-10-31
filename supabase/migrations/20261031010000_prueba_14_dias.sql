-- =====================================================================
-- Buddy ERP · Prueba gratuita de 14 días
-- Fecha: 2026-10-30
--
-- Modelo:
--   · empresas.suscripciones.<modulo>.activo = módulo CONTRATADO (lo activa Zeus).
--   · empresas.prueba_hasta = fin de la prueba gratuita (NULL = sin prueba).
--   · Una empresa puede usar un módulo si lo tiene contratado O si su prueba
--     sigue vigente. Lo aplica empresa_tiene_modulo(), que ya usan todas las
--     reglas RLS "suscripcion": el bloqueo ocurre en la base de datos.
--
-- Empresas existentes: prueba_hasta queda NULL → nada cambia para ellas.
-- Empresas nuevas: nacen sin módulos contratados y con 14 días de prueba
--   de TODOS los módulos (incluido Personas).
-- =====================================================================

-- 1. Columna de prueba y valores por defecto para empresas nuevas
alter table public.empresas add column if not exists prueba_hasta timestamptz;
alter table public.empresas alter column prueba_hasta set default (now() + interval '14 days');
alter table public.empresas alter column suscripciones
  set default '{"ventas": {"activo": false}, "inventario": {"activo": false}, "personas": {"activo": false}}'::jsonb;

-- 2. Acceso por módulo = contratado O prueba vigente
create or replace function public.empresa_tiene_modulo(empresa_id uuid, nombre_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce((e.suscripciones -> nombre_modulo ->> 'activo')::boolean, false)
        or coalesce(e.prueba_hasta > now(), false)
    from public.empresas e
    where e.id = empresa_id
  ), false);
$$;

-- 3. Estado de la suscripción para la app (aviso de días y módulos disponibles)
create or replace function public.estado_suscripcion(p_id_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e public.empresas%rowtype;
  v_en_prueba boolean;
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_e from public.empresas where id = p_id_empresa;
  v_en_prueba := coalesce(v_e.prueba_hasta > now(), false);

  return jsonb_build_object(
    'en_prueba',      v_en_prueba,
    'prueba_hasta',   v_e.prueba_hasta,
    'prueba_vencida', v_e.prueba_hasta is not null and not v_en_prueba,
    'dias_restantes', case when v_en_prueba
                           then greatest(1, ceil(extract(epoch from (v_e.prueba_hasta - now())) / 86400)::int)
                           else 0 end,
    'modulos', jsonb_build_object(
      'ventas',     public.empresa_tiene_modulo(p_id_empresa, 'ventas'),
      'inventario', public.empresa_tiene_modulo(p_id_empresa, 'inventario'),
      'personas',   public.empresa_tiene_modulo(p_id_empresa, 'personas')
    ),
    'contratados', jsonb_build_object(
      'ventas',     coalesce((v_e.suscripciones -> 'ventas'     ->> 'activo')::boolean, false),
      'inventario', coalesce((v_e.suscripciones -> 'inventario' ->> 'activo')::boolean, false),
      'personas',   coalesce((v_e.suscripciones -> 'personas'   ->> 'activo')::boolean, false)
    )
  );
end;
$$;

-- 4. Zeus: resumen con estado de la prueba (cambia el tipo de retorno → recrear)
drop function if exists public.zeus_resumen_empresas();
create function public.zeus_resumen_empresas()
returns table (
  id                      uuid,
  nombre                  text,
  rut                     text,
  pais                    text,
  fecha_creacion          timestamptz,
  suscripciones           jsonb,
  prueba_hasta            timestamptz,
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
    e.id, e.nombre::text, e.rut_o_identificacion::text, e.pais::text, e.fecha_creacion,
    coalesce(e.suscripciones, '{}'::jsonb),
    e.prueba_hasta,
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

-- 5. Zeus: extender (o iniciar) la prueba de una empresa
create or replace function public.zeus_extender_prueba(p_id_empresa uuid, p_dias int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta timestamptz;
begin
  if not public.soy_zeus() then
    raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'Los días deben estar entre 1 y 90' using errcode = '22023';
  end if;

  update public.empresas
  set prueba_hasta = greatest(coalesce(prueba_hasta, now()), now()) + make_interval(days => p_dias)
  where id = p_id_empresa
  returning prueba_hasta into v_hasta;

  if not found then
    raise exception 'Empresa no encontrada' using errcode = 'P0002';
  end if;

  insert into public.zeus_auditoria (id_usuario, email, id_empresa, accion, detalle)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_id_empresa,
          'extender_prueba', jsonb_build_object('dias', p_dias, 'nueva_fecha', v_hasta));

  return v_hasta;
end;
$$;

-- 6. Protección: prueba_hasta solo la cambia Zeus o el backend
create or replace function public.proteger_suscripciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.suscripciones is distinct from old.suscripciones
      or new.prueba_hasta is distinct from old.prueba_hasta)
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (
       select 1 from public.perfiles p
       where p.id_usuario = auth.uid() and p.es_zeus is true)
  then
    raise exception 'No autorizado para modificar la suscripción' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Permisos
revoke all on function public.estado_suscripcion(uuid)          from public, anon;
revoke all on function public.zeus_resumen_empresas()           from public, anon;
revoke all on function public.zeus_extender_prueba(uuid, int)   from public, anon;
grant execute on function public.estado_suscripcion(uuid)        to authenticated;
grant execute on function public.zeus_resumen_empresas()         to authenticated;
grant execute on function public.zeus_extender_prueba(uuid, int) to authenticated;
