-- 007 — El guard que comprobaba si pg_cron existe nunca podía ser cierto.
--
-- La 006 (y antes el bloque 062 de la 001, de donde se copió el patrón)
-- comprobaban la disponibilidad de pg_cron así:
--
--     if to_regproc('cron.schedule(text,text,text)') is null then ... return;
--
-- `to_regproc` NO acepta una firma: espera solo un nombre. Con paréntesis
-- devuelve NULL siempre. Y con el nombre pelado —`to_regproc('cron.schedule')`—
-- también devuelve NULL, porque pg_cron declara DOS sobrecargas y el nombre es
-- ambiguo. Comprobado en producción con pg_cron 1.6 instalado y accesible:
--
--     to_regproc('cron.schedule(text,text,text)')      → NULL
--     to_regproc('cron.schedule')                      → NULL
--     to_regprocedure('cron.schedule(text,text,text)') → cron.schedule(...)
--
-- Es decir: el guard entraba siempre por la rama «no disponible» y no
-- programaba nada, aunque pg_cron estuviera perfectamente instalado. La
-- función que sí resuelve una firma es `to_regprocedure`.

do $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
  v_job text;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '[007] pg_cron no está instalado. Créalo como SUPERUSUARIO y reaplica:';
    raise notice '        docker compose exec -T db psql -U supabase_admin -d % \\', current_database();
    raise notice '          -c "create extension if not exists pg_cron;" \\';
    raise notice '          -c "grant usage on schema cron to postgres;" \\';
    raise notice '          -c "grant all on all tables in schema cron to postgres;"';
    return;
  end if;

  foreach v_job in array array[
    'notifications-worker', 'deadline-proximo', 'alerta-riesgo',
    'sla-respuesta', 'video-analytics-aggregate'
  ] loop
    begin
      perform cron.unschedule(v_job);
    exception when others then null;
    end;
  end loop;

  -- La que apremia: sin ella `video_eventos` no tiene quien la reduzca.
  perform cron.schedule(
    'video-analytics-aggregate', '0 2 * * *',
    'select public.agregar_video_intervalos(current_date - 1)'
  );

  perform cron.schedule('deadline-proximo', '0 8 * * *',
    'select public.notificar_deadlines_proximos()');
  perform cron.schedule('alerta-riesgo', '0 9 * * *',
    'select public.notificar_alertas_riesgo()');
  perform cron.schedule('sla-respuesta', '0 9 * * *',
    'select public.notificar_sla_respuesta()');

  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice '[007] Falta configurar el cron de notificaciones. En el servidor:';
    raise notice '      alter database % set app.settings.supabase_url     = ''http://kong:8000'';',
      current_database();
    raise notice '      alter database % set app.settings.service_role_key = ''<SERVICE_ROLE_KEY>'';',
      current_database();
  else
    perform cron.schedule(
      'notifications-worker', '* * * * *',
      format(
        $cron$select net.http_get(
          url     := %L || '/functions/v1/notifications-worker',
          headers := jsonb_build_object('Authorization', 'Bearer ' || %L)
        );$cron$,
        v_url, v_key
      )
    );
  end if;

  -- El resumen es informativo: en un entorno de pruebas puede existir
  -- `cron.schedule` (stub) sin la tabla `cron.job`, y eso no debe tumbar la
  -- migración.
  begin
    raise notice '[007] Trabajos programados: %',
      (select coalesce(string_agg(jobname, ', ' order by jobname), '(ninguno)') from cron.job);
  exception when others then
    raise notice '[007] Programación completada (sin cron.job que listar).';
  end;
end $$;
