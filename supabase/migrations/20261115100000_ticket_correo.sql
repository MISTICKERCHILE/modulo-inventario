-- ============================================================
-- Ticket de venta por correo (comprobante simple, NO tributario).
-- preparar_ticket() valida permisos y límites y entrega los datos;
-- el envío lo hace /api/enviar-ticket con el token del usuario.
-- ============================================================
create table if not exists public.tickets_enviados (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  id_venta uuid references public.ventas(id) on delete set null,
  correo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','error')),
  enviado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists tickets_enviados_venta on public.tickets_enviados(id_venta);
create index if not exists tickets_enviados_emp on public.tickets_enviados(id_empresa, created_at desc);
alter table public.tickets_enviados enable row level security;
drop policy if exists tickets_enviados_sel on public.tickets_enviados;
create policy tickets_enviados_sel on public.tickets_enviados for select using (public.tiene_acceso_a_empresa(id_empresa));
drop policy if exists tickets_enviados_susc on public.tickets_enviados;
create policy tickets_enviados_susc on public.tickets_enviados as restrictive for all using (public.empresa_tiene_modulo(id_empresa,'ventas'));

create or replace function public.preparar_ticket(p_id_venta uuid, p_correo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record; e record; v_tz text; v_cor text := lower(trim(coalesce(p_correo,''))); v_id uuid; v_lineas jsonb; v_cajero text; v_cli text; v_suc text;
begin
  select * into v from public.ventas where id = p_id_venta;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(v.id_empresa) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not public.empresa_tiene_modulo(v.id_empresa,'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if v.estado = 'ANULADA' then raise exception 'Esta venta está anulada: no se envía ticket' using errcode = '22023'; end if;
  if char_length(v_cor) > 254 or v_cor !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido' using errcode = '22023'; end if;
  if (select count(*) from public.tickets_enviados where id_venta = v.id and estado <> 'error') >= 5 then raise exception 'Esta venta ya tiene 5 tickets enviados' using errcode = '22023'; end if;
  if (select count(*) from public.tickets_enviados where id_empresa = v.id_empresa and created_at > now() - interval '24 hours') >= 300 then
    raise exception 'Se alcanzó el límite diario de tickets por correo' using errcode = '22023';
  end if;

  select coalesce(nombre_comercial, nombre) nombre, datos_documentos dd, coalesce(zona_horaria,'America/Santiago') tz into e from public.empresas where id = v.id_empresa;
  select nombre into v_suc from public.sucursales where id = v.id_sucursal;
  select nombre into v_cli from public.clientes where id = v.id_cliente;
  select nombre into v_cajero from public.perfiles where id_usuario = case when v.cajero ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v.cajero::uuid end limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('nombre', coalesce(p.nombre,'Producto'), 'cantidad', d.cantidad, 'precio', d.precio_unitario, 'subtotal', d.subtotal) order by d.id), '[]'::jsonb)
    into v_lineas from public.ventas_detalles d left join public.productos p on p.id = d.id_producto where d.id_venta = v.id;

  insert into public.tickets_enviados (id_empresa, id_venta, correo, enviado_por) values (v.id_empresa, v.id, v_cor, auth.uid()) returning id into v_id;

  return jsonb_build_object('id_envio', v_id, 'correo', v_cor,
    'empresa', jsonb_build_object('nombre', e.nombre, 'razon_social', e.dd->>'razon_social', 'rut', e.dd->>'rut', 'giro', e.dd->>'giro',
        'direccion', concat_ws(', ', nullif(e.dd->>'direccion',''), nullif(e.dd->>'ciudad','')), 'telefono', e.dd->>'telefono'),
    'sucursal', v_suc, 'ticket', v.numero_ticket, 'fecha', to_char(v.created_at at time zone e.tz, 'DD-MM-YYYY HH24:MI'),
    'moneda', coalesce(v.moneda,'CLP'), 'metodo', v.metodo_pago, 'cajero', v_cajero, 'cliente', v_cli, 'total', v.total,
    'por_cobrar', v.estado = 'POR_COBRAR', 'lineas', v_lineas);
end $$;

create or replace function public.marcar_ticket_enviado(p_id_envio uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from public.tickets_enviados where id = p_id_envio;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(t.id_empresa) or t.enviado_por is distinct from auth.uid() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_estado not in ('enviado','error') then raise exception 'Estado no válido' using errcode = '22023'; end if;
  update public.tickets_enviados set estado = p_estado where id = p_id_envio and estado = 'pendiente';
end $$;

revoke all on function public.preparar_ticket(uuid,text), public.marcar_ticket_enviado(uuid,text) from public, anon;
grant execute on function public.preparar_ticket(uuid,text), public.marcar_ticket_enviado(uuid,text) to authenticated;
