-- =========================================================
-- Migration 048: Reportes Administrativos Avanzados (Fase H1)
-- =========================================================
-- Módulo 3 — Analytics.
--  * Feature flag reportes_avanzados.
--  * v_funnel_curso: funnel de conversión por curso.
--  * v_retencion_cohorte: retención por cohorte semanal.
--  * v_comparativa_cursos: métricas agregadas por curso.
-- =========================================================

-- ---------- Feature flag ----------
insert into public.feature_toggles (key, enabled)
values ('reportes_avanzados', false)
on conflict (key) do nothing;

-- ---------- Funnel de conversión por curso ----------
drop view if exists public.v_funnel_curso;
create view public.v_funnel_curso as
with visitantes as (
  select i.curso_id, count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i
    on i.user_id = ls.actor_id and i.curso_id = ls.object_id
  where ls.verb = 'viewed' and ls.object_type = 'curso'
  group by i.curso_id
),
registrados as (
  select i.curso_id, count(distinct au.id) as n
  from auth.users au
  join public.inscripciones i on i.user_id = au.id
  group by i.curso_id
),
inscritos as (
  select curso_id, count(*) as n
  from public.inscripciones
  group by curso_id
),
activos as (
  select i.curso_id, count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'logged_in'
  group by i.curso_id
),
completados as (
  select m.curso_id, count(distinct p.user_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by m.curso_id
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(v.n, 0) as visitantes,
  coalesce(r.n, 0) as registrados,
  coalesce(i.n, 0) as inscritos,
  coalesce(a.n, 0) as activos,
  coalesce(comp.n, 0) as completados
from public.cursos c
left join visitantes v on v.curso_id = c.id
left join registrados r on r.curso_id = c.id
left join inscritos i on i.curso_id = c.id
left join activos a on a.curso_id = c.id
left join completados comp on comp.curso_id = c.id;

-- ---------- Retención por cohorte (semana de inscripción) ----------
drop view if exists public.v_retencion_cohorte;
create view public.v_retencion_cohorte as
with inscripciones_cohorte as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana_inicio,
    to_char(date_trunc('week', i.inscrito_en), 'IYYY-IW') as semana,
    i.user_id,
    i.inscrito_en
  from public.inscripciones i
),
logins as (
  select actor_id as user_id, timestamp
  from public.lrs_statements
  where verb = 'logged_in'
),
retencion as (
  select
    ic.curso_id,
    ic.semana_inicio,
    ic.semana,
    ic.user_id,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '7 days' then 1 else 0 end) as d7,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '14 days' then 1 else 0 end) as d14,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '30 days' then 1 else 0 end) as d30,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '60 days' then 1 else 0 end) as d60,
    max(case when l.timestamp between ic.inscrito_en and ic.inscrito_en + interval '90 days' then 1 else 0 end) as d90
  from inscripciones_cohorte ic
  left join logins l on l.user_id = ic.user_id
  group by ic.curso_id, ic.semana_inicio, ic.semana, ic.user_id
)
select
  curso_id,
  semana,
  count(*) as total_inscritos,
  sum(d7) as activos_d7,
  sum(d14) as activos_d14,
  sum(d30) as activos_d30,
  sum(d60) as activos_d60,
  sum(d90) as activos_d90,
  round(coalesce(sum(d7)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d7,
  round(coalesce(sum(d14)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d14,
  round(coalesce(sum(d30)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d30,
  round(coalesce(sum(d60)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d60,
  round(coalesce(sum(d90)::numeric / nullif(count(*), 0) * 100, 0), 1) as pct_d90
from retencion
group by curso_id, semana_inicio, semana
order by semana_inicio desc;

-- ---------- Métricas agregadas por curso ----------
drop view if exists public.v_comparativa_cursos;
create view public.v_comparativa_cursos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_inscritos as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
lecciones_completadas as (
  select p.user_id, m.curso_id, count(p.leccion_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by p.user_id, m.curso_id
),
total_completados as (
  select lc.curso_id, count(distinct lc.user_id) as total
  from lecciones_completadas lc
  join total_lecciones tl on tl.curso_id = lc.curso_id
  where lc.n = tl.total
  group by lc.curso_id
),
engagement as (
  select i.curso_id, count(ls.id)::numeric / nullif(count(distinct i.user_id), 0) as avg_activities
  from public.inscripciones i
  left join public.lrs_statements ls on ls.actor_id = i.user_id
  group by i.curso_id
),
calificaciones as (
  select curso_id, avg(puntaje)::numeric as avg_cal
  from public.intentos_evaluacion
  where aprobado
  group by curso_id
),
dias_por_estudiante as (
  select m.curso_id, p.user_id, max(date(p.completado_en) - date(i.inscrito_en)) as dias
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  join public.inscripciones i on i.user_id = p.user_id and i.curso_id = m.curso_id
  where p.completado and p.completado_en is not null
  group by m.curso_id, p.user_id
  having count(p.leccion_id) = (
    select count(l2.id)
    from public.lecciones l2
    join public.modulos m2 on m2.id = l2.modulo_id
    where m2.curso_id = m.curso_id
  )
),
dias_completar as (
  select curso_id, round(avg(dias)::numeric, 1) as avg_dias
  from dias_por_estudiante
  group by curso_id
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(ti.total, 0) as total_inscritos,
  coalesce(tc.total, 0) as total_completados,
  round(coalesce(tc.total::numeric / nullif(ti.total, 0) * 100, 0), 1) as tasa_finalizacion,
  round(coalesce(e.avg_activities, 0), 1) as engagement_promedio,
  round(coalesce(ca.avg_cal, 0), 1) as calificacion_promedio,
  coalesce(dc.avg_dias, 0) as dias_promedio_completar
from public.cursos c
left join total_inscritos ti on ti.curso_id = c.id
left join total_completados tc on tc.curso_id = c.id
left join engagement e on e.curso_id = c.id
left join calificaciones ca on ca.curso_id = c.id
left join dias_completar dc on dc.curso_id = c.id;
