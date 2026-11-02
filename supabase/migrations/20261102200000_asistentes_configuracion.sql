-- ============================================================
-- Asistentes de configuración (inicial, ventas y los que vengan)
-- Una fila por empresa y asistente; las respuestas viven en jsonb,
-- así un asistente nuevo no necesita cambios en la base.
-- ============================================================

alter table public.empresas
  add column if not exists rubro   text,
  add column if not exists monedas text[] not null default '{}';

create table if not exists public.asistentes_empresa (
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  asistente      text not null,
  estado         text not null check (estado in ('completado','omitido')),
  respuestas     jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  primary key (id_empresa, asistente)
);
alter table public.asistentes_empresa enable row level security;   -- solo vía funciones

-- Leer (cualquier miembro: el dashboard se adapta según estas respuestas)
create or replace function public.mi_asistente(p_id_empresa uuid, p_asistente text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object('estado', estado, 'respuestas', respuestas)
    into v from public.asistentes_empresa
   where id_empresa = p_id_empresa and asistente = p_asistente;
  return v;   -- null si aún no se ha hecho
end $$;

-- Guardar (Dueño / Admin)
create or replace function public.guardar_asistente(
  p_id_empresa uuid, p_asistente text, p_estado text, p_respuestas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_monedas text[];
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede configurar la empresa' using errcode = '42501';
  end if;
  if p_asistente not in ('inicial','ventas') then
    raise exception 'Asistente desconocido' using errcode = '22023';
  end if;
  if p_estado not in ('completado','omitido') then
    raise exception 'Estado no válido' using errcode = '22023';
  end if;
  p_respuestas := coalesce(p_respuestas, '{}'::jsonb);

  insert into public.asistentes_empresa (id_empresa, asistente, estado, respuestas, actualizado_por)
  values (p_id_empresa, p_asistente, p_estado, p_respuestas, auth.uid())
  on conflict (id_empresa, asistente) do update
    set estado = excluded.estado, respuestas = excluded.respuestas,
        actualizado_en = now(), actualizado_por = auth.uid();

  -- Asistente inicial: datos de la empresa y sucursales
  if p_asistente = 'inicial' and p_estado = 'completado' then
    if nullif(trim(p_respuestas->>'rubro'), '') is not null then
      update public.empresas set rubro = left(trim(p_respuestas->>'rubro'), 60) where id = p_id_empresa;
    end if;
    if nullif(trim(p_respuestas->>'nombre_comercial'), '') is not null then
      update public.empresas set nombre_comercial = left(trim(p_respuestas->>'nombre_comercial'), 120) where id = p_id_empresa;
    end if;
    if jsonb_typeof(p_respuestas->'monedas') = 'array' then
      -- conserva el orden elegido: la primera es la principal
      select coalesce(array_agg(upper(left(trim(m), 6)) order by ord), '{}') into v_monedas
        from jsonb_array_elements_text(p_respuestas->'monedas') with ordinality as t(m, ord)
       where length(trim(m)) > 0;
      update public.empresas set monedas = v_monedas where id = p_id_empresa;
    end if;
    if jsonb_typeof(p_respuestas->'sucursales') = 'array' then
      for v_nombre in select left(trim(x), 80) from jsonb_array_elements_text(p_respuestas->'sucursales') x
                       where length(trim(x)) > 0 limit 20 loop
        if not exists (select 1 from public.sucursales
                        where id_empresa = p_id_empresa and lower(nombre) = lower(v_nombre)) then
          insert into public.sucursales (id_empresa, nombre) values (p_id_empresa, v_nombre);
        end if;
      end loop;
    end if;
  end if;
end $$;

-- Zeus: qué respondió cada empresa
create or replace function public.zeus_asistentes()
returns table (empresa text, asistente text, estado text, respuestas jsonb, actualizado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.soy_zeus() then
    raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
  end if;
  return query
  select e.nombre::text, a.asistente, a.estado, a.respuestas, a.actualizado_en
    from public.asistentes_empresa a join public.empresas e on e.id = a.id_empresa
   order by a.actualizado_en desc;
end $$;

revoke all on function public.mi_asistente(uuid,text)                   from public, anon;
revoke all on function public.guardar_asistente(uuid,text,text,jsonb)   from public, anon;
revoke all on function public.zeus_asistentes()                         from public, anon;
grant execute on function public.mi_asistente(uuid,text)                 to authenticated;
grant execute on function public.guardar_asistente(uuid,text,text,jsonb) to authenticated;
grant execute on function public.zeus_asistentes()                       to authenticated;
