-- ============================================================
-- Historial unificado: ventas, cotizaciones, agenda, cobros, abonos
-- y cierres del día en una sola lista con filtros y paginación.
-- ============================================================
create or replace function public.historial_unificado(p_id_empresa uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_desde date := nullif(p_filtros->>'desde','')::date;
  v_hasta date := nullif(p_filtros->>'hasta','')::date;
  v_suc uuid := nullif(p_filtros->>'sucursal','')::uuid;
  v_q text := nullif(trim(p_filtros->>'buscar'),'');
  v_estado text := nullif(lower(trim(p_filtros->>'estado')),'');
  v_tipos text[];
  v_lim int := greatest(1, least(coalesce(nullif(p_filtros->>'limite','')::int, 50), 5000));
  v_off int := greatest(0, coalesce(nullif(p_filtros->>'offset','')::int, 0));
  v_res jsonb;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(p_id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = p_id_empresa;
  v_tipos := coalesce(array(select jsonb_array_elements_text(p_filtros->'tipos')), '{}');
  if cardinality(v_tipos) = 0 then v_tipos := array['venta','cotizacion','agenda','cobro','abono','cierre']; end if;
  if v_desde is not null and v_hasta is not null and v_hasta - v_desde > 3660 then raise exception 'Rango de fechas demasiado grande' using errcode = '22023'; end if;
  if v_suc is not null and not exists (select 1 from public.sucursales where id = v_suc and id_empresa = p_id_empresa) then raise exception 'Sucursal no válida' using errcode = '22023'; end if;
  if v_q is not null then v_q := '%' || replace(replace(replace(left(v_q,80),'\','\\'),'%','\%'),'_','\_') || '%'; end if;

  with h as (
    select 'venta'::text tipo, v.id, v.created_at ts, coalesce(v.numero_ticket,'') numero, coalesce(c.nombre,'') cliente,
           trim(coalesce(v.origen,'') || ' · ' || coalesce(v.metodo_pago,'')) detalle, v.total monto, v.moneda,
           lower(v.estado) estado, v.id_sucursal suc
      from public.ventas v left join public.clientes c on c.id = v.id_cliente
     where 'venta' = any(v_tipos) and v.id_empresa = p_id_empresa
    union all
    select 'cotizacion', q.id, q.created_at, lpad(q.numero::text,4,'0') || case when q.revision > 1 then ' r' || q.revision else '' end,
           q.cliente_nombre, coalesce(q.titulo,''), q.total, q.moneda, lower(q.estado), null::uuid
      from public.cotizaciones q where 'cotizacion' = any(v_tipos) and q.id_empresa = p_id_empresa
    union all
    select 'agenda', a.id, a.fecha_inicio, 'AG-' || lpad(a.numero::text,4,'0'), a.cliente_nombre,
           initcap(a.tipo) || coalesce(' · ' || nullif(a.titulo,''),''), a.total, a.moneda, lower(a.estado), a.id_sucursal
      from public.agenda_trabajos a where 'agenda' = any(v_tipos) and a.id_empresa = p_id_empresa
    union all
    select 'cobro', cc.id, cc.created_at, '', coalesce(c.nombre,''), coalesce(cc.concepto,'Cuenta por cobrar'), cc.monto_deuda, cc.moneda, lower(cc.estado), v.id_sucursal
      from public.cuentas_por_cobrar cc left join public.clientes c on c.id = cc.id_cliente left join public.ventas v on v.id = cc.id_venta
     where 'cobro' = any(v_tipos) and cc.id_empresa = p_id_empresa
    union all
    select 'abono', p.id, p.created_at, '', coalesce(c.nombre,''), trim(coalesce(p.metodo_nombre,'') || ' ' || coalesce(p.nota,'')), p.monto, cc.moneda, 'registrado', v.id_sucursal
      from public.cxc_pagos p join public.cuentas_por_cobrar cc on cc.id = p.id_cuenta
      left join public.clientes c on c.id = cc.id_cliente left join public.ventas v on v.id = cc.id_venta
     where 'abono' = any(v_tipos) and p.id_empresa = p_id_empresa
    union all
    select 'cierre', d.id, d.created_at, to_char(d.fecha,'DD/MM/YYYY'), '', 'Cierre de caja · ' || coalesce(d.responsable,''), d.total_dia_declarado, 'CLP',
           case when d.cuadrado then 'cuadrado' else 'con diferencia' end, d.id_sucursal
      from public.cierres_dia d where 'cierre' = any(v_tipos) and d.id_empresa = p_id_empresa
  ), f as (
    select h.*, coalesce((select nombre from public.sucursales s where s.id = h.suc),'') sucursal
      from h
     where (v_desde is null or (ts at time zone v_tz)::date >= v_desde)
       and (v_hasta is null or (ts at time zone v_tz)::date <= v_hasta)
       and (v_suc is null or suc = v_suc)
       and (v_estado is null or estado = v_estado)
       and (v_q is null or cliente ilike v_q or numero ilike v_q or detalle ilike v_q)
  )
  select jsonb_build_object('total', (select count(*) from f),
    'filas', coalesce((select jsonb_agg(to_jsonb(t) order by t.ts desc, t.id) from
       (select tipo, id, ts, numero, cliente, detalle, monto, moneda, estado, sucursal from f order by ts desc, id limit v_lim offset v_off) t), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;
revoke all on function public.historial_unificado(uuid,jsonb) from public, anon;
grant execute on function public.historial_unificado(uuid,jsonb) to authenticated;
