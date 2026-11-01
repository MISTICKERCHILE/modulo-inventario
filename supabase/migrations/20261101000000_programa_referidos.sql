-- =====================================================================
-- Buddy ERP · Programa de recomendados ("Recomienda y gana")
-- Fecha: 2026-10-31
--
-- Reglas:
--   · Cada empresa tiene un código (ej. OLYMPIA-7KM) y un link /r/CODIGO.
--   · La empresa recomendada recibe +30 días de prueba (14 + 30 = 44).
--   · La empresa que recomendó gana 1 mes gratis cuando la recomendada
--     se vuelve cliente (Zeus activa su primer módulo pagado).
--   · Solo el Dueño ve su programa de recomendados.
--
-- Sin UPDATE masivo: el código de las empresas existentes se genera la
-- primera vez que su Dueño abre "Recomienda y gana".
-- =====================================================================

-- 1. Estructura
alter table public.empresas add column if not exists codigo_referido text;
alter table public.empresas add column if not exists referida_por uuid references public.empresas(id) on delete set null;
create unique index if not exists empresas_codigo_referido_key on public.empresas (codigo_referido);

create table if not exists public.referidos (
    id                     uuid primary key default gen_random_uuid(),
    id_empresa_referente   uuid not null references public.empresas(id) on delete cascade,
    id_empresa_referida    uuid not null unique references public.empresas(id) on delete cascade,
    codigo                 text not null,
    created_at             timestamptz not null default now(),
    recompensa_otorgada_en timestamptz
);
alter table public.referidos enable row level security;
-- Sin políticas: solo se lee y escribe mediante las funciones de abajo.

