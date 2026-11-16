-- ============================================================
-- Compras + Tesorería · Fase 1
-- Solo AGREGA: tablas nuevas, columnas nuevas (todas opcionales o con
-- valor por defecto) y funciones. No borra ni renombra nada existente.
--
-- Módulos:
--   'compras'    → nuevo módulo contratable (empresas.suscripciones.compras.activo)
--   Tesorería    → cuentas y pagos; se usa con Compras o con Ventas
--   compras/proveedores siguen funcionando con Inventario y ahora también con Compras
-- ============================================================

-- ------------------------------------------------------------
-- 0. Módulo 'compras' en el estado de suscripción
-- ------------------------------------------------------------
create or replace function public.estado_suscripcion(p_id_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_e public.empresas%rowtype;
  v_en_prueba boolean;
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_e from public.empresas where id = p_id_empresa;
  v_en_prueba := coalesce(v_e.prueba_hasta > now(), false);
  return jsonb_build_object(
    'en_prueba',      v_en_prueba,
    'prueba_hasta',   v_e.prueba_hasta,
    'prueba_vencida', v_e.prueba_hasta is not null and not v_en_prueba,
    'dias_restantes', case when v_en_prueba
                           then greatest(1, ceil(extract(epoch from (v_e.prueba_hasta - now())) / 86400)::int)
                           else 0 end,
    'modulos', jsonb_build_object(
      'ventas',     public.empresa_tiene_modulo(p_id_empresa, 'ventas'),
      'inventario', public.empresa_tiene_modulo(p_id_empresa, 'inventario'),
      'personas',   public.empresa_tiene_modulo(p_id_empresa, 'personas'),
      'compras',    public.empresa_tiene_modulo(p_id_empresa, 'compras')
    ),
    'contratados', jsonb_build_object(
      'ventas',     coalesce((v_e.suscripciones -> 'ventas'     ->> 'activo')::boolean, false),
      'inventario', coalesce((v_e.suscripciones -> 'inventario' ->> 'activo')::boolean, false),
      'personas',   coalesce((v_e.suscripciones -> 'personas'   ->> 'activo')::boolean, false),
      'compras',    coalesce((v_e.suscripciones -> 'compras'    ->> 'activo')::boolean, false)
    )
  );
end $$;

-- Ayudantes de acceso por módulo
create or replace function public._modulo_compras(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.empresa_tiene_modulo(p_empresa, 'compras') or public.empresa_tiene_modulo(p_empresa, 'inventario');
$$;
create or replace function public._modulo_tesoreria(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.empresa_tiene_modulo(p_empresa, 'compras') or public.empresa_tiene_modulo(p_empresa, 'ventas');
$$;
revoke all on function public._modulo_compras(uuid), public._modulo_tesoreria(uuid) from public, anon;
grant execute on function public._modulo_compras(uuid), public._modulo_tesoreria(uuid) to authenticated;

-- compras y proveedores: con Inventario (como hoy) o con Compras
drop policy if exists suscripcion on public.compras;
create policy suscripcion on public.compras as restrictive for all
  using (public._modulo_compras(id_empresa)) with check (public._modulo_compras(id_empresa));
drop policy if exists suscripcion on public.proveedores;
create policy suscripcion on public.proveedores as restrictive for all
  using (public._modulo_compras(id_empresa)) with check (public._modulo_compras(id_empresa));

-- ------------------------------------------------------------
-- 1. Categorías de gasto (id_empresa null = lista base para todas)
-- ------------------------------------------------------------
create table if not exists public.categorias_gasto (
  id              uuid primary key default gen_random_uuid(),
  id_empresa      uuid references public.empresas(id) on delete cascade,
  nombre          text not null check (char_length(nombre) between 1 and 60),
  es_remuneracion boolean not null default false,
  orden           int not null default 100,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists categorias_gasto_nombre_uq
  on public.categorias_gasto (coalesce(id_empresa, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));
alter table public.categorias_gasto enable row level security;
drop policy if exists cat_gasto_sel on public.categorias_gasto;
drop policy if exists cat_gasto_ins on public.categorias_gasto;
drop policy if exists cat_gasto_upd on public.categorias_gasto;
drop policy if exists cat_gasto_del on public.categorias_gasto;
create policy cat_gasto_sel on public.categorias_gasto for select
  using (id_empresa is null or public.tiene_acceso_a_empresa(id_empresa));
create policy cat_gasto_ins on public.categorias_gasto for insert
  with check (id_empresa is not null and public.tiene_acceso_a_empresa(id_empresa) and public._modulo_compras(id_empresa));
create policy cat_gasto_upd on public.categorias_gasto for update
  using (id_empresa is not null and public.tiene_acceso_a_empresa(id_empresa) and public._modulo_compras(id_empresa));
create policy cat_gasto_del on public.categorias_gasto for delete
  using (id_empresa is not null and public.es_admin_de_empresa(id_empresa));

-- Una empresa puede ocultar una categoría base sin borrarla para las demás
create table if not exists public.categorias_gasto_ocultas (
  id_empresa   uuid not null references public.empresas(id) on delete cascade,
  id_categoria uuid not null references public.categorias_gasto(id) on delete cascade,
  primary key (id_empresa, id_categoria)
);
alter table public.categorias_gasto_ocultas enable row level security;
drop policy if exists cat_ocultas_all on public.categorias_gasto_ocultas;
create policy cat_ocultas_all on public.categorias_gasto_ocultas for all
  using (public.tiene_acceso_a_empresa(id_empresa)) with check (public.tiene_acceso_a_empresa(id_empresa));

insert into public.categorias_gasto (id_empresa, nombre, es_remuneracion, orden)
select null, v.nombre, v.rem, v.orden
from (values
  ('Insumos y materiales', false, 10), ('Producción tercerizada', false, 20), ('Despachos y envíos', false, 30),
  ('Software y suscripciones', false, 40), ('Telefonía e internet', false, 50), ('Marketing y publicidad', false, 60),
  ('Mantención y repuestos', false, 70), ('Equipos y mobiliario', false, 80), ('Arriendo y oficina', false, 90),
  ('Contabilidad y trámites', false, 100), ('Impuestos y patentes', false, 110), ('Honorarios y remuneraciones', true, 120),
  ('Cotizaciones previsionales', true, 130), ('Comisiones medios de pago', false, 140), ('Alimentación y reuniones', false, 150),
  ('Transporte y estacionamiento', false, 160), ('Viajes', false, 170), ('Devoluciones a clientes', false, 180), ('Otros', false, 999)
) as v(nombre, rem, orden)
where not exists (select 1 from public.categorias_gasto c where c.id_empresa is null and lower(c.nombre) = lower(v.nombre));

-- ------------------------------------------------------------
-- 2. Cuentas (Tesorería)
--    reembolsable = alguien pagó por la empresa (rendiciones, TDC personal):
--    su saldo es lo que la empresa le debe a esa persona.
-- ------------------------------------------------------------
create table if not exists public.cuentas_financieras (
  id                  uuid primary key default gen_random_uuid(),
  id_empresa          uuid not null references public.empresas(id) on delete cascade,
  nombre              text not null check (char_length(nombre) between 1 and 80),
  tipo                text not null check (tipo in ('banco','billetera','caja','tarjeta_credito','reembolsable')),
  titular             text,
  moneda              text not null default 'CLP',
  saldo_inicial       numeric not null default 0,
  fecha_saldo_inicial date,
  cupo                numeric,
  dia_facturacion     int check (dia_facturacion between 1 and 31),
  dia_pago            int check (dia_pago between 1 and 31),
  ultimos_4           text check (ultimos_4 ~ '^[0-9]{4}$'),
  activo              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists cuentas_financieras_emp_idx on public.cuentas_financieras(id_empresa);
alter table public.cuentas_financieras enable row level security;
drop policy if exists acceso on public.cuentas_financieras;
drop policy if exists suscripcion on public.cuentas_financieras;
create policy acceso on public.cuentas_financieras for all
  using (public.tiene_acceso_a_empresa(id_empresa)) with check (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.cuentas_financieras as restrictive for all
  using (public._modulo_tesoreria(id_empresa)) with check (public._modulo_tesoreria(id_empresa));

-- ------------------------------------------------------------
-- 3. Compras: datos de pago y gastos sin orden de compra
--    Todas las columnas son nuevas y opcionales; las OC de Inventario siguen igual.
-- ------------------------------------------------------------
alter table public.compras
  add column if not exists origen             text not null default 'orden_compra',
  add column if not exists descripcion        text,
  add column if not exists id_categoria_gasto uuid references public.categorias_gasto(id) on delete set null,
  add column if not exists tipo_documento     text,
  add column if not exists monto_neto         numeric,
  add column if not exists monto_iva          numeric,
  add column if not exists moneda             text not null default 'CLP',
  add column if not exists tasa_cambio        numeric,
  add column if not exists condicion_pago     text not null default 'contado',
  add column if not exists dias_credito       int not null default 0,
  add column if not exists fecha_vencimiento  date,
  add column if not exists id_cuenta_pago     uuid references public.cuentas_financieras(id) on delete set null,
  add column if not exists monto_pagado       numeric not null default 0,
  add column if not exists estado_pago        text not null default 'pendiente',
  add column if not exists referencia_externa text,
  add column if not exists id_persona         uuid,
  add column if not exists nombre_persona     text,
  add column if not exists creado_por         uuid;

do $$ begin
  alter table public.compras add constraint compras_origen_chk check (origen in ('orden_compra','gasto'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.compras add constraint compras_condicion_chk check (condicion_pago in ('contado','credito'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.compras add constraint compras_estado_pago_chk check (estado_pago in ('pendiente','parcial','pagado','anulado'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.compras add constraint compras_tipo_doc_chk check (tipo_documento is null or tipo_documento in
    ('factura','boleta','boleta_honorarios','factura_exenta','extranjero','sin_documento'));
exception when duplicate_object then null; end $$;

create index if not exists compras_pago_idx on public.compras(id_empresa, estado_pago, fecha_compra);
create index if not exists compras_cuenta_pago_idx on public.compras(id_cuenta_pago);

alter table public.compras_detalles add column if not exists descripcion text;

alter table public.proveedores
  add column if not exists rut                        text,
  add column if not exists condicion_pago_defecto     text not null default 'contado',
  add column if not exists dias_credito_defecto       int not null default 0,
  add column if not exists id_categoria_gasto_defecto uuid references public.categorias_gasto(id) on delete set null;

-- ------------------------------------------------------------
-- 4. Pagos a proveedores / reembolsos: un pago cubre una o varias compras
--    forma 'via_sueldo' = se devolvió dentro del sueldo (sin transferencia aparte)
-- ------------------------------------------------------------
create table if not exists public.cxp_pagos (
  id          uuid primary key default gen_random_uuid(),
  id_empresa  uuid not null references public.empresas(id) on delete cascade,
  id_cuenta   uuid references public.cuentas_financieras(id) on delete set null,
  forma       text not null default 'transferencia'
              check (forma in ('transferencia','efectivo','tarjeta','billetera','via_sueldo','otro')),
  monto       numeric not null check (monto > 0),
  fecha       date not null default current_date,
  referencia  text,
  nota        text,
  creado_por  uuid,
  created_at  timestamptz not null default now()
);
create table if not exists public.cxp_pagos_aplicaciones (
  id        uuid primary key default gen_random_uuid(),
  id_pago   uuid not null references public.cxp_pagos(id) on delete cascade,
  id_compra uuid not null references public.compras(id) on delete cascade,
  monto     numeric not null check (monto > 0)
);
create index if not exists cxp_pagos_emp_idx on public.cxp_pagos(id_empresa, fecha);
create index if not exists cxp_aplic_pago_idx on public.cxp_pagos_aplicaciones(id_pago);
create index if not exists cxp_aplic_compra_idx on public.cxp_pagos_aplicaciones(id_compra);
alter table public.cxp_pagos enable row level security;
alter table public.cxp_pagos_aplicaciones enable row level security;
-- Lectura directa; escritura solo por las funciones de abajo (mantienen los saldos cuadrados)
drop policy if exists acceso_lectura on public.cxp_pagos;
drop policy if exists suscripcion on public.cxp_pagos;
create policy acceso_lectura on public.cxp_pagos for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.cxp_pagos as restrictive for all
  using (public._modulo_compras(id_empresa)) with check (public._modulo_compras(id_empresa));
drop policy if exists acceso_lectura on public.cxp_pagos_aplicaciones;
create policy acceso_lectura on public.cxp_pagos_aplicaciones for select
  using (exists (select 1 from public.cxp_pagos p where p.id = id_pago and public.tiene_acceso_a_empresa(p.id_empresa)));

-- ------------------------------------------------------------
-- 5. Transferencias entre cuentas (pago de tarjeta, recarga o retiro de MP)
-- ------------------------------------------------------------
create table if not exists public.transferencias_cuentas (
  id                uuid primary key default gen_random_uuid(),
  id_empresa        uuid not null references public.empresas(id) on delete cascade,
  id_cuenta_origen  uuid not null references public.cuentas_financieras(id) on delete restrict,
  id_cuenta_destino uuid not null references public.cuentas_financieras(id) on delete restrict,
  monto             numeric not null check (monto > 0),
  fecha             date not null default current_date,
  nota              text,
  creado_por        uuid,
  created_at        timestamptz not null default now(),
  check (id_cuenta_origen <> id_cuenta_destino)
);
alter table public.transferencias_cuentas enable row level security;
drop policy if exists acceso on public.transferencias_cuentas;
drop policy if exists suscripcion on public.transferencias_cuentas;
create policy acceso on public.transferencias_cuentas for all
  using (public.tiene_acceso_a_empresa(id_empresa)) with check (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.transferencias_cuentas as restrictive for all
  using (public._modulo_tesoreria(id_empresa)) with check (public._modulo_tesoreria(id_empresa));

-- ------------------------------------------------------------
-- 6. Funciones
-- ------------------------------------------------------------
create or replace function public._decimales(p_moneda text)
returns int language sql immutable as $$
  select case when upper(coalesce(p_moneda,'CLP')) in ('CLP','COP','PYG','JPY') then 0 else 2 end;
$$;

-- Registrar un gasto directo (sin orden de compra).
-- Si se paga con banco/billetera/caja/tarjeta de la empresa queda pagado.
-- Si lo pagó una persona (cuenta reembolsable) o es a crédito, queda pendiente.
create or replace function public.registrar_gasto(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := (p->>'id_empresa')::uuid;
  v_monto numeric; v_mon text; v_cta record; v_cond text; v_dias int; v_fecha date; v_id uuid; v_estado text; v_pagado numeric;
begin
  if auth.uid() is null or v_emp is null or not public.tiene_acceso_a_empresa(v_emp) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_compras(v_emp) then raise exception 'El módulo Compras no está activo' using errcode = '42501'; end if;
  v_mon := upper(left(coalesce(nullif(trim(p->>'moneda'),''),'CLP'), 6));
  v_monto := round(coalesce((p->>'monto')::numeric, 0), public._decimales(v_mon));
  if v_monto <= 0 then raise exception 'El monto debe ser mayor que cero' using errcode = '22023'; end if;
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

  if v_cond = 'credito' or v_cta.tipo = 'reembolsable' then v_estado := 'pendiente'; v_pagado := 0;
  else v_estado := 'pagado'; v_pagado := v_monto; end if;

  insert into public.compras (id_empresa, id_proveedor, fecha_compra, origen, descripcion, id_categoria_gasto, tipo_documento,
    numero_factura, total_compra, total_factura, monto_neto, monto_iva, moneda, tasa_cambio, condicion_pago, dias_credito,
    fecha_vencimiento, id_cuenta_pago, monto_pagado, estado_pago, estado, referencia_externa, nombre_persona, url_foto_factura,
    observaciones_factura, creado_por)
  values (v_emp, (p->>'id_proveedor')::uuid, v_fecha, 'gasto', left(trim(p->>'descripcion'), 300), (p->>'id_categoria_gasto')::uuid,
    nullif(p->>'tipo_documento',''), nullif(p->>'numero_documento',''), v_monto, v_monto,
    (p->>'monto_neto')::numeric, (p->>'monto_iva')::numeric, v_mon, (p->>'tasa_cambio')::numeric, v_cond, v_dias,
    case when v_cond = 'credito' then v_fecha + v_dias end, v_cta.id, v_pagado, v_estado, 'Registrado',
    left(nullif(p->>'referencia_externa',''), 60), left(nullif(p->>'nombre_persona',''), 120), nullif(p->>'url_foto',''),
    left(nullif(p->>'nota',''), 500), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'estado_pago', v_estado);
end $$;

-- Pagar (o reembolsar) una o varias compras con un solo pago.
-- p_aplicaciones: [{"id_compra": "...", "monto": 1000}, ...]
create or replace function public.registrar_pago_compras(
  p_id_empresa uuid, p_id_cuenta uuid, p_forma text, p_fecha date, p_aplicaciones jsonb,
  p_referencia text default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; c record; v_total numeric := 0; v_pago uuid; v_m numeric; v_saldo numeric; v_n int := 0;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_compras(p_id_empresa) then raise exception 'El módulo Compras no está activo' using errcode = '42501'; end if;
  if coalesce(p_forma,'') <> 'via_sueldo' then
    if p_id_cuenta is null or not exists (select 1 from public.cuentas_financieras where id = p_id_cuenta and id_empresa = p_id_empresa
                                           and tipo <> 'reembolsable' and activo) then
      raise exception 'Elige desde qué cuenta se pagó' using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(p_aplicaciones) <> 'array' or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'Elige al menos una compra' using errcode = '22023';
  end if;
  if jsonb_array_length(p_aplicaciones) > 500 then raise exception 'Demasiadas compras en un pago' using errcode = '22023'; end if;

  insert into public.cxp_pagos (id_empresa, id_cuenta, forma, monto, fecha, referencia, nota, creado_por)
  values (p_id_empresa, case when p_forma = 'via_sueldo' then null else p_id_cuenta end, coalesce(p_forma,'transferencia'), 1,
          coalesce(p_fecha, current_date), left(p_referencia, 80), left(p_nota, 300), auth.uid())
  returning id into v_pago;

  for a in select * from jsonb_array_elements(p_aplicaciones) loop
    select * into c from public.compras where id = (a->>'id_compra')::uuid and id_empresa = p_id_empresa for update;
    if not found then raise exception 'Compra no válida' using errcode = '22023'; end if;
    if c.estado_pago in ('pagado','anulado') then raise exception 'La compra % ya está pagada', coalesce(c.descripcion, c.numero_factura, c.id::text) using errcode = '22023'; end if;
    v_saldo := coalesce(c.total_factura, c.total_compra, 0) - c.monto_pagado;
    v_m := round(coalesce((a->>'monto')::numeric, v_saldo), public._decimales(c.moneda));
    if v_m <= 0 or v_m > v_saldo then raise exception 'El monto supera el saldo pendiente (%)', v_saldo using errcode = '22023'; end if;
    insert into public.cxp_pagos_aplicaciones (id_pago, id_compra, monto) values (v_pago, c.id, v_m);
    update public.compras set monto_pagado = monto_pagado + v_m,
      estado_pago = case when monto_pagado + v_m >= coalesce(total_factura, total_compra, 0) then 'pagado' else 'parcial' end
     where id = c.id;
    v_total := v_total + v_m; v_n := v_n + 1;
  end loop;
  update public.cxp_pagos set monto = v_total where id = v_pago;
  return jsonb_build_object('id_pago', v_pago, 'monto', v_total, 'compras', v_n);
end $$;

-- Deshacer un pago (vuelve los saldos de sus compras)
create or replace function public.anular_pago_compras(p_id_pago uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pg record; ap record;
begin
  select * into pg from public.cxp_pagos where id = p_id_pago for update;
  if not found or auth.uid() is null or not public.es_admin_de_empresa(pg.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  for ap in select * from public.cxp_pagos_aplicaciones where id_pago = pg.id loop
    update public.compras set monto_pagado = greatest(monto_pagado - ap.monto, 0),
      estado_pago = case when monto_pagado - ap.monto <= 0 then 'pendiente' else 'parcial' end
     where id = ap.id_compra;
  end loop;
  delete from public.cxp_pagos where id = pg.id;
end $$;

-- Resumen del mes
create or replace function public.resumen_compras_mes(p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_compras(p_id_empresa) then raise exception 'El módulo Compras no está activo' using errcode = '42501'; end if;
  with c as (
    select c.*, cf.tipo as tipo_cuenta, cf.nombre as nombre_cuenta, coalesce(c.total_factura, c.total_compra, 0) as total
      from public.compras c left join public.cuentas_financieras cf on cf.id = c.id_cuenta_pago
     where c.id_empresa = p_id_empresa and c.estado_pago <> 'anulado'
  ), mes as (select * from c where fecha_compra between p_desde and p_hasta),
  pagos as (
    select p.*, cf.nombre as nombre_cuenta from public.cxp_pagos p left join public.cuentas_financieras cf on cf.id = p.id_cuenta
     where p.id_empresa = p_id_empresa and p.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'gastado_mes',       coalesce((select sum(total) from mes), 0),
    'salio_de_cuentas',  coalesce((select sum(total) from mes where tipo_cuenta in ('banco','billetera','caja') and condicion_pago = 'contado'), 0)
                         + coalesce((select sum(monto) from pagos where forma <> 'via_sueldo'), 0),
    'cargado_tarjetas',  coalesce((select sum(total) from mes where tipo_cuenta = 'tarjeta_credito'), 0),
    'adelantado_terceros', coalesce((select sum(total) from mes where tipo_cuenta = 'reembolsable'), 0),
    'a_credito_mes',     coalesce((select sum(total) from mes where condicion_pago = 'credito' and coalesce(tipo_cuenta,'') <> 'reembolsable'), 0),
    'debo_proveedores',  coalesce((select sum(total - monto_pagado) from c where estado_pago in ('pendiente','parcial') and coalesce(tipo_cuenta,'') <> 'reembolsable'), 0),
    'debo_personas',     coalesce((select jsonb_agg(jsonb_build_object('cuenta', nombre_cuenta, 'monto', s)) from (
                            select nombre_cuenta, sum(total - monto_pagado) s from c
                             where tipo_cuenta = 'reembolsable' and estado_pago in ('pendiente','parcial') group by nombre_cuenta) x), '[]'::jsonb),
    'antiguedad', (select jsonb_build_object(
        'al_dia',  coalesce(sum(total - monto_pagado) filter (where coalesce(fecha_vencimiento, fecha_compra) > current_date + 7), 0),
        'vence_7', coalesce(sum(total - monto_pagado) filter (where coalesce(fecha_vencimiento, fecha_compra) between current_date and current_date + 7), 0),
        'd1_30',   coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) between 1 and 30), 0),
        'd31_60',  coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) between 31 and 60), 0),
        'd60_mas', coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) > 60), 0))
      from c where estado_pago in ('pendiente','parcial')),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', coalesce(cg.nombre, 'Sin categoría'), 'monto', s) order by s desc)
                      from (select id_categoria_gasto, sum(total) s from mes group by id_categoria_gasto) x
                      left join public.categorias_gasto cg on cg.id = x.id_categoria_gasto), '[]'::jsonb),
    'por_cuenta', coalesce((select jsonb_agg(jsonb_build_object('cuenta', coalesce(nombre_cuenta, 'A crédito'), 'monto', s) order by s desc)
                      from (select nombre_cuenta, sum(total) s from mes group by nombre_cuenta) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.registrar_gasto(jsonb), public.registrar_pago_compras(uuid,uuid,text,date,jsonb,text,text),
  public.anular_pago_compras(uuid), public.resumen_compras_mes(uuid,date,date) from public, anon;
grant execute on function public.registrar_gasto(jsonb), public.registrar_pago_compras(uuid,uuid,text,date,jsonb,text,text),
  public.anular_pago_compras(uuid), public.resumen_compras_mes(uuid,date,date) to authenticated;
