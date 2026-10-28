-- =====================================================================
-- Buddy ERP · Fase 1 · Reparación de datos + roles automáticos
-- Fecha: 2026-10-28
--
-- Contexto: el código antiguo de "crear empresa" inventaba un id sin
-- crear la empresa real ("empresas fantasma"), el registro por invitación
-- no lograba crear el perfil, y ninguna membresía tenía id_rol, por lo
-- que Admins y Operadores no veían módulos en el menú.
--
-- 1. Elimina las empresas fantasma de prueba ("Empresa Nueva" y la sin nombre).
-- 2. Convierte "Mi Sticker Chile" en empresa real (mismo id) + Casa Matriz,
--    con su creador (buddyerp@outlook.com) como Dueño.
-- 3. Elimina roles huérfanos de empresas inexistentes.
-- 4. Roles predeterminados automáticos (Dueño / Admin / Colaborador) con los
--    mismos permisos que crea parametros.js, para toda empresa nueva o existente.
-- 5. Vincula automáticamente cada membresía a su rol de permisos:
--    Dueño → Dueño · Admin → Admin · Operador → Colaborador.
-- 6. Crea el perfil de los usuarios que no lo tenían.
-- 7. Quita el PIN "1234" por defecto de perfiles.
-- 8. Integridad: usuarios_empresas e invitaciones ya no pueden apuntar
--    a empresas inexistentes; no se permiten membresías duplicadas.
-- 9. Función listar_equipo_empresa() para el administrador de usuarios
--    (muestra nombre, apellido y correo sin exponer otros datos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de roles
-- ---------------------------------------------------------------------
create or replace function public.crear_roles_predeterminados(p_id_empresa uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_colab uuid;
  v_mapa  jsonb := '{
    "admin":      ["admin_empresa","admin_seguridad"],
    "ventas":     ["ventas_pos","ventas_descuentos","ventas_cierre","ventas_cxc","ventas_cotizaciones","ventas_ranking"],
    "inventario": ["inventario_stock","inventario_ajustes","inventario_pedidos","inventario_movimientos","inventario_recetas"],
    "reportes":   ["reportes_valorizacion","reportes_kardex","reportes_historial"],
    "catalogos":  ["catalogos_productos","catalogos_categorias","catalogos_unidades","catalogos_proveedores","catalogos_tipos_mov","catalogos_sucursales","catalogos_ubicaciones","catalogos_clientes"]
  }';
  v_master text;
  v_hijo   text;
begin
  if exists (select 1 from public.roles where id_empresa = p_id_empresa) then
    return;
  end if;

  insert into public.roles (id_empresa, nombre, es_predeterminado) values (p_id_empresa, 'Dueño', true);
  insert into public.roles (id_empresa, nombre, es_predeterminado) values (p_id_empresa, 'Admin', true) returning id into v_admin;
  insert into public.roles (id_empresa, nombre, es_predeterminado) values (p_id_empresa, 'Colaborador', true) returning id into v_colab;

  for v_master in select jsonb_object_keys(v_mapa) loop
    insert into public.permisos_roles (id_rol, modulo, puede_ver) values (v_admin, v_master, true);
    if v_master <> 'admin' then
      insert into public.permisos_roles (id_rol, modulo, puede_ver) values (v_colab, v_master, true);
    end if;
    for v_hijo in select jsonb_array_elements_text(v_mapa -> v_master) loop
      insert into public.permisos_roles (id_rol, modulo, puede_ver) values (v_admin, v_hijo, true);
      if v_master <> 'admin' and v_hijo <> 'inventario_recetas' then
        insert into public.permisos_roles (id_rol, modulo, puede_ver) values (v_colab, v_hijo, true);
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.rol_id_para(p_id_empresa uuid, p_rol text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from public.roles r
  where r.id_empresa = p_id_empresa
    and r.nombre = case p_rol when 'Operador' then 'Colaborador' else p_rol end
  order by r.es_predeterminado desc, r.created_at
  limit 1;
$$;

-- Toda empresa nueva nace con sus roles predeterminados.
create or replace function public.trg_empresa_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crear_roles_predeterminados(new.id);
  return new;
end;
$$;

drop trigger if exists trg_empresa_roles on public.empresas;
create trigger trg_empresa_roles
  after insert on public.empresas
  for each row execute function public.trg_empresa_roles();

-- Toda membresía queda vinculada a su rol de permisos.
create or replace function public.trg_membresia_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.id_rol is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.rol is not distinct from old.rol then
    return new;
  end if;
  perform public.crear_roles_predeterminados(new.id_empresa);
  new.id_rol := public.rol_id_para(new.id_empresa, new.rol);
  return new;
end;
$$;

drop trigger if exists trg_membresia_rol on public.usuarios_empresas;
create trigger trg_membresia_rol
  before insert or update of rol on public.usuarios_empresas
  for each row execute function public.trg_membresia_rol();

-- ---------------------------------------------------------------------
-- Reparación de datos
-- ---------------------------------------------------------------------

-- 1. Empresas fantasma de prueba
delete from public.invitaciones
where id_empresa in ('c02551a9-3230-4432-ac87-e054badc4b15', '7c396007-c56c-4a65-901f-b929a3f0f8bb');
delete from public.usuarios_empresas
where id_empresa in ('c02551a9-3230-4432-ac87-e054badc4b15', '7c396007-c56c-4a65-901f-b929a3f0f8bb');

-- 2. "Mi Sticker Chile" pasa a ser una empresa real (el trigger crea sus roles)
insert into public.empresas (id, nombre, nombre_comercial, pais, configuracion)
values ('23f5c560-1338-4f07-a4e5-4fc7d2601716', 'Mi Sticker Chile', 'Mi Sticker Chile', 'Chile',
        '{"operador":{"recetas":true,"reportes":true,"catalogos":true}}'::jsonb)
on conflict (id) do nothing;

insert into public.sucursales (id_empresa, nombre, direccion, nombre_comercial)
select '23f5c560-1338-4f07-a4e5-4fc7d2601716', 'Casa Matriz', 'Sin dirección registrada', 'Mi Sticker Chile'
where not exists (select 1 from public.sucursales where id_empresa = '23f5c560-1338-4f07-a4e5-4fc7d2601716');

update public.usuarios_empresas
set rol = 'Dueño'
where id_empresa = '23f5c560-1338-4f07-a4e5-4fc7d2601716'
  and id_usuario = 'e9225097-ec58-4dd4-8625-d7686bfe3ffb';

-- 3. Roles huérfanos (sus permisos se borran en cascada)
delete from public.roles r
where not exists (select 1 from public.empresas e where e.id = r.id_empresa);

-- 4. Roles predeterminados para empresas que no los tenían
select public.crear_roles_predeterminados(id) from public.empresas;

-- 5. Vincular membresías existentes a su rol
update public.usuarios_empresas
set id_rol = public.rol_id_para(id_empresa, rol)
where id_rol is null;

-- 6. PIN "1234" por defecto: eliminado (quien no elige PIN queda sin PIN)
alter table public.perfiles alter column pin_seguridad drop default;

-- 7. Perfiles faltantes
insert into public.perfiles (id_usuario, id_empresa, nombre, apellido, email, rut_o_identificacion, pin_seguridad)
select
  u.id,
  (select ue.id_empresa from public.usuarios_empresas ue
   where ue.id_usuario = u.id order by ue.created_at limit 1),
  case u.email
    when 'valen2043@gmail.com' then 'Antonia'
    else coalesce(nullif(trim(u.raw_user_meta_data->>'nombre'), ''), split_part(u.email, '@', 1))
  end,
  case u.email
    when 'valen2043@gmail.com' then 'Ibarra'
    else nullif(trim(u.raw_user_meta_data->>'apellido'), '')
  end,
  lower(u.email),
  case u.email when 'valen2043@gmail.com' then '293962499' else null end,
  null
from auth.users u
where not exists (select 1 from public.perfiles p where p.id_usuario = u.id);

-- ---------------------------------------------------------------------
-- 8. Integridad referencial
-- ---------------------------------------------------------------------
alter table public.usuarios_empresas
  add constraint usuarios_empresas_id_empresa_fkey
  foreign key (id_empresa) references public.empresas(id) on delete cascade;

alter table public.usuarios_empresas
  add constraint usuarios_empresas_id_usuario_fkey
  foreign key (id_usuario) references auth.users(id) on delete cascade;

alter table public.usuarios_empresas
  add constraint usuarios_empresas_usuario_empresa_key unique (id_usuario, id_empresa);

alter table public.invitaciones
  add constraint invitaciones_id_empresa_fkey
  foreign key (id_empresa) references public.empresas(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 9. Equipo de la empresa para el administrador de usuarios
-- ---------------------------------------------------------------------
create or replace function public.listar_equipo_empresa(p_id_empresa uuid)
returns table (id uuid, id_usuario uuid, nombre text, apellido text, email text, rol text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select ue.id, ue.id_usuario,
         coalesce(p.nombre, split_part(u.email, '@', 1))::text,
         p.apellido::text,
         u.email::text,
         ue.rol::text
  from public.usuarios_empresas ue
  join auth.users u on u.id = ue.id_usuario
  left join public.perfiles p on p.id_usuario = ue.id_usuario
  where ue.id_empresa = p_id_empresa
  order by case ue.rol when 'Dueño' then 0 when 'Admin' then 1 else 2 end, 3;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke all on function public.crear_roles_predeterminados(uuid) from public, anon, authenticated;
revoke all on function public.rol_id_para(uuid, text)           from public, anon, authenticated;
revoke all on function public.trg_empresa_roles()               from public, anon, authenticated;
revoke all on function public.trg_membresia_rol()               from public, anon, authenticated;
revoke all on function public.listar_equipo_empresa(uuid)       from public, anon;
grant execute on function public.listar_equipo_empresa(uuid)    to authenticated;
