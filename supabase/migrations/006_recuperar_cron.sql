-- 006 — Recuperar los trabajos programados.
--
-- Hallazgo del diagnóstico del 27-08-2026 sobre producción: `pg_cron` estaba
-- en `shared_preload_libraries` y `cron.database_name` apuntaba a la base
-- correcta, pero la extensión NO estaba creada y el esquema `cron` no existía.
-- Consecuencia: las cinco tareas que la 001 programa no existían, y nadie se
-- había enterado porque ninguna avisa cuando no corre.
--
-- Cuatro son funcionalidad ausente (notificaciones y avisos). La quinta es de
-- rendimiento y es la que apremia: `video-analytics-aggregate` es el ÚNICO
-- mecanismo que reduce `video_eventos`, una tabla que recibe un lote por
-- espectador cada 30 segundos y no tiene política de retención. Sin ese
-- trabajo crece sin techo y el mapa de calor que lo lee nunca tiene datos.
--
-- Esta migración es idempotente y tolerante: si `pg_cron` no está disponible
-- —una base de pruebas, otra imagen de Postgres— avisa y sigue, en vez de
-- romper el despliegue entero.

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice '[006] No se pudo crear pg_cron (%). Los trabajos quedan sin programar.', sqlerrm;
end $$;

do $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
  v_job text;
begin
  if to_regproc('cron.schedule(text,text,text)') is null then
    raise notice '[006] pg_cron no disponible: no se programa nada.';
    return;
  end if;

  -- Reprogramar sin duplicar: si el trabajo ya existe se retira primero.
  foreach v_job in array array[
    'notifications-worker', 'deadline-proximo', 'alerta-riesgo',
    'sla-respuesta', 'video-analytics-aggregate'
  ] loop
    begin
      perform cron.unschedule(v_job);
    exception when others then null;
    end;
  end loop;

  -- --------------------------------------------------------------
  -- La que no depende de nada externo: agregación de eventos de video.
  perform cron.schedule(
    'video-analytics-aggregate',
    '0 2 * * *',
    'select public.agregar_video_intervalos(current_date - 1)'
  );

  -- Avisos que solo tocan la propia base.
  perform cron.schedule('deadline-proximo', '0 8 * * *',
    'select public.notificar_deadlines_proximos()');
  perform cron.schedule('alerta-riesgo', '0 9 * * *',
    'select public.notificar_alertas_riesgo()');
  perform cron.schedule('sla-respuesta', '0 9 * * *',
    'select public.notificar_sla_respuesta()');

  -- --------------------------------------------------------------
  -- El worker de notificaciones sí necesita llamar a una Edge Function con la
  -- service_role key, que NO puede vivir en una migración versionada. Si los
  -- GUCs no están puestos, se avisa con las instrucciones exactas y no se
  -- programa: mejor ausente que fallando cada minuto en silencio.
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice '[006] Falta configurar el cron de notificaciones. En el servidor:';
    raise notice '      alter database % set app.settings.supabase_url     = ''http://kong:8000'';',
      current_database();
    raise notice '      alter database % set app.settings.service_role_key = ''<SERVICE_ROLE_KEY>'';',
      current_database();
    raise notice '      ...y vuelve a aplicar esta migración.';
  else
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
    raise notice '[006] notifications-worker programado.';
  end if;

  raise notice '[006] Trabajos programados: %',
    (select string_agg(jobname, ', ' order by jobname) from cron.job);
end $$;
