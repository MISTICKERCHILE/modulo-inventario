-- ============================================================
-- Conciliación · Vincular una línea de cartola con VARIOS registros
-- Ej.: una transferencia de $329.232 = reembolso $300.242 + reembolso $28.990
-- Solo agrega una tabla y reemplaza 2 funciones. No borra ni cambia datos existentes.
-- ============================================================

-- 1) Qué registros (pagos o gastos) cubre cada línea de cartola
create table if not exists public.movimientos_vinculos (
  id            uuid primary key default gen_random_uuid(),
  id_empresa    uuid not null references public.empresas(id) on delete cascade,
  id_movimiento uuid not null references public.movimientos_bancarios(id) on delete cascade,
  tipo          text not null check (tipo in ('pago', 'compra')),
  id_vinculo    uuid not null,
  created_at    timestamptz not null default now(),
  unique (tipo, id_vinculo)            -- un pago o gasto solo puede estar en UNA línea
);
create index if not exists movvinc_mov_idx on public.movimientos_vinculos(id_movimiento);

alter table public.movimientos_vinculos enable row level security;
drop policy if exists lectura on public.movimientos_vinculos;
create policy lectura on public.movimientos_vinculos for select using (public.tiene_acceso_a_empresa(id_empresa));
-- (las escrituras van solo por resolver_movimiento / anular_gasto)

-- 2) Copiar los vínculos que ya existen (uno por línea)
insert into public.movimientos_vinculos (id_empresa, id_movimiento, tipo, id_vinculo)
select id_empresa, id, vinculo_tipo, vinculo_id from public.movimientos_bancarios
 where vinculo_tipo in ('pago', 'compra') and vinculo_id is not null
on conflict (tipo, id_vinculo) do nothing;

