-- ============================================================
-- Agenda de trabajo: Pedidos, Reservas e Instalaciones
-- Reserva stock al crear, anticipo opcional y saldo como cuenta por cobrar.
-- ============================================================

create table if not exists public.agenda_trabajos (
  id            uuid primary key default gen_random_uuid(),
  id_empresa    uuid not null references public.empresas(id) on delete cascade,
  id_sucursal   uuid not null references public.sucursales(id) on delete cascade,
  numero        bigint not null,
  tipo          text not null check (tipo in ('pedido','reserva','instalacion')),
  estado        text not null default 'pendiente' check (estado in ('pendiente','confirmado','en_curso','listo','entregado','cancelado')),
  id_cliente    uuid not null references public.clientes(id),
  cliente_nombre text not null,
  cliente_telefono text,
  titulo        text,
  fecha_inicio  timestamptz not null,
  fecha_fin     timestamptz,
  direccion_trabajo text,
  responsable   text,
  notas         text,
  moneda        text not null default 'CLP',
  descuento_pct numeric not null default 0 check (descuento_pct between 0 and 100),
  impuesto_pct  numeric not null default 0 check (impuesto_pct between 0 and 100),
  subtotal      numeric not null default 0,
  total         numeric not null default 0,
  id_cotizacion uuid references public.cotizaciones(id) on delete set null,
  id_venta      uuid references public.ventas(id) on delete set null,
  id_cuenta     uuid references public.cuentas_por_cobrar(id) on delete set null,
  creado_por    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id_empresa, numero)
);
create index if not exists agenda_trabajos_idx on public.agenda_trabajos(id_empresa, fecha_inicio);

create table if not exists public.agenda_items (
  id          uuid primary key default gen_random_uuid(),
  id_agenda   uuid not null references public.agenda_trabajos(id) on delete cascade,
  orden       int not null default 0,
  id_producto uuid references public.productos(id) on delete set null,
  descripcion text not null,
  cantidad    numeric not null check (cantidad > 0),
  precio_unitario numeric not null default 0 check (precio_unitario >= 0),
  descuento_pct numeric not null default 0 check (descuento_pct between 0 and 100)
);
create index if not exists agenda_items_idx on public.agenda_items(id_agenda, orden);

alter table public.agenda_trabajos enable row level security;
alter table public.agenda_items enable row level security;
drop policy if exists acceso_lectura on public.agenda_trabajos;
drop policy if exists suscripcion on public.agenda_trabajos;
drop policy if exists acceso_lectura on public.agenda_items;
create policy acceso_lectura on public.agenda_trabajos for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.agenda_trabajos as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));
create policy acceso_lectura on public.agenda_items for select using (
  exists (select 1 from public.agenda_trabajos a where a.id = id_agenda and public.tiene_acceso_a_empresa(a.id_empresa)));

