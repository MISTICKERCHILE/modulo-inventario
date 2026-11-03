-- ============================================================
-- Envíos programados de CSV (ventas o cierres) por correo
-- ============================================================

create table if not exists public.export_programaciones (
  id          uuid primary key default gen_random_uuid(),
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  id_sucursal uuid not null references public.sucursales(id) on delete cascade,
  tipo        text not null check (tipo in ('ventas','cierres')),
  frecuencia  text not null check (frecuencia in ('diaria','semanal','mensual')),
  dia_semana  smallint check (dia_semana between 0 and 6),     -- 0 = domingo
  dia_mes     smallint check (dia_mes between 1 and 28),
  rango       text not null check (rango in ('ayer','semana_anterior','mes_anterior')),
  correos     text[] not null,
  activo      boolean not null default true,
  ultimo_envio date,
  creado_por  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists export_programaciones_idx on public.export_programaciones(id_empresa);
alter table public.export_programaciones enable row level security;
drop policy if exists solo_admin_lectura on public.export_programaciones;
drop policy if exists suscripcion on public.export_programaciones;
create policy solo_admin_lectura on public.export_programaciones for select using (public.es_admin_de_empresa(id_empresa));
create policy suscripcion on public.export_programaciones as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

create or replace function public.guardar_programacion(
  p_id_empresa uuid, p_id uuid, p_id_sucursal uuid, p_tipo text, p_frecuencia text,
  p_dia_semana int, p_dia_mes int, p_rango text, p_correos text[], p_activo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id; c text; limpios text[] := '{}';
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede programar envíos' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if not exists (select 1 from public.sucursales where id = p_id_sucursal and id_empresa = p_id_empresa) then
    raise exception 'Sucursal no válida' using errcode = '22023';
  end if;
  foreach c in array coalesce(p_correos, '{}') loop
    c := lower(trim(c));
    if c !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(c) > 254 then raise exception 'Correo no válido: %', c using errcode = '22023'; end if;
    if not (c = any(limpios)) then limpios := limpios || c; end if;
  end loop;
  if coalesce(array_length(limpios,1),0) not between 1 and 5 then raise exception 'Indica entre 1 y 5 correos' using errcode = '22023'; end if;
  if p_frecuencia = 'semanal' and p_dia_semana is null then raise exception 'Elige el día de la semana' using errcode = '22023'; end if;
  if p_frecuencia = 'mensual' and p_dia_mes is null then raise exception 'Elige el día del mes' using errcode = '22023'; end if;
  if v is null then
    if (select count(*) from public.export_programaciones where id_empresa = p_id_empresa) >= 20 then
      raise exception 'Máximo 20 envíos programados' using errcode = '22023';
    end if;
    insert into public.export_programaciones (id_empresa, id_sucursal, tipo, frecuencia, dia_semana, dia_mes, rango, correos, activo, creado_por)
    values (p_id_empresa, p_id_sucursal, p_tipo, p_frecuencia, p_dia_semana, p_dia_mes, p_rango, limpios, coalesce(p_activo,true), auth.uid())
    returning id into v;
  else
    update public.export_programaciones set id_sucursal = p_id_sucursal, tipo = p_tipo, frecuencia = p_frecuencia, dia_semana = p_dia_semana,
           dia_mes = p_dia_mes, rango = p_rango, correos = limpios, activo = coalesce(p_activo,true)
     where id = v and id_empresa = p_id_empresa;
    if not found then raise exception 'Envío no encontrado' using errcode = '22023'; end if;
  end if;
  return v;
end $$;

create or replace function public.eliminar_programacion(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.export_programaciones where id = p_id;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.export_programaciones where id = p_id;
end $$;

-- ---- Solo para el servidor (clave de servicio): quién toca enviar hoy ----
create or replace function public.programaciones_pendientes()
returns table (id uuid) language sql stable security definer set search_path = public as $$
  select p.id
    from public.export_programaciones p
    join public.empresas e on e.id = p.id_empresa
   where p.activo and public.empresa_tiene_modulo(p.id_empresa, 'ventas')
     and p.ultimo_envio is distinct from (now() at time zone e.zona_horaria)::date
     and (   p.frecuencia = 'diaria'
          or (p.frecuencia = 'semanal' and extract(dow from (now() at time zone e.zona_horaria)::date) = p.dia_semana)
          or (p.frecuencia = 'mensual' and extract(day from (now() at time zone e.zona_horaria)::date) = p.dia_mes))
$$;

-- Datos de un envío: columnas guardadas de la sucursal, período y filas
create or replace function public.datos_programacion(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p record; tz text; hoy date; d date; h date; cols jsonb; filas jsonb; v_emp text; v_suc text;
begin
  select * into p from public.export_programaciones where id = p_id;
  if not found then raise exception 'Envío no encontrado'; end if;
  select zona_horaria, coalesce(nombre_comercial, nombre) into tz, v_emp from public.empresas where id = p.id_empresa;
  select nombre into v_suc from public.sucursales where id = p.id_sucursal;
  hoy := (now() at time zone tz)::date;
  if p.rango = 'ayer' then d := hoy - 1; h := hoy - 1;
  elsif p.rango = 'semana_anterior' then d := (date_trunc('week', hoy)::date) - 7; h := d + 6;
  else d := (date_trunc('month', hoy) - interval '1 month')::date; h := (date_trunc('month', hoy)::date) - 1; end if;
  select columnas into cols from public.export_config where id_sucursal = p.id_sucursal and tipo = p.tipo;
  if cols is null then
    cols := case p.tipo
      when 'ventas' then '["fecha","hora","ticket","origen","estado","cliente","forma_pago","moneda","total","cajero","productos","unidades","id_externo"]'::jsonb
      else '["fecha","sucursal","modo","forma_pago","moneda","sistema","otros","declarado","diferencia","responsable","cuadrado","comentario","otros_cobros"]'::jsonb end;
  end if;
  filas := case p.tipo when 'ventas' then public._export_ventas_filas(p.id_sucursal, d, h) else public._export_cierres_filas(p.id_sucursal, d, h) end;
  return jsonb_build_object('id', p.id, 'id_empresa', p.id_empresa, 'id_sucursal', p.id_sucursal, 'tipo', p.tipo, 'correos', to_jsonb(p.correos),
    'empresa', v_emp, 'sucursal', v_suc, 'desde', d, 'hasta', h, 'columnas', cols, 'filas', filas);
end $$;

create or replace function public.registrar_envio_programado(
  p_id uuid, p_estado text, p_detalle text, p_filas int, p_desde date, p_hasta date, p_columnas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.export_programaciones where id = p_id;
  if not found then return; end if;
  insert into public.export_historial (id_empresa, id_sucursal, tipo, desde, hasta, columnas, filas, origen, correos, estado, detalle)
  values (p.id_empresa, p.id_sucursal, p.tipo, p_desde, p_hasta, p_columnas, greatest(coalesce(p_filas,0),0), 'automatico', p.correos,
          case when p_estado = 'ok' then 'ok' else 'error' end, left(p_detalle, 300));
  if p_estado = 'ok' then
    update public.export_programaciones set ultimo_envio = (now() at time zone (select zona_horaria from public.empresas where id = p.id_empresa))::date where id = p.id;
  end if;
end $$;

revoke all on function public.guardar_programacion(uuid,uuid,uuid,text,text,int,int,text,text[],boolean) from public, anon;
revoke all on function public.eliminar_programacion(uuid) from public, anon;
grant execute on function public.guardar_programacion(uuid,uuid,uuid,text,text,int,int,text,text[],boolean) to authenticated;
grant execute on function public.eliminar_programacion(uuid) to authenticated;
-- Estas tres solo las puede usar el servidor con la clave de servicio
revoke all on function public.programaciones_pendientes() from public, anon, authenticated;
revoke all on function public.datos_programacion(uuid) from public, anon, authenticated;
revoke all on function public.registrar_envio_programado(uuid,text,text,int,date,date,jsonb) from public, anon, authenticated;
grant execute on function public.programaciones_pendientes() to service_role;
grant execute on function public.datos_programacion(uuid) to service_role;
grant execute on function public.registrar_envio_programado(uuid,text,text,int,date,date,jsonb) to service_role;
