-- Historial unificado: agrega los ajustes (anulaciones y devoluciones del POS).
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.historial_unificado(uuid,jsonb)'::regprocedure);
  if position('ventas_ajustes' in d) = 0 then
    d := replace(d, $a$array['venta','cotizacion','agenda','cobro','abono','cierre']$a$, $a$array['venta','cotizacion','agenda','cobro','abono','cierre','ajuste']$a$);
    d := replace(d, E'  ), f as (', $a$    union all
    select 'ajuste', j.id, j.created_at, coalesce(j.numero_ticket,''),
           coalesce((select c.nombre from public.ventas vv join public.clientes c on c.id = vv.id_cliente where vv.id = j.id_venta),''),
           initcap(j.tipo) || ' · ' || j.motivo, j.monto, j.moneda, case when j.dia_cerrado then 'día cerrado' else 'registrado' end, j.id_sucursal
      from public.ventas_ajustes j where 'ajuste' = any(v_tipos) and j.id_empresa = p_id_empresa
  ), f as ($a$);
    if position('ventas_ajustes' in d) = 0 then raise exception 'No se pudo parchear historial_unificado'; end if;
    execute d;
  end if;
end $mig$;
