-- ============================================================
-- Conciliación: tipo de ingreso y nota en cada línea resuelta
-- tipo_ingreso: venta | aporte_capital | prestamo_recibido | devolucion_proveedor | devolucion_impuestos | intereses | reintegro | otro
-- ============================================================
alter table public.movimientos_bancarios add column if not exists tipo_ingreso text;
alter table public.movimientos_bancarios add column if not exists nota text;
update public.movimientos_bancarios set tipo_ingreso = 'venta' where estado = 'ingreso' and tipo_ingreso is null;

create or replace function public.resolver_movimiento(p_id uuid, p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; v_cta record; v_id uuid; v_cat uuid; v_pat text; v_otra record; v_com uuid; v_desc text;
  v_items jsonb; v_it jsonb; v_tipo text; v_ptipo text; v_pid uuid; v_pagar jsonb := '[]'::jsonb; v_c record; v_res jsonb; v_cat2 uuid;
begin
  select * into m from public.movimientos_bancarios where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(m.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_cta from public.cuentas_financieras where id = m.id_cuenta;
  p_datos := coalesce(p_datos, '{}'::jsonb);

  if p_accion = 'deshacer' then
    -- Los pagos que se registraron desde esta línea se anulan (los gastos vuelven a quedar por pagar)
    for v_it in select to_jsonb(p) from public.cxp_pagos p join public.movimientos_vinculos v on v.tipo = 'pago' and v.id_vinculo = p.id
                 where v.id_movimiento = m.id and p.referencia = 'Pago desde conciliación' loop
      delete from public.movimientos_vinculos where tipo = 'pago' and id_vinculo = (v_it->>'id')::uuid;
      perform public.anular_pago_compras((v_it->>'id')::uuid);
    end loop;
    -- Gastos creados desde esta línea (al crear o al explicar una diferencia): se borran con ella
    if (p_datos->>'borrar_gasto')::boolean then
      v_items := coalesce((select jsonb_agg(v.id_vinculo) from public.movimientos_vinculos v join public.compras c on c.id = v.id_vinculo
                  where v.id_movimiento = m.id and v.tipo = 'compra' and c.observaciones_factura = 'Creado desde conciliación'), '[]'::jsonb);
      if m.vinculo_tipo = 'compra' then v_items := v_items || jsonb_build_array(m.vinculo_id); end if;
    end if;
    delete from public.movimientos_vinculos where id_movimiento = m.id;
    if (p_datos->>'borrar_gasto')::boolean then
      delete from public.compras c where c.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_items) x) and c.id_empresa = m.id_empresa and c.origen = 'gasto'
        and c.observaciones_factura = 'Creado desde conciliación'
        and not exists (select 1 from public.cxp_pagos_aplicaciones a where a.id_compra = c.id);
    end if;
    if m.vinculo_tipo = 'transferencia' then delete from public.transferencias_cuentas where id = m.vinculo_id and id_empresa = m.id_empresa; end if;
    if m.id_gasto_comision is not null then delete from public.compras where id = m.id_gasto_comision and id_empresa = m.id_empresa; end if;
    update public.movimientos_bancarios set estado = 'pendiente', vinculo_tipo = null, vinculo_id = null, id_gasto_comision = null,
      resuelto_por = null, resuelto_at = null, tipo_ingreso = null, nota = null where id = m.id;
    return jsonb_build_object('estado', 'pendiente');
  end if;

  if m.estado <> 'pendiente' then raise exception 'Esta línea ya está resuelta; deshazla primero' using errcode = '22023'; end if;

  if p_accion = 'vincular' then
    -- Una línea puede cubrir uno o varios registros: p_datos.items = [{tipo, id}, ...] (o tipo/id sueltos, como antes)
    v_items := coalesce(p_datos->'items', case when p_datos ? 'id' then jsonb_build_array(jsonb_build_object('tipo', p_datos->>'tipo', 'id', p_datos->>'id')) else '[]'::jsonb end);
    -- Gastos nuevos para explicar la diferencia: p_datos.nuevos = [{descripcion, monto, id_categoria_gasto}]
    if jsonb_typeof(p_datos->'nuevos') = 'array' and jsonb_array_length(p_datos->'nuevos') > 0 then
      if m.monto >= 0 then raise exception 'Solo los cargos pueden explicarse con gastos' using errcode = '22023'; end if;
      for v_it in select value from jsonb_array_elements(p_datos->'nuevos') loop
        if coalesce((v_it->>'monto')::numeric, 0) <= 0 or nullif(trim(v_it->>'descripcion'), '') is null then
          raise exception 'Cada gasto nuevo necesita descripción y monto' using errcode = '22023'; end if;
        v_cat2 := nullif(v_it->>'id_categoria_gasto', '')::uuid;
        insert into public.compras (id_empresa, fecha_compra, origen, descripcion, id_categoria_gasto, total_compra, total_factura, moneda,
          condicion_pago, id_cuenta_pago, monto_pagado, estado_pago, estado, observaciones_factura, creado_por, id_sucursal)
        values (m.id_empresa, m.fecha, 'gasto', left(trim(v_it->>'descripcion'), 300), v_cat2, round((v_it->>'monto')::numeric), round((v_it->>'monto')::numeric),
          v_cta.moneda, 'contado', v_cta.id,
          case when v_cta.tipo = 'reembolsable' then 0 else round((v_it->>'monto')::numeric) end,
          case when v_cta.tipo = 'reembolsable' then 'pendiente' else 'pagado' end, 'Registrado', 'Creado desde conciliación', auth.uid(), public._sucursal_unica(m.id_empresa))
        returning id into v_id;
        v_items := v_items || jsonb_build_array(jsonb_build_object('tipo', 'compra', 'id', v_id));
      end loop;
    end if;
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then raise exception 'Elige al menos un registro' using errcode = '22023'; end if;
    for v_it in select value from jsonb_array_elements(v_items) loop
      v_tipo := v_it->>'tipo'; v_id := (v_it->>'id')::uuid;
      if v_tipo = 'pago' then
        if not exists (select 1 from public.cxp_pagos where id = v_id and id_empresa = m.id_empresa) then raise exception 'Pago no válido' using errcode = '22023'; end if;
      elsif v_tipo = 'compra' then
        select c.*, cf.tipo as tipo_cuenta into v_c from public.compras c left join public.cuentas_financieras cf on cf.id = c.id_cuenta_pago where c.id = v_id and c.id_empresa = m.id_empresa;
        if not found then raise exception 'Gasto no válido' using errcode = '22023'; end if;
        -- Gasto aún por pagar (lo adelantó una persona o es a crédito) y esta línea es un cargo de otra cuenta:
        -- esta línea ES su pago → se registra el pago y se vincula el pago, no el gasto.
        if m.monto < 0 and v_c.estado_pago in ('pendiente', 'parcial') and v_c.id_cuenta_pago is distinct from m.id_cuenta then
          v_pagar := v_pagar || jsonb_build_array(jsonb_build_object('id_compra', v_id));
          continue;
        end if;
      else raise exception 'Tipo de vínculo no válido' using errcode = '22023'; end if;
      if exists (select 1 from public.movimientos_vinculos where tipo = v_tipo and id_vinculo = v_id and id_movimiento <> m.id) then
        raise exception 'Uno de esos registros ya está vinculado a otra línea' using errcode = '22023';
      end if;
      insert into public.movimientos_vinculos (id_empresa, id_movimiento, tipo, id_vinculo) values (m.id_empresa, m.id, v_tipo, v_id)
      on conflict (tipo, id_vinculo) do nothing;
      if v_pid is null then v_pid := v_id; v_ptipo := v_tipo; end if;
    end loop;
    if jsonb_array_length(v_pagar) > 0 then
      v_res := public.registrar_pago_compras(m.id_empresa, m.id_cuenta, 'transferencia', m.fecha, v_pagar, 'Pago desde conciliación', left(m.descripcion, 200));
      v_id := (v_res->>'id_pago')::uuid;
      insert into public.movimientos_vinculos (id_empresa, id_movimiento, tipo, id_vinculo) values (m.id_empresa, m.id, 'pago', v_id);
      if v_pid is null then v_pid := v_id; v_ptipo := 'pago'; end if;
    end if;
    v_id := v_pid;
    update public.movimientos_bancarios set estado = 'conciliado', vinculo_tipo = v_ptipo, vinculo_id = v_pid,
      resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;

  elsif p_accion = 'crear_gasto' then
    if m.monto >= 0 then raise exception 'Solo los cargos pueden convertirse en gasto' using errcode = '22023'; end if;
    v_cat := (p_datos->>'id_categoria_gasto')::uuid;
    v_desc := left(coalesce(nullif(trim(p_datos->>'descripcion'),''), m.descripcion), 300);
    insert into public.compras (id_empresa, fecha_compra, origen, descripcion, id_categoria_gasto, total_compra, total_factura, moneda,
      condicion_pago, id_cuenta_pago, monto_pagado, estado_pago, estado, observaciones_factura, creado_por, id_sucursal)
    values (m.id_empresa, m.fecha, 'gasto', v_desc, v_cat, abs(m.monto), abs(m.monto), v_cta.moneda, 'contado', v_cta.id,
      case when v_cta.tipo = 'reembolsable' then 0 else abs(m.monto) end,
      case when v_cta.tipo = 'reembolsable' then 'pendiente' else 'pagado' end, 'Registrado', 'Creado desde conciliación', auth.uid(), public._sucursal_unica(m.id_empresa))
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
    update public.movimientos_bancarios set estado = 'ingreso', id_gasto_comision = v_com, resuelto_por = auth.uid(), resuelto_at = now(),
      tipo_ingreso = coalesce(nullif(p_datos->>'tipo_ingreso', ''), 'venta') where id = m.id;

  elsif p_accion = 'no_corresponde' then
    update public.movimientos_bancarios set estado = 'no_corresponde', resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;
  else
    raise exception 'Acción no válida' using errcode = '22023';
  end if;

  -- Nota libre para cualquier resolución
  if nullif(trim(p_datos->>'nota'), '') is not null then
    update public.movimientos_bancarios set nota = left(trim(p_datos->>'nota'), 300) where id = m.id;
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

notify pgrst, 'reload schema';
