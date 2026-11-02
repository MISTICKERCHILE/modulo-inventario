-- ============================================================
-- PIN seguro del POS
--  * El PIN se valida contra UNA persona (persona + PIN); ya no hace falta que sea único.
--  * Cambiar un PIN exige la contraseña de quien lo hace.
--  * 5 intentos fallidos bloquean 5 minutos (PIN y contraseña).
-- Las funciones antiguas (asignar_pin de 3 parámetros y validar_pin de 2)
-- se retiran en una migración posterior, cuando el nuevo código esté en producción.
-- ============================================================

create table if not exists public.pin_intentos (
  id_usuario      uuid not null,
  tipo            text not null check (tipo in ('pin','clave')),
  fallos          int  not null default 0,
  bloqueado_hasta timestamptz,
  primary key (id_usuario, tipo)
);
alter table public.pin_intentos enable row level security;   -- sin políticas: solo funciones

-- Registra un fallo; devuelve true si quedó bloqueado
create or replace function public._registrar_fallo(p_usuario uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pin_intentos (id_usuario, tipo, fallos) values (p_usuario, p_tipo, 1)
  on conflict (id_usuario, tipo) do update
    set fallos = case when public.pin_intentos.fallos + 1 >= 5 then 0 else public.pin_intentos.fallos + 1 end,
        bloqueado_hasta = case when public.pin_intentos.fallos + 1 >= 5
                               then now() + interval '5 minutes' else public.pin_intentos.bloqueado_hasta end;
end $$;

create or replace function public._revisar_bloqueo(p_usuario uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_hasta timestamptz;
begin
  select bloqueado_hasta into v_hasta from public.pin_intentos
   where id_usuario = p_usuario and tipo = p_tipo;
  if v_hasta is not null and v_hasta > now() then
    raise exception 'Demasiados intentos fallidos. Intenta de nuevo en % minuto(s).',
      greatest(1, ceil(extract(epoch from (v_hasta - now())) / 60)::int)
      using errcode = 'P0001';
  end if;
end $$;

revoke all on function public._registrar_fallo(uuid,text) from public, anon, authenticated;
revoke all on function public._revisar_bloqueo(uuid,text)  from public, anon, authenticated;

-- Validar: persona + PIN
create or replace function public.validar_pin(p_id_empresa uuid, p_id_usuario uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_res jsonb;
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public._revisar_bloqueo(p_id_usuario, 'pin');

  select (p.pin_hash is not null and p.pin_hash = extensions.crypt(coalesce(p_pin,''), p.pin_hash)),
         jsonb_build_object('id_usuario', ue.id_usuario, 'nombre', coalesce(p.nombre,''), 'rol', ue.rol)
    into v_ok, v_res
    from public.usuarios_empresas ue
    join public.perfiles p on p.id_usuario = ue.id_usuario
   where ue.id_empresa = p_id_empresa and ue.id_usuario = p_id_usuario;

  if v_ok is true and coalesce(p_pin,'') ~ '^[0-9]{4,6}$' then
    delete from public.pin_intentos where id_usuario = p_id_usuario and tipo = 'pin';
    return v_res;
  end if;

  perform public._registrar_fallo(p_id_usuario, 'pin');
  return null;
end $$;

revoke all on function public.validar_pin(uuid,uuid,text) from public, anon;
grant execute on function public.validar_pin(uuid,uuid,text) to authenticated;

-- Asignar: pide la contraseña de quien hace el cambio. Devuelve 'ok' o 'clave_incorrecta'.
create or replace function public.asignar_pin(p_id_empresa uuid, p_id_usuario uuid, p_pin text, p_clave text)
returns text language plpgsql security definer set search_path = public as $$
declare v_clave_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if not (p_id_usuario = auth.uid() and public.tiene_acceso_a_empresa(p_id_empresa))
     and not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.usuarios_empresas
                  where id_empresa = p_id_empresa and id_usuario = p_id_usuario) then
    raise exception 'El usuario no pertenece a la empresa' using errcode = '22023';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos' using errcode = '22023';
  end if;

  perform public._revisar_bloqueo(auth.uid(), 'clave');

  select (u.encrypted_password is not null and u.encrypted_password = extensions.crypt(coalesce(p_clave,''), u.encrypted_password))
    into v_clave_ok from auth.users u where u.id = auth.uid();

  if v_clave_ok is not true then
    perform public._registrar_fallo(auth.uid(), 'clave');
    return 'clave_incorrecta';
  end if;
  delete from public.pin_intentos where id_usuario = auth.uid() and tipo = 'clave';

  update public.perfiles set pin_seguridad = p_pin where id_usuario = p_id_usuario;
  if not found then
    raise exception 'El usuario no tiene perfil' using errcode = 'P0002';
  end if;
  delete from public.pin_intentos where id_usuario = p_id_usuario and tipo = 'pin';  -- desbloquea
  return 'ok';
end $$;

revoke all on function public.asignar_pin(uuid,uuid,text,text) from public, anon;
grant execute on function public.asignar_pin(uuid,uuid,text,text) to authenticated;
