-- ============================================================
-- Calendario del Inicio: eventos propios (personales o de la empresa),
-- feriados de Chile y lectura unificada con Agenda y vencimientos.
-- ============================================================
create table if not exists public.feriados_chile (
  fecha date primary key,
  nombre text not null,
  irrenunciable boolean not null default false
);
alter table public.feriados_chile enable row level security;
drop policy if exists feriados_chile_sel on public.feriados_chile;
create policy feriados_chile_sel on public.feriados_chile for select to authenticated using (true);
-- Fuente: calendario oficial de feriados de Chile (revisar cada año; la ley puede cambiarlos).
insert into public.feriados_chile (fecha, nombre, irrenunciable) values
 ('2026-09-18','Independencia Nacional',true), ('2026-09-19','Día de las Glorias del Ejército',true), ('2026-10-12','Encuentro de Dos Mundos',false),
 ('2026-10-31','Día de las Iglesias Evangélicas y Protestantes',false), ('2026-11-01','Día de Todos los Santos',false), ('2026-12-08','Inmaculada Concepción',false), ('2026-12-25','Navidad',true),
 ('2027-01-01','Año Nuevo',true), ('2027-03-26','Viernes Santo',false), ('2027-03-27','Sábado Santo',false), ('2027-05-01','Día Nacional del Trabajo',true),
 ('2027-05-21','Día de las Glorias Navales',false), ('2027-06-21','Día Nacional de los Pueblos Indígenas',false), ('2027-06-28','San Pedro y San Pablo',false),
 ('2027-07-16','Día de la Virgen del Carmen',false), ('2027-08-15','Asunción de la Virgen',false), ('2027-09-17','Feriado adicional de Fiestas Patrias',false),
 ('2027-09-18','Independencia Nacional',true), ('2027-09-19','Día de las Glorias del Ejército',true), ('2027-10-11','Encuentro de Dos Mundos',false),
 ('2027-10-31','Día de las Iglesias Evangélicas y Protestantes',false), ('2027-11-01','Día de Todos los Santos',false), ('2027-12-08','Inmaculada Concepción',false), ('2027-12-25','Navidad',true)
on conflict (fecha) do nothing;

create table if not exists public.calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  id_usuario uuid not null,
  titulo text not null check (char_length(titulo) between 1 and 120),
  descripcion text check (char_length(descripcion) <= 2000),
  ubicacion text check (char_length(ubicacion) <= 200),
  todo_el_dia boolean not null default false,
  inicio timestamptz, fin timestamptz,
  dia_inicio date, dia_fin date,
  color text not null default '#10b981' check (color ~ '^#[0-9a-fA-F]{6}$'),
  ambito text not null default 'personal' check (ambito in ('personal','empresa')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((todo_el_dia and dia_inicio is not null) or (not todo_el_dia and inicio is not null))
);
create index if not exists calendario_eventos_emp on public.calendario_eventos(id_empresa, id_usuario);
alter table public.calendario_eventos enable row level security;
drop policy if exists calendario_eventos_sel on public.calendario_eventos;
create policy calendario_eventos_sel on public.calendario_eventos for select
  using (public.tiene_acceso_a_empresa(id_empresa) and (ambito = 'empresa' or id_usuario = auth.uid()));

