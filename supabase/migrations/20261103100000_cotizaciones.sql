-- ============================================================
-- Cotizaciones: datos de la empresa para documentos, correlativo,
-- cotizaciones con ítems, adjuntos (Storage) y funciones de guardado.
-- ============================================================

-- 1) Datos de la empresa para sus documentos (logo, RUT, dirección...)
alter table public.empresas
  add column if not exists datos_documentos jsonb not null default '{}'::jsonb;

create or replace function public.guardar_datos_documentos(p_id_empresa uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; k text;
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede cambiar los datos de la empresa' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) <> 'object' then raise exception 'Datos no válidos' using errcode = '22023'; end if;
  foreach k in array array['razon_social','rut','giro','direccion','ciudad','telefono','correo','sitio_web',
                           'condiciones','pie','logo','color','iva_pct','validez_dias','moneda'] loop
    if p_datos ? k then v := v || jsonb_build_object(k, p_datos->k); end if;
  end loop;
  if length(coalesce(v->>'logo','')) > 700000 then
    raise exception 'El logo es demasiado pesado' using errcode = '22023';
  end if;
  if coalesce(v->>'logo','') <> '' and (v->>'logo') !~ '^data:image/(png|jpeg|webp);base64,' then
    raise exception 'El logo debe ser una imagen PNG, JPG o WEBP' using errcode = '22023';
  end if;
  update public.empresas set datos_documentos = v where id = p_id_empresa;
end $$;

-- 2) Correlativos por empresa y tipo de documento
create table if not exists public.contadores_documento (
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  tipo       text not null,
  ultimo     bigint not null default 0,
  primary key (id_empresa, tipo)
);
alter table public.contadores_documento enable row level security;   -- solo funciones

-- 3) Cotizaciones
create table if not exists public.cotizaciones (
  id               uuid primary key default gen_random_uuid(),
  id_empresa       uuid not null references public.empresas(id) on delete cascade,
  numero           bigint not null,
  revision         int not null default 1,
  estado           text not null default 'borrador' check (estado in ('borrador','enviada','aceptada','rechazada','convertida')),
  id_cliente       uuid references public.clientes(id) on delete set null,
  cliente_nombre   text not null,
  cliente_documento text,
  cliente_correo   text,
  cliente_telefono text,
  cliente_direccion text,
  titulo           text,
  fecha_emision    date not null default current_date,
  validez_dias     int  not null default 15,
  fecha_vencimiento date not null,
  moneda           text not null default 'CLP',
  descuento_pct    numeric not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100),
  impuesto_pct     numeric not null default 0 check (impuesto_pct >= 0 and impuesto_pct <= 100),
  subtotal         numeric not null default 0,
  descuento        numeric not null default 0,
  impuesto         numeric not null default 0,
  total            numeric not null default 0,
  notas            text,
  condiciones      text,
  id_origen        uuid references public.cotizaciones(id) on delete set null,
  id_venta         uuid references public.ventas(id) on delete set null,
  creado_por       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id_empresa, numero)
);
create index if not exists cotizaciones_empresa_idx on public.cotizaciones(id_empresa, created_at desc);

create table if not exists public.cotizaciones_items (
  id             uuid primary key default gen_random_uuid(),
  id_cotizacion  uuid not null references public.cotizaciones(id) on delete cascade,
  orden          int  not null default 0,
  id_producto    uuid references public.productos(id) on delete set null,
  descripcion    text not null,
  unidad         text,
  cantidad       numeric not null check (cantidad > 0),
  precio_unitario numeric not null default 0 check (precio_unitario >= 0),
  descuento_pct  numeric not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100)
);
create index if not exists cotizaciones_items_idx on public.cotizaciones_items(id_cotizacion, orden);

create table if not exists public.cotizaciones_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  id_cotizacion  uuid not null references public.cotizaciones(id) on delete cascade,
  nombre         text not null,
  ruta           text not null,
  tamano         bigint,
  tipo           text,
  creado_por     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists cotizaciones_adjuntos_idx on public.cotizaciones_adjuntos(id_cotizacion);

