-- ============================================================
-- Tesorería · Fase 2: Conciliación
-- Solo AGREGA tablas y funciones.
--   importaciones_cartola  → cada archivo subido (cartola, EECC, MP)
--   movimientos_bancarios  → cada línea, con su estado y a qué quedó vinculada
--   reglas_comercio        → lo que Buddy aprende ("BLUE EXPRESS" = despachos)
-- ============================================================

create table if not exists public.importaciones_cartola (
  id             uuid primary key default gen_random_uuid(),
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  id_cuenta      uuid not null references public.cuentas_financieras(id) on delete cascade,
  nombre_archivo text,
  formato        text,
  periodo_desde  date,
  periodo_hasta  date,
  filas          int not null default 0,
  nuevas         int not null default 0,
  creado_por     uuid,
  created_at     timestamptz not null default now()
);

create table if not exists public.movimientos_bancarios (
  id             uuid primary key default gen_random_uuid(),
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  id_cuenta      uuid not null references public.cuentas_financieras(id) on delete cascade,
  id_importacion uuid references public.importaciones_cartola(id) on delete cascade,
  fecha          date not null,
  descripcion    text not null,
  monto          numeric not null,           -- negativo = cargo / salida, positivo = abono / entrada
  monto_bruto    numeric,                    -- MP: lo que pagó el cliente
  comision       numeric,                    -- MP: lo que cobró la plataforma
  saldo          numeric,
  referencia     text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','conciliado','no_corresponde','interna','ingreso')),
  vinculo_tipo   text check (vinculo_tipo in ('pago','compra','transferencia','venta','cobro')),
  vinculo_id     uuid,
  id_gasto_comision uuid,
  nota           text,
  resuelto_por   uuid,
  resuelto_at    timestamptz,
  hash_linea     text not null,
  created_at     timestamptz not null default now(),
  unique (id_cuenta, hash_linea)
);
create index if not exists movban_emp_idx on public.movimientos_bancarios(id_empresa, id_cuenta, fecha);
create index if not exists movban_vinculo_idx on public.movimientos_bancarios(vinculo_tipo, vinculo_id);

create table if not exists public.reglas_comercio (
  id                 uuid primary key default gen_random_uuid(),
  id_empresa         uuid not null references public.empresas(id) on delete cascade,
  patron             text not null check (char_length(patron) between 2 and 60),
  accion             text not null check (accion in ('empresa','no_corresponde','interna')),
  id_categoria_gasto uuid references public.categorias_gasto(id) on delete set null,
  usos               int not null default 1,
  created_at         timestamptz not null default now(),
  unique (id_empresa, patron)
);

alter table public.importaciones_cartola enable row level security;
alter table public.movimientos_bancarios enable row level security;
alter table public.reglas_comercio enable row level security;
drop policy if exists lectura on public.importaciones_cartola;
drop policy if exists lectura on public.movimientos_bancarios;
drop policy if exists acceso on public.reglas_comercio;
drop policy if exists suscripcion on public.movimientos_bancarios;
-- Lectura directa; las escrituras van por las funciones de abajo
create policy lectura on public.importaciones_cartola for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy lectura on public.movimientos_bancarios for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.movimientos_bancarios as restrictive for all
  using (public._modulo_tesoreria(id_empresa)) with check (public._modulo_tesoreria(id_empresa));
create policy acceso on public.reglas_comercio for all
  using (public.tiene_acceso_a_empresa(id_empresa)) with check (public.tiene_acceso_a_empresa(id_empresa));

-- Patrón de comercio: primeras palabras útiles de la descripción, sin números ni códigos
create or replace function public._patron_comercio(p text)
returns text language sql immutable set search_path = public as $$
  select left(trim(regexp_replace(regexp_replace(upper(coalesce(p,'')),
           '^(APP-)?TRASPASO (A|DE):\s*', ''), '[^A-ZÑ ]+', ' ', 'g')), 22);
$$;

