-- ============================================================
-- Mesa de monitoreo: el dueño decide quién ve cada panel.
-- visible_para: null = todo el equipo con acceso a Ventas;
--               '{}' = solo Dueño/Admin; {'Vendedor',..} = esos roles.
-- Dueño y Admin siempre ven todo.
-- ============================================================
alter table public.lab_paneles add column if not exists visible_para text[];

create or replace function public._lab_puede_ver_panel(p_empresa uuid, p_visible text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_acceso_a_empresa(p_empresa)
     and (public.es_admin_de_empresa(p_empresa)
          or p_visible is null
          or coalesce(public.mi_rol_en_empresa(p_empresa) = any(p_visible), false));
$$;
revoke all on function public._lab_puede_ver_panel(uuid,text[]) from public, anon;
grant execute on function public._lab_puede_ver_panel(uuid,text[]) to authenticated;

create or replace function public._lab_puede_ver_widgets(p_panel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public._lab_puede_ver_panel(id_empresa, visible_para) from public.lab_paneles where id = p_panel), false);
$$;
revoke all on function public._lab_puede_ver_widgets(uuid) from public, anon;
grant execute on function public._lab_puede_ver_widgets(uuid) to authenticated;

drop policy if exists lab_paneles_sel on public.lab_paneles;
create policy lab_paneles_sel on public.lab_paneles for select using (public._lab_puede_ver_panel(id_empresa, visible_para));
drop policy if exists lab_widgets_sel on public.lab_widgets;
create policy lab_widgets_sel on public.lab_widgets for select using (public._lab_puede_ver_widgets(id_panel));

-- ¿Puede este usuario consultar datos del Laboratorio? Admin, o ve al menos un panel.
create or replace function public._lab_hay_acceso(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin_de_empresa(p_empresa)
      or exists (select 1 from public.lab_paneles p where p.id_empresa = p_empresa and public._lab_puede_ver_panel(p.id_empresa, p.visible_para));
$$;
revoke all on function public._lab_hay_acceso(uuid) from public, anon, authenticated;

-- Reemplaza lab_consultar agregando el chequeo de acceso (mismo cuerpo + 1 línea)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.lab_consultar(uuid,jsonb)'::regprocedure);
  if position('_lab_hay_acceso' in d) = 0 then
    d := replace(d, E'  if not public.empresa_tiene_modulo(p_id_empresa,''ventas'') then raise exception ''El módulo Ventas no está activo'' using errcode = ''42501''; end if;',
      E'  if not public.empresa_tiene_modulo(p_id_empresa,''ventas'') then raise exception ''El módulo Ventas no está activo'' using errcode = ''42501''; end if;\n  if not public._lab_hay_acceso(p_id_empresa) then raise exception ''No tienes acceso a la Mesa de monitoreo'' using errcode = ''42501''; end if;');
    if position('_lab_hay_acceso' in d) = 0 then raise exception 'No se pudo parchear lab_consultar'; end if;
    execute d;
  end if;
end $$;

-- Roles del equipo (para elegir quién ve) — solo admin
create or replace function public.roles_equipo_lab(p_id_empresa uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  return coalesce((select array_agg(distinct rol order by rol) from public.usuarios_empresas
                    where id_empresa = p_id_empresa and rol is not null and rol not in ('Dueño','Admin','Administrador Supremo')), '{}');
end $$;

create or replace function public.guardar_visibilidad_lab(p_id_panel uuid, p_visible text[])
returns void language plpgsql security definer set search_path = public as $$
declare e uuid; x text;
begin
  select id_empresa into e from public.lab_paneles where id = p_id_panel;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(e,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_visible is not null then
    if array_length(p_visible,1) > 30 then raise exception 'Demasiados roles' using errcode = '22023'; end if;
    foreach x in array p_visible loop
      if char_length(x) > 40 then raise exception 'Rol no válido' using errcode = '22023'; end if;
    end loop;
  end if;
  update public.lab_paneles set visible_para = p_visible, updated_at = now() where id = p_id_panel;
end $$;

revoke all on function public.roles_equipo_lab(uuid), public.guardar_visibilidad_lab(uuid,text[]) from public, anon;
grant execute on function public.roles_equipo_lab(uuid), public.guardar_visibilidad_lab(uuid,text[]) to authenticated;
