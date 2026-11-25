-- ============================================================
-- Compras · títulos de cartolas, referencia de rendición/lote, editar gastos con historial
-- Agrega 2 columnas, 1 tabla y 3 funciones. No borra datos.
-- ============================================================

-- 1) Título editable para cada archivo importado ("Cartola julio 2026 · Banco Chile")
alter table public.importaciones_cartola add column if not exists titulo text;

create or replace function public.renombrar_importacion(p_id uuid, p_titulo text)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select * into v from public.importaciones_cartola where id = p_id;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(v.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.importaciones_cartola set titulo = left(nullif(trim(p_titulo), ''), 120) where id = p_id;
end $$;

-- 2) Referencia de rendición / lote de reembolso en cada gasto (como en los pagos)
alter table public.compras add column if not exists referencia_lote text;

-- 2a) Desde la nota "Rendición #260210-02" que quedó al importar
update public.compras set referencia_lote = substring(observaciones_factura from 'Rendición #[0-9]+-[0-9]+(?:-[0-9]+)?(?: Parte [0-9]+)?')
 where referencia_lote is null and observaciones_factura ~ 'Rendición #[0-9]';

-- 2b) Gastos ya pagados: toman la referencia del pago que los cubrió (sin la fecha entre paréntesis)
update public.compras c set referencia_lote = x.ref
  from (select distinct on (a.id_compra) a.id_compra, trim(regexp_replace(p.referencia, '\s*\(\d{4}-\d{2}-\d{2}\)\s*$', '')) as ref
          from public.cxp_pagos_aplicaciones a join public.cxp_pagos p on p.id = a.id_pago
         where nullif(trim(p.referencia), '') is not null
         order by a.id_compra, p.fecha) x
 where c.id = x.id_compra and c.referencia_lote is null;