create or replace function public.guardar_evento_cal(p_id_empresa uuid, p_id uuid, p_datos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; e record; v_todo boolean := coalesce((p_datos->>'todo_el_dia')::boolean,false);
  v_ini timestamptz; v_fin timestamptz; v_di date; v_df date; v_amb text := coalesce(nullif(p_datos->>'ambito',''),'personal');
  v_col text := coalesce(nullif(p_datos->>'color',''),'#10b981'); v_tit text := nullif(trim(p_datos->>'titulo'),'');
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_tit is null then raise exception 'Ponle un título al evento' using errcode = '22023'; end if;
  if v_amb not in ('personal','empresa') then raise exception 'Ámbito no válido' using errcode = '22023'; end if;
  if v_col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color no válido' using errcode = '22023'; end if;
  if v_todo then
    v_di := nullif(p_datos->>'dia_inicio','')::date; v_df := coalesce(nullif(p_datos->>'dia_fin','')::date, v_di);
    if v_di is null then raise exception 'Indica la fecha' using errcode = '22023'; end if;
    if v_df < v_di or v_df - v_di > 366 then raise exception 'Fechas no válidas' using errcode = '22023'; end if;
  else
    v_ini := nullif(p_datos->>'inicio','')::timestamptz; v_fin := nullif(p_datos->>'fin','')::timestamptz;
    if v_ini is null then raise exception 'Indica la fecha y hora' using errcode = '22023'; end if;
    if v_fin is not null and v_fin < v_ini then raise exception 'El término no puede ser antes del inicio' using errcode = '22023'; end if;
  end if;
  if p_id is null then
    if (select count(*) from public.calendario_eventos where id_empresa = p_id_empresa and id_usuario = auth.uid()) >= 5000 then raise exception 'Demasiados eventos' using errcode = '22023'; end if;
    insert into public.calendario_eventos (id_empresa, id_usuario, titulo, descripcion, ubicacion, todo_el_dia, inicio, fin, dia_inicio, dia_fin, color, ambito)
    values (p_id_empresa, auth.uid(), left(v_tit,120), left(p_datos->>'descripcion',2000), left(p_datos->>'ubicacion',200), v_todo, v_ini, v_fin, v_di, v_df, v_col, v_amb) returning id into v_id;
  else
    select * into e from public.calendario_eventos where id = p_id and id_empresa = p_id_empresa;
    if not found or (e.id_usuario <> auth.uid() and not (e.ambito = 'empresa' and public.es_admin_de_empresa(p_id_empresa))) then raise exception 'No puedes editar este evento' using errcode = '42501'; end if;
    update public.calendario_eventos set titulo = left(v_tit,120), descripcion = left(p_datos->>'descripcion',2000), ubicacion = left(p_datos->>'ubicacion',200),
      todo_el_dia = v_todo, inicio = v_ini, fin = v_fin, dia_inicio = v_di, dia_fin = v_df, color = v_col,
      ambito = case when e.id_usuario = auth.uid() then v_amb else e.ambito end, updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.eliminar_evento_cal(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select * into e from public.calendario_eventos where id = p_id;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(e.id_empresa)
     or (e.id_usuario <> auth.uid() and not (e.ambito = 'empresa' and public.es_admin_de_empresa(e.id_empresa))) then raise exception 'No puedes eliminar este evento' using errcode = '42501'; end if;
  delete from public.calendario_eventos where id = p_id;
end $$;

-- Lectura unificada del rango. Fechas "de día completo" salen como 'YYYY-MM-DD' (fin inclusivo).
create or replace function public.calendario_rango(p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb := '[]'::jsonb; v_tz text; v_ventas boolean;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then raise exception 'Rango no válido' using errcode = '22023'; end if;
  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = p_id_empresa;
  v_ventas := public.empresa_tiene_modulo(p_id_empresa,'ventas');

  select v_res || coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'fuente', 'evento', 'titulo', c.titulo, 'detalle', c.descripcion, 'lugar', c.ubicacion,
      'todo_el_dia', c.todo_el_dia, 'inicio', case when c.todo_el_dia then c.dia_inicio::text else to_char(c.inicio at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'fin', case when c.todo_el_dia then c.dia_fin::text else to_char(c.fin at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'color', c.color, 'ambito', c.ambito, 'editable', (c.id_usuario = auth.uid() or (c.ambito = 'empresa' and public.es_admin_de_empresa(p_id_empresa))))), '[]'::jsonb)
    into v_res
    from public.calendario_eventos c
   where c.id_empresa = p_id_empresa and (c.ambito = 'empresa' or c.id_usuario = auth.uid())
     and ((c.todo_el_dia and c.dia_inicio <= p_hasta and coalesce(c.dia_fin, c.dia_inicio) >= p_desde)
       or (not c.todo_el_dia and (c.inicio at time zone v_tz)::date <= p_hasta and (coalesce(c.fin, c.inicio) at time zone v_tz)::date >= p_desde));

  select v_res || coalesce(jsonb_agg(jsonb_build_object('id', f.fecha::text, 'fuente', 'feriado', 'titulo', f.nombre, 'detalle', case when f.irrenunciable then 'Feriado irrenunciable' else 'Feriado' end,
      'todo_el_dia', true, 'inicio', f.fecha::text, 'fin', f.fecha::text, 'editable', false)), '[]'::jsonb)
    into v_res from public.feriados_chile f where f.fecha between p_desde and p_hasta;

  if v_ventas then
    select v_res || coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'fuente', 'agenda', 'subtipo', a.tipo, 'titulo', initcap(a.tipo) || coalesce(' · ' || nullif(a.cliente_nombre,''),'') || coalesce(' · ' || nullif(a.titulo,''),''),
        'detalle', a.estado, 'lugar', a.direccion_trabajo, 'todo_el_dia', false,
        'inicio', to_char(a.fecha_inicio at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'fin', to_char(coalesce(a.fecha_fin, a.fecha_inicio + interval '1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'vista', 'agenda', 'editable', false)), '[]'::jsonb)
      into v_res from public.agenda_trabajos a
     where a.id_empresa = p_id_empresa and a.estado not in ('cancelado','entregado')
       and (a.fecha_inicio at time zone v_tz)::date between p_desde and p_hasta;

    select v_res || coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'fuente', 'vencimiento', 'subtipo', 'cotizacion', 'titulo', 'Vence cotización ' || lpad(q.numero::text,4,'0') || ' · ' || q.cliente_nombre,
        'detalle', q.estado, 'todo_el_dia', true, 'inicio', q.fecha_vencimiento::text, 'fin', q.fecha_vencimiento::text, 'vista', 'cotizaciones', 'editable', false)), '[]'::jsonb)
      into v_res from public.cotizaciones q
     where q.id_empresa = p_id_empresa and q.estado in ('borrador','enviada') and q.fecha_vencimiento between p_desde and p_hasta;

    select v_res || coalesce(jsonb_agg(jsonb_build_object('id', cc.id, 'fuente', 'vencimiento', 'subtipo', 'cobro', 'titulo', 'Cobro por vencer · ' || coalesce(cl.nombre,'cliente') || ' · ' || coalesce(cc.moneda,'CLP') || ' ' || (cc.monto_deuda - cc.monto_pagado)::text,
        'detalle', cc.estado, 'todo_el_dia', true, 'inicio', cc.fecha_vencimiento::text, 'fin', cc.fecha_vencimiento::text, 'vista', 'cuentas_cobrar', 'editable', false)), '[]'::jsonb)
      into v_res from public.cuentas_por_cobrar cc left join public.clientes cl on cl.id = cc.id_cliente
     where cc.id_empresa = p_id_empresa and coalesce(cc.estado,'') <> 'Anulada' and cc.monto_deuda > cc.monto_pagado and cc.fecha_vencimiento between p_desde and p_hasta;
  end if;
  return v_res;
end $$;

revoke all on function public.guardar_evento_cal(uuid,uuid,jsonb), public.eliminar_evento_cal(uuid), public.calendario_rango(uuid,date,date) from public, anon;
grant execute on function public.guardar_evento_cal(uuid,uuid,jsonb), public.eliminar_evento_cal(uuid), public.calendario_rango(uuid,date,date) to authenticated;
