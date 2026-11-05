-- Avisos por correo del calendario + resumen de la mañana.
-- La base calcula qué avisos tocan (y los "reserva" para no repetirlos); el envío lo hace /api/calendario-avisos.
alter table public.calendario_eventos
  add column if not exists aviso_min int check (aviso_min is null or aviso_min between 0 and 2880),
  add column if not exists aviso_a text not null default 'yo' check (aviso_a in ('yo','admins','todos'));

create table if not exists public.calendario_preferencias (
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  id_usuario uuid not null,
  aviso_agenda_min int check (aviso_agenda_min is null or aviso_agenda_min between 0 and 2880),
  aviso_cotizaciones_dias int check (aviso_cotizaciones_dias is null or aviso_cotizaciones_dias between 0 and 3),
  aviso_cobros_dias int check (aviso_cobros_dias is null or aviso_cobros_dias between 0 and 3),
  recibe_resumen boolean not null default true,
  primary key (id_empresa, id_usuario)
);
alter table public.calendario_preferencias enable row level security;
drop policy if exists calendario_preferencias_sel on public.calendario_preferencias;
create policy calendario_preferencias_sel on public.calendario_preferencias for select using (id_usuario = auth.uid());

create table if not exists public.calendario_config_empresa (
  id_empresa uuid primary key references public.empresas(id) on delete cascade,
  resumen_destino text not null default 'nadie' check (resumen_destino in ('nadie','admins','todos')),
  resumen_hora int not null default 8 check (resumen_hora between 5 and 12)
);
alter table public.calendario_config_empresa enable row level security;
drop policy if exists calendario_config_sel on public.calendario_config_empresa;
create policy calendario_config_sel on public.calendario_config_empresa for select using (public.tiene_acceso_a_empresa(id_empresa));

create table if not exists public.calendario_avisos_enviados (
  clave text primary key,
  id_empresa uuid not null,
  id_usuario uuid not null,
  tipo text not null,
  created_at timestamptz not null default now()
);
alter table public.calendario_avisos_enviados enable row level security;  -- sin políticas: solo el servidor