-- 2. Generación de códigos
create or replace function public.generar_codigo_referido(p_nombre text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
    v_base  text := left(regexp_replace(upper(translate(coalesce(p_nombre, ''),
                    'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z0-9]', '', 'g'), 8);
    v_abc   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_cod   text;
    i       int;
begin
    if v_base = '' then v_base := 'BUDDY'; end if;
    loop
        v_cod := v_base || '-';
        for i in 1..3 loop
            v_cod := v_cod || substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1);
        end loop;
        exit when not exists (select 1 from public.empresas where codigo_referido = v_cod);
    end loop;
    return v_cod;
end;
$$;

create or replace function public.trg_empresa_codigo_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.codigo_referido is null then
        new.codigo_referido := public.generar_codigo_referido(coalesce(new.nombre_comercial, new.nombre));
    end if;
    return new;
end;
$$;

create trigger trg_empresa_codigo_referido
    before insert on public.empresas
    for each row execute function public.trg_empresa_codigo_referido();

-- 3. Registrar que una empresa nueva llegó recomendada (+30 días de prueba)
create or replace function public.registrar_referido(p_id_empresa uuid, p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_codigo     text := upper(trim(coalesce(p_codigo, '')));
    v_referente  uuid;
begin
    if v_codigo = '' then return false; end if;

    select id into v_referente from public.empresas where codigo_referido = v_codigo;
    if v_referente is null or v_referente = p_id_empresa then return false; end if;
    if exists (select 1 from public.empresas where id = p_id_empresa and referida_por is not null) then return false; end if;

    update public.empresas
    set referida_por = v_referente,
        prueba_hasta = greatest(coalesce(prueba_hasta, now()), now()) + interval '30 days'
    where id = p_id_empresa;

    insert into public.referidos (id_empresa_referente, id_empresa_referida, codigo)
    values (v_referente, p_id_empresa, v_codigo)
    on conflict (id_empresa_referida) do nothing;

    return true;
end;
$$;

-- 4. Registro de empresa nueva: aplica el código de recomendado (bloque protegido:
--    si algo falla con el código, la cuenta se crea igual)
create or replace function public.crear_empresa_y_perfil()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_empresa_id uuid;
BEGIN
  IF new.raw_user_meta_data->>'tipo_registro' = 'nueva_empresa' THEN

    INSERT INTO public.empresas (nombre, rut_o_identificacion, pais, nombre_comercial, configuracion)
    VALUES (
      new.raw_user_meta_data->>'nombre_empresa',
      new.raw_user_meta_data->>'rut_empresa',
      new.raw_user_meta_data->>'pais',
      new.raw_user_meta_data->>'nombre_comercial',
      '{"operador":{"recetas":true,"reportes":true,"catalogos":true}}'::jsonb
    ) RETURNING id INTO v_empresa_id;

    INSERT INTO public.sucursales (id_empresa, nombre, direccion, nombre_comercial)
    VALUES (
      v_empresa_id, 'Casa Matriz', 'Sin dirección registrada', new.raw_user_meta_data->>'nombre_comercial'
    );

    INSERT INTO public.perfiles (id_usuario, id_empresa, nombre, apellido, email, telefono, pin_seguridad, fecha_nacimiento, rut_o_identificacion)
    VALUES (
      new.id,
      v_empresa_id,
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'apellido',
      new.email,
      new.raw_user_meta_data->>'telefono',
      new.raw_user_meta_data->>'pin_seguridad',
      NULLIF(new.raw_user_meta_data->>'fecha_nacimiento', '')::date,
      new.raw_user_meta_data->>'rut_personal'
    )
    ON CONFLICT (id_usuario) DO UPDATE SET
      id_empresa = EXCLUDED.id_empresa,
      nombre = EXCLUDED.nombre,
      apellido = EXCLUDED.apellido,
      email = EXCLUDED.email,
      telefono = EXCLUDED.telefono,
      pin_seguridad = EXCLUDED.pin_seguridad,
      fecha_nacimiento = EXCLUDED.fecha_nacimiento,
      rut_o_identificacion = EXCLUDED.rut_o_identificacion;

    INSERT INTO public.usuarios_empresas (id_usuario, id_empresa, rol, nombre_empresa)
    VALUES (
      new.id, v_empresa_id, 'Dueño', new.raw_user_meta_data->>'nombre_empresa'
    );

    -- Programa de recomendados
    BEGIN
      IF coalesce(trim(new.raw_user_meta_data->>'codigo_referido'), '') <> '' THEN
        PERFORM public.registrar_referido(v_empresa_id, new.raw_user_meta_data->>'codigo_referido');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo registrar el código de recomendado: %', SQLERRM;
    END;

  END IF;
  RETURN new;
END;
$function$;

-- 5. Validar un código desde el registro (antes de tener cuenta)
create or replace function public.validar_codigo_referido(p_codigo text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(nullif(trim(nombre_comercial), ''), nombre)::text
    from public.empresas
    where codigo_referido = upper(trim(coalesce(p_codigo, '')))
    limit 1;
$$;

-- 6. "Recomienda y gana" del Dueño
create or replace function public.mi_programa_referidos(p_id_empresa uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_codigo text;
begin
    if public.mi_rol_en_empresa(p_id_empresa) is distinct from 'Dueño' then
        raise exception 'Solo el Dueño de la empresa puede ver su programa de recomendados' using errcode = '42501';
    end if;

    select codigo_referido into v_codigo from public.empresas where id = p_id_empresa;
    if v_codigo is null then
        v_codigo := public.generar_codigo_referido((select coalesce(nombre_comercial, nombre) from public.empresas where id = p_id_empresa));
        update public.empresas set codigo_referido = v_codigo where id = p_id_empresa;
    end if;

    return jsonb_build_object(
        'codigo', v_codigo,
        'meses_ganados', (select count(*) from public.referidos where id_empresa_referente = p_id_empresa and recompensa_otorgada_en is not null),
        'referidos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'empresa', coalesce(nullif(trim(e.nombre_comercial), ''), e.nombre),
                'desde', r.created_at,
                'estado', case when r.recompensa_otorgada_en is not null then 'cliente'
                               when e.prueba_hasta > now() then 'en_prueba'
                               else 'sin_plan' end,
                'mes_ganado_en', r.recompensa_otorgada_en
            ) order by r.created_at desc)
            from public.referidos r
            join public.empresas e on e.id = r.id_empresa_referida
            where r.id_empresa_referente = p_id_empresa
        ), '[]'::jsonb)
    );
end;
$$;

-- 7. Recompensa: al activar el primer módulo pagado de una empresa recomendada
create or replace function public.zeus_cambiar_modulo(p_id_empresa uuid, p_modulo text, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_subs jsonb;
begin
    if not public.soy_zeus() then
        raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
    end if;
    if p_modulo not in ('ventas', 'inventario', 'personas') then
        raise exception 'Módulo desconocido: %', p_modulo using errcode = '22023';
    end if;

    update public.empresas
    set suscripciones = jsonb_set(coalesce(suscripciones, '{}'::jsonb), array[p_modulo],
            coalesce(suscripciones -> p_modulo, '{}'::jsonb) || jsonb_build_object('activo', p_activo), true)
    where id = p_id_empresa
    returning suscripciones into v_subs;

    if not found then
        raise exception 'Empresa no encontrada' using errcode = 'P0002';
    end if;

    insert into public.zeus_auditoria (id_usuario, email, id_empresa, accion, detalle)
    values (auth.uid(), (select email from auth.users where id = auth.uid()), p_id_empresa,
            'cambiar_modulo', jsonb_build_object('modulo', p_modulo, 'activo', p_activo));

    -- Primera activación de una empresa recomendada → 1 mes gratis para quien la recomendó
    if p_activo then
        update public.referidos
        set recompensa_otorgada_en = now()
        where id_empresa_referida = p_id_empresa and recompensa_otorgada_en is null;

        if found then
            insert into public.zeus_auditoria (id_usuario, email, id_empresa, accion, detalle)
            select auth.uid(), (select email from auth.users where id = auth.uid()), r.id_empresa_referente,
                   'mes_gratis_por_referido', jsonb_build_object('empresa_referida', p_id_empresa)
            from public.referidos r where r.id_empresa_referida = p_id_empresa;
        end if;
    end if;

    return v_subs;
end;
$$;

-- 8. Zeus: todas las recomendaciones
create or replace function public.zeus_referidos()
returns table (
    referente       text,
    codigo          text,
    referida        text,
    desde           timestamptz,
    prueba_hasta    timestamptz,
    mes_ganado_en   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.soy_zeus() then
        raise exception 'Acceso exclusivo Zeus' using errcode = '42501';
    end if;
    return query
    select ea.nombre::text, r.codigo, eb.nombre::text, r.created_at, eb.prueba_hasta, r.recompensa_otorgada_en
    from public.referidos r
    join public.empresas ea on ea.id = r.id_empresa_referente
    join public.empresas eb on eb.id = r.id_empresa_referida
    order by r.created_at desc;
end;
$$;

-- Permisos
revoke all on function public.generar_codigo_referido(text)      from public, anon, authenticated;
revoke all on function public.trg_empresa_codigo_referido()      from public, anon, authenticated;
revoke all on function public.registrar_referido(uuid, text)     from public, anon, authenticated;
revoke all on function public.crear_empresa_y_perfil()           from public, anon, authenticated;
revoke all on function public.validar_codigo_referido(text)      from public;
revoke all on function public.mi_programa_referidos(uuid)        from public, anon;
revoke all on function public.zeus_referidos()                   from public, anon;
grant execute on function public.validar_codigo_referido(text)   to anon, authenticated;
grant execute on function public.mi_programa_referidos(uuid)     to authenticated;
grant execute on function public.zeus_referidos()                to authenticated;
