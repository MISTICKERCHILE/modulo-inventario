-- ============================================================
-- Organigrama: razones sociales, sucursales y centros de costo en Compras / Tesorería
-- + reparto de un gasto entre centros de costo (%)
-- Solo agrega tablas y columnas; lo existente queda asignado a su razón social / sucursal principal.
-- ============================================================

-- 1) Razones sociales (RUT) de cada empresa cliente
create table if not exists public.razones_sociales (
  id          uuid primary key default gen_random_uuid(),
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  nombre      text not null,
  rut         text,
  giro        text,
  direccion   text,
  principal   boolean not null default false,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists razones_sociales_principal_uq on public.razones_sociales(id_empresa) where principal;
alter table public.razones_sociales enable row level security;
drop policy if exists lectura on public.razones_sociales;
drop policy if exists admin on public.razones_sociales;
create policy lectura on public.razones_sociales for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy admin on public.razones_sociales for all using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));

-- 2) Sucursal → razón social;  cuenta bancaria / tarjeta / billetera → razón social
alter table public.sucursales          add column if not exists id_razon_social uuid references public.razones_sociales(id) on delete set null;
alter table public.cuentas_financieras add column if not exists id_razon_social uuid references public.razones_sociales(id) on delete set null;

-- 3) Centros de costo (con sub-niveles opcionales)
create table if not exists public.centros_costo (
  id          uuid primary key default gen_random_uuid(),
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  nombre      text not null,
  codigo      text,
  id_padre    uuid references public.centros_costo(id) on delete set null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.centros_costo enable row level security;
drop policy if exists lectura on public.centros_costo;
drop policy if exists admin on public.centros_costo;
create policy lectura on public.centros_costo for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy admin on public.centros_costo for all using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));

-- 4) Cada gasto: sucursal y centro de costo (opcional)
alter table public.compras add column if not exists id_sucursal     uuid references public.sucursales(id) on delete set null;
alter table public.compras add column if not exists id_centro_costo uuid references public.centros_costo(id) on delete set null;
create index if not exists compras_sucursal_idx on public.compras(id_sucursal);
create index if not exists compras_centro_idx on public.compras(id_centro_costo);

-- 5) Reparto de un gasto entre centros de costo / sucursales (ej. arriendo 60% Producción, 40% Administración)
create table if not exists public.compras_distribucion (
  id              uuid primary key default gen_random_uuid(),
  id_empresa      uuid not null references public.empresas(id) on delete cascade,
  id_compra       uuid not null references public.compras(id) on delete cascade,
  id_centro_costo uuid references public.centros_costo(id) on delete cascade,
  id_sucursal     uuid references public.sucursales(id) on delete cascade,
  porcentaje      numeric(6,3) not null check (porcentaje > 0 and porcentaje <= 100),
  monto           numeric not null,
  check (id_centro_costo is not null or id_sucursal is not null)
);
create index if not exists compras_distrib_idx on public.compras_distribucion(id_compra);
alter table public.compras_distribucion enable row level security;
drop policy if exists lectura on public.compras_distribucion;
create policy lectura on public.compras_distribucion for select using (public.tiene_acceso_a_empresa(id_empresa));

-- 6) Datos existentes
-- 6a) Una razón social principal por empresa (su nombre y RUT)
insert into public.razones_sociales (id_empresa, nombre, rut, principal)
select e.id, e.nombre, nullif(trim(e.rut_o_identificacion), ''), true from public.empresas e
 where not exists (select 1 from public.razones_sociales r where r.id_empresa = e.id and r.principal);
-- 6b) Las "empresas asociadas" escritas en sucursales pasan a ser razones sociales
insert into public.razones_sociales (id_empresa, nombre)
select distinct on (s.id_empresa, lower(trim(s.empresa_asociada))) s.id_empresa, trim(s.empresa_asociada)
  from public.sucursales s join public.empresas e on e.id = s.id_empresa
 where nullif(trim(s.empresa_asociada), '') is not null and lower(trim(s.empresa_asociada)) <> lower(trim(e.nombre))
   and not exists (select 1 from public.razones_sociales r where r.id_empresa = s.id_empresa and lower(r.nombre) = lower(trim(s.empresa_asociada)));