create or replace function public.guardar_evento_cal(p_id_empresa uuid, p_id uuid, p_datos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; e record; v_todo boolean := coalesce((p_datos->>'todo_el_dia')::boolean,false);
  v_ini timestamptz; v_fin timestamptz; v_di date; v_df date; v_amb text := coalesce(nullif(p_datos->>'ambito',''),'personal');
  v_col text := coalesce(nullif(p_datos->>'color',''),'#10b981'); v_tit text := nullif(trim(p_datos->>'titulo'),'');
  v_rep text := coalesce(nullif(p_datos->>'repite',''),'ninguna'); v_hasta date := nullif(p_datos->>'repite_hasta','')::date; v_base date;
  v_aviso int := nullif(p_datos->>'aviso_min','')::int; v_avisoa text := coalesce(nullif(p_datos->>'aviso_a',''),'yo');
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_tit is null then raise exception 'Ponle un título al evento' using errcode = '22023'; end if;
  if v_amb not in ('personal','empresa') then raise exception 'Ámbito no válido' using errcode = '22023'; end if;
  if v_col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color no válido' using errcode = '22023'; end if;
  if v_rep not in ('ninguna','diaria','semanal','mensual','anual') then raise exception 'Repetición no válida' using errcode = '22023'; end if;
  if v_aviso is not null and (v_aviso < 0 or v_aviso > 2880) then raise exception 'Aviso no válido' using errcode = '22023'; end if;
  if v_avisoa not in ('yo','admins','todos') then raise exception 'Destinatario del aviso no válido' using errcode = '22023'; end if;
  if v_amb = 'personal' then v_avisoa := 'yo'; end if;
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
    insert into public.calendario_eventos (id_empresa, id_usuario, titulo, descripcion, ubicacion, todo_el_dia, inicio, fin, dia_inicio, dia_fin, color, ambito, repite, repite_hasta, aviso_min, aviso_a)
    values (p_id_empresa, auth.uid(), left(v_tit,120), left(p_datos->>'descripcion',2000), left(p_datos->>'ubicacion',200), v_todo, v_ini, v_fin, v_di, v_df, v_col, v_amb, v_rep, v_hasta, v_aviso, v_avisoa) returning id into v_id;
  else
    select * into e from public.calendario_eventos where id = p_id and id_empresa = p_id_empresa;
    if not found or (e.id_usuario <> auth.uid() and not (e.ambito = 'empresa' and public.es_admin_de_empresa(p_id_empresa))) then raise exception 'No puedes editar este evento' using errcode = '42501'; end if;
    update public.calendario_eventos set titulo = left(v_tit,120), descripcion = left(p_datos->>'descripcion',2000), ubicacion = left(p_datos->>'ubicacion',200),
      todo_el_dia = v_todo, inicio = v_ini, fin = v_fin, dia_inicio = v_di, dia_fin = v_df, color = v_col, repite = v_rep, repite_hasta = v_hasta, aviso_min = v_aviso,
      ambito = case when e.id_usuario = auth.uid() then v_amb else e.ambito end,
      aviso_a = case when (case when e.id_usuario = auth.uid() then v_amb else e.ambito end) = 'personal' then 'yo' else v_avisoa end, updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;


create or replace function public._calendario_rango_para(p_uid uuid, p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb := '[]'::jsonb; v_tz text; v_ventas boolean; v_admin boolean;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then raise exception 'Rango no válido' using errcode = '22023'; end if;
  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = p_id_empresa;
  v_ventas := public.empresa_tiene_modulo(p_id_empresa,'ventas');
  v_admin := exists (select 1 from public.usuarios_empresas ue where ue.id_usuario = p_uid and ue.id_empresa = p_id_empresa and ue.rol::text in ('Dueño','Admin'));

  -- Eventos propios (con repetición): se generan las ocurrencias que caen en el rango.
  select v_res || coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'uid', q.id::text || case when q.repite <> 'ninguna' then '@' || q.occ::text else '' end,
      'fuente', 'evento', 'titulo', q.titulo, 'detalle', q.descripcion, 'lugar', q.ubicacion, 'todo_el_dia', q.todo_el_dia,
      'inicio', case when q.todo_el_dia then q.occ::text else to_char(q.oi at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'fin', case when q.todo_el_dia then (q.occ + q.dur)::text else to_char(q.ofin at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'inicio0', case when q.todo_el_dia then q.dia_inicio::text else to_char(q.inicio at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'fin0', case when q.todo_el_dia then coalesce(q.dia_fin, q.dia_inicio)::text else to_char(q.fin at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'creador', q.id_usuario, 'aviso_min', q.aviso_min, 'aviso_a', q.aviso_a, 'repite', q.repite, 'repite_hasta', q.repite_hasta, 'color', q.color, 'ambito', q.ambito,
      'editable', (q.id_usuario = p_uid or (q.ambito = 'empresa' and v_admin)))), '[]'::jsonb)
    into v_res
    from (
      select b.*, o.occ,
             case when b.todo_el_dia then 0 else (b.fin_d - b.base_d) end + case when b.todo_el_dia then coalesce(b.dia_fin, b.dia_inicio) - b.dia_inicio else 0 end as dur,
             case when b.todo_el_dia then null else ((b.inicio at time zone v_tz) + (o.occ - b.base_d) * interval '1 day') at time zone v_tz end as oi,
             case when b.todo_el_dia or b.fin is null then null else ((b.fin at time zone v_tz) + (o.occ - b.base_d) * interval '1 day') at time zone v_tz end as ofin
        from (select c.*, case when c.todo_el_dia then c.dia_inicio else (c.inicio at time zone v_tz)::date end as base_d,
                     case when c.todo_el_dia then c.dia_inicio else (coalesce(c.fin, c.inicio) at time zone v_tz)::date end as fin_d
                from public.calendario_eventos c
               where c.id_empresa = p_id_empresa and (c.ambito = 'empresa' or c.id_usuario = p_uid)) b
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

create or replace function public.calendario_rango(p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  return public._calendario_rango_para(auth.uid(), p_id_empresa, p_desde, p_hasta);
end $$;

-- Ajustes: lectura y guardado desde la pantalla
create or replace function public.calendario_ajustes(p_id_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p record; c record;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into p from public.calendario_preferencias where id_empresa = p_id_empresa and id_usuario = auth.uid();
  select * into c from public.calendario_config_empresa where id_empresa = p_id_empresa;
  return jsonb_build_object('es_admin', public.es_admin_de_empresa(p_id_empresa),
    'aviso_agenda_min', p.aviso_agenda_min, 'aviso_cotizaciones_dias', p.aviso_cotizaciones_dias, 'aviso_cobros_dias', p.aviso_cobros_dias,
    'recibe_resumen', coalesce(p.recibe_resumen, true),
    'resumen_destino', coalesce(c.resumen_destino, 'nadie'), 'resumen_hora', coalesce(c.resumen_hora, 8),
    'tiene_ventas', public.empresa_tiene_modulo(p_id_empresa,'ventas'));
end $$;

create or replace function public.guardar_ajustes_cal(p_id_empresa uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_dest text := p_datos->>'resumen_destino'; v_hora int := nullif(p_datos->>'resumen_hora','')::int;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_dest is not null then
    if not public.es_admin_de_empresa(p_id_empresa) then raise exception 'Solo el dueño o un administrador puede cambiar el resumen de la empresa' using errcode = '42501'; end if;
    if v_dest not in ('nadie','admins','todos') or v_hora is null or v_hora not between 5 and 12 then raise exception 'Ajuste del resumen no válido' using errcode = '22023'; end if;
  end if;
  insert into public.calendario_preferencias (id_empresa, id_usuario, aviso_agenda_min, aviso_cotizaciones_dias, aviso_cobros_dias, recibe_resumen)
  values (p_id_empresa, auth.uid(), nullif(p_datos->>'aviso_agenda_min','')::int, nullif(p_datos->>'aviso_cotizaciones_dias','')::int,
          nullif(p_datos->>'aviso_cobros_dias','')::int, coalesce((p_datos->>'recibe_resumen')::boolean, true))
  on conflict (id_empresa, id_usuario) do update set aviso_agenda_min = excluded.aviso_agenda_min, aviso_cotizaciones_dias = excluded.aviso_cotizaciones_dias,
    aviso_cobros_dias = excluded.aviso_cobros_dias, recibe_resumen = excluded.recibe_resumen;
  if v_dest is not null then
    insert into public.calendario_config_empresa (id_empresa, resumen_destino, resumen_hora) values (p_id_empresa, v_dest, v_hora)
    on conflict (id_empresa) do update set resumen_destino = excluded.resumen_destino, resumen_hora = excluded.resumen_hora;
  end if;
end $$;

-- Motor de avisos (solo servidor): devuelve los avisos que tocan ahora y los reserva para no repetirlos.
create or replace function public.calendario_avisos_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  emp record; u record; it jsonb; pr record; v_out jsonb := '[]'::jsonb; v_hoy date; v_ini timestamptz; v_trig timestamptz; v_clave text; v_tipo text;
  v_admin boolean; v_min int; v_ok boolean; v_n int;
begin
  delete from public.calendario_avisos_enviados where created_at < now() - interval '30 days';
  for emp in
    select e.id, coalesce(e.nombre_comercial, e.nombre) as nombre, coalesce(e.zona_horaria,'America/Santiago') as tz from public.empresas e
     where exists (select 1 from public.calendario_eventos c where c.id_empresa = e.id and c.aviso_min is not null)
        or exists (select 1 from public.calendario_preferencias p where p.id_empresa = e.id and (p.aviso_agenda_min is not null or p.aviso_cotizaciones_dias is not null or p.aviso_cobros_dias is not null))
  loop
    v_hoy := (now() at time zone emp.tz)::date;
    for u in select ue.id_usuario, ue.rol::text as rol, coalesce(nullif(trim(pf.email),''), au.email) as correo, coalesce(nullif(trim(pf.nombre),''),'') as nombre
               from public.usuarios_empresas ue left join public.perfiles pf on pf.id_usuario = ue.id_usuario left join auth.users au on au.id = ue.id_usuario
              where ue.id_empresa = emp.id
    loop
      continue when u.correo is null;
      v_admin := u.rol in ('Dueño','Admin');
      select * into pr from public.calendario_preferencias where id_empresa = emp.id and id_usuario = u.id_usuario;
      for it in select value from jsonb_array_elements(public._calendario_rango_para(u.id_usuario, emp.id, v_hoy - 1, v_hoy + 4)) loop
        v_tipo := null; v_ok := false;
        if it->>'fuente' = 'evento' and (it->>'aviso_min') is not null then
          v_ok := (it->>'creador')::uuid = u.id_usuario or (it->>'ambito' = 'empresa' and ((it->>'aviso_a') = 'todos' or ((it->>'aviso_a') = 'admins' and v_admin)));
          if v_ok then v_tipo := 'evento'; v_min := (it->>'aviso_min')::int; end if;
        elsif it->>'fuente' = 'agenda' and pr.aviso_agenda_min is not null then v_tipo := 'agenda'; v_min := pr.aviso_agenda_min;
        elsif it->>'fuente' = 'vencimiento' and it->>'subtipo' = 'cotizacion' and pr.aviso_cotizaciones_dias is not null then v_tipo := 'cotizacion'; v_min := pr.aviso_cotizaciones_dias * 1440;
        elsif it->>'fuente' = 'vencimiento' and it->>'subtipo' = 'cobro' and pr.aviso_cobros_dias is not null then v_tipo := 'cobro'; v_min := pr.aviso_cobros_dias * 1440;
        end if;
        continue when v_tipo is null;
        if (it->>'todo_el_dia')::boolean then v_ini := ((it->>'inicio')::date + interval '8 hours') at time zone emp.tz;
        else v_ini := (it->>'inicio')::timestamptz; end if;
        v_trig := v_ini - make_interval(mins => v_min);
        continue when not (v_trig <= now() and v_trig > now() - interval '25 minutes');
        v_clave := v_tipo || ':' || coalesce(it->>'uid', it->>'id') || ':' || u.id_usuario || ':' || v_min || ':' || to_char(v_ini at time zone 'UTC','YYYYMMDDHH24MI');
        insert into public.calendario_avisos_enviados (clave, id_empresa, id_usuario, tipo) values (v_clave, emp.id, u.id_usuario, v_tipo) on conflict do nothing;
        get diagnostics v_n = row_count;
        continue when v_n = 0;
        v_out := v_out || jsonb_build_array(jsonb_build_object('clave', v_clave, 'tipo', v_tipo, 'correo', u.correo, 'nombre', u.nombre, 'empresa', emp.nombre, 'zona', emp.tz,
          'titulo', it->>'titulo', 'lugar', it->>'lugar', 'detalle', it->>'detalle', 'todo_el_dia', (it->>'todo_el_dia')::boolean, 'inicio', it->>'inicio', 'minutos', v_min));
      end loop;
    end loop;
  end loop;
  return v_out;
end $$;

-- Resumen de la mañana (solo servidor)
create or replace function public.calendario_resumenes_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  emp record; u record; pr record; v_out jsonb := '[]'::jsonb; v_hoy date; v_lh timestamp; v_items jsonb; v_clave text; v_n int;
begin
  for emp in
    select e.id, coalesce(e.nombre_comercial, e.nombre) as nombre, coalesce(e.zona_horaria,'America/Santiago') as tz, c.resumen_destino, c.resumen_hora
      from public.empresas e join public.calendario_config_empresa c on c.id_empresa = e.id where c.resumen_destino <> 'nadie'
  loop
    v_lh := now() at time zone emp.tz; v_hoy := v_lh::date;
    continue when not (extract(hour from v_lh) >= emp.resumen_hora and extract(hour from v_lh) < emp.resumen_hora + 3);
    for u in select ue.id_usuario, ue.rol::text as rol, coalesce(nullif(trim(pf.email),''), au.email) as correo, coalesce(nullif(trim(pf.nombre),''),'') as nombre
               from public.usuarios_empresas ue left join public.perfiles pf on pf.id_usuario = ue.id_usuario left join auth.users au on au.id = ue.id_usuario
              where ue.id_empresa = emp.id and (emp.resumen_destino = 'todos' or ue.rol::text in ('Dueño','Admin'))
    loop
      continue when u.correo is null;
      select * into pr from public.calendario_preferencias where id_empresa = emp.id and id_usuario = u.id_usuario;
      continue when found and not pr.recibe_resumen;
      v_clave := 'resumen:' || emp.id || ':' || u.id_usuario || ':' || v_hoy;
      continue when exists (select 1 from public.calendario_avisos_enviados where clave = v_clave);
      v_items := public._calendario_rango_para(u.id_usuario, emp.id, v_hoy, v_hoy);
      insert into public.calendario_avisos_enviados (clave, id_empresa, id_usuario, tipo) values (v_clave, emp.id, u.id_usuario, 'resumen') on conflict do nothing;
      get diagnostics v_n = row_count;
      continue when v_n = 0 or jsonb_array_length(v_items) = 0;
      v_out := v_out || jsonb_build_array(jsonb_build_object('clave', v_clave, 'correo', u.correo, 'nombre', u.nombre, 'empresa', emp.nombre, 'zona', emp.tz, 'fecha', v_hoy::text,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('fuente', x->>'fuente', 'subtipo', x->>'subtipo', 'titulo', x->>'titulo', 'lugar', x->>'lugar', 'todo_el_dia', (x->>'todo_el_dia')::boolean, 'inicio', x->>'inicio', 'fin', x->>'fin')
                    order by (x->>'todo_el_dia')::boolean desc, x->>'inicio'), '[]'::jsonb) from jsonb_array_elements(v_items) x)));
    end loop;
  end loop;
  return v_out;
end $$;

create or replace function public.calendario_liberar_avisos(p_claves text[])
returns void language sql security definer set search_path = public as $$
  delete from public.calendario_avisos_enviados where clave = any(p_claves);
$$;

revoke all on function public._calendario_rango_para(uuid,uuid,date,date), public.calendario_avisos_pendientes(), public.calendario_resumenes_pendientes(), public.calendario_liberar_avisos(text[]) from public, anon, authenticated;
grant execute on function public._calendario_rango_para(uuid,uuid,date,date), public.calendario_avisos_pendientes(), public.calendario_resumenes_pendientes(), public.calendario_liberar_avisos(text[]) to service_role;
revoke all on function public.calendario_ajustes(uuid), public.guardar_ajustes_cal(uuid,jsonb), public.calendario_rango(uuid,date,date), public.guardar_evento_cal(uuid,uuid,jsonb) from public, anon;
grant execute on function public.calendario_ajustes(uuid), public.guardar_ajustes_cal(uuid,jsonb), public.calendario_rango(uuid,date,date), public.guardar_evento_cal(uuid,uuid,jsonb) to authenticated;
