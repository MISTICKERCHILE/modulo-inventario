-- ============================================================
-- Importación de ventas desde otros sistemas (CSV)
--  * Cada venta importada guarda origen, moneda y su identificador externo.
--  * Sin duplicados: por (origen + nº de pedido) o, sin pedido, por huella.
--  * Cada archivo queda registrado y se puede deshacer (revierte stock).
-- ============================================================

create table if not exists public.importaciones_ventas (
  id               uuid primary key default gen_random_uuid(),
  id_empresa       uuid not null references public.empresas(id) on delete cascade,
  id_sucursal      uuid not null references public.sucursales(id),
  origen           text not null,
  archivo          text,
  moneda           text,
  descontar_stock  boolean not null default false,
  filas            int  not null default 0,
  ventas_importadas int not null default 0,
  duplicadas       int  not null default 0,
  estado           text not null default 'activa' check (estado in ('activa','revertida')),
  creado_por       uuid,
  created_at       timestamptz not null default now(),
  revertida_en     timestamptz
);
alter table public.importaciones_ventas enable row level security;
drop policy if exists acceso_lectura on public.importaciones_ventas;
create policy acceso_lectura on public.importaciones_ventas
  for select using (public.tiene_acceso_a_empresa(id_empresa));   -- escribir: solo vía funciones

alter table public.ventas
  add column if not exists moneda         text,
  add column if not exists id_externo     text,
  add column if not exists huella         text,
  add column if not exists id_importacion uuid references public.importaciones_ventas(id);

create unique index if not exists ventas_externo_unico
  on public.ventas(id_empresa, origen, id_externo) where id_externo is not null;
create unique index if not exists ventas_huella_unica
  on public.ventas(id_empresa, origen, huella) where id_externo is null and huella is not null;
create index if not exists ventas_importacion_idx on public.ventas(id_importacion);

-- Memoria por origen: columnas del archivo y vínculo producto externo -> producto ERP
create table if not exists public.importacion_mapeos (
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  origen     text not null,
  mapeo      jsonb not null default '{}'::jsonb,
  primary key (id_empresa, origen)
);
create table if not exists public.homologacion_ventas (
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  origen      text not null,
  clave       text not null,                 -- 'sku:ABC' o 'nom:hamburguesa clasica'
  id_producto uuid not null references public.productos(id) on delete cascade,
  primary key (id_empresa, origen, clave)
);
alter table public.importacion_mapeos enable row level security;
alter table public.homologacion_ventas enable row level security;
drop policy if exists acceso_empresa on public.importacion_mapeos;
drop policy if exists acceso_empresa on public.homologacion_ventas;
create policy acceso_empresa on public.importacion_mapeos for all
  using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));
create policy acceso_empresa on public.homologacion_ventas for all
  using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));

-- 1) Abrir una importación (Dueño / Admin)
create or replace function public.crear_importacion(
  p_id_empresa uuid, p_id_sucursal uuid, p_origen text, p_archivo text,
  p_moneda text, p_descontar boolean, p_filas int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede importar ventas' using errcode = '42501';
  end if;
  if not (public.empresa_tiene_modulo(p_id_empresa, 'ventas') or public.empresa_tiene_modulo(p_id_empresa, 'inventario')) then
    raise exception 'Tu plan no incluye Ventas ni Inventario' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sucursales where id = p_id_sucursal and id_empresa = p_id_empresa) then
    raise exception 'Sucursal no válida' using errcode = '22023';
  end if;
  if nullif(trim(p_origen), '') is null then
    raise exception 'Indica de dónde vienen las ventas' using errcode = '22023';
  end if;
  insert into public.importaciones_ventas
    (id_empresa, id_sucursal, origen, archivo, moneda, descontar_stock, filas, creado_por)
  values (p_id_empresa, p_id_sucursal, left(trim(p_origen), 60), left(p_archivo, 200),
          upper(left(coalesce(p_moneda, ''), 6)), coalesce(p_descontar, false), coalesce(p_filas, 0), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- 2) Importar un lote de pedidos (todo o nada por lote)
