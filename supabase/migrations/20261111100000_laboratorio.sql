-- ============================================================
-- LABORATORIO: paneles de monitoreo armados por el cliente.
-- Paneles y widgets (solo configuración) + una función de consulta
-- con listas blancas: nadie arma SQL libre.
-- ============================================================

create table if not exists public.lab_paneles (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  orden int not null default 0,
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.lab_widgets (
  id uuid primary key default gen_random_uuid(),
  id_panel uuid not null references public.lab_paneles(id) on delete cascade,
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  titulo text not null default '' check (char_length(titulo) <= 80),
  vista text not null check (vista in ('numero','tabla','barras','linea','torta')),
  config jsonb not null default '{}'::jsonb,
  x int not null default 0, y int not null default 0,
  w int not null default 4 check (w between 1 and 12),
  h int not null default 3 check (h between 1 and 12),
  orden int not null default 0
);
create index if not exists lab_paneles_emp on public.lab_paneles(id_empresa);
create index if not exists lab_widgets_panel on public.lab_widgets(id_panel);

alter table public.lab_paneles enable row level security;
alter table public.lab_widgets enable row level security;
drop policy if exists lab_paneles_sel on public.lab_paneles;
create policy lab_paneles_sel on public.lab_paneles for select using (public.tiene_acceso_a_empresa(id_empresa));
drop policy if exists lab_paneles_susc on public.lab_paneles;
create policy lab_paneles_susc on public.lab_paneles as restrictive for all using (public.empresa_tiene_modulo(id_empresa,'ventas'));
drop policy if exists lab_widgets_sel on public.lab_widgets;
create policy lab_widgets_sel on public.lab_widgets for select using (public.tiene_acceso_a_empresa(id_empresa));
drop policy if exists lab_widgets_susc on public.lab_widgets;
create policy lab_widgets_susc on public.lab_widgets as restrictive for all using (public.empresa_tiene_modulo(id_empresa,'ventas'));

-- ---------- Guardar panel (crear / renombrar) ----------
create or replace function public.guardar_panel_lab(p_id_empresa uuid, p_id uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then raise exception 'Solo el administrador puede armar paneles' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(p_id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if nullif(trim(p_nombre),'') is null then raise exception 'Ponle un nombre al panel' using errcode = '22023'; end if;
  if p_id is null then
    if (select count(*) from public.lab_paneles where id_empresa = p_id_empresa) >= 20 then raise exception 'Máximo 20 paneles' using errcode = '22023'; end if;
    insert into public.lab_paneles (id_empresa, nombre, creado_por, orden)
    values (p_id_empresa, left(trim(p_nombre),60), auth.uid(), coalesce((select max(orden)+1 from public.lab_paneles where id_empresa = p_id_empresa),0))
    returning id into v_id;
  else
    update public.lab_paneles set nombre = left(trim(p_nombre),60), updated_at = now()
     where id = p_id and id_empresa = p_id_empresa returning id into v_id;
    if v_id is null then raise exception 'Panel no encontrado' using errcode = '22023'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.eliminar_panel_lab(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.lab_paneles where id = p_id;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(e,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  delete from public.lab_paneles where id = p_id;
end $$;

-- ---------- Guardar todos los widgets de un panel ----------
create or replace function public.guardar_widgets_lab(p_id_panel uuid, p_widgets jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare e uuid; w jsonb; i int := 0; c jsonb;
begin
  select id_empresa into e from public.lab_paneles where id = p_id_panel;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(e,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if jsonb_typeof(p_widgets) <> 'array' or jsonb_array_length(p_widgets) > 40 then raise exception 'Máximo 40 widgets por panel' using errcode = '22023'; end if;
  delete from public.lab_widgets where id_panel = p_id_panel;
  for w in select * from jsonb_array_elements(p_widgets) loop
    c := coalesce(w->'config','{}'::jsonb);
    if jsonb_typeof(c) <> 'object' or length(c::text) > 2000 then raise exception 'Configuración no válida' using errcode = '22023'; end if;
    insert into public.lab_widgets (id_panel, id_empresa, titulo, vista, config, x, y, w, h, orden)
    values (p_id_panel, e, left(coalesce(w->>'titulo',''),80), w->>'vista', c,
            greatest(0,least(11,coalesce((w->>'x')::int,0))), greatest(0,coalesce((w->>'y')::int,0)),
            greatest(1,least(12,coalesce((w->>'w')::int,4))), greatest(1,least(12,coalesce((w->>'h')::int,3))), i);
    i := i + 1;
  end loop;
  update public.lab_paneles set updated_at = now() where id = p_id_panel;
  return i;
end $$;

-- ---------- Cálculo (interno) ----------
create or replace function public._lab_calcular(
  p_empresa uuid, p_fuente text, p_medida text, p_agrupar text,
  p_desde date, p_hasta date, p_sucursal uuid, p_moneda text, p_limite int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tz text; v_res jsonb; v_tiempo boolean := p_agrupar in ('dia','semana','mes','anio'); v_lim int;
begin
  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = p_empresa;
  v_lim := case when v_tiempo then 400 else greatest(1,least(coalesce(p_limite,10),100)) end;

  with h as (
    select (v.created_at at time zone v_tz)::date f, v.id, v.total monto,
           (select coalesce(sum(d.cantidad),0) from public.ventas_detalles d where d.id_venta = v.id) unid,
           v.id_sucursal suc, coalesce(mp.nombre, v.metodo_pago, 'Sin dato') metodo, null::text producto,
           null::text tipo, v.estado, coalesce(v.cajero,'Sin dato') cajero
      from public.ventas v left join public.metodos_pago mp on mp.id = v.id_metodo_pago
     where p_fuente = 'ventas' and v.id_empresa = p_empresa and v.estado in ('COMPLETADA','POR_COBRAR') and v.moneda = p_moneda
    union all
    select (v.created_at at time zone v_tz)::date, v.id, d.subtotal, d.cantidad, v.id_sucursal,
           coalesce(mp.nombre, v.metodo_pago, 'Sin dato'), coalesce(p.nombre,'Sin dato'), null::text, v.estado, coalesce(v.cajero,'Sin dato')
      from public.ventas_detalles d join public.ventas v on v.id = d.id_venta
      left join public.productos p on p.id = d.id_producto left join public.metodos_pago mp on mp.id = v.id_metodo_pago
     where p_fuente = 'productos' and v.id_empresa = p_empresa and v.estado in ('COMPLETADA','POR_COBRAR') and v.moneda = p_moneda
    union all
    select (a.fecha_inicio at time zone v_tz)::date, a.id, a.total, 0, a.id_sucursal, 'Sin dato', null::text, a.tipo, a.estado, 'Sin dato'
      from public.agenda_trabajos a
     where p_fuente = 'agenda' and a.id_empresa = p_empresa and a.estado <> 'cancelado' and a.moneda = p_moneda
  ),
  f as (select * from h where f between p_desde and p_hasta and (p_sucursal is null or suc = p_sucursal)),
  g as (
    select case p_agrupar
             when 'dia' then f::text when 'semana' then date_trunc('week', f)::date::text
             when 'mes' then to_char(f,'YYYY-MM') when 'anio' then to_char(f,'YYYY')
             when 'sucursal' then coalesce((select nombre from public.sucursales s where s.id = f.suc),'Sin dato')
             when 'metodo' then metodo when 'producto' then producto when 'tipo' then tipo
             when 'estado' then estado when 'cajero' then cajero else 'Total' end k,
           case p_medida
             when 'monto' then sum(monto) when 'tickets' then count(distinct id)::numeric
             when 'promedio' then sum(monto) / nullif(count(distinct id),0)
             when 'maximo' then max(monto) when 'minimo' then min(monto)
             when 'unidades' then sum(unid) end valor
      from f group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('k', k, 'valor', round(coalesce(valor,0),2))
           order by case when v_tiempo then k end asc, case when not v_tiempo then valor end desc nulls last), '[]'::jsonb)
    into v_res from (select * from g order by case when v_tiempo then k end asc, case when not v_tiempo then valor end desc nulls last limit v_lim) t;
  return v_res;
end $$;
revoke all on function public._lab_calcular(uuid,text,text,text,date,date,uuid,text,int) from public, anon, authenticated;

-- ---------- Consulta pública (valida listas blancas) ----------
create or replace function public.lab_consultar(p_id_empresa uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fuente text := coalesce(p_config->>'fuente','ventas');
  v_medida text := coalesce(p_config->>'medida','monto');
  v_agr text := coalesce(p_config->>'agrupar','ninguno');
  v_desde date := coalesce(nullif(p_config->>'desde','')::date, current_date - 29);
  v_hasta date := coalesce(nullif(p_config->>'hasta','')::date, current_date);
  v_suc uuid := nullif(p_config->>'sucursal','')::uuid;
  v_mon text := upper(left(coalesce(nullif(p_config->>'moneda',''),'CLP'),6));
  v_lim int := coalesce(nullif(p_config->>'limite','')::int, 10);
  v_dias int; v_ant jsonb := null;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(p_id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if v_fuente not in ('ventas','productos','agenda') then raise exception 'Fuente no válida' using errcode = '22023'; end if;
  if v_medida not in ('monto','tickets','promedio','maximo','minimo','unidades') then raise exception 'Medida no válida' using errcode = '22023'; end if;
  if v_agr not in ('ninguno','dia','semana','mes','anio','sucursal','metodo','producto','tipo','estado','cajero') then raise exception 'Agrupación no válida' using errcode = '22023'; end if;
  if v_agr = 'producto' and v_fuente <> 'productos' then raise exception 'Agrupar por producto requiere la fuente Productos' using errcode = '22023'; end if;
  if v_agr = 'tipo' and v_fuente <> 'agenda' then raise exception 'Agrupar por tipo requiere la fuente Agenda' using errcode = '22023'; end if;
  if v_fuente = 'agenda' and v_medida = 'unidades' then raise exception 'La agenda no tiene unidades' using errcode = '22023'; end if;
  if v_fuente = 'productos' and v_medida = 'tickets' then null; end if;
  if v_hasta < v_desde or v_hasta - v_desde > 1830 then raise exception 'Rango de fechas no válido' using errcode = '22023'; end if;
  if v_suc is not null and not exists (select 1 from public.sucursales where id = v_suc and id_empresa = p_id_empresa) then raise exception 'Sucursal no válida' using errcode = '22023'; end if;

  if coalesce((p_config->>'comparar')::boolean,false) and v_agr = 'ninguno' then
    v_dias := v_hasta - v_desde + 1;
    v_ant := public._lab_calcular(p_id_empresa, v_fuente, v_medida, v_agr, v_desde - v_dias, v_desde - 1, v_suc, v_mon, v_lim);
  end if;
  return jsonb_build_object('moneda', v_mon,
    'filas', public._lab_calcular(p_id_empresa, v_fuente, v_medida, v_agr, v_desde, v_hasta, v_suc, v_mon, v_lim),
    'anterior', v_ant);
end $$;

revoke all on function public.guardar_panel_lab(uuid,uuid,text), public.eliminar_panel_lab(uuid), public.guardar_widgets_lab(uuid,jsonb), public.lab_consultar(uuid,jsonb) from public, anon;
grant execute on function public.guardar_panel_lab(uuid,uuid,text), public.eliminar_panel_lab(uuid), public.guardar_widgets_lab(uuid,jsonb), public.lab_consultar(uuid,jsonb) to authenticated;