-- 3) resolver_movimiento: 'vincular' acepta varios registros
create or replace function public.resolver_movimiento(p_id uuid, p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; v_cta record; v_id uuid; v_cat uuid; v_pat text; v_otra record; v_com uuid; v_desc text;
  v_items jsonb; v_it jsonb; v_tipo text; v_ptipo text; v_pid uuid;
begin
  select * into m from public.movimientos_bancarios where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(m.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_cta from public.cuentas_financieras where id = m.id_cuenta;
  p_datos := coalesce(p_datos, '{}'::jsonb);

  if p_accion = 'deshacer' then
    delete from public.movimientos_vinculos where id_movimiento = m.id;
    if m.vinculo_tipo = 'compra' and (p_datos->>'borrar_gasto')::boolean then
      delete from public.compras where id = m.vinculo_id and id_empresa = m.id_empresa and origen = 'gasto'
        and not exists (select 1 from public.cxp_pagos_aplicaciones a where a.id_compra = m.vinculo_id);
    end if;
    if m.vinculo_tipo = 'transferencia' then delete from public.transferencias_cuentas where id = m.vinculo_id and id_empresa = m.id_empresa; end if;
    if m.id_gasto_comision is not null then delete from public.compras where id = m.id_gasto_comision and id_empresa = m.id_empresa; end if;
    update public.movimientos_bancarios set estado = 'pendiente', vinculo_tipo = null, vinculo_id = null, id_gasto_comision = null,
      resuelto_por = null, resuelto_at = null where id = m.id;
    return jsonb_build_object('estado', 'pendiente');
  end if;

  if m.estado <> 'pendiente' then raise exception 'Esta línea ya está resuelta; deshazla primero' using errcode = '22023'; end if;

  if p_accion = 'vincular' then
    -- Una línea puede cubrir uno o varios registros: p_datos.items = [{tipo, id}, ...] (o tipo/id sueltos, como antes)
    v_items := coalesce(p_datos->'items', jsonb_build_array(jsonb_build_object('tipo', p_datos->>'tipo', 'id', p_datos->>'id')));
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then raise exception 'Elige al menos un registro' using errcode = '22023'; end if;
    for v_it in select value from jsonb_array_elements(v_items) loop
      v_tipo := v_it->>'tipo'; v_id := (v_it->>'id')::uuid;
      if v_tipo = 'pago' then
        if not exists (select 1 from public.cxp_pagos where id = v_id and id_empresa = m.id_empresa) then raise exception 'Pago no válido' using errcode = '22023'; end if;
      elsif v_tipo = 'compra' then
        if not exists (select 1 from public.compras where id = v_id and id_empresa = m.id_empresa) then raise exception 'Gasto no válido' using errcode = '22023'; end if;
      else raise exception 'Tipo de vínculo no válido' using errcode = '22023'; end if;
      if exists (select 1 from public.movimientos_vinculos where tipo = v_tipo and id_vinculo = v_id and id_movimiento <> m.id) then
        raise exception 'Uno de esos registros ya está vinculado a otra línea' using errcode = '22023';
      end if;
      insert into public.movimientos_vinculos (id_empresa, id_movimiento, tipo, id_vinculo) values (m.id_empresa, m.id, v_tipo, v_id)
      on conflict (tipo, id_vinculo) do nothing;
      if v_pid is null then v_pid := v_id; v_ptipo := v_tipo; end if;
    end loop;
    v_id := v_pid;
    update public.movimientos_bancarios set estado = 'conciliado', vinculo_tipo = v_ptipo, vinculo_id = v_pid,
      resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;

  elsif p_accion = 'crear_gasto' then
    if m.monto >= 0 then raise exception 'Solo los cargos pueden convertirse en gasto' using errcode = '22023'; end if;
    v_cat := (p_datos->>'id_categoria_gasto')::uuid;
    v_desc := left(coalesce(nullif(trim(p_datos->>'descripcion'),''), m.descripcion), 300);
    insert into public.compras (id_empresa, fecha_compra, origen, descripcion, id_categoria_gasto, total_compra, total_factura, moneda,
      condicion_pago, id_cuenta_pago, monto_pagado, estado_pago, estado, observaciones_factura, creado_por)
    values (m.id_empresa, m.fecha, 'gasto', v_desc, v_cat, abs(m.monto), abs(m.monto), v_cta.moneda, 'contado', v_cta.id,
      case when v_cta.tipo = 'reembolsable' then 0 else abs(m.monto) end,
      case when v_cta.tipo = 'reembolsable' then 'pendiente' else 'pagado' end, 'Registrado', 'Creado desde conciliación', auth.uid())
    returning id into v_id;
    insert into public.movimientos_vinculos (id_empresa, id_movimiento, tipo, id_vinculo) values (m.id_empresa, m.id, 'compra', v_id);
    update public.movimientos_bancarios set estado = 'conciliado', vinculo_tipo = 'compra', vinculo_id = v_id,
      resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;

  elsif p_accion = 'interna' then
    if (p_datos->>'id_cuenta_otra') is not null then
      select * into v_otra from public.cuentas_financieras where id = (p_datos->>'id_cuenta_otra')::uuid and id_empresa = m.id_empresa;
      if not found or v_otra.id = v_cta.id then raise exception 'Cuenta no válida' using errcode = '22023'; end if;
      insert into public.transferencias_cuentas (id_empresa, id_cuenta_origen, id_cuenta_destino, monto, fecha, nota, creado_por)
      values (m.id_empresa, case when m.monto < 0 then v_cta.id else v_otra.id end, case when m.monto < 0 then v_otra.id else v_cta.id end,
              abs(m.monto), m.fecha, left(m.descripcion, 200), auth.uid())
      returning id into v_id;
    end if;
    update public.movimientos_bancarios set estado = 'interna', vinculo_tipo = case when v_id is null then null else 'transferencia' end,
      vinculo_id = v_id, resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;

  elsif p_accion = 'ingreso' then
    if m.monto <= 0 then raise exception 'Solo los abonos son ingresos' using errcode = '22023'; end if;
    if coalesce(m.comision, 0) > 0 then
      select id into v_cat from public.categorias_gasto where id_empresa is null and nombre = 'Comisiones medios de pago';
      insert into public.compras (id_empresa, fecha_compra, origen, descripcion, id_categoria_gasto, total_compra, total_factura, moneda,
        condicion_pago, id_cuenta_pago, monto_pagado, estado_pago, estado, referencia_externa, observaciones_factura, creado_por)
      values (m.id_empresa, m.fecha, 'gasto', 'Comisión ' || v_cta.nombre || ' · venta ' || coalesce(m.referencia, ''), v_cat, m.comision, m.comision,
        v_cta.moneda, 'contado', v_cta.id, m.comision, 'pagado', 'Registrado', left('com-' || coalesce(m.referencia, m.id::text), 60),
        'Creado desde conciliación', auth.uid())
      returning id into v_com;
    end if;
    update public.movimientos_bancarios set estado = 'ingreso', id_gasto_comision = v_com, resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;

  elsif p_accion = 'no_corresponde' then
    update public.movimientos_bancarios set estado = 'no_corresponde', resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;
  else
    raise exception 'Acción no válida' using errcode = '22023';
  end if;

  -- Aprender el comercio
  if coalesce((p_datos->>'recordar')::boolean, false) and p_accion in ('crear_gasto','no_corresponde','interna') then
    v_pat := public._patron_comercio(m.descripcion);
    if char_length(v_pat) >= 2 then
      insert into public.reglas_comercio (id_empresa, patron, accion, id_categoria_gasto)
      values (m.id_empresa, v_pat, case p_accion when 'crear_gasto' then 'empresa' else p_accion end, (p_datos->>'id_categoria_gasto')::uuid)
      on conflict (id_empresa, patron) do update set accion = excluded.accion, id_categoria_gasto = excluded.id_categoria_gasto,
        usos = public.reglas_comercio.usos + 1;
    end if;
  end if;
  return jsonb_build_object('estado', (select estado from public.movimientos_bancarios where id = m.id), 'id', v_id);
end $$;

-- 4) anular_gasto: también libera líneas vinculadas a varios registros
create or replace function public.anular_gasto(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.compras where id = p_id for update;
  if not found or auth.uid() is null or not public.es_admin_de_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if c.estado_pago = 'anulado' then return; end if;
  if exists (select 1 from public.cxp_pagos_aplicaciones where id_compra = c.id) then
    raise exception 'Este gasto tiene pagos registrados; anula primero el pago en “Por pagar”' using errcode = '22023';
  end if;
  update public.compras set estado_pago = 'anulado', monto_pagado = 0,
    observaciones_factura = left(concat_ws(' · ', observaciones_factura, 'Anulado' || coalesce(': ' || nullif(trim(p_motivo),''), '')), 500)
   where id = c.id;
  -- Las líneas de cartola que cubrían este gasto vuelven a "por revisar" (con todos sus vínculos)
  with lineas as (
    select id_movimiento as id from public.movimientos_vinculos where tipo = 'compra' and id_vinculo = c.id
    union select id from public.movimientos_bancarios where vinculo_tipo = 'compra' and vinculo_id = c.id),
  borra as (delete from public.movimientos_vinculos where id_movimiento in (select id from lineas))
  update public.movimientos_bancarios set estado = 'pendiente', vinculo_tipo = null, vinculo_id = null, resuelto_por = null, resuelto_at = null
   where id in (select id from lineas);
end $$;


notify pgrst, 'reload schema';