-- ------------------------------------------------------------
-- Importar líneas. p_filas: [{fecha, descripcion, monto, monto_bruto?, comision?, saldo?, referencia?}]
-- Las líneas repetidas (misma cuenta + mismo contenido) se ignoran.
-- ------------------------------------------------------------
create or replace function public.importar_movimientos(
  p_id_cuenta uuid, p_archivo text, p_formato text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cta record; v_imp uuid; f jsonb; v_n int := 0; v_nuevas int := 0; v_h text; v_rep jsonb := '{}'::jsonb; v_k text; v_i int;
        v_desde date; v_hasta date;
begin
  select * into v_cta from public.cuentas_financieras where id = p_id_cuenta;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(v_cta.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_tesoreria(v_cta.id_empresa) then raise exception 'Tesorería no está activa' using errcode = '42501'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no trae movimientos' using errcode = '22023'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Máximo 5.000 movimientos por archivo' using errcode = '22023'; end if;

  insert into public.importaciones_cartola (id_empresa, id_cuenta, nombre_archivo, formato, creado_por)
  values (v_cta.id_empresa, v_cta.id, left(p_archivo, 120), left(p_formato, 30), auth.uid()) returning id into v_imp;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    if (f->>'fecha') is null or (f->>'monto') is null or (f->>'monto')::numeric = 0 then continue; end if;
    -- dos líneas idénticas el mismo día son movimientos distintos: se numeran
    v_k := (f->>'fecha') || '|' || (f->>'monto') || '|' || upper(trim(coalesce(f->>'descripcion',''))) || '|' || coalesce(f->>'referencia','');
    v_i := coalesce((v_rep->>v_k)::int, 0) + 1;
    v_rep := v_rep || jsonb_build_object(v_k, v_i);
    v_h := md5(v_k || '|' || v_i);
    insert into public.movimientos_bancarios (id_empresa, id_cuenta, id_importacion, fecha, descripcion, monto, monto_bruto, comision, saldo, referencia, hash_linea)
    values (v_cta.id_empresa, v_cta.id, v_imp, (f->>'fecha')::date, left(coalesce(nullif(trim(f->>'descripcion'),''),'(sin detalle)'), 200),
            round((f->>'monto')::numeric, public._decimales(v_cta.moneda)), (f->>'monto_bruto')::numeric, (f->>'comision')::numeric,
            (f->>'saldo')::numeric, left(f->>'referencia', 60), v_h)
    on conflict (id_cuenta, hash_linea) do nothing;
    get diagnostics v_i = row_count;
    if v_i > 0 then v_nuevas := v_nuevas + 1; end if;
    v_desde := least(coalesce(v_desde, (f->>'fecha')::date), (f->>'fecha')::date);
    v_hasta := greatest(coalesce(v_hasta, (f->>'fecha')::date), (f->>'fecha')::date);
  end loop;
  if v_nuevas = 0 then
    delete from public.importaciones_cartola where id = v_imp; v_imp := null;
  else
    update public.importaciones_cartola set filas = v_n, nuevas = v_nuevas, periodo_desde = v_desde, periodo_hasta = v_hasta where id = v_imp;
  end if;
  return jsonb_build_object('id_importacion', v_imp, 'filas', v_n, 'nuevas', v_nuevas, 'repetidas', v_n - v_nuevas);
end $$;

-- ------------------------------------------------------------
-- Resolver una línea.
--   vincular   → p_datos {tipo: 'pago'|'compra', id}
--   crear_gasto→ p_datos {descripcion?, id_categoria_gasto?, recordar?}
--                cargo en cuenta de la empresa = gasto pagado; en cuenta reembolsable = pendiente de reembolso
--   interna    → p_datos {id_cuenta_otra?}  (crea la transferencia entre cuentas si se indica)
--   ingreso    → abono de una venta; si trae comisión (MP) registra el gasto de comisión
--   no_corresponde / deshacer
-- ------------------------------------------------------------
create or replace function public.resolver_movimiento(p_id uuid, p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; v_cta record; v_id uuid; v_cat uuid; v_pat text; v_otra record; v_com uuid; v_desc text;
begin
  select * into m from public.movimientos_bancarios where id = p_id for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(m.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_cta from public.cuentas_financieras where id = m.id_cuenta;
  p_datos := coalesce(p_datos, '{}'::jsonb);

  if p_accion = 'deshacer' then
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
    v_id := (p_datos->>'id')::uuid;
    if p_datos->>'tipo' = 'pago' then
      if not exists (select 1 from public.cxp_pagos where id = v_id and id_empresa = m.id_empresa) then raise exception 'Pago no válido' using errcode = '22023'; end if;
    elsif p_datos->>'tipo' = 'compra' then
      if not exists (select 1 from public.compras where id = v_id and id_empresa = m.id_empresa) then raise exception 'Gasto no válido' using errcode = '22023'; end if;
    else raise exception 'Tipo de vínculo no válido' using errcode = '22023'; end if;
    if exists (select 1 from public.movimientos_bancarios where vinculo_tipo = p_datos->>'tipo' and vinculo_id = v_id and id <> m.id) then
      raise exception 'Ese registro ya está vinculado a otra línea' using errcode = '22023';
    end if;
    update public.movimientos_bancarios set estado = 'conciliado', vinculo_tipo = p_datos->>'tipo', vinculo_id = v_id,
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

-- Borrar una importación completa (solo líneas aún pendientes; lo ya resuelto se mantiene)
create or replace function public.borrar_importacion_cartola(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record; v_n int;
begin
  select * into v from public.importaciones_cartola where id = p_id;
  if not found or auth.uid() is null or not public.es_admin_de_empresa(v.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  delete from public.movimientos_bancarios where id_importacion = p_id and estado = 'pendiente';
  get diagnostics v_n = row_count;
  if not exists (select 1 from public.movimientos_bancarios where id_importacion = p_id) then delete from public.importaciones_cartola where id = p_id; end if;
  return jsonb_build_object('borradas', v_n);
end $$;

revoke all on function public.importar_movimientos(uuid,text,text,jsonb), public.resolver_movimiento(uuid,text,jsonb),
  public.borrar_importacion_cartola(uuid), public._patron_comercio(text) from public, anon;
grant execute on function public.importar_movimientos(uuid,text,text,jsonb), public.resolver_movimiento(uuid,text,jsonb),
  public.borrar_importacion_cartola(uuid), public._patron_comercio(text) to authenticated;