update public.sucursales s set id_razon_social = coalesce(
    (select r.id from public.razones_sociales r where r.id_empresa = s.id_empresa and lower(r.nombre) = lower(trim(s.empresa_asociada)) limit 1),
    (select r.id from public.razones_sociales r where r.id_empresa = s.id_empresa and r.principal))
 where s.id_razon_social is null;
-- 6c) Cuentas → razón social principal
update public.cuentas_financieras c set id_razon_social = (select r.id from public.razones_sociales r where r.id_empresa = c.id_empresa and r.principal)
 where c.id_razon_social is null;
-- 6d) Gastos → la sucursal, si la empresa tiene una sola
create or replace function public._sucursal_unica(p_emp uuid) returns uuid language sql stable set search_path = public as $$
  select case when count(*) = 1 then min(id::text)::uuid end from public.sucursales where id_empresa = p_emp
$$;
update public.compras c set id_sucursal = public._sucursal_unica(c.id_empresa) where c.id_sucursal is null;

-- 6e) Toda empresa nueva nace con su razón social principal
create or replace function public._crear_razon_social_principal() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.razones_sociales (id_empresa, nombre, rut, principal) values (new.id, new.nombre, nullif(trim(new.rut_o_identificacion), ''), true)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_razon_social_principal on public.empresas;
create trigger trg_razon_social_principal after insert on public.empresas for each row execute function public._crear_razon_social_principal();

-- 7) Repartir un gasto: p_items = [{"id_centro_costo": "...", "id_sucursal": null, "porcentaje": 60}, ...] (deben sumar 100; [] quita el reparto)
create or replace function public.distribuir_gasto(p_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_it jsonb; v_suma numeric := 0; v_n int; v_i int := 0; v_resto numeric; v_monto numeric; v_total numeric;
begin
  select * into c from public.compras where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  p_items := coalesce(p_items, '[]'::jsonb);
  v_n := jsonb_array_length(p_items);
  delete from public.compras_distribucion where id_compra = c.id;
  if v_n = 0 then
    insert into public.compras_historial (id_empresa, id_compra, accion, cambios) values (c.id_empresa, c.id, 'editado', jsonb_build_object('reparto', 'quitado'));
    return jsonb_build_object('items', 0);
  end if;
  select sum((x->>'porcentaje')::numeric) into v_suma from jsonb_array_elements(p_items) x;
  if round(v_suma, 3) <> 100 then raise exception 'Los porcentajes deben sumar 100%% (suman %)', v_suma using errcode = '22023'; end if;
  v_total := coalesce(c.total_factura, c.total_compra); v_resto := v_total;
  for v_it in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    if nullif(v_it->>'id_centro_costo','') is not null and not exists (select 1 from public.centros_costo where id = (v_it->>'id_centro_costo')::uuid and id_empresa = c.id_empresa) then
      raise exception 'Centro de costo no válido' using errcode = '22023'; end if;
    if nullif(v_it->>'id_sucursal','') is not null and not exists (select 1 from public.sucursales where id = (v_it->>'id_sucursal')::uuid and id_empresa = c.id_empresa) then
      raise exception 'Sucursal no válida' using errcode = '22023'; end if;
    -- el último se lleva el redondeo, para que la suma calce exacto con el gasto
    v_monto := case when v_i = v_n then v_resto else round(v_total * (v_it->>'porcentaje')::numeric / 100, public._decimales(c.moneda)) end;
    v_resto := v_resto - v_monto;
    insert into public.compras_distribucion (id_empresa, id_compra, id_centro_costo, id_sucursal, porcentaje, monto)
    values (c.id_empresa, c.id, nullif(v_it->>'id_centro_costo','')::uuid, nullif(v_it->>'id_sucursal','')::uuid, (v_it->>'porcentaje')::numeric, v_monto);
  end loop;
  insert into public.compras_historial (id_empresa, id_compra, accion, cambios) values (c.id_empresa, c.id, 'editado', jsonb_build_object('reparto', p_items));
  return jsonb_build_object('items', v_n);
end $$;
revoke all on function public.distribuir_gasto(uuid, jsonb) from public, anon;
grant execute on function public.distribuir_gasto(uuid, jsonb) to authenticated;

-- 8) registrar_gasto y editar_gasto aceptan sucursal y centro de costo
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
  if (p->>'id_sucursal') is not null and not exists (select 1 from public.sucursales where id = (p->>'id_sucursal')::uuid and id_empresa = v_emp) then
    raise exception 'Sucursal no válida' using errcode = '22023';
  end if;
  if (p->>'id_centro_costo') is not null and not exists (select 1 from public.centros_costo where id = (p->>'id_centro_costo')::uuid and id_empresa = v_emp) then
    raise exception 'Centro de costo no válido' using errcode = '22023';
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
    nombre_persona, url_foto_factura, observaciones_factura, creado_por, id_sucursal, id_centro_costo, referencia_lote)
  values (v_emp, (p->>'id_proveedor')::uuid, v_fecha, 'gasto', left(trim(p->>'descripcion'), 300), (p->>'id_categoria_gasto')::uuid,
    nullif(p->>'tipo_documento',''), nullif(p->>'numero_documento',''), v_monto, v_monto,
    (p->>'monto_neto')::numeric, (p->>'monto_iva')::numeric, v_mon, v_tasa, v_mon_orig, v_monto_orig,
    v_cond, v_dias, case when v_cond = 'credito' then v_fecha + v_dias end, v_cta.id, v_pagado, v_estado, 'Registrado',
    left(nullif(p->>'referencia_externa',''), 60), left(nullif(p->>'nombre_persona',''), 120), nullif(p->>'url_foto',''),
    left(nullif(p->>'nota',''), 500), auth.uid(),
    coalesce((p->>'id_sucursal')::uuid, public._sucursal_unica(v_emp)), (p->>'id_centro_costo')::uuid, left(nullif(trim(p->>'referencia_lote'),''), 80))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'estado_pago', v_estado, 'monto', v_monto);
