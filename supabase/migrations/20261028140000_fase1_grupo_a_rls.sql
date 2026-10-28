-- =====================================================================
-- Buddy ERP · Fase 1 · Grupo A — Blindaje RLS sin cambios de código
-- Fecha: 2026-10-28
--
-- Objetivo:
--   1. Reemplazar políticas basadas en user_metadata (editable por el
--      usuario) por tiene_acceso_a_empresa(id_empresa).
--   2. Cerrar tablas abiertas a cualquier usuario autenticado
--      (USING true) y limitarlas a la empresa del usuario.
--   3. Impedir que clientes modifiquen empresas.suscripciones
--      (solo usuarios Zeus o el backend/SQL Editor).
--   4. Endurecer funciones SECURITY DEFINER (search_path fijo y sin
--      ejecución anónima de la función trigger).
--
-- Las políticas restrictivas "suscripcion" existentes NO se tocan.
-- Verificado antes de aplicar: todo insert del frontend (main y DEV)
-- envía id_empresa, y no existen filas con id_empresa NULL.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Políticas basadas en user_metadata  →  tiene_acceso_a_empresa
-- ---------------------------------------------------------------------
drop policy if exists "Acceso total a clientes de la empresa" on public.clientes;
create policy acceso_empresa on public.clientes
  for all to authenticated
  using (public.tiene_acceso_a_empresa(id_empresa))
  with check (public.tiene_acceso_a_empresa(id_empresa));

drop policy if exists "Acceso total a cuentas de la empresa" on public.cuentas_por_cobrar;
create policy acceso_empresa on public.cuentas_por_cobrar
  for all to authenticated
  using (public.tiene_acceso_a_empresa(id_empresa))
  with check (public.tiene_acceso_a_empresa(id_empresa));

drop policy if exists "Acceso total a usuarios de la misma empresa" on public.ventas;
create policy acceso_empresa on public.ventas
  for all to authenticated
  using (public.tiene_acceso_a_empresa(id_empresa))
  with check (public.tiene_acceso_a_empresa(id_empresa));

-- ventas_detalles no tiene id_empresa: se valida a través de su venta.
drop policy if exists "Acceso a detalles de la misma empresa" on public.ventas_detalles;
create policy acceso_empresa on public.ventas_detalles
  for all to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = ventas_detalles.id_venta
      and public.tiene_acceso_a_empresa(v.id_empresa)))
  with check (exists (
    select 1 from public.ventas v
    where v.id = ventas_detalles.id_venta
      and public.tiene_acceso_a_empresa(v.id_empresa)));

-- ---------------------------------------------------------------------
-- 2. Tablas abiertas (USING true)  →  solo la propia empresa
-- ---------------------------------------------------------------------
drop policy if exists "Permitir todo en hr_cargos a usuarios logueados"          on public.hr_cargos;
drop policy if exists "Permitir todo en hr_fechas_especiales a authenticated"    on public.hr_fechas_especiales;
drop policy if exists "Permitir todo en hr_feriados a auth"                      on public.hr_feriados_eventos;
drop policy if exists "Permitir todo a usuarios autenticados"                    on public.hr_fichas_laborales;
drop policy if exists "Permitir todo en hr_permisos_solicitudes a auth"          on public.hr_permisos_solicitudes;
drop policy if exists "Permitir todo en hr_permisos_tipos a auth"                on public.hr_permisos_tipos;
drop policy if exists "Permitir todo en hr_sucursal_horarios a authenticated"    on public.hr_sucursal_horarios;
drop policy if exists "Permitir todo en hr_turnos_asignados a auth"              on public.hr_turnos_asignados;
drop policy if exists "Permitir todo en hr_turnos_plantillas a authenticated"    on public.hr_turnos_plantillas;
drop policy if exists "Accesos a metodos de pago"                                on public.metodos_pago;
drop policy if exists "Accesos a cuentas abiertas"                               on public.pos_cuentas_abiertas;
drop policy if exists "Solo usuarios autenticados"                               on public.pos_turnos;
drop policy if exists "Empresas ven sus turnos"                                  on public.pos_turnos;
drop policy if exists "Permitir todo a usuarios autenticados"                    on public.sub_ubicaciones;

do $$
declare
  t text;
begin
  foreach t in array array[
    'hr_cargos', 'hr_fechas_especiales', 'hr_feriados_eventos',
    'hr_fichas_laborales', 'hr_permisos_solicitudes', 'hr_permisos_tipos',
    'hr_sucursal_horarios', 'hr_turnos_asignados', 'hr_turnos_plantillas',
    'metodos_pago', 'pos_cuentas_abiertas', 'pos_turnos', 'sub_ubicaciones'
  ]
  loop
    execute format(
      'create policy acceso_empresa on public.%I
         for all to authenticated
         using (public.tiene_acceso_a_empresa(id_empresa))
         with check (public.tiene_acceso_a_empresa(id_empresa))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Proteger empresas.suscripciones (anti auto-activación de módulos)
--    Permitido: usuarios con perfiles.es_zeus = true, y conexiones sin
--    rol de API (SQL Editor, service_role, funciones internas).
-- ---------------------------------------------------------------------
create or replace function public.proteger_suscripciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.suscripciones is distinct from old.suscripciones
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (
       select 1 from public.perfiles p
       where p.id_usuario = auth.uid() and p.es_zeus is true)
  then
    raise exception 'No autorizado para modificar suscripciones'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_suscripciones() from public, anon, authenticated;

drop trigger if exists trg_proteger_suscripciones on public.empresas;
create trigger trg_proteger_suscripciones
  before update on public.empresas
  for each row execute function public.proteger_suscripciones();

-- ---------------------------------------------------------------------
-- 4. Endurecer funciones SECURITY DEFINER
-- ---------------------------------------------------------------------
alter function public.empresa_tiene_modulo(uuid, text) set search_path = public;
alter function public.crear_empresa_y_perfil()         set search_path = public;

-- La función trigger de registro no debe ser invocable vía API.
revoke execute on function public.crear_empresa_y_perfil() from public, anon, authenticated;

