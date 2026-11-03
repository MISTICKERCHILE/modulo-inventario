-- ============================================================
-- Correo con el resumen diario al cerrar el día
-- ============================================================

create table if not exists public.resumen_destinatarios (
  id         uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  correo     text not null,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists resumen_destinatarios_uq on public.resumen_destinatarios(id_empresa, lower(correo));
alter table public.resumen_destinatarios enable row level security;
drop policy if exists solo_admin_lectura on public.resumen_destinatarios;
create policy solo_admin_lectura on public.resumen_destinatarios for select using (public.es_admin_de_empresa(id_empresa));

alter table public.cierres_dia
  add column if not exists correo_enviado_at timestamptz,
  add column if not exists correo_estado text;

create or replace function public.agregar_destinatario_resumen(p_id_empresa uuid, p_correo text)
returns void language plpgsql security definer set search_path = public as $$
declare c text := lower(trim(coalesce(p_correo,'')));
begin
  if auth.uid() is null or not public.es_admin_de_empresa(p_id_empresa) then
    raise exception 'Solo un Dueño o Administrador puede elegir quién recibe el resumen' using errcode = '42501';
  end if;
  if c !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(c) > 254 then raise exception 'Correo no válido' using errcode = '22023'; end if;
  if (select count(*) from public.resumen_destinatarios where id_empresa = p_id_empresa) >= 10 then
    raise exception 'Máximo 10 destinatarios' using errcode = '22023';
  end if;
  insert into public.resumen_destinatarios (id_empresa, correo, creado_por) values (p_id_empresa, c, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.quitar_destinatario_resumen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.resumen_destinatarios where id = p_id;
  if e is null or auth.uid() is null or not public.es_admin_de_empresa(e) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.resumen_destinatarios where id = p_id;
end $$;

-- Datos para armar el correo. Solo se puede enviar una vez por cierre y dentro de las 24 h siguientes.
create or replace function public.preparar_resumen_cierre(p_id_cierre uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_emp text; v_suc text; v_dest jsonb;
begin
  select * into c from public.cierres_dia where id = p_id_cierre;
  if not found or auth.uid() is null or not public.tiene_acceso_a_empresa(c.id_empresa) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.empresa_tiene_modulo(c.id_empresa, 'ventas') then raise exception 'El módulo Ventas no está activo' using errcode = '42501'; end if;
  if c.correo_enviado_at is not null then raise exception 'El resumen de este cierre ya se envió' using errcode = '22023'; end if;
  if c.created_at < now() - interval '24 hours' then raise exception 'El plazo para enviar este resumen venció' using errcode = '22023'; end if;
  select coalesce(nombre_comercial, nombre) into v_emp from public.empresas where id = c.id_empresa;
  select nombre into v_suc from public.sucursales where id = c.id_sucursal;
  select coalesce(jsonb_agg(correo order by created_at), '[]'::jsonb) into v_dest from public.resumen_destinatarios where id_empresa = c.id_empresa;
  return jsonb_build_object('id', c.id, 'empresa', v_emp, 'sucursal', v_suc, 'fecha', c.fecha, 'modo', c.modo, 'responsable', c.responsable,
    'comentario', c.comentario, 'cuadrado', c.cuadrado, 'desglose', c.desglose, 'totales', c.totales, 'otros_cobros', c.otros_cobros,
    'total_dia_declarado', c.total_dia_declarado, 'destinatarios', v_dest);
end $$;

create or replace function public.marcar_resumen_enviado(p_id_cierre uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select id_empresa into e from public.cierres_dia where id = p_id_cierre;
  if e is null or auth.uid() is null or not public.tiene_acceso_a_empresa(e) then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.cierres_dia set correo_enviado_at = case when p_estado = 'enviado' then now() else correo_enviado_at end,
         correo_estado = left(p_estado, 40) where id = p_id_cierre and correo_enviado_at is null;
end $$;

revoke all on function public.agregar_destinatario_resumen(uuid,text) from public, anon;
revoke all on function public.quitar_destinatario_resumen(uuid) from public, anon;
revoke all on function public.preparar_resumen_cierre(uuid) from public, anon;
revoke all on function public.marcar_resumen_enviado(uuid,text) from public, anon;
grant execute on function public.agregar_destinatario_resumen(uuid,text) to authenticated;
grant execute on function public.quitar_destinatario_resumen(uuid) to authenticated;
grant execute on function public.preparar_resumen_cierre(uuid) to authenticated;
grant execute on function public.marcar_resumen_enviado(uuid,text) to authenticated;