end $$;

-- Anular un gasto (solo administradores). No se puede si ya tiene pagos:
-- primero se anula el pago. Si estaba vinculado a una línea de cartola, la línea vuelve a "por revisar".

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
  if nullif(p->>'id_sucursal','') is not null and not exists (select 1 from public.sucursales where id = (p->>'id_sucursal')::uuid and id_empresa = c.id_empresa) then
    raise exception 'Sucursal no válida' using errcode = '22023'; end if;
  if nullif(p->>'id_centro_costo','') is not null and not exists (select 1 from public.centros_costo where id = (p->>'id_centro_costo')::uuid and id_empresa = c.id_empresa) then
    raise exception 'Centro de costo no válido' using errcode = '22023'; end if;
  if (p->>'id_proveedor') is not null and not exists (select 1 from public.proveedores where id = (p->>'id_proveedor')::uuid and id_empresa = c.id_empresa) then
    raise exception 'Proveedor no válido' using errcode = '22023'; end if;

  -- Campos simples
  foreach k in array array['descripcion','fecha_compra','id_categoria_gasto','id_proveedor','tipo_documento','numero_factura','observaciones_factura','referencia_lote','id_sucursal','id_centro_costo'] loop
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
    id_sucursal           = case when p ? 'id_sucursal' then nullif(p->>'id_sucursal', '')::uuid else id_sucursal end,
    id_centro_costo       = case when p ? 'id_centro_costo' then nullif(p->>'id_centro_costo', '')::uuid else id_centro_costo end,
    fecha_vencimiento     = case when p ? 'fecha_compra' and condicion_pago = 'credito' then (p->>'fecha_compra')::date + coalesce(dias_credito, 0) else fecha_vencimiento end
   where id = c.id;
  insert into public.compras_historial (id_empresa, id_compra, accion, cambios) values (c.id_empresa, c.id, 'editado', v_cambios);
  return jsonb_build_object('cambios', (select count(*) from jsonb_object_keys(v_cambios)));
end $$;

notify pgrst, 'reload schema';
