-- =========================================================================
-- Migration 062: el cron de notificaciones debe autenticarse de verdad
-- =========================================================================
-- 051_notificaciones.sql agenda el job así:
--
--   headers := jsonb_build_object('Authorization',
--              'Bearer ' || current_setting('app.settings.supabase_anon_key'))
--
-- Dos problemas:
--
--  (a) La anon key es PÚBLICA (va en el bundle del navegador): no autentica
--      nada. Ahora que notifications-worker exige la service_role key, este
--      job dejaría de funcionar si no se reprograma.
--
--  (b) Ni app.settings.supabase_url ni app.settings.supabase_anon_key se
--      definen en ninguna migración, en docker-compose ni en el .env. Con
--      current_setting() sin el segundo argumento, la ausencia del GUC lanza
--      excepción: el job de notificaciones NUNCA ha llegado a ejecutarse.
--
-- El operador debe fijar los GUCs una vez, en el servidor:
--
--   alter database postgres set app.settings.supabase_url        = 'http://kong:8000';
--   alter database postgres set app.settings.service_role_key    = '<SERVICE_ROLE_KEY>';
--
-- Se usa current_setting(..., true) para que la ausencia del GUC no reviente
-- la migración; el job simplemente no se agenda y se avisa por NOTICE.
-- =========================================================================

do $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  -- pg_cron y pg_net solo existen en la imagen supabase/postgres.
  if to_regproc('cron.schedule(text,text,text)') is null then
    raise notice '[062] pg_cron no disponible: no se reprograma el job de notificaciones.';
    return;
  end if;

  begin
    perform cron.unschedule('notifications-worker');
  exception when others then null;
  end;

  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice '[062] Falta configuración del cron de notificaciones. Ejecuta en el servidor:';
    raise notice '      alter database % set app.settings.supabase_url     = ''http://kong:8000'';',
      current_database();
    raise notice '      alter database % set app.settings.service_role_key = ''<SERVICE_ROLE_KEY>'';',
      current_database();
    raise notice '      ...y vuelve a aplicar esta migración (o agenda el job a mano).';
    return;
  end if;

  perform cron.schedule(
    'notifications-worker',
    '* * * * *',
    format(
      $cron$select net.http_get(
        url     := %L || '/functions/v1/notifications-worker',
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L)
      );$cron$,
      v_url, v_key
    )
  );
  raise notice '[062] job notifications-worker reprogramado con service_role.';
end $$;