-- Crear: cliente, venta por cobrar, reserva de stock, cuenta por cobrar y anticipo, todo en una operación
-- p_datos: id_sucursal, tipo, id_cliente | cliente_nombre, cliente_telefono, titulo, fecha_inicio, fecha_fin,
--          direccion_trabajo, responsable, notas, moneda, descuento_pct, impuesto_pct
-- p_items: [{id_producto, descripcion, cantidad, precio_unitario, descuento_pct}]
-- p_anticipo: {monto, id_metodo_pago} (opcional)
create or replace function public.crear_agenda(
  p_id_empresa uuid, p_datos jsonb, p_items jsonb, p_anticipo jsonb default null, p_id_cotizacion uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_num bigint; v_suc uuid; v_tipo text; v_cli uuid; v_nombre text; it jsonb;
  v_moneda text; v_dec int; v_dpct numeric; v_ipct numeric; v_sub numeric := 0; v_desc numeric; v_imp numeric; v_total numeric;
  v_inicio timestamptz; v_venta uuid; v_cuenta uuid; v_permite boolean; v_ref text; v_deudas jsonb := '[]'::jsonb; v_orden int := 0;
  v_prod uuid; v_monto numeric;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  v_suc := nullif(p_datos->>'id_sucursal','')::uuid;
  if not exists (select 1 from public.sucursales where id = v_suc and id_empresa = p_id_empresa) then raise exception 'Elige una sucursal' using errcode = '22023'; end if;
  v_tipo := p_datos->>'tipo';
  if v_tipo not in ('pedido','reserva','instalacion') then raise exception 'Tipo no válido' using errcode = '22023'; end if;
  v_inicio := nullif(p_datos->>'fecha_inicio','')::timestamptz;
  if v_inicio is null then raise exception 'Indica la fecha' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Agrega entre 1 y 100 líneas' using errcode = '22023'; end if;

  v_moneda := upper(left(coalesce(nullif(trim(p_datos->>'moneda'),''),'CLP'),6));
  v_dec := case when v_moneda in ('CLP','COP','PYG','JPY') then 0 else 2 end;
  v_dpct := coalesce(nullif(p_datos->>'descuento_pct','')::numeric,0);
  v_ipct := coalesce(nullif(p_datos->>'impuesto_pct','')::numeric,0);

  -- Cliente: existente o nuevo
  v_cli := nullif(p_datos->>'id_cliente','')::uuid;
  if v_cli is not null and not exists (select 1 from public.clientes where id = v_cli and id_empresa = p_id_empresa) then v_cli := null; end if;
  v_nombre := nullif(trim(p_datos->>'cliente_nombre'),'');
  if v_cli is null then
    if v_nombre is null then raise exception 'Indica el cliente' using errcode = '22023'; end if;
    insert into public.clientes (id_empresa, nombre, telefono, direccion)
    values (p_id_empresa, left(v_nombre,160), left(p_datos->>'cliente_telefono',40), left(p_datos->>'direccion_trabajo',240)) returning id into v_cli;
  else
    select nombre into v_nombre from public.clientes where id = v_cli;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if nullif(trim(it->>'descripcion'),'') is null then raise exception 'Una línea no tiene descripción' using errcode = '22023'; end if;
    if coalesce((it->>'cantidad')::numeric,0) <= 0 then raise exception 'Una línea tiene cantidad cero' using errcode = '22023'; end if;
    v_sub := v_sub + (it->>'cantidad')::numeric * coalesce((it->>'precio_unitario')::numeric,0) * (1 - coalesce((it->>'descuento_pct')::numeric,0)/100);
  end loop;
  v_sub := round(v_sub, v_dec); v_desc := round(v_sub * v_dpct/100, v_dec); v_imp := round((v_sub - v_desc) * v_ipct/100, v_dec);
  v_total := v_sub - v_desc + v_imp;

  insert into public.contadores_documento (id_empresa, tipo, ultimo) values (p_id_empresa, 'agenda', 1)
  on conflict (id_empresa, tipo) do update set ultimo = public.contadores_documento.ultimo + 1 returning ultimo into v_num;

  -- Venta por cobrar (el saldo y los abonos viven en Cobros)
  insert into public.ventas (id_empresa, id_sucursal, id_cliente, numero_ticket, total, origen, estado, metodo_pago, moneda)
  values (p_id_empresa, v_suc, v_cli, 'AG-' || lpad(v_num::text,4,'0'), v_total, 'AGENDA', 'POR_COBRAR', 'Crédito', v_moneda) returning id into v_venta;

  insert into public.agenda_trabajos (id, id_empresa, id_sucursal, numero, tipo, id_cliente, cliente_nombre, cliente_telefono, titulo, fecha_inicio, fecha_fin,
      direccion_trabajo, responsable, notas, moneda, descuento_pct, impuesto_pct, subtotal, total, id_cotizacion, id_venta, creado_por)
  values (v_id, p_id_empresa, v_suc, v_num, v_tipo, v_cli, left(v_nombre,160), left(p_datos->>'cliente_telefono',40), left(p_datos->>'titulo',200), v_inicio,
      nullif(p_datos->>'fecha_fin','')::timestamptz, left(p_datos->>'direccion_trabajo',240), left(p_datos->>'responsable',80), left(p_datos->>'notas',4000),
      v_moneda, v_dpct, v_ipct, v_sub, v_total, p_id_cotizacion, v_venta, auth.uid());

  select coalesce(venta_sin_stock,false) into v_permite from public.empresas where id = p_id_empresa;
  v_ref := 'AGENDA:' || v_id::text;
  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := (select id from public.productos where id = nullif(it->>'id_producto','')::uuid and id_empresa = p_id_empresa);
    insert into public.agenda_items (id_agenda, orden, id_producto, descripcion, cantidad, precio_unitario, descuento_pct)
    values (v_id, v_orden, v_prod, left(trim(it->>'descripcion'),300), (it->>'cantidad')::numeric, coalesce((it->>'precio_unitario')::numeric,0), coalesce((it->>'descuento_pct')::numeric,0));
    v_orden := v_orden + 1;
    if v_prod is not null then
      insert into public.ventas_detalles (id_venta, id_producto, cantidad, precio_unitario, subtotal)
      values (v_venta, v_prod, (it->>'cantidad')::numeric, coalesce((it->>'precio_unitario')::numeric,0) * (1 - coalesce((it->>'descuento_pct')::numeric,0)/100),
              (it->>'cantidad')::numeric * coalesce((it->>'precio_unitario')::numeric,0) * (1 - coalesce((it->>'descuento_pct')::numeric,0)/100));
      v_deudas := public._pos_consumir_producto(p_id_empresa, v_suc, v_prod, (it->>'cantidad')::numeric, v_permite, v_ref, 0, v_deudas);
    end if;
  end loop;

  insert into public.cuentas_por_cobrar (id_empresa, id_venta, id_cliente, monto_deuda, monto_pagado, estado, fecha_vencimiento, moneda, concepto, id_cotizacion)
  values (p_id_empresa, v_venta, v_cli, v_total, 0, 'Pendiente', (v_inicio at time zone (select zona_horaria from public.empresas where id = p_id_empresa))::date, v_moneda,
          left(initcap(v_tipo) || ' AG-' || lpad(v_num::text,4,'0') || coalesce(' · ' || nullif(p_datos->>'titulo',''), ''), 300), p_id_cotizacion)
  returning id into v_cuenta;
  update public.agenda_trabajos set id_cuenta = v_cuenta where id = v_id;

  v_monto := coalesce(nullif(p_anticipo->>'monto','')::numeric, 0);
  if v_monto > 0 then
    perform public.registrar_abono(v_cuenta, v_monto, nullif(p_anticipo->>'id_metodo_pago','')::uuid, 'Anticipo', null);
  end if;

  if p_id_cotizacion is not null then
    update public.cotizaciones set estado = 'convertida', id_venta = v_venta, updated_at = now()
     where id = p_id_cotizacion and id_empresa = p_id_empresa and estado = 'aceptada';
  end if;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'total', v_total, 'id_cuenta', v_cuenta);