--    p_ventas: [{ id_externo, huella, fecha, cliente, metodo_pago,
--                 items:[{ id_producto, cantidad, precio_unitario }] }]
create or replace function public.importar_ventas(p_id_importacion uuid, p_ventas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  imp record; v jsonb; it jsonb;
  v_ext text; v_huella text; v_fecha timestamptz; v_cliente uuid; v_nom text;
  v_total numeric; v_cant numeric; v_precio numeric; v_ticket bigint; v_venta uuid;
  v_ok int := 0; v_dup int := 0; v_deudas jsonb := '[]'::jsonb; v_faltan jsonb;
begin
  select * into imp from public.importaciones_ventas where id = p_id_importacion;
  if not found then raise exception 'Importación no encontrada' using errcode = '22023'; end if;
  if auth.uid() is null or not public.es_admin_de_empresa(imp.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if imp.estado <> 'activa' then raise exception 'Esta importación ya fue revertida' using errcode = '22023'; end if;
  if jsonb_typeof(p_ventas) <> 'array' or jsonb_array_length(p_ventas) = 0 or jsonb_array_length(p_ventas) > 500 then
    raise exception 'Cada lote debe tener entre 1 y 500 pedidos' using errcode = '22023';
  end if;

  for v in select * from jsonb_array_elements(p_ventas) loop
    v_ext := nullif(trim(v->>'id_externo'), '');
    v_huella := case when v_ext is null then md5(coalesce(v->>'huella', '')) end;
    if v_ext is null and coalesce(v->>'huella', '') = '' then
      raise exception 'Un pedido no tiene número ni huella' using errcode = '22023';
    end if;

    if exists (select 1 from public.ventas
                where id_empresa = imp.id_empresa and origen = imp.origen
                  and ((v_ext is not null and id_externo = v_ext) or (v_ext is null and huella = v_huella))) then
      v_dup := v_dup + 1; continue;
    end if;

    v_fecha := coalesce(nullif(v->>'fecha', '')::timestamptz, now());
    if jsonb_typeof(v->'items') <> 'array' or jsonb_array_length(v->'items') = 0 then
      raise exception 'Un pedido no tiene productos' using errcode = '22023';
    end if;

    v_total := 0;
    for it in select * from jsonb_array_elements(v->'items') loop
      v_cant := (it->>'cantidad')::numeric; v_precio := coalesce((it->>'precio_unitario')::numeric, 0);
      if v_cant is null or v_cant <= 0 or v_precio < 0 then raise exception 'Cantidad o precio no válido' using errcode = '22023'; end if;
      if not exists (select 1 from public.productos where id = (it->>'id_producto')::uuid and id_empresa = imp.id_empresa) then
        raise exception 'Un producto no pertenece a la empresa' using errcode = '22023';
      end if;
      v_total := v_total + v_cant * v_precio;
    end loop;

    v_cliente := null; v_nom := nullif(trim(v->>'cliente'), '');
    if v_nom is not null then
      select id into v_cliente from public.clientes
       where id_empresa = imp.id_empresa and lower(nombre) = lower(left(v_nom, 120)) limit 1;
      if v_cliente is null then
        insert into public.clientes (id_empresa, nombre) values (imp.id_empresa, left(v_nom, 120)) returning id into v_cliente;
      end if;
    end if;

    insert into public.contadores_ticket (id_empresa, ultimo) values (imp.id_empresa, 1)
    on conflict (id_empresa) do update set ultimo = public.contadores_ticket.ultimo + 1
    returning ultimo into v_ticket;

    insert into public.ventas (id_empresa, id_sucursal, id_cliente, numero_ticket, total, origen, estado,
                               created_at, metodo_pago, moneda, id_externo, huella, id_importacion)
    values (imp.id_empresa, imp.id_sucursal, v_cliente, v_ticket::text, v_total, imp.origen, 'COMPLETADA',
            v_fecha, left(nullif(trim(v->>'metodo_pago'), ''), 60), imp.moneda, v_ext, v_huella, imp.id)
    returning id into v_venta;

    for it in select * from jsonb_array_elements(v->'items') loop
      v_cant := (it->>'cantidad')::numeric; v_precio := coalesce((it->>'precio_unitario')::numeric, 0);
      insert into public.ventas_detalles (id_venta, id_producto, cantidad, precio_unitario, subtotal)
      values (v_venta, (it->>'id_producto')::uuid, v_cant, v_precio, v_cant * v_precio);
      if imp.descontar_stock then
        v_deudas := public._pos_consumir_producto(imp.id_empresa, imp.id_sucursal, (it->>'id_producto')::uuid,
                      v_cant, true, 'IMP:' || imp.id::text || ' #' || v_ticket, 0, v_deudas);
      end if;
    end loop;
    v_ok := v_ok + 1;
  end loop;

  update public.importaciones_ventas
     set ventas_importadas = ventas_importadas + v_ok, duplicadas = duplicadas + v_dup
   where id = imp.id;

  select coalesce(jsonb_agg(jsonb_build_object('producto', pr.nombre, 'cantidad_ua', d.cant)), '[]'::jsonb) into v_faltan
    from (select (x->>'id_producto')::uuid id, sum((x->>'cantidad_ua')::numeric) cant
            from jsonb_array_elements(v_deudas) x group by 1) d
    join public.productos pr on pr.id = d.id;

  return jsonb_build_object('importadas', v_ok, 'duplicadas', v_dup, 'sin_stock', v_faltan);
end $$;

-- 3) Deshacer una importación (borra sus ventas y devuelve el stock descontado)
create or replace function public.revertir_importacion(p_id_importacion uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare imp record; r record; v_borradas int;
begin
  select * into imp from public.importaciones_ventas where id = p_id_importacion for update;
  if not found then raise exception 'Importación no encontrada' using errcode = '22023'; end if;
  if auth.uid() is null or not public.es_admin_de_empresa(imp.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if imp.estado <> 'activa' then raise exception 'Ya estaba revertida' using errcode = '22023'; end if;

  if imp.descontar_stock then
    for r in
      select id_producto, id_ubicacion, id_sub_ubicacion, sum(cantidad_movida) cant
        from public.movimientos_inventario
       where id_empresa = imp.id_empresa and tipo_movimiento = 'VENTA_POS'
         and referencia like 'IMP:' || imp.id::text || '%'
       group by 1, 2, 3
    loop
      update public.inventario_saldos
         set cantidad_actual_ua = cantidad_actual_ua - r.cant, ultima_actualizacion = now()
       where id = (select s.id from public.inventario_saldos s
                    where s.id_empresa = imp.id_empresa and s.id_sucursal = imp.id_sucursal
                      and s.id_producto = r.id_producto
                      and s.id_ubicacion is not distinct from r.id_ubicacion
                      and s.id_sub_ubicacion is not distinct from r.id_sub_ubicacion
                    order by s.id limit 1);
      if not found then
        insert into public.inventario_saldos (id_empresa, id_producto, id_sucursal, id_ubicacion, id_sub_ubicacion, cantidad_actual_ua)
        values (imp.id_empresa, r.id_producto, imp.id_sucursal, r.id_ubicacion, r.id_sub_ubicacion, -r.cant);
      end if;
      insert into public.movimientos_inventario
        (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
      values (imp.id_empresa, r.id_producto, 'REVERSA_IMPORTACION', -r.cant, 'Reversa de IMP:' || imp.id::text, r.id_ubicacion, r.id_sub_ubicacion);
    end loop;
  end if;

  delete from public.ventas where id_importacion = imp.id;
  get diagnostics v_borradas = row_count;
  update public.importaciones_ventas set estado = 'revertida', revertida_en = now() where id = imp.id;
  return jsonb_build_object('ventas_borradas', v_borradas);
end $$;

revoke all on function public.crear_importacion(uuid,uuid,text,text,text,boolean,int) from public, anon;
revoke all on function public.importar_ventas(uuid,jsonb)                          from public, anon;
revoke all on function public.revertir_importacion(uuid)                           from public, anon;
grant execute on function public.crear_importacion(uuid,uuid,text,text,text,boolean,int) to authenticated;
grant execute on function public.importar_ventas(uuid,jsonb)                          to authenticated;
grant execute on function public.revertir_importacion(uuid)                           to authenticated;
