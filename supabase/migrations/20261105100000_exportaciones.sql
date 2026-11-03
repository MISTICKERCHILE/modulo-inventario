-- ============================================================
-- Descargas de ventas y cierres: columnas elegidas por sucursal, rango de fechas e historial
-- ============================================================

create table if not exists public.export_config (
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  id_sucursal uuid not null references public.sucursales(id) on delete cascade,
  tipo        text not null check (tipo in ('ventas','cierres')),
  columnas    jsonb not null,                -- ["fecha","ticket",...] en el orden elegido
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (id_sucursal, tipo)
);
alter table public.export_config enable row level security;
drop policy if exists acceso_lectura on public.export_config;
drop policy if exists suscripcion on public.export_config;
create policy acceso_lectura on public.export_config for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.export_config as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

create table if not exists public.export_historial (
  id          uuid primary key default gen_random_uuid(),
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  id_sucursal uuid references public.sucursales(id) on delete set null,
  tipo        text not null check (tipo in ('ventas','cierres')),
  desde       date not null,
  hasta       date not null,
  columnas    jsonb not null,
  filas       int not null default 0,
  origen      text not null default 'manual' check (origen in ('manual','automatico')),
  correos     text[],
  estado      text not null default 'ok',
  detalle     text,
  creado_por  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists export_historial_idx on public.export_historial(id_empresa, created_at desc);
alter table public.export_historial enable row level security;
drop policy if exists acceso_lectura on public.export_historial;
drop policy if exists suscripcion on public.export_historial;
create policy acceso_lectura on public.export_historial for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.export_historial as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

-- Filas de ventas (uso interno; el tope evita descargas gigantes)
create or replace function public._export_ventas_filas(p_id_sucursal uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(f order by f->>'fecha', f->>'hora'), '[]'::jsonb) from (
    select jsonb_build_object(
      'fecha', to_char(v.created_at at time zone e.zona_horaria, 'YYYY-MM-DD'),
      'hora',  to_char(v.created_at at time zone e.zona_horaria, 'HH24:MI'),
      'ticket', v.numero_ticket, 'origen', v.origen, 'estado', v.estado,
      'cliente', c.nombre, 'forma_pago', coalesce(m.nombre, v.metodo_pago),
      'moneda', coalesce(v.moneda, m.moneda, 'CLP'), 'total', v.total,
      'cajero', case when v.cajero ~ '^[0-9a-f-]{36}$' then (select p.nombre from public.perfiles p where p.id_usuario = v.cajero::uuid limit 1) else v.cajero end,
      'productos', (select string_agg(d.cantidad::text || 'x ' || pr.nombre, '; ' order by pr.nombre)
                      from public.ventas_detalles d join public.productos pr on pr.id = d.id_producto where d.id_venta = v.id),
      'unidades', (select sum(d.cantidad) from public.ventas_detalles d where d.id_venta = v.id),
      'id_externo', v.id_externo) as f
    from public.ventas v
    join public.sucursales s on s.id = v.id_sucursal
    join public.empresas e on e.id = s.id_empresa
    left join public.clientes c on c.id = v.id_cliente
    left join public.metodos_pago m on m.id = v.id_metodo_pago
   where v.id_sucursal = p_id_sucursal
     and (v.created_at at time zone e.zona_horaria)::date between p_desde and p_hasta
   order by v.created_at
   limit 50000
  ) q
$$;

-- Filas de cierres: una por forma de pago de cada cierre
create or replace function public._export_cierres_filas(p_id_sucursal uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(f order by f->>'fecha', f->>'forma_pago'), '[]'::jsonb) from (
    select jsonb_build_object(
      'fecha', c.fecha, 'sucursal', s.nombre, 'modo', case c.modo when 'POS' then 'POS' else 'Declarado' end,
      'forma_pago', d->>'nombre', 'moneda', d->>'moneda',
      'sistema', d->'sistema', 'otros', d->'otros', 'declarado', d->'declarado', 'diferencia', d->'diferencia',
      'responsable', c.responsable, 'cuadrado', case when c.cuadrado then 'Sí' else 'No' end,
      'comentario', c.comentario,
      'otros_cobros', (select string_agg((o->>'monto') || ' ' || (o->>'moneda') || ' (' || (o->>'motivo') || ')', '; ') from jsonb_array_elements(c.otros_cobros) o)) as f
    from public.cierres_dia c
    join public.sucursales s on s.id = c.id_sucursal
    cross join lateral jsonb_array_elements(c.desglose) d
   where c.id_sucursal = p_id_sucursal and c.fecha between p_desde and p_hasta
  ) q
$$;
revoke all on function public._export_ventas_filas(uuid,date,date) from public, anon, authenticated;
revoke all on function public._export_cierres_filas(uuid,date,date) from public, anon, authenticated;

-- Descarga desde la pantalla (valida acceso)
create or replace function public.exportar_datos(p_id_sucursal uuid, p_tipo text, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(e, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_tipo not in ('ventas','cierres') then raise exception 'Tipo no válido' using errcode = '22023'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido' using errcode = '22023'; end if;
  if p_hasta - p_desde > 800 then raise exception 'El rango máximo es de 800 días por descarga' using errcode = '22023'; end if;
  return case p_tipo when 'ventas' then public._export_ventas_filas(p_id_sucursal, p_desde, p_hasta)
                     else public._export_cierres_filas(p_id_sucursal, p_desde, p_hasta) end;
end $$;

-- Guardar el orden de columnas de una sucursal (solo Dueño/Admin)
create or replace function public.guardar_export_config(p_id_sucursal uuid, p_tipo text, p_columnas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then
    raise exception 'Solo un Dueño o Administrador puede guardar el orden de columnas' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(e, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_tipo not in ('ventas','cierres') then raise exception 'Tipo no válido' using errcode = '22023'; end if;
  if jsonb_typeof(p_columnas) <> 'array' or jsonb_array_length(p_columnas) = 0 or jsonb_array_length(p_columnas) > 30 then
    raise exception 'Elige al menos una columna' using errcode = '22023';
  end if;
  insert into public.export_config (id_empresa, id_sucursal, tipo, columnas, updated_by)
  values (e, p_id_sucursal, p_tipo, p_columnas, auth.uid())
  on conflict (id_sucursal, tipo) do update set columnas = excluded.columnas, updated_by = auth.uid(), updated_at = now();
end $$;

-- Anotar una descarga manual en el historial
create or replace function public.registrar_exportacion(
  p_id_sucursal uuid, p_tipo text, p_desde date, p_hasta date, p_columnas jsonb, p_filas int)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; v uuid;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.export_historial (id_empresa, id_sucursal, tipo, desde, hasta, columnas, filas, origen, creado_por)
  values (e, p_id_sucursal, p_tipo, p_desde, p_hasta, p_columnas, greatest(p_filas,0), 'manual', auth.uid()) returning id into v;
  return v;
end $$;

revoke all on function public.exportar_datos(uuid,text,date,date) from public, anon;
revoke all on function public.guardar_export_config(uuid,text,jsonb) from public, anon;
revoke all on function public.registrar_exportacion(uuid,text,date,date,jsonb,int) from public, anon;
grant execute on function public.exportar_datos(uuid,text,date,date) to authenticated;
grant execute on function public.guardar_export_config(uuid,text,jsonb) to authenticated;
grant execute on function public.registrar_exportacion(uuid,text,date,date,jsonb,int) to authenticated;
