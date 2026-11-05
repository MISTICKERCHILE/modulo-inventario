-- Eventos que se repiten (cada día/semana/mes/año) y cumpleaños del equipo en el calendario.
alter table public.calendario_eventos
  add column if not exists repite text not null default 'ninguna' check (repite in ('ninguna','diaria','semanal','mensual','anual')),
  add column if not exists repite_hasta date;

create or replace function public.guardar_evento_cal(p_id_empresa uuid, p_id uuid, p_datos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; e record; v_todo boolean := coalesce((p_datos->>'todo_el_dia')::boolean,false);
  v_ini timestamptz; v_fin timestamptz; v_di date; v_df date; v_amb text := coalesce(nullif(p_datos->>'ambito',''),'personal');
  v_col text := coalesce(nullif(p_datos->>'color',''),'#10b981'); v_tit text := nullif(trim(p_datos->>'titulo'),'');
  v_rep text := coalesce(nullif(p_datos->>'repite',''),'ninguna'); v_hasta date := nullif(p_datos->>'repite_hasta','')::date; v_base date;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_tit is null then raise exception 'Ponle un título al evento' using errcode = '22023'; end if;
  if v_amb not in ('personal','empresa') then raise exception 'Ámbito no válido' using errcode = '22023'; end if;
  if v_col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color no válido' using errcode = '22023'; end if;
  if v_rep not in ('ninguna','diaria','semanal','mensual','anual') then raise exception 'Repetición no válida' using errcode = '22023'; end if;
  if v_todo then
    v_di := nullif(p_datos->>'dia_inicio','')::date; v_df := coalesce(nullif(p_datos->>'dia_fin','')::date, v_di);
    if v_di is null then raise exception 'Indica la fecha' using errcode = '22023'; end if;
    if v_df < v_di or v_df - v_di > 366 then raise exception 'Fechas no válidas' using errcode = '22023'; end if;
    v_base := v_di;
  else
    v_ini := nullif(p_datos->>'inicio','')::timestamptz; v_fin := nullif(p_datos->>'fin','')::timestamptz;
    if v_ini is null then raise exception 'Indica la fecha y hora' using errcode = '22023'; end if;
    if v_fin is not null and v_fin < v_ini then raise exception 'El término no puede ser antes del inicio' using errcode = '22023'; end if;
    v_base := v_ini::date;
  end if;
  if v_rep = 'ninguna' then v_hasta := null;
  elsif v_hasta is not null and (v_hasta < v_base - 1 or v_hasta > v_base + 3660) then raise exception 'La fecha final de la repetición no es válida' using errcode = '22023'; end if;
  if p_id is null then
    if (select count(*) from public.calendario_eventos where id_empresa = p_id_empresa and id_usuario = auth.uid()) >= 5000 then raise exception 'Demasiados eventos' using errcode = '22023'; end if;
    insert into public.calendario_eventos (id_empresa, id_usuario, titulo, descripcion, ubicacion, todo_el_dia, inicio, fin, dia_inicio, dia_fin, color, ambito, repite, repite_hasta)
    values (p_id_empresa, auth.uid(), left(v_tit,120), left(p_datos->>'descripcion',2000), left(p_datos->>'ubicacion',200), v_todo, v_ini, v_fin, v_di, v_df, v_col, v_amb, v_rep, v_hasta) returning id into v_id;
  else
    select * into e from public.calendario_eventos where id = p_id and id_empresa = p_id_empresa;
    if not found or (e.id_usuario <> auth.uid() and not (e.ambito = 'empresa' and public.es_admin_de_empresa(p_id_empresa))) then raise exception 'No puedes editar este evento' using errcode = '42501'; end if;
    update public.calendario_eventos set titulo = left(v_tit,120), descripcion = left(p_datos->>'descripcion',2000), ubicacion = left(p_datos->>'ubicacion',200),
      todo_el_dia = v_todo, inicio = v_ini, fin = v_fin, dia_inicio = v_di, dia_fin = v_df, color = v_col, repite = v_rep, repite_hasta = v_hasta,
      ambito = case when e.id_usuario = auth.uid() then v_amb else e.ambito end, updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.calendario_rango(p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb := '[]'::jsonb; v_tz text; v_ventas boolean;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then raise exception 'Rango no válido' using errcode = '22023'; end if;
  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = p_id_empresa;
  v_ventas := public.empresa_tiene_modulo(p_id_empresa,'ventas');

  -- Eventos propios (con repetición): se generan las ocurrencias que caen en el rango.
  select v_res || coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'uid', q.id::text || case when q.repite <> 'ninguna' then '@' || q.occ::text else '' end,
      'fuente', 'evento', 'titulo', q.titulo, 'detalle', q.descripcion, 'lugar', q.ubicacion, 'todo_el_dia', q.todo_el_dia,
      'inicio', case when q.todo_el_dia then q.occ::text else to_char(q.oi at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'fin', case when q.todo_el_dia then (q.occ + q.dur)::text else to_char(q.ofin at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'inicio0', case when q.todo_el_dia then q.dia_inicio::text else to_char(q.inicio at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'fin0', case when q.todo_el_dia then coalesce(q.dia_fin, q.dia_inicio)::text else to_char(q.fin at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'repite', q.repite, 'repite_hasta', q.repite_hasta, 'color', q.color, 'ambito', q.ambito,
      'editable', (q.id_usuario = auth.uid() or (q.ambito = 'empresa' and public.es_admin_de_empresa(p_id_empresa))))), '[]'::jsonb)
    into v_res
    from (
      select b.*, o.occ,
             case when b.todo_el_dia then 0 else (b.fin_d - b.base_d) end + case when b.todo_el_dia then coalesce(b.dia_fin, b.dia_inicio) - b.dia_inicio else 0 end as dur,
             case when b.todo_el_dia then null else ((b.inicio at time zone v_tz) + (o.occ - b.base_d) * interval '1 day') at time zone v_tz end as oi,
             case when b.todo_el_dia or b.fin is null then null else ((b.fin at time zone v_tz) + (o.occ - b.base_d) * interval '1 day') at time zone v_tz end as ofin
        from (select c.*, case when c.todo_el_dia then c.dia_inicio else (c.inicio at time zone v_tz)::date end as base_d,
                     case when c.todo_el_dia then c.dia_inicio else (coalesce(c.fin, c.inicio) at time zone v_tz)::date end as fin_d
                from public.calendario_eventos c
               where c.id_empresa = p_id_empresa and (c.ambito = 'empresa' or c.id_usuario = auth.uid())) b
        cross join lateral (
          select (b.base_d + case b.repite when 'semanal' then make_interval(days => 7 * n) when 'mensual' then make_interval(months => n)
                                          when 'anual' then make_interval(years => n) else make_interval(days => n) end)::date as occ
            from generate_series(0, case b.repite when 'diaria' then 3650 when 'semanal' then 1040 when 'mensual' then 240 when 'anual' then 60 else 0 end) n) o
    ) q
   where q.occ <= p_hasta and q.occ + q.dur >= p_desde and (q.repite_hasta is null or q.occ <= q.repite_hasta);

  select v_res || coalesce(jsonb_agg(jsonb_build_object('id', f.fecha::text, 'fuente', 'feriado', 'titulo', f.nombre, 'detalle', case when f.irrenunciable then 'Feriado irrenunciable' else 'Feriado' end,
      'todo_el_dia', true, 'inicio', f.fecha::text, 'fin', f.fecha::text, 'editable', false)), '[]'::jsonb)
    into v_res from public.feriados f where f.pais = (select case when pais = 'Venezuela' then 'Venezuela' else 'Chile' end from public.empresas where id = p_id_empresa) and f.fecha between p_desde and p_hasta;

  -- Cumpleaños del equipo (solo día y mes; no se muestra la edad)
  select v_res || coalesce(jsonb_agg(jsonb_build_object('id', 'cumple-' || t.id_usuario::text || '-' || t.fecha::text, 'fuente', 'cumple',
      'titulo', '🎂 Cumpleaños de ' || t.nombre, 'todo_el_dia', true, 'inicio', t.fecha::text, 'fin', t.fecha::text, 'editable', false)), '[]'::jsonb)
    into v_res
    from (
      select x.id_usuario, x.nombre, case when extract(month from x.fn) = 2 and extract(day from x.fn) = 29 and not (y % 4 = 0 and (y % 100 <> 0 or y % 400 = 0))
                  then make_date(y, 2, 28) else make_date(y, extract(month from x.fn)::int, extract(day from x.fn)::int) end as fecha
        from (select distinct on (ue.id_usuario) ue.id_usuario, trim(concat_ws(' ', p.nombre, p.apellido)) as nombre, p.fecha_nacimiento as fn
                from public.usuarios_empresas ue join public.perfiles p on p.id_usuario = ue.id_usuario
               where ue.id_empresa = p_id_empresa and p.fecha_nacimiento is not null and nullif(trim(p.nombre),'') is not null) x
        cross join generate_series(extract(year from p_desde)::int, extract(year from p_hasta)::int) y) t
   where t.fecha between p_desde and p_hasta;

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
