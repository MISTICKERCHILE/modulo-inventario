-- ============================================================
-- POS base: abrir caja, venta atómica (registrar_venta), recetas,
-- deuda de stock (saldo negativo) y tickets correlativos.
-- ============================================================

-- 1) Turnos: columna de sucursal que el POS ya enviaba y no existía
alter table public.pos_turnos
  add column if not exists id_sucursal uuid references public.sucursales(id);

-- Turno abandonado desde junio: se cierra para que no bloquee la caja
update public.pos_turnos
   set estado = 'CERRADO',
       fecha_cierre = coalesce(fecha_cierre, now()),
       desglose_cierre = coalesce(desglose_cierre, '{}'::jsonb)
                         || jsonb_build_object('cierre_automatico', 'Turno abandonado, cerrado en la migración del POS')
 where estado = 'ABIERTO' and fecha_apertura < now() - interval '2 days';

-- 2) Ventas: vínculo al turno y al método de pago
alter table public.ventas
  add column if not exists id_turno uuid references public.pos_turnos(id),
  add column if not exists id_metodo_pago uuid references public.metodos_pago(id);

create index if not exists ventas_turno_idx on public.ventas(id_turno);

-- 3) Tickets correlativos por empresa
create table if not exists public.contadores_ticket (
  id_empresa uuid primary key references public.empresas(id) on delete cascade,
  ultimo     bigint not null default 0
);
alter table public.contadores_ticket enable row level security;  -- sin políticas: solo funciones

-- Reparar tickets existentes (todos eran NULL), en orden de creación
with numeradas as (
  select id, id_empresa,
         row_number() over (partition by id_empresa order by created_at, id) n
    from public.ventas
   where numero_ticket is null
)
update public.ventas v set numero_ticket = n.n::text
  from numeradas n where v.id = n.id;

insert into public.contadores_ticket (id_empresa, ultimo)
select id_empresa, max(numero_ticket::bigint)
  from public.ventas
 where numero_ticket ~ '^[0-9]+$'
 group by id_empresa
on conflict (id_empresa) do update set ultimo = greatest(public.contadores_ticket.ultimo, excluded.ultimo);

create unique index if not exists ventas_ticket_unico
  on public.ventas(id_empresa, numero_ticket) where numero_ticket is not null;

-- 4) Vista de deuda de stock (saldos negativos = vendido sin stock)
create or replace view public.deuda_stock
with (security_invoker = true) as
select s.id_empresa, s.id_sucursal, s.id_producto, p.nombre as producto,
       sum(s.cantidad_actual_ua) as cantidad_ua
  from public.inventario_saldos s
  join public.productos p on p.id = s.id_producto
 group by s.id_empresa, s.id_sucursal, s.id_producto, p.nombre
having sum(s.cantidad_actual_ua) < 0;

-- 5) Descuento de stock (uso interno): cascada por ubicación; si falta, deja saldo negativo
create or replace function public._pos_descontar_stock(
  p_empresa uuid, p_sucursal uuid, p_producto uuid,
  p_cantidad_ua numeric, p_permite_deuda boolean, p_ref text
) returns numeric          -- devuelve la parte que quedó como deuda
language plpgsql security definer set search_path = public as $$
declare
  v_resta numeric := p_cantidad_ua;
  v_toma  numeric;
  r       record;
  v_deuda numeric := 0;
  v_ubi   uuid;
  v_sub   uuid;
  v_nombre text;
