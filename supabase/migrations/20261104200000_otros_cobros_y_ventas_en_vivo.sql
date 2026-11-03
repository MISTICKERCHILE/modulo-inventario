-- ============================================================
-- Cierre del día con "otros cobros" + ventas en vivo con comparación
-- ============================================================

alter table public.cierres_dia add column if not exists otros_cobros jsonb not null default '[]'::jsonb;
-- [{id_metodo_pago, nombre, moneda, monto (puede ser negativo), motivo}]

drop function if exists public.cerrar_dia(uuid,date,text,text,text,jsonb,numeric);

-- p_otros: [{id_metodo_pago, monto, motivo}] — suma (o resta, si es negativo) a lo esperado de esa forma de pago
create or replace function public.cerrar_dia(
  p_id_sucursal uuid, p_fecha date, p_modo text, p_responsable text, p_comentario text,
  p_declarado jsonb, p_total_dia numeric default null, p_otros jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e uuid; x jsonb; m record; v_sis numeric; v_decl numeric; v_otro numeric; v_esp numeric;
  v_desglose jsonb := '[]'::jsonb; v_otros jsonb := '[]'::jsonb; v_totales jsonb := '{}'::jsonb;
  v_cuadrado boolean := true; v_id uuid; v_hoy date; v_tz text; v_dif numeric; v_otros_total numeric := 0;
begin
  select id_empresa into e from public.sucursales where id = p_id_sucursal;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(e, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if p_modo not in ('POS','MANUAL') then raise exception 'Modo no válido' using errcode = '22023'; end if;
  if nullif(trim(p_responsable),'') is null then raise exception 'Escribe el nombre del responsable' using errcode = '22023'; end if;
  if jsonb_typeof(p_declarado) <> 'array' or jsonb_typeof(coalesce(p_otros,'[]'::jsonb)) <> 'array' then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  select zona_horaria into v_tz from public.empresas where id = e;
  v_hoy := (now() at time zone v_tz)::date;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'La fecha no puede ser futura' using errcode = '22023'; end if;
  if exists (select 1 from public.cierres_dia where id_sucursal = p_id_sucursal and fecha = p_fecha) then
    raise exception 'Ese día ya está cerrado para esta sucursal' using errcode = '22023';
  end if;
  if p_modo = 'POS' and exists (select 1 from public.pos_turnos where id_sucursal = p_id_sucursal and estado = 'ABIERTO') then
    raise exception 'Hay turnos abiertos en esta sucursal. Ciérralos antes de cerrar el día.' using errcode = '22023';
  end if;

  -- Otros cobros (validados)
  for x in select * from jsonb_array_elements(coalesce(p_otros,'[]'::jsonb)) loop
    select * into m from public.metodos_pago where id = (x->>'id_metodo_pago')::uuid and id_empresa = e;
    if not found then raise exception 'Otro cobro: forma de pago no válida' using errcode = '22023'; end if;
    if coalesce((x->>'monto')::numeric,0) = 0 then continue; end if;
    if nullif(trim(x->>'motivo'),'') is null then raise exception 'Cada otro cobro necesita un motivo' using errcode = '22023'; end if;
    v_otros := v_otros || jsonb_build_object('id_metodo_pago', m.id, 'nombre', m.nombre, 'moneda', m.moneda,
                                             'monto', round((x->>'monto')::numeric, 2), 'motivo', left(trim(x->>'motivo'), 200));
  end loop;

  for x in select * from jsonb_array_elements(p_declarado) loop
    select * into m from public.metodos_pago where id = (x->>'id_metodo_pago')::uuid and id_empresa = e;
    if not found then raise exception 'Forma de pago no válida' using errcode = '22023'; end if;
    v_decl := round(coalesce((x->>'monto')::numeric, 0), 2);
    if v_decl < 0 then raise exception 'Los montos no pueden ser negativos' using errcode = '22023'; end if;
    select coalesce(sum((o->>'monto')::numeric),0) into v_otro from jsonb_array_elements(v_otros) o where (o->>'id_metodo_pago')::uuid = m.id;
    v_sis := case when p_modo = 'POS' then coalesce((select sistema from public._ventas_dia_por_metodo(p_id_sucursal, p_fecha) where id_metodo_pago = m.id), 0) else null end;
    v_dif := case when p_modo = 'POS' then v_decl - (v_sis + v_otro) else null end;
    v_desglose := v_desglose || jsonb_build_object('id_metodo_pago', m.id, 'nombre', m.nombre, 'tipo', m.tipo, 'moneda', m.moneda,
                                                   'sistema', v_sis, 'otros', v_otro, 'declarado', v_decl, 'diferencia', v_dif);
    v_totales := jsonb_set(v_totales, array[m.moneda],
        jsonb_build_object('sistema', coalesce((v_totales->m.moneda->>'sistema')::numeric,0) + coalesce(v_sis,0),
                           'otros', coalesce((v_totales->m.moneda->>'otros')::numeric,0) + v_otro,
                           'declarado', coalesce((v_totales->m.moneda->>'declarado')::numeric,0) + v_decl,
                           'diferencia', coalesce((v_totales->m.moneda->>'diferencia')::numeric,0) + coalesce(v_dif,0)), true);
  end loop;

  if p_modo = 'POS' then
    for m in select d.* from public._ventas_dia_por_metodo(p_id_sucursal, p_fecha) d loop
      if not exists (select 1 from jsonb_array_elements(v_desglose) y where (y->>'id_metodo_pago')::uuid = m.id_metodo_pago) then
        select coalesce(sum((o->>'monto')::numeric),0) into v_otro from jsonb_array_elements(v_otros) o where (o->>'id_metodo_pago')::uuid = m.id_metodo_pago;
        v_desglose := v_desglose || jsonb_build_object('id_metodo_pago', m.id_metodo_pago, 'nombre', m.nombre, 'tipo', m.tipo, 'moneda', m.moneda,
                                                       'sistema', m.sistema, 'otros', v_otro, 'declarado', 0, 'diferencia', -(m.sistema + v_otro));
        v_totales := jsonb_set(v_totales, array[m.moneda],
            jsonb_build_object('sistema', coalesce((v_totales->m.moneda->>'sistema')::numeric,0) + m.sistema,
                               'otros', coalesce((v_totales->m.moneda->>'otros')::numeric,0) + v_otro,
                               'declarado', coalesce((v_totales->m.moneda->>'declarado')::numeric,0),
                               'diferencia', coalesce((v_totales->m.moneda->>'diferencia')::numeric,0) - (m.sistema + v_otro)), true);
      end if;
    end loop;
    -- otros cobros de una forma de pago que no aparece en el desglose
    for x in select o from jsonb_array_elements(v_otros) o loop
      if not exists (select 1 from jsonb_array_elements(v_desglose) y where (y->>'id_metodo_pago') = (x->>'id_metodo_pago')) then
        select * into m from public.metodos_pago where id = (x->>'id_metodo_pago')::uuid;
        v_otro := (x->>'monto')::numeric;
        v_desglose := v_desglose || jsonb_build_object('id_metodo_pago', m.id, 'nombre', m.nombre, 'tipo', m.tipo, 'moneda', m.moneda,
                                                       'sistema', 0, 'otros', v_otro, 'declarado', 0, 'diferencia', -v_otro);
        v_totales := jsonb_set(v_totales, array[m.moneda],
            jsonb_build_object('sistema', coalesce((v_totales->m.moneda->>'sistema')::numeric,0),
                               'otros', coalesce((v_totales->m.moneda->>'otros')::numeric,0) + v_otro,
                               'declarado', coalesce((v_totales->m.moneda->>'declarado')::numeric,0),
                               'diferencia', coalesce((v_totales->m.moneda->>'diferencia')::numeric,0) - v_otro), true);
      end if;
    end loop;
    select bool_and(coalesce((y->>'diferencia')::numeric,0) = 0) into v_cuadrado from jsonb_array_elements(v_desglose) y;
    v_cuadrado := coalesce(v_cuadrado, true);
  else
    if p_total_dia is null or p_total_dia < 0 then raise exception 'Indica el total del día' using errcode = '22023'; end if;
    select coalesce(sum((o->>'monto')::numeric),0) into v_otros_total from jsonb_array_elements(v_otros) o;
    v_cuadrado := ((p_total_dia + v_otros_total) = (select coalesce(sum((y->>'declarado')::numeric),0) from jsonb_array_elements(v_desglose) y));
  end if;

  if not v_cuadrado and nullif(trim(p_comentario),'') is null then
    raise exception 'No cuadra: escribe un comentario que explique la diferencia' using errcode = '22023';
  end if;

  insert into public.cierres_dia (id_empresa, id_sucursal, fecha, modo, responsable, comentario, total_dia_declarado, desglose, totales, cuadrado, cerrado_por, otros_cobros)
  values (e, p_id_sucursal, p_fecha, p_modo, left(trim(p_responsable),80), left(p_comentario,2000),
          case when p_modo = 'MANUAL' then p_total_dia end, v_desglose, v_totales, v_cuadrado, auth.uid(), v_otros)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'cuadrado', v_cuadrado, 'desglose', v_desglose, 'totales', v_totales, 'otros', v_otros);
end $$;

revoke all on function public.cerrar_dia(uuid,date,text,text,text,jsonb,numeric,jsonb) from public, anon;
grant execute on function public.cerrar_dia(uuid,date,text,text,text,jsonb,numeric,jsonb) to authenticated;

-- Ventas en vivo: hoy / semana / mes contra el período anterior a la misma altura
-- (mismo día y hora de la semana pasada; semana en curso vs. anterior; mes en curso vs. mes anterior)
create or replace function public.ventas_en_vivo(p_id_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tz text; ahora timestamp; per record; res jsonb := '[]'::jsonb; fila jsonb;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(p_id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  select zona_horaria into tz from public.empresas where id = p_id_empresa;
  ahora := now() at time zone tz;

  for per in
    select * from (values
      ('dia',    date_trunc('day', ahora),   ahora, date_trunc('day', ahora) - interval '7 days',  ahora - interval '7 days'),
      ('semana', date_trunc('week', ahora),  ahora, date_trunc('week', ahora) - interval '7 days', ahora - interval '7 days'),
      ('mes',    date_trunc('month', ahora), ahora, date_trunc('month', ahora) - interval '1 month', ahora - interval '1 month')
    ) t(periodo, ini, fin, ini_ant, fin_ant)
  loop
    select coalesce(jsonb_agg(f), '[]'::jsonb) into fila from (
      select jsonb_build_object(
          'periodo', per.periodo, 'id_sucursal', s.id, 'sucursal', s.nombre, 'moneda', c.moneda,
          'actual', coalesce(sum(case when c.t >= per.ini and c.t <= per.fin then c.total end), 0),
          'anterior', coalesce(sum(case when c.t >= per.ini_ant and c.t <= per.fin_ant then c.total end), 0),
          'ventas_actual', count(*) filter (where c.t >= per.ini and c.t <= per.fin)) f
        from public.sucursales s
        left join lateral (
          select (v.created_at at time zone tz) t, v.total, coalesce(v.moneda, m.moneda, 'CLP') moneda
            from public.ventas v left join public.metodos_pago m on m.id = v.id_metodo_pago
           where v.id_sucursal = s.id and v.estado = 'COMPLETADA'
             and (v.created_at at time zone tz) >= per.ini_ant and (v.created_at at time zone tz) <= per.fin
        ) c on true
       where s.id_empresa = p_id_empresa and c.moneda is not null
       group by s.id, s.nombre, c.moneda
    ) q;
    res := res || fila;
  end loop;
  return jsonb_build_object('actualizado', now(), 'filas', res);
end $$;

revoke all on function public.ventas_en_vivo(uuid) from public, anon;
grant execute on function public.ventas_en_vivo(uuid) to authenticated;