end $$;

-- Datos que se pueden editar sin tocar montos ni stock
create or replace function public.actualizar_agenda(p_id uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.agenda_trabajos where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(a.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(a.id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if a.estado in ('entregado','cancelado') then raise exception 'Este trabajo ya está cerrado' using errcode = '22023'; end if;
  update public.agenda_trabajos set
    titulo = left(coalesce(p_datos->>'titulo', titulo),200),
    fecha_inicio = coalesce(nullif(p_datos->>'fecha_inicio','')::timestamptz, fecha_inicio),
    fecha_fin = case when p_datos ? 'fecha_fin' then nullif(p_datos->>'fecha_fin','')::timestamptz else fecha_fin end,
    direccion_trabajo = left(coalesce(p_datos->>'direccion_trabajo', direccion_trabajo),240),
    responsable = left(coalesce(p_datos->>'responsable', responsable),80),
    cliente_telefono = left(coalesce(p_datos->>'cliente_telefono', cliente_telefono),40),
    notas = left(coalesce(p_datos->>'notas', notas),4000), updated_at = now()
   where id = p_id;
end $$;

-- Cambiar estado. Cancelar devuelve el stock reservado y anula la deuda pendiente (los abonos ya cobrados quedan en el historial).
create or replace function public.cambiar_estado_agenda(p_id uuid, p_estado text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; r record; cu record; v_pagado numeric := 0;
begin
  select * into a from public.agenda_trabajos where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(a.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(a.id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_estado not in ('pendiente','confirmado','en_curso','listo','entregado','cancelado') then raise exception 'Estado no válido' using errcode = '22023'; end if;
  if a.estado in ('entregado','cancelado') then raise exception 'Este trabajo ya está cerrado' using errcode = '22023'; end if;

  if p_estado = 'cancelado' then
    for r in
      select id_producto, id_ubicacion, id_sub_ubicacion, sum(cantidad_movida) cant
        from public.movimientos_inventario
       where id_empresa = a.id_empresa and tipo_movimiento = 'VENTA_POS' and referencia like 'AGENDA:' || a.id::text || '%'
       group by 1,2,3
    loop
      update public.inventario_saldos set cantidad_actual_ua = cantidad_actual_ua - r.cant, ultima_actualizacion = now()
       where id = (select s.id from public.inventario_saldos s
                    where s.id_empresa = a.id_empresa and s.id_sucursal = a.id_sucursal and s.id_producto = r.id_producto
                      and s.id_ubicacion is not distinct from r.id_ubicacion and s.id_sub_ubicacion is not distinct from r.id_sub_ubicacion
                    order by s.id limit 1);
      if not found then
        insert into public.inventario_saldos (id_empresa, id_producto, id_sucursal, id_ubicacion, id_sub_ubicacion, cantidad_actual_ua)
        values (a.id_empresa, r.id_producto, a.id_sucursal, r.id_ubicacion, r.id_sub_ubicacion, -r.cant);
      end if;
      insert into public.movimientos_inventario (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
      values (a.id_empresa, r.id_producto, 'REVERSA_AGENDA', -r.cant, 'Reversa de AGENDA:' || a.id::text, r.id_ubicacion, r.id_sub_ubicacion);
    end loop;
    select * into cu from public.cuentas_por_cobrar where id = a.id_cuenta;
    if found then
      v_pagado := cu.monto_pagado;
      update public.cuentas_por_cobrar set estado = 'Anulada', monto_deuda = monto_pagado where id = cu.id;
    end if;
    update public.ventas set estado = 'ANULADA' where id = a.id_venta;
  end if;

  update public.agenda_trabajos set estado = p_estado, updated_at = now() where id = p_id;
  return jsonb_build_object('estado', p_estado, 'abonado_a_devolver', v_pagado);
end $$;

-- Desde una cotización aceptada
create or replace function public.crear_agenda_desde_cotizacion(
  p_id_cotizacion uuid, p_id_sucursal uuid, p_tipo text, p_fecha_inicio timestamptz, p_anticipo jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_items jsonb;
begin
  select * into c from public.cotizaciones where id = p_id_cotizacion for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if c.estado <> 'aceptada' then raise exception 'Solo una cotización aceptada puede pasar a la agenda' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('id_producto', id_producto, 'descripcion', descripcion, 'cantidad', cantidad,
                                      'precio_unitario', precio_unitario, 'descuento_pct', descuento_pct) order by orden)
    into v_items from public.cotizaciones_items where id_cotizacion = c.id;
  return public.crear_agenda(c.id_empresa, jsonb_build_object('id_sucursal', p_id_sucursal, 'tipo', p_tipo, 'id_cliente', c.id_cliente,
      'cliente_nombre', c.cliente_nombre, 'cliente_telefono', c.cliente_telefono, 'titulo', c.titulo, 'fecha_inicio', p_fecha_inicio,
      'direccion_trabajo', c.cliente_direccion, 'notas', c.notas, 'moneda', c.moneda, 'descuento_pct', c.descuento_pct, 'impuesto_pct', c.impuesto_pct),
    v_items, p_anticipo, c.id);
end $$;

revoke all on function public.crear_agenda(uuid,jsonb,jsonb,jsonb,uuid) from public, anon;
revoke all on function public.actualizar_agenda(uuid,jsonb) from public, anon;
revoke all on function public.cambiar_estado_agenda(uuid,text) from public, anon;
revoke all on function public.crear_agenda_desde_cotizacion(uuid,uuid,text,timestamptz,jsonb) from public, anon;
grant execute on function public.crear_agenda(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
grant execute on function public.actualizar_agenda(uuid,jsonb) to authenticated;
grant execute on function public.cambiar_estado_agenda(uuid,text) to authenticated;
grant execute on function public.crear_agenda_desde_cotizacion(uuid,uuid,text,timestamptz,jsonb) to authenticated;
