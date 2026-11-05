-- Programador de avisos del calendario: cada 5 minutos llama a /api/calendario-avisos.
-- La clave vive en Supabase Vault (calendario_cron_secret) y en Vercel (CALENDARIO_CRON_SECRET); no está en el código.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public._calendario_llamar_avisos()
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text;
begin
  select decrypted_secret into v_clave from vault.decrypted_secrets where name = 'calendario_cron_secret';
  if v_clave is null then return; end if;
  perform net.http_post(url := 'https://www.buddyerp.com/api/calendario-avisos',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_clave, 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
end $$;
revoke all on function public._calendario_llamar_avisos() from public, anon, authenticated;

-- (idempotente) reemplaza el trabajo si ya existe
do $$ begin perform cron.unschedule('calendario-avisos'); exception when others then null; end $$;
select cron.schedule('calendario-avisos', '*/5 * * * *', 'select public._calendario_llamar_avisos()');
