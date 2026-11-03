-- ============================================================
-- Formas de pago por sucursal + Cierre del día (con POS o declarado a mano)
-- ============================================================

alter table public.empresas add column if not exists zona_horaria text not null default 'America/Santiago';

-- Dónde se recibe cada forma de pago. Sin filas = todas las sucursales (incluidas las futuras).
create table if not exists public.metodos_pago_sucursales (
  id_metodo_pago uuid not null references public.metodos_pago(id) on delete cascade,
  id_sucursal    uuid not null references public.sucursales(id) on delete cascade,
  id_empresa     uuid not null references public.empresas(id) on delete cascade,
  primary key (id_metodo_pago, id_sucursal)
);
alter table public.metodos_pago_sucursales enable row level security;
drop policy if exists acceso_lectura on public.metodos_pago_sucursales;
drop policy if exists suscripcion on public.metodos_pago_sucursales;
create policy acceso_lectura on public.metodos_pago_sucursales for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.metodos_pago_sucursales as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

-- Crear o editar una forma de pago y sus sucursales (arreglo vacío = todas)
create or replace function public.guardar_metodo_pago(
  p_id_empresa uuid, p_id uuid, p_nombre text, p_tipo text, p_moneda text, p_tasa numeric, p_sucursales uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; s uuid;
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede configurar formas de pago' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then
    raise exception 'El módulo Ventas no está activo' using errcode = '42501';
  end if;
  if nullif(trim(p_nombre),'') is null then raise exception 'Indica un nombre' using errcode = '22023'; end if;
  if upper(p_tipo) not in ('EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO') then
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.metodos_pago (id_empresa, nombre, tipo, moneda, tasa_cambio, activo)
    values (p_id_empresa, left(trim(p_nombre),60), upper(p_tipo), upper(left(coalesce(nullif(trim(p_moneda),''),'CLP'),6)),
            coalesce(nullif(p_tasa,0),1), true) returning id into v_id;
  else
    update public.metodos_pago set nombre = left(trim(p_nombre),60), tipo = upper(p_tipo),
           moneda = upper(left(coalesce(nullif(trim(p_moneda),''),'CLP'),6)), tasa_cambio = coalesce(nullif(p_tasa,0),1)
     where id = v_id and id_empresa = p_id_empresa;
    if not found then raise exception 'Forma de pago no encontrada' using errcode = '22023'; end if;
  end if;
  delete from public.metodos_pago_sucursales where id_metodo_pago = v_id;
  foreach s in array coalesce(p_sucursales, '{}'::uuid[]) loop
    if exists (select 1 from public.sucursales where id = s and id_empresa = p_id_empresa) then
      insert into public.metodos_pago_sucursales (id_metodo_pago, id_sucursal, id_empresa) values (v_id, s, p_id_empresa)
      on conflict do nothing;
    end if;
  end loop;
  return v_id;
end $$;

-- Ocultar (no se borra: el historial de ventas y cierres sigue intacto)
create or replace function public.ocultar_metodo_pago(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.metodos_pago where id = p_id;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then
    raise exception 'Solo un Dueño o Administrador puede ocultar formas de pago' using errcode = '42501';
  end if;
  update public.metodos_pago set activo = false where id = p_id;
end $$;

-- Ventas del POS de una sucursal y día, por forma de pago (incluye formas ya ocultas que vendieron ese día)
create or replace function public._ventas_dia_por_metodo(p_id_sucursal uuid, p_fecha date)
returns table (id_metodo_pago uuid, nombre text, tipo text, moneda text, sistema numeric, n bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.nombre, m.tipo, m.moneda, sum(v.total), count(*)
    from public.ventas v
    join public.sucursales s on s.id = v.id_sucursal
    join public.empresas e on e.id = s.id_empresa
    join public.metodos_pago m on m.id = v.id_metodo_pago
   where v.id_sucursal = p_id_sucursal and v.origen = 'POS' and v.estado = 'COMPLETADA'
     and (v.created_at at time zone e.zona_horaria)::date = p_fecha
   group by m.id, m.nombre, m.tipo, m.moneda
$$;
revoke all on function public._ventas_dia_por_metodo(uuid,date) from public, anon, authenticated;

-- Resumen para mostrar en pantalla antes de cerrar (POS)
create or replace function public.resumen_dia_pos(p_id_sucursal uuid, p_fecha date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e uuid; v_abiertos int; v_res jsonb;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(e, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  select count(*) into v_abiertos from public.pos_turnos where id_sucursal = p_id_sucursal and estado = 'ABIERTO';
  -- formas de pago de la sucursal (aunque no hayan vendido) + las que vendieron ese día
  select coalesce(jsonb_agg(jsonb_build_object('id_metodo_pago', x.id, 'nombre', x.nombre, 'tipo', x.tipo, 'moneda', x.moneda,
                                                'sistema', coalesce(x.sistema,0), 'n', coalesce(x.n,0)) order by x.nombre), '[]'::jsonb)
    into v_res
    from (
      select m.id, m.nombre, m.tipo, m.moneda, d.sistema, d.n
        from public.metodos_pago m
        left join public._ventas_dia_por_metodo(p_id_sucursal, p_fecha) d on d.id_metodo_pago = m.id
       where m.id_empresa = e and upper(coalesce(m.tipo,'')) <> 'CREDITO'
         and ((coalesce(m.activo,true) and (not exists (select 1 from public.metodos_pago_sucursales ms where ms.id_metodo_pago = m.id)
                                            or exists (select 1 from public.metodos_pago_sucursales ms where ms.id_metodo_pago = m.id and ms.id_sucursal = p_id_sucursal)))
              or d.sistema is not null)
    ) x;
  return jsonb_build_object('turnos_abiertos', v_abiertos, 'metodos', v_res,
    'cerrado', exists (select 1 from public.cierres_dia where id_sucursal = p_id_sucursal and fecha = p_fecha));
end $$;

-- Cierres del día
create table if not exists public.cierres_dia (
  id            uuid primary key default gen_random_uuid(),
  id_empresa    uuid not null references public.empresas(id) on delete cascade,
  id_sucursal   uuid not null references public.sucursales(id) on delete cascade,
  fecha         date not null,
  modo          text not null check (modo in ('POS','MANUAL')),
  responsable   text not null,
  comentario    text,
  total_dia_declarado numeric,                 -- solo MANUAL: total del día según su sistema externo
  desglose      jsonb not null default '[]'::jsonb,   -- [{id_metodo_pago,nombre,tipo,moneda,sistema,declarado,diferencia}]
  totales       jsonb not null default '{}'::jsonb,   -- {CLP:{sistema,declarado,diferencia}}
  cuadrado      boolean not null,
  cerrado_por   uuid,
  created_at    timestamptz not null default now(),
  unique (id_sucursal, fecha)
);
create index if not exists cierres_dia_empresa_idx on public.cierres_dia(id_empresa, fecha desc);
alter table public.cierres_dia enable row level security;
drop policy if exists acceso_lectura on public.cierres_dia;
drop policy if exists suscripcion on public.cierres_dia;
create policy acceso_lectura on public.cierres_dia for select using (public.tiene_acceso_a_empresa(id_empresa));
create policy suscripcion on public.cierres_dia as restrictive for all
  using (public.empresa_tiene_modulo(id_empresa, 'ventas')) with check (public.empresa_tiene_modulo(id_empresa, 'ventas'));

-- p_declarado: [{id_metodo_pago, monto}]
create or replace function public.cerrar_dia(
  p_id_sucursal uuid, p_fecha date, p_modo text, p_responsable text, p_comentario text,
  p_declarado jsonb, p_total_dia numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e uuid; x jsonb; m record; v_sis numeric; v_decl numeric; v_desglose jsonb := '[]'::jsonb;
  v_totales jsonb := '{}'::jsonb; v_cuadrado boolean := true; v_id uuid; v_hoy date; v_tz text; v_dif numeric;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(e, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_modo not in ('POS','MANUAL') then raise exception 'Modo no válido' using errcode = '22023'; end if;
  if nullif(trim(p_responsable),'') is null then raise exception 'Escribe el nombre del responsable' using errcode = '22023'; end if;
  if jsonb_typeof(p_declarado) <> 'array' then raise exception 'Datos no válidos' using errcode = '22023'; end if;
  select zona_horaria into v_tz from public.empresas where id = e;
  v_hoy := (now() at time zone v_tz)::date;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'La fecha no puede ser futura' using errcode = '22023'; end if;
  if exists (select 1 from public.cierres_dia where id_sucursal = p_id_sucursal and fecha = p_fecha) then
    raise exception 'Ese día ya está cerrado para esta sucursal' using errcode = '22023';
  end if;
  if p_modo = 'POS' and exists (select 1 from public.pos_turnos where id_sucursal = p_id_sucursal and estado = 'ABIERTO') then
    raise exception 'Hay turnos abiertos en esta sucursal. Ciérralos antes de cerrar el día.' using errcode = '22023';
  end if;

  for x in select * from jsonb_array_elements(p_declarado) loop
    select * into m from public.metodos_pago where id = (x->>'id_metodo_pago')::uuid and id_empresa = e;
    if not found then raise exception 'Forma de pago no válida' using errcode = '22023'; end if;
    v_decl := round(coalesce((x->>'monto')::numeric, 0), 2);
    if v_decl < 0 then raise exception 'Los montos no pueden ser negativos' using errcode = '22023'; end if;
    v_sis := case when p_modo = 'POS' then coalesce((select sistema from public._ventas_dia_por_metodo(p_id_sucursal, p_fecha) where id_metodo_pago = m.id), 0) else null end;
    v_dif := case when p_modo = 'POS' then v_decl - v_sis else null end;
    v_desglose := v_desglose || jsonb_build_object('id_metodo_pago', m.id, 'nombre', m.nombre, 'tipo', m.tipo, 'moneda', m.moneda,
                                                   'sistema', v_sis, 'declarado', v_decl, 'diferencia', v_dif);
    v_totales := jsonb_set(v_totales, array[m.moneda],
        jsonb_build_object('sistema', coalesce((v_totales->m.moneda->>'sistema')::numeric,0) + coalesce(v_sis,0),
                           'declarado', coalesce((v_totales->m.moneda->>'declarado')::numeric,0) + v_decl,
                           'diferencia', coalesce((v_totales->m.moneda->>'diferencia')::numeric,0) + coalesce(v_dif,0)), true);
  end loop;

  if p_modo = 'POS' then
    -- ventas por formas de pago que el usuario no declaró: cuentan como "declarado 0"
    for m in select d.*, mp.id as _x from public._ventas_dia_por_metodo(p_id_sucursal, p_fecha) d join public.metodos_pago mp on mp.id = d.id_metodo_pago loop
      if not exists (select 1 from jsonb_array_elements(v_desglose) y where (y->>'id_metodo_pago')::uuid = m.id_metodo_pago) then
        v_desglose := v_desglose || jsonb_build_object('id_metodo_pago', m.id_metodo_pago, 'nombre', m.nombre, 'tipo', m.tipo, 'moneda', m.moneda,
                                                       'sistema', m.sistema, 'declarado', 0, 'diferencia', -m.sistema);
        v_totales := jsonb_set(v_totales, array[m.moneda],
            jsonb_build_object('sistema', coalesce((v_totales->m.moneda->>'sistema')::numeric,0) + m.sistema,
                               'declarado', coalesce((v_totales->m.moneda->>'declarado')::numeric,0),
                               'diferencia', coalesce((v_totales->m.moneda->>'diferencia')::numeric,0) - m.sistema), true);
      end if;
    end loop;
    select bool_and(coalesce((y->>'diferencia')::numeric,0) = 0) into v_cuadrado from jsonb_array_elements(v_desglose) y;
    v_cuadrado := coalesce(v_cuadrado, true);
  else
    if p_total_dia is null or p_total_dia < 0 then raise exception 'Indica el total del día' using errcode = '22023'; end if;
    v_cuadrado := (p_total_dia = (select coalesce(sum((y->>'declarado')::numeric),0) from jsonb_array_elements(v_desglose) y));
  end if;

  if not v_cuadrado and nullif(trim(p_comentario),'') is null then
    raise exception 'No cuadra: escribe un comentario que explique la diferencia' using errcode = '22023';
  end if;

  insert into public.cierres_dia (id_empresa, id_sucursal, fecha, modo, responsable, comentario, total_dia_declarado, desglose, totales, cuadrado, cerrado_por)
  values (e, p_id_sucursal, p_fecha, p_modo, left(trim(p_responsable),80), left(p_comentario,2000),
          case when p_modo = 'MANUAL' then p_total_dia end, v_desglose, v_totales, v_cuadrado, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'cuadrado', v_cuadrado, 'desglose', v_desglose, 'totales', v_totales);
end $$;

revoke all on function public.guardar_metodo_pago(uuid,uuid,text,text,text,numeric,uuid[]) from public, anon;
revoke all on function public.ocultar_metodo_pago(uuid) from public, anon;
revoke all on function public.resumen_dia_pos(uuid,date) from public, anon;
revoke all on function public.cerrar_dia(uuid,date,text,text,text,jsonb,numeric) from public, anon;
grant execute on function public.guardar_metodo_pago(uuid,uuid,text,text,text,numeric,uuid[]) to authenticated;
grant execute on function public.ocultar_metodo_pago(uuid) to authenticated;
grant execute on function public.resumen_dia_pos(uuid,date) to authenticated;
grant execute on function public.cerrar_dia(uuid,date,text,text,text,jsonb,numeric) to authenticated;
