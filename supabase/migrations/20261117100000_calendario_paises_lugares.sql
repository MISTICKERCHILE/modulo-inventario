-- Feriados por país (Chile / Venezuela) y sugerencias de lugar desde datos del ERP.
create table if not exists public.feriados (
  pais text not null check (pais in ('Chile','Venezuela')),
  fecha date not null,
  nombre text not null,
  irrenunciable boolean not null default false,
  primary key (pais, fecha)
);
alter table public.feriados enable row level security;
drop policy if exists feriados_sel on public.feriados;
create policy feriados_sel on public.feriados for select to authenticated using (true);

insert into public.feriados (pais, fecha, nombre, irrenunciable)
select 'Chile', fecha, nombre, irrenunciable from public.feriados_chile on conflict do nothing;

-- Venezuela: feriados nacionales habituales. Pueden variar por decreto: revisar cada año.
insert into public.feriados (pais, fecha, nombre, irrenunciable) values
 ('Venezuela','2026-12-24','Nochebuena',false), ('Venezuela','2026-12-25','Navidad',false), ('Venezuela','2026-12-31','Fin de Año',false),
 ('Venezuela','2027-01-01','Año Nuevo',false), ('Venezuela','2027-02-08','Lunes de Carnaval',false), ('Venezuela','2027-02-09','Martes de Carnaval',false),
 ('Venezuela','2027-03-25','Jueves Santo',false), ('Venezuela','2027-03-26','Viernes Santo',false), ('Venezuela','2027-04-19','Declaración de la Independencia',false),
 ('Venezuela','2027-05-01','Día del Trabajador',false), ('Venezuela','2027-06-24','Batalla de Carabobo',false), ('Venezuela','2027-07-05','Día de la Independencia',false),
 ('Venezuela','2027-07-24','Natalicio de Simón Bolívar',false), ('Venezuela','2027-10-12','Día de la Resistencia Indígena',false),
 ('Venezuela','2027-12-24','Nochebuena',false), ('Venezuela','2027-12-25','Navidad',false), ('Venezuela','2027-12-31','Fin de Año',false)
on conflict do nothing;

drop table if exists public.feriados_chile;

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.calendario_rango(uuid,date,date)'::regprocedure);
  d := replace(d, 'from public.feriados_chile f where f.fecha between p_desde and p_hasta;',
    'from public.feriados f where f.pais = (select case when pais = ''Venezuela'' then ''Venezuela'' else ''Chile'' end from public.empresas where id = p_id_empresa) and f.fecha between p_desde and p_hasta;');
  if d like '%feriados_chile%' then raise exception 'parche feriados no aplicado'; end if;
  execute d;
end $mig$;

create or replace function public.calendario_lugares(p_id_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; dd jsonb;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('valor', s.direccion, 'origen', 'Sucursal ' || s.nombre) order by s.nombre), '[]'::jsonb) into v
    from public.sucursales s where s.id_empresa = p_id_empresa and nullif(trim(s.direccion),'') is not null;
  select datos_documentos into dd from public.empresas where id = p_id_empresa;
  if nullif(trim(dd->>'direccion'),'') is not null then
    v := v || jsonb_build_array(jsonb_build_object('valor', concat_ws(', ', trim(dd->>'direccion'), nullif(trim(dd->>'ciudad'),'')), 'origen', 'Dirección de la empresa'));
  end if;
  if public.empresa_tiene_modulo(p_id_empresa,'ventas') then
    v := v || coalesce((select jsonb_agg(jsonb_build_object('valor', x.direccion, 'origen', 'Cliente ' || x.nombre)) from (
        select distinct on (lower(trim(direccion))) trim(direccion) direccion, nombre from public.clientes
         where id_empresa = p_id_empresa and nullif(trim(direccion),'') is not null order by lower(trim(direccion)), nombre limit 150) x), '[]'::jsonb);
    v := v || coalesce((select jsonb_agg(jsonb_build_object('valor', x.d, 'origen', 'Trabajo reciente')) from (
        select trim(direccion_trabajo) d, max(fecha_inicio) m from public.agenda_trabajos
         where id_empresa = p_id_empresa and nullif(trim(direccion_trabajo),'') is not null group by trim(direccion_trabajo) order by m desc limit 40) x), '[]'::jsonb);
  end if;
  return v;
end $$;
revoke all on function public.calendario_lugares(uuid) from public, anon;
grant execute on function public.calendario_lugares(uuid) to authenticated;
