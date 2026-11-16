-- ============================================================
-- Compras + Tesorería · Fase 1b
-- - El resumen ignora las OC de Inventario que aún no tienen datos de pago.
-- - _decimales con search_path fijo (aviso del linter).
-- ============================================================
alter function public._decimales(text) set search_path = public;

-- Resumen del mes
create or replace function public.resumen_compras_mes(p_id_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.tiene_acceso_a_empresa(p_id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public._modulo_compras(p_id_empresa) then raise exception 'El módulo Compras no está activo' using errcode = '42501'; end if;
  with c as (
    select c.*, cf.tipo as tipo_cuenta, cf.nombre as nombre_cuenta, coalesce(c.total_factura, c.total_compra, 0) as total
      from public.compras c left join public.cuentas_financieras cf on cf.id = c.id_cuenta_pago
     where c.id_empresa = p_id_empresa and c.estado_pago <> 'anulado'
       -- OC de Inventario sin datos de pago no cuentan hasta completarlas en Compras
       and (c.origen = 'gasto' or c.id_cuenta_pago is not null or c.condicion_pago = 'credito' or c.monto_pagado > 0)
  ), mes as (select * from c where fecha_compra between p_desde and p_hasta),
  pagos as (
    select p.*, cf.nombre as nombre_cuenta from public.cxp_pagos p left join public.cuentas_financieras cf on cf.id = p.id_cuenta
     where p.id_empresa = p_id_empresa and p.fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'gastado_mes',       coalesce((select sum(total) from mes), 0),
    'salio_de_cuentas',  coalesce((select sum(total) from mes where tipo_cuenta in ('banco','billetera','caja') and condicion_pago = 'contado'), 0)
                         + coalesce((select sum(monto) from pagos where forma <> 'via_sueldo'), 0),
    'cargado_tarjetas',  coalesce((select sum(total) from mes where tipo_cuenta = 'tarjeta_credito'), 0),
    'adelantado_terceros', coalesce((select sum(total) from mes where tipo_cuenta = 'reembolsable'), 0),
    'a_credito_mes',     coalesce((select sum(total) from mes where condicion_pago = 'credito' and coalesce(tipo_cuenta,'') <> 'reembolsable'), 0),
    'debo_proveedores',  coalesce((select sum(total - monto_pagado) from c where estado_pago in ('pendiente','parcial') and coalesce(tipo_cuenta,'') <> 'reembolsable'), 0),
    'debo_personas',     coalesce((select jsonb_agg(jsonb_build_object('cuenta', nombre_cuenta, 'monto', s)) from (
                            select nombre_cuenta, sum(total - monto_pagado) s from c
                             where tipo_cuenta = 'reembolsable' and estado_pago in ('pendiente','parcial') group by nombre_cuenta) x), '[]'::jsonb),
    'antiguedad', (select jsonb_build_object(
        'al_dia',  coalesce(sum(total - monto_pagado) filter (where coalesce(fecha_vencimiento, fecha_compra) > current_date + 7), 0),
        'vence_7', coalesce(sum(total - monto_pagado) filter (where coalesce(fecha_vencimiento, fecha_compra) between current_date and current_date + 7), 0),
        'd1_30',   coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) between 1 and 30), 0),
        'd31_60',  coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) between 31 and 60), 0),
        'd60_mas', coalesce(sum(total - monto_pagado) filter (where current_date - coalesce(fecha_vencimiento, fecha_compra) > 60), 0))
      from c where estado_pago in ('pendiente','parcial')),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', coalesce(cg.nombre, 'Sin categoría'), 'monto', s) order by s desc)
                      from (select id_categoria_gasto, sum(total) s from mes group by id_categoria_gasto) x
                      left join public.categorias_gasto cg on cg.id = x.id_categoria_gasto), '[]'::jsonb),
    'por_cuenta', coalesce((select jsonb_agg(jsonb_build_object('cuenta', coalesce(nombre_cuenta, 'A crédito'), 'monto', s) order by s desc)
                      from (select nombre_cuenta, sum(total) s from mes group by nombre_cuenta) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

