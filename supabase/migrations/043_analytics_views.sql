-- =========================================================
-- Migration 043: Analytics views (engagement diario & riesgo alumno)
-- =========================================================
-- Módulo 3 — Analytics.
--  * v_engagement_diario: métricas por curso y día (logins, lecciones,
--    quizzes, foros) usando inscripciones, progreso, intentos_evaluación,
--    foros y lrs_statements.
--  * v_riesgo_alumno: score 0-100 de abandono por alumno y curso.
--    Fórmula exacta:
--      min(100, round(
--        min(dias_ultimo_login/30 * 30, 30) +
--        (100 - pct_lecciones) * 0.25 +
--        (100 - pct_quizzes) * 0.25 +
--        min(dias_ultima_entrega/60 * 20, 20)
--      ))
-- =========================================================

-- ---------- Engagement diario ----------
drop view if exists public.v_engagement_diario;
create view public.v_engagement_diario as
with daily_logins as (
  select date(ls.stored_at) as fecha,
         i.curso_id,
         count(*) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'logged_in'
  group by date(ls.stored_at), i.curso_id
),
daily_lecciones as (
  select date(p.completado_en) as fecha,
         m.curso_id,
         count(*) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and p.completado_en is not null
  group by date(p.completado_en), m.curso_id
),
daily_quizzes as (
  select date(creado_en) as fecha,
         curso_id,
         count(*) as n
  from public.intentos_evaluacion
  group by date(creado_en), curso_id
),
daily_foros_hilos as (
  select date(fh.creado_en) as fecha,
         fo.curso_id,
         count(*) as n
  from public.foro_hilos fh
  join public.foros fo on fo.id = fh.foro_id
  group by date(fh.creado_en), fo.curso_id
),
daily_foros_respuestas as (
  select date(fr.creado_en) as fecha,
         fo.curso_id,
         count(*) as n
  from public.foro_respuestas fr
  join public.foro_hilos fh on fh.id = fr.hilo_id
  join public.foros fo on fo.id = fh.foro_id
  group by date(fr.creado_en), fo.curso_id
),
fechas_cursos as (
  select fecha, curso_id from daily_logins
  union
  select fecha, curso_id from daily_lecciones
  union
  select fecha, curso_id from daily_quizzes
  union
  select fecha, curso_id from daily_foros_hilos
  union
  select fecha, curso_id from daily_foros_respuestas
)
select
  fc.fecha,
  fc.curso_id,
  coalesce(dl.n, 0) as logins,
  coalesce(dlec.n, 0) as lecciones_completadas,
  coalesce(dq.n, 0) as quizzes_respondidos,
  coalesce(dfh.n, 0) + coalesce(dfr.n, 0) as foros_posts
from fechas_cursos fc
left join daily_logins dl
  on dl.fecha = fc.fecha and dl.curso_id = fc.curso_id
left join daily_lecciones dlec
  on dlec.fecha = fc.fecha and dlec.curso_id = fc.curso_id
left join daily_quizzes dq
  on dq.fecha = fc.fecha and dq.curso_id = fc.curso_id
left join daily_foros_hilos dfh
  on dfh.fecha = fc.fecha and dfh.curso_id = fc.curso_id
left join daily_foros_respuestas dfr
  on dfr.fecha = fc.fecha and dfr.curso_id = fc.curso_id
order by fc.fecha desc, fc.curso_id;

-- ---------- Riesgo de abandono ----------
drop view if exists public.v_riesgo_alumno;
create view public.v_riesgo_alumno as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_quizzes as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  where l.tipo_material = 'examen'
  group by m.curso_id
),
lecciones_completadas as (
  select p.user_id, m.curso_id, count(p.leccion_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by p.user_id, m.curso_id
),
quizzes_intentados as (
  select ie.user_id, ie.curso_id, count(distinct ie.leccion_id) as n
  from public.intentos_evaluacion ie
  group by ie.user_id, ie.curso_id
),
ultimo_login as (
  select actor_id as user_id, max(timestamp) as ultimo
  from public.lrs_statements
  where verb = 'logged_in'
  group by actor_id
),
ultima_entrega as (
  select el.user_id, el.curso_id, max(el.creado_en) as ultimo
  from public.entregas_leccion el
  group by el.user_id, el.curso_id
)
select
  i.user_id,
  i.curso_id,
  current_date - date(coalesce(ul.ultimo, i.inscrito_en)) as dias_ultimo_login,
  coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0) as pct_lecciones,
  coalesce(round(qi.n::numeric / nullif(tq.total, 0) * 100, 2), 0) as pct_quizzes,
  current_date - date(coalesce(ue.ultimo, i.inscrito_en)) as dias_ultima_entrega,
  least(100, round(
    least(
      (current_date - date(coalesce(ul.ultimo, i.inscrito_en)))::numeric / 30 * 30,
      30
    ) +
    (100 - coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0)) * 0.25 +
    (100 - coalesce(round(qi.n::numeric / nullif(tq.total, 0) * 100, 2), 0)) * 0.25 +
    least(
      (current_date - date(coalesce(ue.ultimo, i.inscrito_en)))::numeric / 60 * 20,
      20
    )
  ))::int as score_riesgo
from public.inscripciones i
left join total_lecciones tl on tl.curso_id = i.curso_id
left join total_quizzes tq on tq.curso_id = i.curso_id
left join lecciones_completadas lc
  on lc.user_id = i.user_id and lc.curso_id = i.curso_id
left join quizzes_intentados qi
  on qi.user_id = i.user_id and qi.curso_id = i.curso_id
left join ultimo_login ul on ul.user_id = i.user_id
left join ultima_entrega ue
  on ue.user_id = i.user_id and ue.curso_id = i.curso_id;
