-- ============================================================
-- Compras · Monedas extranjeras y anular gastos
-- Solo agrega columnas y reemplaza/agrega funciones.
--   compras.moneda           → sigue siendo la moneda en que se paga (CLP)
--   compras.moneda_original  → moneda de la compra si fue otra (USD, EUR…)
--   compras.monto_original   → monto en esa moneda (USD 60)
--   compras.tasa_cambio      → ya existía: CLP por 1 unidad (dólar observado del día)
-- ============================================================
alter table public.compras
  add column if not exists moneda_original text,
  add column if not exists monto_original  numeric;

-- registrar_gasto: si viene moneda_original distinta de la de la cuenta,
-- el monto en pesos = monto_original × tasa_cambio (redondeado, sin decimales en CLP)
create or replace function public.registrar_gasto(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := (p->>'id_empresa')::uuid;
  v_monto numeric; v_mon text; v_cta record; v_cond text; v_dias int; v_fecha date; v_id uuid; v_estado text; v_pagado numeric;
  v_mon_orig text; v_monto_orig numeric; v_tasa numeric;
begin
  if auth.uid() is null or v_emp is null or not public.tiene_acceso_a_empresa(v_emp) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_compras(v_emp) then raise exception 'El módulo Compras no está activo' using errcode = '42501'; end if;
  if nullif(trim(p->>'descripcion'),'') is null then raise exception 'Indica qué se compró' using errcode = '22023'; end if;
  v_fecha := coalesce((p->>'fecha')::date, current_date);
  v_cond := coalesce(nullif(p->>'condicion_pago',''), 'contado');
  v_dias := greatest(coalesce((p->>'dias_credito')::int, 0), 0);
  if (p->>'id_proveedor') is not null and not exists (select 1 from public.proveedores where id = (p->>'id_proveedor')::uuid and id_empresa = v_emp) then
    raise exception 'Proveedor no válido' using errcode = '22023';
  end if;
  if (p->>'id_categoria_gasto') is not null and not exists (select 1 from public.categorias_gasto where id = (p->>'id_categoria_gasto')::uuid and (id_empresa is null or id_empresa = v_emp)) then
    raise exception 'Categoría no válida' using errcode = '22023';
  end if;
  if (p->>'id_cuenta_pago') is not null then
    select * into v_cta from public.cuentas_financieras where id = (p->>'id_cuenta_pago')::uuid and id_empresa = v_emp and activo;
    if not found then raise exception 'Cuenta no válida' using errcode = '22023'; end if;
  elsif v_cond = 'contado' then
    raise exception 'Indica con qué cuenta se pagó' using errcode = '22023';
  end if;

  v_mon := upper(left(coalesce(nullif(trim(p->>'moneda'),''), v_cta.moneda, 'CLP'), 6));
  v_mon_orig := upper(left(nullif(trim(p->>'moneda_original'),''), 6));
  if v_mon_orig is not null and v_mon_orig <> v_mon then
    v_monto_orig := (p->>'monto_original')::numeric;
    v_tasa := (p->>'tasa_cambio')::numeric;
    if coalesce(v_monto_orig, 0) <= 0 then raise exception 'Indica el monto en %', v_mon_orig using errcode = '22023'; end if;
    if coalesce(v_tasa, 0) <= 0 then raise exception 'Indica el tipo de cambio de % a %', v_mon_orig, v_mon using errcode = '22023'; end if;
    v_monto := round(v_monto_orig * v_tasa, public._decimales(v_mon));
  else
    v_mon_orig := null; v_tasa := null;
    v_monto := round(coalesce((p->>'monto')::numeric, 0), public._decimales(v_mon));
  end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor que cero' using errcode = '22023'; end if;

  if v_cond = 'credito' or v_cta.tipo = 'reembolsable' then v_estado := 'pendiente'; v_pagado := 0;
  else v_estado := 'pagado'; v_pagado := v_monto; end if;

  insert into public.compras (id_empresa, id_proveedor, fecha_compra, origen, descripcion, id_categoria_gasto, tipo_documento,
    numero_factura, total_compra, total_factura, monto_neto, monto_iva, moneda, tasa_cambio, moneda_original, monto_original,
    condicion_pago, dias_credito, fecha_vencimiento, id_cuenta_pago, monto_pagado, estado_pago, estado, referencia_externa,
    nombre_persona, url_foto_factura, observaciones_factura, creado_por)
  values (v_emp, (p->>'id_proveedor')::uuid, v_fecha, 'gasto', left(trim(p->>'descripcion'), 300), (p->>'id_categoria_gasto')::uuid,
    nullif(p->>'tipo_documento',''), nullif(p->>'numero_documento',''), v_monto, v_monto,
    (p->>'monto_neto')::numeric, (p->>'monto_iva')::numeric, v_mon, v_tasa, v_mon_orig, v_monto_orig,
    v_cond, v_dias, case when v_cond = 'credito' then v_fecha + v_dias end, v_cta.id, v_pagado, v_estado, 'Registrado',
    left(nullif(p->>'referencia_externa',''), 60), left(nullif(p->>'nombre_persona',''), 120), nullif(p->>'url_foto',''),
    left(nullif(p->>'nota',''), 500), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'estado_pago', v_estado, 'monto', v_monto);
end $$;

-- Anular un gasto (solo administradores). No se puede si ya tiene pagos:
-- primero se anula el pago. Si estaba vinculado a una línea de cartola, la línea vuelve a "por revisar".
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
  update public.movimientos_bancarios set estado = 'pendiente', vinculo_tipo = null, vinculo_id = null, resuelto_por = null, resuelto_at = null
   where vinculo_tipo = 'compra' and vinculo_id = c.id;
end $$;

revoke all on function public.anular_gasto(uuid, text) from public, anon;
grant execute on function public.anular_gasto(uuid, text) to authenticated;
