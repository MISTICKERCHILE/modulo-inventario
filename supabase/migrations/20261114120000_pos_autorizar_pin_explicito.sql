-- Autorización: si se entrega PIN siempre se valida (en el POS el cajero opera
-- con la sesión del negocio, que suele ser la del dueño).
create or replace function public._pos_autorizar(p_empresa uuid, p_id_autoriza uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_id_autoriza is not null and nullif(p_pin,'') is not null then
    r := public.validar_pin(p_empresa, p_id_autoriza, p_pin);
    if r is null or (r->>'rol') not in ('Dueño','Admin','Administrador Supremo') then
      return jsonb_build_object('ok', false, 'error', 'PIN de administrador incorrecto');
    end if;
    return jsonb_build_object('ok', true, 'id', (r->>'id_usuario')::uuid, 'nombre', r->>'nombre');
  end if;
  if public.es_admin_de_empresa(p_empresa) then
    return jsonb_build_object('ok', true, 'id', auth.uid(),
      'nombre', coalesce((select nombre from public.perfiles where id_usuario = auth.uid() limit 1), 'Administrador'));
  end if;
  return jsonb_build_object('ok', false, 'error', 'Se necesita el PIN de un administrador');
end $$;
revoke all on function public._pos_autorizar(uuid,uuid,text) from public, anon, authenticated;