alter table public.cotizaciones          enable row level security;
alter table public.cotizaciones_items    enable row level security;
alter table public.cotizaciones_adjuntos enable row level security;

-- Lectura para quien tiene acceso y el módulo Ventas; escritura por funciones
drop policy if exists acceso_lectura on public.cotizaciones;
drop policy if exists acceso_lectura on public.cotizaciones_items;
drop policy if exists acceso_empresa on public.cotizaciones_adjuntos;
drop policy if exists suscripcion    on public.cotizaciones;
drop policy if exists suscripcion    on public.cotizaciones_adjuntos;
create policy acceso_lectura on public.cotizaciones for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy acceso_lectura on public.cotizaciones_items for select using (
  exists (select 1 from public.cotizaciones c where c.id = id_cotizacion and public.tiene_acceso_a_empresa(c.id_empresa)));
create policy acceso_empresa on public.cotizaciones_adjuntos for all
  using (public.tiene_acceso_a_empresa(id_empresa)) with check (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.cotizaciones as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));
create policy suscripcion on public.cotizaciones_adjuntos as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

-- 4) Guardar (crear o editar) una cotización completa en una operación
--    p_datos: cliente_*, titulo, fecha_emision, validez_dias, moneda, descuento_pct, impuesto_pct, notas, condiciones, id_cliente
--    p_items: [{ id_producto, descripcion, unidad, cantidad, precio_unitario, descuento_pct }]
create or replace function public.guardar_cotizacion(
  p_id_empresa uuid, p_id uuid, p_datos jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; it jsonb; v_id uuid := p_id; v_num bigint;
  v_emision date; v_validez int; v_venc date; v_moneda text;
  v_desc_pct numeric; v_imp_pct numeric;
  v_sub numeric := 0; v_linea numeric; v_desc numeric; v_imp numeric; v_total numeric;
  v_dec int; v_orden int := 0; v_cliente uuid; v_nombre text;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  v_nombre := nullif(trim(p_datos->>'cliente_nombre'), '');
  if v_nombre is null then raise exception 'Indica el cliente' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    raise exception 'La cotización necesita entre 1 y 200 ítems' using errcode = '22023';
  end if;

  v_emision := coalesce(nullif(p_datos->>'fecha_emision','')::date, current_date);
  v_validez := greatest(0, least(coalesce(nullif(p_datos->>'validez_dias','')::int, 15), 365));
  v_venc    := v_emision + v_validez;
  v_moneda  := upper(left(coalesce(nullif(trim(p_datos->>'moneda'), ''), 'CLP'), 6));
  v_desc_pct := coalesce(nullif(p_datos->>'descuento_pct','')::numeric, 0);
  v_imp_pct  := coalesce(nullif(p_datos->>'impuesto_pct','')::numeric, 0);
  v_dec := case when v_moneda in ('CLP','COP','PYG','JPY') then 0 else 2 end;

  v_cliente := nullif(p_datos->>'id_cliente','')::uuid;
  if v_cliente is not null and not exists (select 1 from public.clientes where id = v_cliente and id_empresa = p_id_empresa) then
    v_cliente := null;
  end if;

  -- Totales calculados en el servidor
  for it in select * from jsonb_array_elements(p_items) loop
    v_linea := (it->>'cantidad')::numeric * coalesce((it->>'precio_unitario')::numeric, 0)
               * (1 - coalesce((it->>'descuento_pct')::numeric, 0) / 100);
    v_sub := v_sub + v_linea;
  end loop;
  v_sub   := round(v_sub, v_dec);
  v_desc  := round(v_sub * v_desc_pct / 100, v_dec);
  v_imp   := round((v_sub - v_desc) * v_imp_pct / 100, v_dec);
  v_total := v_sub - v_desc + v_imp;

  if v_id is null then
    insert into public.contadores_documento (id_empresa, tipo, ultimo) values (p_id_empresa, 'cotizacion', 1)
    on conflict (id_empresa, tipo) do update set ultimo = public.contadores_documento.ultimo + 1
    returning ultimo into v_num;
    insert into public.cotizaciones (id_empresa, numero, id_cliente, cliente_nombre, cliente_documento, cliente_correo,
        cliente_telefono, cliente_direccion, titulo, fecha_emision, validez_dias, fecha_vencimiento, moneda,
        descuento_pct, impuesto_pct, subtotal, descuento, impuesto, total, notas, condiciones, creado_por)
    values (p_id_empresa, v_num, v_cliente, left(v_nombre,160), left(p_datos->>'cliente_documento',40), left(p_datos->>'cliente_correo',160),
        left(p_datos->>'cliente_telefono',40), left(p_datos->>'cliente_direccion',240), left(p_datos->>'titulo',200),
        v_emision, v_validez, v_venc, v_moneda, v_desc_pct, v_imp_pct, v_sub, v_desc, v_imp, v_total,
        left(p_datos->>'notas',4000), left(p_datos->>'condiciones',4000), auth.uid())
    returning id into v_id;
  else
    select * into c from public.cotizaciones where id = v_id and id_empresa = p_id_empresa for update;
    if not found then raise exception 'Cotización no encontrada' using errcode = '22023'; end if;
    if c.estado = 'convertida' then raise exception 'Una cotización convertida en venta ya no se puede editar' using errcode = '22023'; end if;
    update public.cotizaciones set
        id_cliente = v_cliente, cliente_nombre = left(v_nombre,160), cliente_documento = left(p_datos->>'cliente_documento',40),
        cliente_correo = left(p_datos->>'cliente_correo',160), cliente_telefono = left(p_datos->>'cliente_telefono',40),
        cliente_direccion = left(p_datos->>'cliente_direccion',240), titulo = left(p_datos->>'titulo',200),
        fecha_emision = v_emision, validez_dias = v_validez, fecha_vencimiento = v_venc, moneda = v_moneda,
        descuento_pct = v_desc_pct, impuesto_pct = v_imp_pct, subtotal = v_sub, descuento = v_desc, impuesto = v_imp, total = v_total,
        notas = left(p_datos->>'notas',4000), condiciones = left(p_datos->>'condiciones',4000),
        revision = case when c.estado = 'borrador' then c.revision else c.revision + 1 end,
        updated_at = now()
     where id = v_id;
    delete from public.cotizaciones_items where id_cotizacion = v_id;
    v_num := c.numero;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if nullif(trim(it->>'descripcion'), '') is null then raise exception 'Un ítem no tiene descripción' using errcode = '22023'; end if;
    if coalesce((it->>'cantidad')::numeric, 0) <= 0 then raise exception 'Un ítem tiene cantidad cero' using errcode = '22023'; end if;
    insert into public.cotizaciones_items (id_cotizacion, orden, id_producto, descripcion, unidad, cantidad, precio_unitario, descuento_pct)
    values (v_id, v_orden,
            (select id from public.productos where id = nullif(it->>'id_producto','')::uuid and id_empresa = p_id_empresa),
            left(trim(it->>'descripcion'), 300), left(it->>'unidad', 20), (it->>'cantidad')::numeric,
            coalesce((it->>'precio_unitario')::numeric, 0), coalesce((it->>'descuento_pct')::numeric, 0));
    v_orden := v_orden + 1;
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_num, 'total', v_total);
end $$;

