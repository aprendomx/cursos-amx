-- =========================================================================
-- Migration 063: los feature flags dejan de ser cosméticos
-- =========================================================================
-- Situación anterior:
--
--  (a) NINGUNA política RLS consultaba feature_toggles. Con "foros" apagado,
--      foro_hilos seguía aceptando INSERT por PostgREST; con "chat" apagado,
--      mensajes_chat igual. El flag ocultaba la interfaz, no cerraba la
--      puerta. El comentario de src/lib/featureFlags.ts que dice "los objetos
--      de base de datos quedan inertes" era falso.
--
--  (b) Dos sistemas de flags con conjuntos de claves casi disjuntos: 25 en
--      build-time (VITE_FEATURE_*) y 11 en runtime (feature_toggles), con
--      solo 5 en común. Los otros 20 exigían `npm run build` y republicar,
--      contradiciendo la promesa del README.
--
--  (c) feature_toggles no tenía política de escritura: ni un administrador
--      podía cambiar un flag sin entrar por psql al servidor.
--
-- Esta migración: siembra las 25 claves, permite escribirlas al admin, y
-- añade el apagado a nivel de datos con políticas RESTRICTIVAS (se combinan
-- en AND con las permisivas existentes, así que no hay que reescribirlas).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. feature_on(): consulta barata y cacheable dentro de la consulta
-- ---------------------------------------------------------------------
create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable                    -- stable => se evalúa una vez por consulta, no por fila
security definer
set search_path = public
as $$
  -- Ausente = apagado, salvo que nadie haya sembrado la clave todavía, en
  -- cuyo caso se deja pasar para no romper una base a medio migrar.
  select coalesce(
    (select enabled from public.feature_toggles where key = p_key),
    not exists (select 1 from public.feature_toggles where key = p_key)
  );
$$;

grant execute on function public.feature_on(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. El administrador puede escribir los flags
-- ---------------------------------------------------------------------
drop policy if exists "feature_toggles: admin escribir" on public.feature_toggles;
create policy "feature_toggles: admin escribir" on public.feature_toggles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Sembrar las 25 claves
-- ---------------------------------------------------------------------
-- Regla de siembra: un módulo cuyas tablas YA tienen datos se enciende; el
-- resto queda apagado. Así una instalación existente no pierde de golpe una
-- funcionalidad que estaba usando (p. ej. foros activados por
-- VITE_FEATURE_FOROS=true), y una instalación nueva arranca cerrada.
do $$
declare
  v_foros    boolean := exists (select 1 from public.foro_hilos);
  v_chat     boolean := exists (select 1 from public.mensajes_chat);
  v_entregas boolean := exists (select 1 from public.entregas_leccion)
                        or exists (select 1 from public.tareas);
  v_aulas    boolean := exists (select 1 from public.sesiones_virtuales);
  v_evals    boolean := exists (select 1 from public.preguntas);
begin
  insert into public.feature_toggles (key, enabled) values
    ('instructor',              true),
    ('foros',                   v_foros),
    ('chat',                    v_chat),
    ('entregas',                v_entregas),
    ('entregas_rubricas',       v_entregas),
    ('aulas',                   v_aulas),
    ('sesiones_virtuales',      v_aulas),
    ('evaluaciones',            v_evals),
    ('advanced_quizzes',        false),
    ('rubrics',                 v_entregas),
    ('cohorts',                 false),
    ('bulk_user_import',        false),
    ('gamificacion',            false),
    ('analytics',               false),
    ('risk_dashboard',          false),
    ('downloadable_reports',    false),
    ('reportes_avanzados',      false),
    ('ai_quiz_generator',       false),
    ('ai_summaries',            false),
    ('ai_study_assistant',      false),
    ('pwa_offline',             false),
    ('offline_video_cache',     false),
    ('offline_sync',            false),
    ('push_notifications',      false),
    ('notificaciones',          false),
    ('notificaciones_email',    false),
    ('video_analytics',         false),
    ('video_analytics_heatmap', false),
    ('zoom_integration',        false),
    ('sesiones_grabaciones',    false),
    ('transcripcion_whisper',   false)
  on conflict (key) do nothing;   -- nunca se pisa lo que el operador ya decidió
end $$;

-- ---------------------------------------------------------------------
-- 4. Apagado REAL: políticas restrictivas por módulo
-- ---------------------------------------------------------------------
-- Una política RESTRICTIVA se combina en AND con todas las permisivas de la
-- tabla. Es decir: se conserva intacta la lógica de autorización existente y
-- se le antepone "…y además el módulo debe estar encendido".
--
-- No se aplica a service_role (que además tiene BYPASSRLS): el worker, el
-- cron y las Edge Functions siguen operando con el módulo apagado, que es lo
-- que se quiere para tareas de mantenimiento y limpieza.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('foros',              'foros'),
      ('foro_hilos',         'foros'),
      ('foro_respuestas',    'foros'),
      ('mensajes_chat',      'chat'),
      ('entregas_leccion',   'entregas'),
      ('tareas',             'entregas'),
      ('entregas',           'entregas'),
      ('entrega_versiones',  'entregas'),
      ('calificaciones',     'entregas'),
      ('rubricas',           'entregas'),
      ('rubrica_criterios',  'entregas'),
      ('rubrica_niveles',    'entregas'),
      ('sesiones_virtuales', 'sesiones_virtuales'),
      ('sesiones_rsvp',      'sesiones_virtuales'),
      ('cohortes',           'cohorts'),
      ('miembros_cohorte',   'cohorts'),
      ('lrs_statements',     'analytics'),
      ('video_eventos',      'video_analytics'),
      ('ai_summaries',       'ai_summaries')
    ) as t(tabla, flag)
  loop
    if to_regclass('public.' || r.tabla) is null then
      continue;
    end if;
    execute format(
      'drop policy if exists %I on public.%I',
      'modulo apagado: ' || r.flag, r.tabla);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated '
      'using (public.feature_on(%L)) with check (public.feature_on(%L))',
      'modulo apagado: ' || r.flag, r.tabla, r.flag, r.flag);
  end loop;
end $$;

comment on function public.feature_on(text) is
  'Estado de un feature flag. La usan las políticas RESTRICTIVAS que apagan '
  'los módulos a nivel de datos (migración 063): un módulo apagado no solo '
  'oculta la interfaz, también cierra sus tablas.';
