-- ============================================================
-- Cuentas por cobrar con abonos, notas de cobro y conversión de cotizaciones.
-- ============================================================

alter table public.cuentas_por_cobrar
  add column if not exists moneda text not null default 'CLP',
  add column if not exists concepto text,
  add column if not exists id_cotizacion uuid references public.cotizaciones(id) on delete set null;

-- La restricción de suscripción también aplica a cuentas por cobrar
drop policy if exists suscripcion on public.cuentas_por_cobrar;
create policy suscripcion on public.cuentas_por_cobrar as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

create table if not exists public.cxc_pagos (
  id             uuid primary key default gen_random_uuid(),
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  id_cuenta      uuid not null references public.cuentas_por_cobrar(id) on delete cascade,
  monto          numeric not null check (monto > 0),
  id_metodo_pago uuid references public.metodos_pago(id) on delete set null,
  metodo_nombre  text,
  nota           text,
  fecha          date not null default current_date,
  creado_por     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists cxc_pagos_cuenta_idx on public.cxc_pagos(id_cuenta, created_at);
alter table public.cxc_pagos enable row level security;
drop policy if exists acceso_lectura on public.cxc_pagos;
drop policy if exists suscripcion on public.cxc_pagos;
create policy acceso_lectura on public.cxc_pagos for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.cxc_pagos as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

-- Abono (pago parcial o total)
create or replace function public.registrar_abono(
  p_id_cuenta uuid, p_monto numeric, p_id_metodo_pago uuid, p_nota text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; m record; v_saldo numeric; v_pagado numeric; v_estado text; v_dec int;
begin
  select * into c from public.cuentas_por_cobrar where id = p_id_cuenta for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(c.id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  v_dec := case when c.moneda in ('CLP','COP','PYG','JPY') then 0 else 2 end;
  p_monto := round(coalesce(p_monto, 0), v_dec);
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero' using errcode = '22023'; end if;
  v_saldo := c.monto_deuda - c.monto_pagado;
  if p_monto > v_saldo then
    raise exception 'El abono supera el saldo pendiente (%)', v_saldo using errcode = '22023';
  end if;
  select * into m from public.metodos_pago
   where id = p_id_metodo_pago and id_empresa = c.id_empresa and coalesce(activo, true) and upper(coalesce(tipo,'')) <> 'CREDITO';
  if not found then raise exception 'Elige un método de pago válido' using errcode = '22023'; end if;

  insert into public.cxc_pagos (id_empresa, id_cuenta, monto, id_metodo_pago, metodo_nombre, nota, fecha, creado_por)
  values (c.id_empresa, c.id, p_monto, m.id, m.nombre, left(p_nota, 300), coalesce(p_fecha, current_date), auth.uid());

  v_pagado := c.monto_pagado + p_monto;
  v_estado := case when v_pagado >= c.monto_deuda then 'Pagada' else 'Parcial' end;
  update public.cuentas_por_cobrar set monto_pagado = v_pagado, estado = v_estado where id = c.id;
  if v_estado = 'Pagada' then
    update public.ventas set estado = 'COMPLETADA' where id = c.id_venta and estado = 'POR_COBRAR';
  end if;
  return jsonb_build_object('saldo', c.monto_deuda - v_pagado, 'estado', v_estado);
end $$;

-- Nota de cobro: una deuda de un cliente sin pasar por el POS
create or replace function public.crear_nota_cobro(
  p_id_empresa uuid, p_id_sucursal uuid, p_id_cliente uuid, p_concepto text,
  p_monto numeric, p_moneda text, p_vencimiento date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num bigint; v_venta uuid; v_cuenta uuid; v_mon text; v_dec int;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sucursales where id = p_id_sucursal and id_empresa = p_id_empresa) then
    raise exception 'Sucursal no válida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clientes where id = p_id_cliente and id_empresa = p_id_empresa) then
    raise exception 'Elige un cliente' using errcode = '22023';
  end if;
  v_mon := upper(left(coalesce(nullif(trim(p_moneda),''),'CLP'), 6));
  v_dec := case when v_mon in ('CLP','COP','PYG','JPY') then 0 else 2 end;
  p_monto := round(coalesce(p_monto,0), v_dec);
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero' using errcode = '22023'; end if;
  if nullif(trim(p_concepto),'') is null then raise exception 'Indica el concepto' using errcode = '22023'; end if;

  insert into public.contadores_documento (id_empresa, tipo, ultimo) values (p_id_empresa, 'nota', 1)
  on conflict (id_empresa, tipo) do update set ultimo = public.contadores_documento.ultimo + 1
  returning ultimo into v_num;

  insert into public.ventas (id_empresa, id_sucursal, id_cliente, numero_ticket, total, origen, estado, metodo_pago, moneda)
  values (p_id_empresa, p_id_sucursal, p_id_cliente, 'NOTA-' || lpad(v_num::text, 4, '0'), p_monto, 'NOTA', 'POR_COBRAR', 'Crédito', v_mon)
  returning id into v_venta;

  insert into public.cuentas_por_cobrar (id_empresa, id_venta, id_cliente, monto_deuda, monto_pagado, estado, fecha_vencimiento, moneda, concepto)
  values (p_id_empresa, v_venta, p_id_cliente, p_monto, 0, 'Pendiente', coalesce(p_vencimiento, current_date + 30), v_mon, left(trim(p_concepto), 300))
  returning id into v_cuenta;
  return jsonb_build_object('id_cuenta', v_cuenta, 'numero', v_num);
end $$;

-- Convertir una cotización aceptada en venta por cobrar (opcionalmente descontando stock)
create or replace function public.convertir_cotizacion(
  p_id uuid, p_id_sucursal uuid, p_vencimiento date, p_descontar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; it record; v_cliente uuid; v_venta uuid; v_cuenta uuid; v_permite boolean;
  v_deudas jsonb := '[]'::jsonb; v_ref text; v_num text;
begin
  select * into c from public.cotizaciones where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(c.id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  if c.estado <> 'aceptada' then raise exception 'Solo se puede convertir una cotización aceptada' using errcode = '22023'; end if;
  if not exists (select 1 from public.sucursales where id = p_id_sucursal and id_empresa = c.id_empresa) then
    raise exception 'Sucursal no válida' using errcode = '22023';
  end if;
  if exists (select 1 from public.cotizaciones_items where id_cotizacion = c.id and id_producto is null) then
    raise exception 'Hay líneas que no están vinculadas a un producto. Vincúlalas o usa una Nueva nota de cobro.' using errcode = '22023';
  end if;

  v_cliente := c.id_cliente;
  if v_cliente is null or not exists (select 1 from public.clientes where id = v_cliente and id_empresa = c.id_empresa) then
    insert into public.clientes (id_empresa, nombre, documento, correo, telefono, direccion)
    values (c.id_empresa, c.cliente_nombre, c.cliente_documento, c.cliente_correo, c.cliente_telefono, c.cliente_direccion)
    returning id into v_cliente;
  end if;

  v_num := 'COT-' || lpad(c.numero::text, 4, '0');
  insert into public.ventas (id_empresa, id_sucursal, id_cliente, numero_ticket, total, origen, estado, metodo_pago, moneda)
  values (c.id_empresa, p_id_sucursal, v_cliente, v_num, c.total, 'COTIZACION', 'POR_COBRAR', 'Crédito', c.moneda)
  returning id into v_venta;

  select coalesce(venta_sin_stock, false) into v_permite from public.empresas where id = c.id_empresa;
  v_ref := 'Cotización ' || v_num;
  for it in select * from public.cotizaciones_items where id_cotizacion = c.id order by orden loop
    insert into public.ventas_detalles (id_venta, id_producto, cantidad, precio_unitario, subtotal)
    values (v_venta, it.id_producto, it.cantidad, it.precio_unitario * (1 - it.descuento_pct / 100),
            it.cantidad * it.precio_unitario * (1 - it.descuento_pct / 100));
    if p_descontar then
      v_deudas := public._pos_consumir_producto(c.id_empresa, p_id_sucursal, it.id_producto, it.cantidad, v_permite, v_ref, 0, v_deudas);
    end if;
  end loop;

  insert into public.cuentas_por_cobrar (id_empresa, id_venta, id_cliente, monto_deuda, monto_pagado, estado, fecha_vencimiento, moneda, concepto, id_cotizacion)
  values (c.id_empresa, v_venta, v_cliente, c.total, 0, 'Pendiente', coalesce(p_vencimiento, current_date + 30), c.moneda,
          left(coalesce(c.titulo, 'Cotización ' || lpad(c.numero::text, 4, '0')), 300), c.id)
  returning id into v_cuenta;

  update public.cotizaciones set estado = 'convertida', id_venta = v_venta, id_cliente = v_cliente, updated_at = now() where id = c.id;
  return jsonb_build_object('id_venta', v_venta, 'id_cuenta', v_cuenta);
end $$;

revoke all on function public.registrar_abono(uuid,numeric,uuid,text,date) from public, anon;
revoke all on function public.crear_nota_cobro(uuid,uuid,uuid,text,numeric,text,date) from public, anon;
revoke all on function public.convertir_cotizacion(uuid,uuid,date,boolean) from public, anon;
grant execute on function public.registrar_abono(uuid,numeric,uuid,text,date) to authenticated;
grant execute on function public.crear_nota_cobro(uuid,uuid,uuid,text,numeric,text,date) to authenticated;
grant execute on function public.convertir_cotizacion(uuid,uuid,date,boolean) to authenticated;