begin
  if p_cantidad_ua <= 0 then return 0; end if;

  for r in
    select s.id, s.cantidad_actual_ua, s.id_ubicacion, s.id_sub_ubicacion
      from public.inventario_saldos s
      left join public.ubicaciones_internas u on u.id = s.id_ubicacion
     where s.id_empresa = p_empresa and s.id_sucursal = p_sucursal
       and s.id_producto = p_producto and s.cantidad_actual_ua > 0
     order by coalesce(u.orden, 999), s.id
       for update of s
  loop
    exit when v_resta <= 0;
    v_toma := least(v_resta, r.cantidad_actual_ua);
    update public.inventario_saldos
       set cantidad_actual_ua = cantidad_actual_ua - v_toma, ultima_actualizacion = now()
     where id = r.id;
    insert into public.movimientos_inventario
      (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
    values (p_empresa, p_producto, 'VENTA_POS', -v_toma, p_ref, r.id_ubicacion, r.id_sub_ubicacion);
    v_resta := v_resta - v_toma;
  end loop;

  if v_resta > 0 then
    if not p_permite_deuda then
      select nombre into v_nombre from public.productos where id = p_producto;
      raise exception 'Sin stock suficiente de "%"', v_nombre using errcode = 'P0001';
    end if;

    -- Deuda: se descuenta de la ubicación principal (o se crea un saldo negativo)
    select s.id_ubicacion, s.id_sub_ubicacion into v_ubi, v_sub
      from public.inventario_saldos s
      left join public.ubicaciones_internas u on u.id = s.id_ubicacion
     where s.id_empresa = p_empresa and s.id_sucursal = p_sucursal and s.id_producto = p_producto
     order by coalesce(u.orden, 999), s.id limit 1;

    update public.inventario_saldos
       set cantidad_actual_ua = cantidad_actual_ua - v_resta, ultima_actualizacion = now()
     where id = (select s.id from public.inventario_saldos s
                  left join public.ubicaciones_internas u on u.id = s.id_ubicacion
                 where s.id_empresa = p_empresa and s.id_sucursal = p_sucursal and s.id_producto = p_producto
                 order by coalesce(u.orden, 999), s.id limit 1);
    if not found then
      insert into public.inventario_saldos (id_empresa, id_producto, id_sucursal, cantidad_actual_ua)
      values (p_empresa, p_producto, p_sucursal, -v_resta);
    end if;

    insert into public.movimientos_inventario
      (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
    values (p_empresa, p_producto, 'VENTA_POS', -v_resta, p_ref || ' (sin stock)', v_ubi, v_sub);
    v_deuda := v_resta;
  end if;

  return v_deuda;
end $$;

revoke all on function public._pos_descontar_stock(uuid,uuid,uuid,numeric,boolean,text) from public, anon, authenticated;

-- 6) Descuento de un producto vendido (con receta, hasta 2 niveles de ingredientes)
--    p_cant_um = cantidad en unidad menor (lo que se vende en el POS)
create or replace function public._pos_consumir_producto(
  p_empresa uuid, p_sucursal uuid, p_producto uuid,
  p_cant_um numeric, p_permite_deuda boolean, p_ref text,
  p_nivel int, p_deudas jsonb
) returns jsonb            -- devuelve el acumulado de deudas [{id_producto, cantidad_ua}]
language plpgsql security definer set search_path = public as $$
declare
  p        record;
  ing      record;
  v_ua     numeric;
  v_stock  numeric;
  v_toma_um numeric;
  v_resta_um numeric := p_cant_um;
  v_deuda  numeric;
  v_ing_um numeric;
begin
  select id, nombre, tiene_receta, control_stock,
         coalesce(nullif(cant_en_um_de_ua,0),1) um_por_ua,
         coalesce(nullif(cant_en_ur_de_um,0),1) ur_por_um
    into p from public.productos where id = p_producto and id_empresa = p_empresa;
  if not found then return p_deudas; end if;
  if p.control_stock is false then return p_deudas; end if;

  if p.tiene_receta then
    -- 1) primero el producto terminado que haya en stock
    select coalesce(sum(cantidad_actual_ua),0) into v_stock
      from public.inventario_saldos
     where id_empresa = p_empresa and id_sucursal = p_sucursal and id_producto = p_producto and cantidad_actual_ua > 0;
    v_toma_um := least(v_resta_um, v_stock * p.um_por_ua);
    if v_toma_um > 0 then
      perform public._pos_descontar_stock(p_empresa, p_sucursal, p_producto, v_toma_um / p.um_por_ua, true, p_ref);
      v_resta_um := v_resta_um - v_toma_um;
    end if;

    -- 2) lo que falta, con los ingredientes de la receta
    if v_resta_um > 0 then
      if p_nivel >= 2 then
        -- tope de profundidad: se descuenta como producto (queda como deuda si no hay)
        v_deuda := public._pos_descontar_stock(p_empresa, p_sucursal, p_producto, v_resta_um / p.um_por_ua, p_permite_deuda, p_ref);
        if v_deuda > 0 then
          p_deudas := p_deudas || jsonb_build_array(jsonb_build_object('id_producto', p_producto, 'cantidad_ua', v_deuda));
        end if;
      else
        for ing in select id_ingrediente, cantidad_neta from public.recetas
                    where id_empresa = p_empresa and id_producto_padre = p_producto loop
          -- cantidad_neta viene en unidad de receta del ingrediente -> unidad menor
          v_ing_um := (v_resta_um * ing.cantidad_neta)
                      / coalesce(nullif((select cant_en_ur_de_um from public.productos where id = ing.id_ingrediente),0),1);
          p_deudas := public._pos_consumir_producto(
            p_empresa, p_sucursal, ing.id_ingrediente, v_ing_um, p_permite_deuda, p_ref, p_nivel + 1, p_deudas);
        end loop;
      end if;
    end if;
  else
    v_ua := p_cant_um / p.um_por_ua;
    v_deuda := public._pos_descontar_stock(p_empresa, p_sucursal, p_producto, v_ua, p_permite_deuda, p_ref);
    if v_deuda > 0 then
      p_deudas := p_deudas || jsonb_build_array(jsonb_build_object('id_producto', p_producto, 'cantidad_ua', v_deuda));
    end if;
  end if;

  return p_deudas;
end $$;

revoke all on function public._pos_consumir_producto(uuid,uuid,uuid,numeric,boolean,text,int,jsonb) from public, anon, authenticated;

