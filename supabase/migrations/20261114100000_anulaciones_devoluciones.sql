-- ============================================================
-- POS: anulación de ventas y devoluciones parciales por línea.
-- Autoriza un admin/dueño (PIN si quien opera no lo es).
-- Las correcciones del día cambian los totales del día; si el día ya
-- estaba cerrado, el cierre no se toca y el ajuste queda registrado.
-- ============================================================
create table if not exists public.ventas_ajustes (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  id_venta uuid references public.ventas(id) on delete set null,
  id_sucursal uuid,
  numero_ticket text,
  tipo text not null check (tipo in ('anulacion','devolucion')),
  motivo text not null check (char_length(motivo) between 3 and 300),
  monto numeric not null default 0,
  moneda text,
  id_metodo_reembolso uuid,
  metodo_reembolso text,
  items jsonb,
  repone_stock boolean not null default false,
  autorizado_por uuid,
  autorizado_nombre text,
  hecho_por uuid,
  dia_cerrado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ventas_ajustes_emp on public.ventas_ajustes(id_empresa, created_at desc);
create index if not exists ventas_ajustes_venta on public.ventas_ajustes(id_venta);
alter table public.ventas_ajustes enable row level security;
drop policy if exists ventas_ajustes_sel on public.ventas_ajustes;
create policy ventas_ajustes_sel on public.ventas_ajustes for select using (public.tiene_acceso_a_empresa(id_empresa));
drop policy if exists ventas_ajustes_susc on public.ventas_ajustes;
create policy ventas_ajustes_susc on public.ventas_ajustes as restrictive for all using (public.empresa_tiene_modulo(id_empresa,'ventas'));

-- ---------- Autorización (interno) ----------
-- Devuelve {ok,id,nombre} o {ok:false,error}. No lanza error por PIN malo
-- (si lo hiciera, se perdería el registro del intento fallido).
create or replace function public._pos_autorizar(p_empresa uuid, p_id_autoriza uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if public.es_admin_de_empresa(p_empresa) then
    return jsonb_build_object('ok', true, 'id', auth.uid(),
      'nombre', coalesce((select nombre from public.perfiles where id_usuario = auth.uid() limit 1), 'Administrador'));
  end if;
  if p_id_autoriza is null or nullif(p_pin,'') is null then
    return jsonb_build_object('ok', false, 'error', 'Se necesita el PIN de un administrador');
  end if;
  r := public.validar_pin(p_empresa, p_id_autoriza, p_pin);
  if r is null or (r->>'rol') not in ('Dueño','Admin','Administrador Supremo') then
    return jsonb_build_object('ok', false, 'error', 'PIN de administrador incorrecto');
  end if;
  return jsonb_build_object('ok', true, 'id', (r->>'id_usuario')::uuid, 'nombre', r->>'nombre');
end $$;
revoke all on function public._pos_autorizar(uuid,uuid,text) from public, anon, authenticated;

-- ---------- Anular una venta completa ----------
create or replace function public.anular_venta(
  p_id_venta uuid, p_motivo text, p_id_autoriza uuid default null, p_pin text default null,
  p_id_metodo_reembolso uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record; au jsonb; r record; v_ref text; v_tz text; v_cerrado boolean; v_monto numeric; v_met text;
  cc record;
begin
  select * into v from public.ventas where id = p_id_venta for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(v.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(v.id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if v.estado not in ('COMPLETADA','POR_COBRAR') then raise exception 'Esta venta ya está anulada o no se puede anular' using errcode = '22023'; end if;
  if v.origen = 'AGENDA' then raise exception 'Esta venta viene de la Agenda: cancélala desde la Agenda' using errcode = '22023'; end if;
  if v.id_importacion is not null then raise exception 'Esta venta es de una importación: reviértela desde Importar ventas' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  if exists (select 1 from public.ventas_ajustes where id_venta = v.id and tipo = 'devolucion') then
    raise exception 'Esta venta ya tiene devoluciones: devuelve el resto por línea' using errcode = '22023';
  end if;
  if p_id_metodo_reembolso is not null and not exists (select 1 from public.metodos_pago where id = p_id_metodo_reembolso and id_empresa = v.id_empresa) then
    raise exception 'Forma de devolución no válida' using errcode = '22023';
  end if;

  au := public._pos_autorizar(v.id_empresa, p_id_autoriza, p_pin);
  if not (au->>'ok')::boolean then return au; end if;

  -- Reponer stock con los mismos movimientos que lo descontaron
  v_ref := 'Venta POS #' || v.numero_ticket;
  for r in
    select id_producto, id_ubicacion, id_sub_ubicacion, sum(cantidad_movida) cant
      from public.movimientos_inventario
     where id_empresa = v.id_empresa and tipo_movimiento = 'VENTA_POS'
       and (referencia = v_ref or referencia = v_ref || ' (sin stock)')
     group by 1, 2, 3
  loop
    update public.inventario_saldos set cantidad_actual_ua = cantidad_actual_ua - r.cant, ultima_actualizacion = now()
     where id = (select s.id from public.inventario_saldos s
                  where s.id_empresa = v.id_empresa and s.id_sucursal = v.id_sucursal and s.id_producto = r.id_producto
                    and s.id_ubicacion is not distinct from r.id_ubicacion and s.id_sub_ubicacion is not distinct from r.id_sub_ubicacion
                  order by s.id limit 1);
    if not found then
      insert into public.inventario_saldos (id_empresa, id_producto, id_sucursal, id_ubicacion, id_sub_ubicacion, cantidad_actual_ua)
      values (v.id_empresa, r.id_producto, v.id_sucursal, r.id_ubicacion, r.id_sub_ubicacion, -r.cant);
    end if;
    insert into public.movimientos_inventario (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
    values (v.id_empresa, r.id_producto, 'ANULACION_POS', -r.cant, 'Anulación de Venta POS #' || v.numero_ticket, r.id_ubicacion, r.id_sub_ubicacion);
  end loop;

  update public.ventas set estado = 'ANULADA' where id = v.id;
  v_monto := v.total;
  select * into cc from public.cuentas_por_cobrar where id_venta = v.id order by created_at desc limit 1;
  if found then
    update public.cuentas_por_cobrar set estado = 'Anulada', monto_deuda = monto_pagado where id = cc.id;
    v_monto := cc.monto_pagado;      -- a crédito: solo se devuelve lo que ya abonó
  end if;

  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = v.id_empresa;
  v_cerrado := exists (select 1 from public.cierres_dia d where d.id_sucursal = v.id_sucursal and d.fecha = (v.created_at at time zone v_tz)::date);
  select nombre into v_met from public.metodos_pago where id = coalesce(p_id_metodo_reembolso, v.id_metodo_pago);

  insert into public.ventas_ajustes (id_empresa, id_venta, id_sucursal, numero_ticket, tipo, motivo, monto, moneda, id_metodo_reembolso, metodo_reembolso,
        repone_stock, autorizado_por, autorizado_nombre, hecho_por, dia_cerrado)
  values (v.id_empresa, v.id, v.id_sucursal, v.numero_ticket, 'anulacion', left(trim(p_motivo),300), v_monto, v.moneda,
        coalesce(p_id_metodo_reembolso, v.id_metodo_pago), coalesce(v_met, v.metodo_pago), true, (au->>'id')::uuid, au->>'nombre', auth.uid(), v_cerrado);

  return jsonb_build_object('ok', true, 'monto_a_devolver', v_monto, 'moneda', v.moneda, 'dia_cerrado', v_cerrado, 'metodo', coalesce(v_met, v.metodo_pago));
end $$;

-- ---------- Devolución parcial por línea ----------
-- p_items: [{id_detalle, cantidad, repone_stock}]
create or replace function public.devolver_items_venta(
  p_id_venta uuid, p_items jsonb, p_motivo text, p_id_autoriza uuid default null, p_pin text default null,
  p_id_metodo_reembolso uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record; au jsonb; it jsonb; d record; pr record; v_cant numeric; v_ref numeric; v_total_ref numeric := 0; v_tz text; v_cerrado boolean;
  v_repone boolean; v_ua numeric; v_any_repone boolean := false; v_items jsonb := '[]'::jsonb; v_met text; v_restan int; v_dec int; s record;
begin
  select * into v from public.ventas where id = p_id_venta for update;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(v.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(v.id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if v.estado <> 'COMPLETADA' then raise exception 'Solo se pueden devolver productos de ventas completadas (las de crédito se anulan)' using errcode = '22023'; end if;
  if v.origen = 'AGENDA' or v.id_importacion is not null then raise exception 'Esta venta no admite devoluciones desde aquí' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Elige qué se devuelve' using errcode = '22023'; end if;
  if p_id_metodo_reembolso is not null and not exists (select 1 from public.metodos_pago where id = p_id_metodo_reembolso and id_empresa = v.id_empresa) then
    raise exception 'Forma de devolución no válida' using errcode = '22023';
  end if;

  au := public._pos_autorizar(v.id_empresa, p_id_autoriza, p_pin);
  if not (au->>'ok')::boolean then return au; end if;

  v_dec := case when upper(coalesce(v.moneda,'CLP')) in ('CLP','COP','PYG','JPY') then 0 else 2 end;
  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::numeric;
    v_repone := coalesce((it->>'repone_stock')::boolean, false);
    select * into d from public.ventas_detalles where id = (it->>'id_detalle')::uuid and id_venta = v.id for update;
    if not found then raise exception 'Una línea no pertenece a esta venta' using errcode = '22023'; end if;
    if v_cant is null or v_cant <= 0 or v_cant > d.cantidad then raise exception 'Cantidad a devolver no válida' using errcode = '22023'; end if;
    v_ref := case when v_cant = d.cantidad then d.subtotal else round(d.subtotal / d.cantidad * v_cant, v_dec) end;
    v_total_ref := v_total_ref + v_ref;

    select id, nombre, control_stock, coalesce(nullif(cant_en_um_de_ua,0),1) um_por_ua into pr from public.productos where id = d.id_producto;

    if v_cant = d.cantidad then delete from public.ventas_detalles where id = d.id;
    else update public.ventas_detalles set cantidad = cantidad - v_cant, subtotal = subtotal - v_ref where id = d.id; end if;

    if v_repone and pr.id is not null and pr.control_stock is not false then
      v_ua := v_cant / pr.um_por_ua; v_any_repone := true;
      select s2.id, s2.id_ubicacion, s2.id_sub_ubicacion into s from public.inventario_saldos s2
        left join public.ubicaciones_internas u on u.id = s2.id_ubicacion
       where s2.id_empresa = v.id_empresa and s2.id_sucursal = v.id_sucursal and s2.id_producto = d.id_producto
       order by coalesce(u.orden, 999), s2.id limit 1;
      if found then
        update public.inventario_saldos set cantidad_actual_ua = cantidad_actual_ua + v_ua, ultima_actualizacion = now() where id = s.id;
      else
        insert into public.inventario_saldos (id_empresa, id_producto, id_sucursal, cantidad_actual_ua) values (v.id_empresa, d.id_producto, v.id_sucursal, v_ua);
      end if;
      insert into public.movimientos_inventario (id_empresa, id_producto, tipo_movimiento, cantidad_movida, referencia, id_ubicacion, id_sub_ubicacion)
      values (v.id_empresa, d.id_producto, 'DEVOLUCION_POS', v_ua, 'Devolución Venta POS #' || v.numero_ticket, s.id_ubicacion, s.id_sub_ubicacion);
    else v_repone := false; end if;

    v_items := v_items || jsonb_build_object('producto', coalesce(pr.nombre,'Producto'), 'cantidad', v_cant, 'monto', v_ref, 'repone_stock', v_repone);
  end loop;

  update public.ventas set total = total - v_total_ref where id = v.id;
  select count(*) into v_restan from public.ventas_detalles where id_venta = v.id;
  if v_restan = 0 then update public.ventas set estado = 'ANULADA', total = 0 where id = v.id; end if;

  select coalesce(zona_horaria,'America/Santiago') into v_tz from public.empresas where id = v.id_empresa;
  v_cerrado := exists (select 1 from public.cierres_dia d2 where d2.id_sucursal = v.id_sucursal and d2.fecha = (v.created_at at time zone v_tz)::date);
  select nombre into v_met from public.metodos_pago where id = coalesce(p_id_metodo_reembolso, v.id_metodo_pago);

  insert into public.ventas_ajustes (id_empresa, id_venta, id_sucursal, numero_ticket, tipo, motivo, monto, moneda, id_metodo_reembolso, metodo_reembolso,
        items, repone_stock, autorizado_por, autorizado_nombre, hecho_por, dia_cerrado)
  values (v.id_empresa, v.id, v.id_sucursal, v.numero_ticket, 'devolucion', left(trim(p_motivo),300), v_total_ref, v.moneda,
        coalesce(p_id_metodo_reembolso, v.id_metodo_pago), coalesce(v_met, v.metodo_pago), v_items, v_any_repone, (au->>'id')::uuid, au->>'nombre', auth.uid(), v_cerrado);

  return jsonb_build_object('ok', true, 'monto_a_devolver', v_total_ref, 'moneda', v.moneda, 'dia_cerrado', v_cerrado,
                            'metodo', coalesce(v_met, v.metodo_pago), 'total_restante', v.total - v_total_ref, 'venta_anulada', v_restan = 0);
end $$;

revoke all on function public.anular_venta(uuid,text,uuid,text,uuid), public.devolver_items_venta(uuid,jsonb,text,uuid,text,uuid) from public, anon;
grant execute on function public.anular_venta(uuid,text,uuid,text,uuid), public.devolver_items_venta(uuid,jsonb,text,uuid,text,uuid) to authenticated;
