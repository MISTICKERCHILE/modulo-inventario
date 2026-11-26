-- ============================================================
-- Presupuesto mensual de gastos (por categoría, centro de costo y/o sucursal)
-- ============================================================
create table if not exists public.presupuestos (
  id                 uuid primary key default gen_random_uuid(),
  id_empresa         uuid not null references public.empresas(id) on delete cascade,
  periodo            date not null check (extract(day from periodo) = 1),   -- primer día del mes
  id_categoria_gasto uuid references public.categorias_gasto(id) on delete cascade,
  id_centro_costo    uuid references public.centros_costo(id) on delete cascade,
  id_sucursal        uuid references public.sucursales(id) on delete cascade,
  monto              numeric not null check (monto >= 0),
  nota               text,
  actualizado_por    uuid default auth.uid(),
  updated_at         timestamptz not null default now()
);
-- una sola fila por combinación (los null cuentan como "todas")
create unique index if not exists presupuestos_uq on public.presupuestos (id_empresa, periodo,
  coalesce(id_categoria_gasto, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(id_centro_costo,    '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(id_sucursal,        '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.presupuestos enable row level security;
drop policy if exists lectura on public.presupuestos;
drop policy if exists admin on public.presupuestos;
create policy lectura on public.presupuestos for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy admin on public.presupuestos for all using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));
notify pgrst, 'reload schema';