-- 7) La venta completa en UNA operación
create or replace function public.registrar_venta(
  p_id_sucursal uuid,
  p_id_turno    uuid,
  p_id_metodo_pago uuid,
  p_id_cliente  uuid,
  p_id_cajero   uuid,
  p_items       jsonb          -- [{ "id": uuid, "cantidad": numeric }]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_permite boolean;
  v_metodo  record;
  v_turno   record;
  v_item    jsonb;
  v_prod    record;
  v_cant    numeric;
  v_total   numeric := 0;
  v_ticket  bigint;
  v_venta   uuid;
  v_estado  text;
  v_deudas  jsonb := '[]'::jsonb;
  v_ref     text;
  v_faltan  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select id_empresa into v_empresa from public.sucursales where id = p_id_sucursal;
  if v_empresa is null then
    raise exception 'Sucursal no encontrada' using errcode = '22023';
  end if;
  if not public.tiene_acceso_a_empresa(v_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(v_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo para esta empresa' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío' using errcode = '22023';
  end if;

  select * into v_turno from public.pos_turnos
   where id = p_id_turno and id_empresa = v_empresa and estado = 'ABIERTO';
  if not found then
    raise exception 'No hay una caja abierta para vender' using errcode = '22023';
  end if;

  select * into v_metodo from public.metodos_pago
   where id = p_id_metodo_pago and id_empresa = v_empresa and coalesce(activo, true);
  if not found then
    raise exception 'Método de pago no válido' using errcode = '22023';
  end if;

  if p_id_cajero is not null and not exists (
       select 1 from public.usuarios_empresas where id_empresa = v_empresa and id_usuario = p_id_cajero) then
    raise exception 'El cajero no pertenece a la empresa' using errcode = '22023';
  end if;

  v_estado := case when upper(coalesce(v_metodo.tipo,'')) = 'CREDITO' then 'POR_COBRAR' else 'COMPLETADA' end;
  if v_estado = 'POR_COBRAR' and p_id_cliente is null then
    raise exception 'Una venta a crédito necesita un cliente' using errcode = '22023';
  end if;
  if p_id_cliente is not null and not exists (
       select 1 from public.clientes where id = p_id_cliente and id_empresa = v_empresa) then
    raise exception 'Cliente no válido' using errcode = '22023';
  end if;

  select coalesce(venta_sin_stock, false) into v_permite from public.empresas where id = v_empresa;

  -- Ticket correlativo (bloquea la fila del contador hasta el fin de la transacción)
  insert into public.contadores_ticket (id_empresa, ultimo) values (v_empresa, 1)
  on conflict (id_empresa) do update set ultimo = public.contadores_ticket.ultimo + 1
  returning ultimo into v_ticket;

  -- Total calculado en el servidor con el precio vigente
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad no válida' using errcode = '22023';
    end if;
    select id, coalesce(precio_venta_iva, 0) precio into v_prod
      from public.productos
     where id = (v_item->>'id')::uuid and id_empresa = v_empresa and coalesce(vender_en_pos, false);
    if not found then
      raise exception 'Producto no disponible para la venta' using errcode = '22023';
    end if;
    v_total := v_total + v_prod.precio * v_cant;
  end loop;

  insert into public.ventas
    (id_empresa, id_sucursal, id_cliente, numero_ticket, total, origen, estado,
     metodo_pago, cajero, id_turno, id_metodo_pago)
  values
    (v_empresa, p_id_sucursal, p_id_cliente, v_ticket::text, v_total, 'POS', v_estado,
     v_metodo.nombre, p_id_cajero::text, p_id_turno, p_id_metodo_pago)
  returning id into v_venta;

  v_ref := 'Venta POS #' || v_ticket;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::numeric;
    select id, coalesce(precio_venta_iva, 0) precio into v_prod
      from public.productos where id = (v_item->>'id')::uuid and id_empresa = v_empresa;

    insert into public.ventas_detalles (id_venta, id_producto, cantidad, precio_unitario, subtotal)
    values (v_venta, v_prod.id, v_cant, v_prod.precio, v_prod.precio * v_cant);

    v_deudas := public._pos_consumir_producto(
      v_empresa, p_id_sucursal, v_prod.id, v_cant, v_permite, v_ref, 0, v_deudas);
  end loop;

  if v_estado = 'POR_COBRAR' then
    insert into public.cuentas_por_cobrar
      (id_empresa, id_venta, id_cliente, monto_deuda, monto_pagado, estado, fecha_vencimiento)
    values (v_empresa, v_venta, p_id_cliente, v_total, 0, 'Pendiente', (now() + interval '30 days')::date);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('producto', pr.nombre, 'cantidad_ua', d.cant)), '[]'::jsonb)
    into v_faltan
    from (select (x->>'id_producto')::uuid id, sum((x->>'cantidad_ua')::numeric) cant
            from jsonb_array_elements(v_deudas) x group by 1) d
    join public.productos pr on pr.id = d.id;

  return jsonb_build_object(
    'id', v_venta, 'numero_ticket', v_ticket, 'total', v_total,
    'estado', v_estado, 'sin_stock', v_faltan);
end $$;

revoke all on function public.registrar_venta(uuid,uuid,uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.registrar_venta(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;