-- 3) Historial de cambios de cada gasto (quién, cuándo, qué cambió)
create table if not exists public.compras_historial (
  id         uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  id_compra  uuid not null references public.compras(id) on delete cascade,
  accion     text not null,                      -- editado | anulado
  cambios    jsonb not null default '{}'::jsonb, -- {campo: [antes, después]}
  usuario    uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists compras_hist_idx on public.compras_historial(id_compra, created_at);
alter table public.compras_historial enable row level security;
drop policy if exists lectura on public.compras_historial;
create policy lectura on public.compras_historial for select using (public.tiene_acceso_a_empresa(id_empresa));

-- 4) Editar un gasto. Monto, moneda y cuenta solo si aún no tiene pagos registrados.
create or replace function public.editar_gasto(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.compras%rowtype; v_cta record; v_cambios jsonb := '{}'::jsonb; v_monto numeric; v_cuenta uuid; v_estado text; v_pagado numeric;
  k text; v_antes text; v_despues text;
begin
  select * into c from public.compras where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if c.estado_pago = 'anulado' then raise exception 'El gasto está anulado' using errcode = '22023'; end if;
  if p ? 'descripcion' and nullif(trim(p->>'descripcion'), '') is null then raise exception 'La descripción no puede quedar vacía' using errcode = '22023'; end if;
  if (p->>'id_categoria_gasto') is not null and not exists (select 1 from public.categorias_gasto where id = (p->>'id_categoria_gasto')::uuid and (id_empresa is null or id_empresa = c.id_empresa)) then
    raise exception 'Categoría no válida' using errcode = '22023'; end if;
  if (p->>'id_proveedor') is not null and not exists (select 1 from public.proveedores where id = (p->>'id_proveedor')::uuid and id_empresa = c.id_empresa) then
    raise exception 'Proveedor no válido' using errcode = '22023'; end if;

  -- Campos simples
  foreach k in array array['descripcion','fecha_compra','id_categoria_gasto','id_proveedor','tipo_documento','numero_factura','observaciones_factura','referencia_lote'] loop
    if p ? k then
      execute format('select ($1).%I::text', k) into v_antes using c;
      v_despues := nullif(trim(p->>k), '');
      if v_despues is distinct from v_antes then v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_array(v_antes, v_despues)); end if;
    end if;
  end loop;

  -- Monto / cuenta
  v_monto := coalesce((p->>'monto')::numeric, c.total_compra);
  v_cuenta := case when p ? 'id_cuenta_pago' then nullif(p->>'id_cuenta_pago', '')::uuid else c.id_cuenta_pago end;
  if v_monto is distinct from c.total_compra or v_cuenta is distinct from c.id_cuenta_pago then
    if exists (select 1 from public.cxp_pagos_aplicaciones where id_compra = c.id) then
      raise exception 'Este gasto ya tiene pagos registrados: para cambiar monto o cuenta, anula primero el pago en “Por pagar”' using errcode = '22023';
    end if;
    if v_monto <= 0 then raise exception 'El monto debe ser mayor que cero' using errcode = '22023'; end if;
    if v_cuenta is not null then
      select * into v_cta from public.cuentas_financieras where id = v_cuenta and id_empresa = c.id_empresa;
      if not found then raise exception 'Cuenta no válida' using errcode = '22023'; end if;
    end if;
    v_monto := round(v_monto, public._decimales(c.moneda));
    if c.condicion_pago = 'credito' or v_cuenta is null or v_cta.tipo = 'reembolsable' then v_estado := 'pendiente'; v_pagado := 0;
    else v_estado := 'pagado'; v_pagado := v_monto; end if;
    if v_monto is distinct from c.total_compra then v_cambios := v_cambios || jsonb_build_object('monto', jsonb_build_array(c.total_compra, v_monto)); end if;
    if v_cuenta is distinct from c.id_cuenta_pago then v_cambios := v_cambios || jsonb_build_object('id_cuenta_pago', jsonb_build_array(c.id_cuenta_pago, v_cuenta)); end if;
    update public.compras set total_compra = v_monto, total_factura = v_monto, id_cuenta_pago = v_cuenta, monto_pagado = v_pagado, estado_pago = v_estado,
      moneda_original = case when v_monto is distinct from c.total_compra then null else moneda_original end,
      monto_original  = case when v_monto is distinct from c.total_compra then null else monto_original end
     where id = c.id;
  end if;

  if v_cambios = '{}'::jsonb then return jsonb_build_object('cambios', 0); end if;
  update public.compras set
    descripcion           = case when p ? 'descripcion' then left(trim(p->>'descripcion'), 300) else descripcion end,
    fecha_compra          = case when p ? 'fecha_compra' then (p->>'fecha_compra')::date else fecha_compra end,
    id_categoria_gasto    = case when p ? 'id_categoria_gasto' then nullif(p->>'id_categoria_gasto', '')::uuid else id_categoria_gasto end,
    id_proveedor          = case when p ? 'id_proveedor' then nullif(p->>'id_proveedor', '')::uuid else id_proveedor end,
    tipo_documento        = case when p ? 'tipo_documento' then nullif(p->>'tipo_documento', '') else tipo_documento end,
    numero_factura        = case when p ? 'numero_factura' then nullif(trim(p->>'numero_factura'), '') else numero_factura end,
    observaciones_factura = case when p ? 'observaciones_factura' then left(nullif(trim(p->>'observaciones_factura'), ''), 500) else observaciones_factura end,
    referencia_lote       = case when p ? 'referencia_lote' then left(nullif(trim(p->>'referencia_lote'), ''), 80) else referencia_lote end,
    fecha_vencimiento     = case when p ? 'fecha_compra' and condicion_pago = 'credito' then (p->>'fecha_compra')::date + coalesce(dias_credito, 0) else fecha_vencimiento end
   where id = c.id;
  insert into public.compras_historial (id_empresa, id_compra, accion, cambios) values (c.id_empresa, c.id, 'editado', v_cambios);
  return jsonb_build_object('cambios', (select count(*) from jsonb_object_keys(v_cambios)));
end $$;
revoke all on function public.editar_gasto(uuid, jsonb), public.renombrar_importacion(uuid, text) from public, anon;
grant execute on function public.editar_gasto(uuid, jsonb), public.renombrar_importacion(uuid, text) to authenticated;

-- 5) registrar_gasto ya no cambia; anular_gasto ahora deja constancia en el historial
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
  insert into public.compras_historial (id_empresa, id_compra, accion, cambios)
  values (c.id_empresa, c.id, 'anulado', jsonb_build_object('motivo', nullif(trim(p_motivo), '')));
  -- Las líneas de cartola que cubrían este gasto vuelven a "por revisar" (con todos sus vínculos)
  with lineas as (
    select id_movimiento as id from public.movimientos_vinculos where tipo = 'compra' and id_vinculo = c.id
    union select id from public.movimientos_bancarios where vinculo_tipo = 'compra' and vinculo_id = c.id),
  borra as (delete from public.movimientos_vinculos where id_movimiento in (select id from lineas))
  update public.movimientos_bancarios set estado = 'pendiente', vinculo_tipo = null, vinculo_id = null, resuelto_por = null, resuelto_at = null
   where id in (select id from lineas);
end $$;

notify pgrst, 'reload schema';