-- 5) Duplicar: nueva cotización en borrador con el siguiente número
create or replace function public.duplicar_cotizacion(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_num bigint; v_nuevo uuid;
begin
  select * into c from public.cotizaciones where id = p_id;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(c.id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  insert into public.contadores_documento (id_empresa, tipo, ultimo) values (c.id_empresa, 'cotizacion', 1)
  on conflict (id_empresa, tipo) do update set ultimo = public.contadores_documento.ultimo + 1
  returning ultimo into v_num;

  insert into public.cotizaciones (id_empresa, numero, id_cliente, cliente_nombre, cliente_documento, cliente_correo,
      cliente_telefono, cliente_direccion, titulo, fecha_emision, validez_dias, fecha_vencimiento, moneda,
      descuento_pct, impuesto_pct, subtotal, descuento, impuesto, total, notas, condiciones, id_origen, creado_por)
  values (c.id_empresa, v_num, c.id_cliente, c.cliente_nombre, c.cliente_documento, c.cliente_correo,
      c.cliente_telefono, c.cliente_direccion, c.titulo, current_date, c.validez_dias, current_date + c.validez_dias, c.moneda,
      c.descuento_pct, c.impuesto_pct, c.subtotal, c.descuento, c.impuesto, c.total, c.notas, c.condiciones, c.id, auth.uid())
  returning id into v_nuevo;

  insert into public.cotizaciones_items (id_cotizacion, orden, id_producto, descripcion, unidad, cantidad, precio_unitario, descuento_pct)
  select v_nuevo, orden, id_producto, descripcion, unidad, cantidad, precio_unitario, descuento_pct
    from public.cotizaciones_items where id_cotizacion = p_id;
  return jsonb_build_object('id', v_nuevo, 'numero', v_num);
end $$;

-- 6) Cambiar estado
create or replace function public.cambiar_estado_cotizacion(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.cotizaciones where id = p_id;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(c.id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  if p_estado not in ('borrador','enviada','aceptada','rechazada') then
    raise exception 'Estado no válido' using errcode = '22023';
  end if;
  if c.estado = 'convertida' then raise exception 'Ya fue convertida en venta' using errcode = '22023'; end if;
  update public.cotizaciones set estado = p_estado, updated_at = now() where id = p_id;
end $$;

-- 7) Eliminar (solo borradores o rechazadas); los archivos se borran desde la pantalla
create or replace function public.eliminar_cotizacion(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.cotizaciones where id = p_id;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if c.estado not in ('borrador','rechazada') then
    raise exception 'Solo se pueden eliminar cotizaciones en borrador o rechazadas' using errcode = '22023';
  end if;
  delete from public.cotizaciones where id = p_id;
end $$;

-- 8) Almacenamiento de adjuntos (privado, por empresa)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos_ventas', 'adjuntos_ventas', false, 10485760, array[
  'application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain',
  'application/msword','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

drop policy if exists adjuntos_ventas_acceso on storage.objects;
create policy adjuntos_ventas_acceso on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos_ventas'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.tiene_acceso_a_empresa(((storage.foldername(name))[1])::uuid)
         and public.empresa_tiene_modulo(((storage.foldername(name))[1])::uuid, 'ventas'))
  with check (bucket_id = 'adjuntos_ventas'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.tiene_acceso_a_empresa(((storage.foldername(name))[1])::uuid)
         and public.empresa_tiene_modulo(((storage.foldername(name))[1])::uuid, 'ventas'));

-- 9) Permisos de ejecución
revoke all on function public.guardar_datos_documentos(uuid,jsonb)            from public, anon;
revoke all on function public.guardar_cotizacion(uuid,uuid,jsonb,jsonb)      from public, anon;
revoke all on function public.duplicar_cotizacion(uuid)                      from public, anon;
revoke all on function public.cambiar_estado_cotizacion(uuid,text)           from public, anon;
revoke all on function public.eliminar_cotizacion(uuid)                      from public, anon;
grant execute on function public.guardar_datos_documentos(uuid,jsonb)        to authenticated;
grant execute on function public.guardar_cotizacion(uuid,uuid,jsonb,jsonb)   to authenticated;
grant execute on function public.duplicar_cotizacion(uuid)                   to authenticated;
grant execute on function public.cambiar_estado_cotizacion(uuid,text)        to authenticated;
grant execute on function public.eliminar_cotizacion(uuid)                   to authenticated;
