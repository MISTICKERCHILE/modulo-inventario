-- Personas (RR.HH.) · Paso 0: cimientos de seguridad
-- 1) Versiona el esquema HR (hasta ahora creado a mano; "if not exists" lo deja idéntico al real).
-- 2) Lectura: cualquiera del equipo con acceso. Escritura: solo Dueño/Admin.
-- 3) Todas las tablas exigen que la empresa tenga el módulo 'personas'.
-- 4) Sueldos en tabla aparte (solo Dueño/Admin y la propia persona).
-- 5) Bucket hr_archivos aislado por empresa (primera carpeta = id_empresa).

create table if not exists public.hr_cargos (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nombre text not null,
  tipo_origen text default 'link',
  url_descripcion text,
  estado text default 'Activo',
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_fichas_laborales (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  id_usuario uuid not null,
  cargo text,
  tipo_contrato text,
  sueldo_base numeric,
  fecha_ingreso date,
  estado text default 'Activo',
  sucursales uuid[],
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_turnos_plantillas (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nombre text not null,
  hora_inicio time,
  hora_fin time,
  descanso_minutos integer default 0,
  sucursales_disponibles uuid[],
  lleva_desayuno boolean default false,
  lleva_almuerzo boolean default false,
  lleva_once_cena boolean default false,
  created_at timestamptz default timezone('utc', now()),
  es_ausencia boolean default false
);
create table if not exists public.hr_turnos_asignados (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  id_ficha uuid not null,
  id_sucursal uuid not null,
  fecha date not null,
  id_turno_plantilla uuid not null,
  estado text default 'Programado',
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_sucursal_horarios (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  id_sucursal uuid not null,
  nombre_version text not null default 'Horario Estándar',
  activo boolean default true,
  config_dias jsonb not null,
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_permisos_tipos (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nombre text not null,
  es_remunerado boolean default false,
  color text default 'bg-blue-100',
  flujo_aprobacion jsonb default '["Autoriza Administrador"]'::jsonb,
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_permisos_solicitudes (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  id_ficha uuid not null,
  id_tipo uuid not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text default 'Pendiente',
  comentarios text,
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_feriados_eventos (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nombre text not null,
  fecha date not null,
  cierra_sucursal boolean default true,
  sucursales_afectadas uuid[] default '{}',
  created_at timestamptz default timezone('utc', now())
);
create table if not exists public.hr_fechas_especiales (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nombre_evento text not null,
  fecha date not null,
  compartido_todos boolean default true,
  config_sucursales jsonb default '[]'::jsonb,
  created_at timestamptz default timezone('utc', now())
);

-- Sueldos: tabla aparte para que ninguna lectura de la ficha los exponga.
create table if not exists public.hr_fichas_sueldos (
  id_ficha uuid primary key references public.hr_fichas_laborales(id) on delete cascade,
  id_empresa uuid not null,
  sueldo_base numeric,
  updated_at timestamptz default now()
);
insert into public.hr_fichas_sueldos (id_ficha, id_empresa, sueldo_base)
  select id, id_empresa, sueldo_base from public.hr_fichas_laborales where sueldo_base is not null
  on conflict (id_ficha) do nothing;
alter table public.hr_fichas_laborales drop column if exists sueldo_base;

-- Políticas: lectura equipo / escritura admin / módulo contratado.
do $$
declare t text;
begin
  foreach t in array array['hr_cargos','hr_fichas_laborales','hr_turnos_plantillas','hr_turnos_asignados',
    'hr_sucursal_horarios','hr_permisos_tipos','hr_permisos_solicitudes','hr_feriados_eventos','hr_fechas_especiales']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists acceso_empresa on public.%I', t);
    execute format('drop policy if exists suscripcion on public.%I', t);
    execute format('drop policy if exists hr_leer_equipo on public.%I', t);
    execute format('drop policy if exists hr_escribir_admin on public.%I', t);
    execute format('create policy suscripcion on public.%I as restrictive for all to authenticated
      using (public.empresa_tiene_modulo(id_empresa, ''personas'')) with check (public.empresa_tiene_modulo(id_empresa, ''personas''))', t);
    execute format('create policy hr_leer_equipo on public.%I for select to authenticated
      using (public.tiene_acceso_a_empresa(id_empresa))', t);
    execute format('create policy hr_escribir_admin on public.%I for all to authenticated
      using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa))', t);
  end loop;
end $$;

alter table public.hr_fichas_sueldos enable row level security;
drop policy if exists suscripcion on public.hr_fichas_sueldos;
drop policy if exists sueldos_admin on public.hr_fichas_sueldos;
drop policy if exists sueldos_propio on public.hr_fichas_sueldos;
create policy suscripcion on public.hr_fichas_sueldos as restrictive for all to authenticated
  using (public.empresa_tiene_modulo(id_empresa, 'personas')) with check (public.empresa_tiene_modulo(id_empresa, 'personas'));
create policy sueldos_admin on public.hr_fichas_sueldos for all to authenticated
  using (public.es_admin_de_empresa(id_empresa)) with check (public.es_admin_de_empresa(id_empresa));
create policy sueldos_propio on public.hr_fichas_sueldos for select to authenticated
  using (exists (select 1 from public.hr_fichas_laborales f where f.id = id_ficha and f.id_usuario = auth.uid()));

-- Storage: hr_archivos aislado por empresa. Ver = equipo; subir/borrar = Dueño/Admin.
drop policy if exists "Permitir todo en hr_archivos a usuarios autenticados" on storage.objects;
drop policy if exists hr_archivos_leer on storage.objects;
drop policy if exists hr_archivos_escribir on storage.objects;
create policy hr_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'hr_archivos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.tiene_acceso_a_empresa(((storage.foldername(name))[1])::uuid)
    and public.empresa_tiene_modulo(((storage.foldername(name))[1])::uuid, 'personas'));
create policy hr_archivos_escribir on storage.objects for all to authenticated
  using (bucket_id = 'hr_archivos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.es_admin_de_empresa(((storage.foldername(name))[1])::uuid)
    and public.empresa_tiene_modulo(((storage.foldername(name))[1])::uuid, 'personas'))
  with check (bucket_id = 'hr_archivos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.es_admin_de_empresa(((storage.foldername(name))[1])::uuid)
    and public.empresa_tiene_modulo(((storage.foldername(name))[1])::uuid, 'personas'));
