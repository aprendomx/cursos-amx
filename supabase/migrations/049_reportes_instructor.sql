-- =========================================================
-- Migration 049: Reportes por Instructor + Análisis de Contenido (Fase H2)
-- =========================================================
-- Módulo 3 — Analytics.
--  * v_instructor_cursos: métricas agregadas de los cursos asignados a
--    cada instructor (alumnos, aprobación, calificación, tiempo de
--    finalización, lecciones y módulos).
--  * v_instructor_alumnos: desglose por alumno y curso (progreso,
--    calificación, tiempo dedicado/activo, última actividad,
--    participación en foros y entregas).
--  * v_leccion_analytics: métricas por lección (visualizaciones,
--    completitud, tiempo promedio visto, comentarios, entregas,
--    foros, evaluaciones y calificación promedio).
-- =========================================================

-- ---------- Cursos del instructor con métricas agregadas ----------
drop view if exists public.v_instructor_cursos;
create view public.v_instructor_cursos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_modulos as (
  select curso_id, count(*) as total
  from public.modulos
  group by curso_id
),
total_alumnos as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
aprobados as (
  select curso_id, count(*) as total
  from public.intentos_evaluacion
  where aprobado
  group by curso_id
),
promedio_calif as (
  select curso_id, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by curso_id
),
alumnos_completados as (
  select i.curso_id, i.user_id, max(p.completado_en) as ultima_leccion
  from public.inscripciones i
  join public.progreso p on p.user_id = i.user_id
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and p.completado_en is not null and m.curso_id = i.curso_id
  group by i.curso_id, i.user_id
  having count(p.leccion_id) = (
    select count(l2.id)
    from public.lecciones l2
    join public.modulos m2 on m2.id = l2.modulo_id
    where m2.curso_id = i.curso_id
  )
),
tiempo_completar as (
  select ac.curso_id,
         round(avg(extract(epoch from (ac.ultima_leccion - i.inscrito_en)) / 86400)::numeric, 1) as avg_dias
  from alumnos_completados ac
  join public.inscripciones i on i.curso_id = ac.curso_id and i.user_id = ac.user_id
  group by ac.curso_id
)
select
  ci.user_id as instructor_id,
  ci.curso_id,
  c.titulo as curso_titulo,
  coalesce(ta.total, 0) as total_alumnos,
  round(coalesce(ap.total::numeric / nullif(ta.total, 0) * 100, 0), 1) as tasa_aprobacion,
  coalesce(pc.avg_puntaje, 0) as promedio_calificacion,
  coalesce(tc.avg_dias, 0) as tiempo_promedio_completar,
  coalesce(tl.total, 0) as total_lecciones,
  coalesce(tm.total, 0) as total_modulos
from public.cursos_instructores ci
join public.cursos c on c.id = ci.curso_id
left join total_alumnos ta on ta.curso_id = ci.curso_id
left join aprobados ap on ap.curso_id = ci.curso_id
left join promedio_calif pc on pc.curso_id = ci.curso_id
left join tiempo_completar tc on tc.curso_id = ci.curso_id
left join total_lecciones tl on tl.curso_id = ci.curso_id
left join total_modulos tm on tm.curso_id = ci.curso_id;

-- ---------- Alumnos por curso del instructor ----------
drop view if exists public.v_instructor_alumnos;
create view public.v_instructor_alumnos as
with total_lecciones as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
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
calif_promedio as (
  select user_id, curso_id, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by user_id, curso_id
),
tiempo_dedicado as (
  select p.user_id, m.curso_id, sum(p.segundos_vistos) as total_segundos
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  group by p.user_id, m.curso_id
),
tiempo_activo as (
  select user_id, curso_id, sum(segundos_activos) as total_segundos
  from public.tiempo_curso
  group by user_id, curso_id
),
ultima_actividad as (
  select actor_id as user_id, max(timestamp) as ultimo
  from public.lrs_statements
  group by actor_id
),
foros_hilos_user as (
  select fh.autor_id as user_id, f.curso_id, count(*) as n
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  group by fh.autor_id, f.curso_id
),
foros_respuestas_user as (
  select fr.autor_id as user_id, f.curso_id, count(*) as n
  from public.foro_respuestas fr
  join public.foro_hilos fh on fh.id = fr.hilo_id
  join public.foros f on f.id = fh.foro_id
  group by fr.autor_id, f.curso_id
),
entregas_user as (
  select user_id, curso_id, count(*) as n
  from public.entregas_leccion
  group by user_id, curso_id
)
select
  i.user_id,
  p.nombres_completos,
  p.correo,
  i.curso_id,
  c.titulo as curso_titulo,
  coalesce(round(lc.n::numeric / nullif(tl.total, 0) * 100, 2), 0) as pct_progreso,
  coalesce(cp.avg_puntaje, 0) as calificacion_promedio,
  coalesce(td.total_segundos, 0) as tiempo_dedicado_segundos,
  coalesce(ta.total_segundos, 0) as tiempo_activo_segundos,
  ult.ultimo as ultima_actividad,
  coalesce(fh.n, 0) + coalesce(fr.n, 0) as foros_posts,
  coalesce(eu.n, 0) as entregas_realizadas
from public.inscripciones i
join public.perfiles p on p.id = i.user_id
join public.cursos c on c.id = i.curso_id
left join total_lecciones tl on tl.curso_id = i.curso_id
left join lecciones_completadas lc
  on lc.user_id = i.user_id and lc.curso_id = i.curso_id
left join calif_promedio cp
  on cp.user_id = i.user_id and cp.curso_id = i.curso_id
left join tiempo_dedicado td
  on td.user_id = i.user_id and td.curso_id = i.curso_id
left join tiempo_activo ta
  on ta.user_id = i.user_id and ta.curso_id = i.curso_id
left join ultima_actividad ult on ult.user_id = i.user_id
left join foros_hilos_user fh
  on fh.user_id = i.user_id and fh.curso_id = i.curso_id
left join foros_respuestas_user fr
  on fr.user_id = i.user_id and fr.curso_id = i.curso_id
left join entregas_user eu
  on eu.user_id = i.user_id and eu.curso_id = i.curso_id;

-- ---------- Métricas por lección ----------
drop view if exists public.v_leccion_analytics;
create view public.v_leccion_analytics as
with total_inscritos_curso as (
  select curso_id, count(*) as total
  from public.inscripciones
  group by curso_id
),
vieron as (
  select p.leccion_id, count(distinct p.user_id) as n
  from public.progreso p
  where p.segundos_vistos > 0
  group by p.leccion_id
),
completaron as (
  select leccion_id, count(*) as n
  from public.progreso
  where completado
  group by leccion_id
),
tiempo_visto as (
  select leccion_id, round(avg(segundos_vistos)::numeric, 1) as avg_segundos
  from public.progreso
  where segundos_vistos > 0
  group by leccion_id
),
comentarios as (
  select leccion_id, count(*) as n
  from public.comentarios
  group by leccion_id
),
entregas as (
  select leccion_id, count(*) as n
  from public.entregas_leccion
  group by leccion_id
),
evaluaciones as (
  select leccion_id, count(*) as n, round(avg(puntaje)::numeric, 2) as avg_puntaje
  from public.intentos_evaluacion
  group by leccion_id
),
foro_hilos_curso as (
  select f.curso_id, count(*) as n
  from public.foro_hilos fh
  join public.foros f on f.id = fh.foro_id
  group by f.curso_id
)
select
  l.id as leccion_id,
  l.titulo as leccion_titulo,
  m.titulo as modulo_titulo,
  m.curso_id,
  coalesce(v.n, 0) as total_alumnos_vieron,
  coalesce(c.n, 0) as total_completaron,
  round(coalesce(c.n::numeric / nullif(tic.total, 0) * 100, 0), 1) as tasa_completitud,
  coalesce(tv.avg_segundos, 0) as tiempo_promedio_visto_segundos,
  coalesce(com.n, 0) as total_comentarios,
  coalesce(ent.n, 0) as total_entregas,
  coalesce(fhc.n, 0) as total_foro_hilos,
  coalesce(ev.n, 0) as total_evaluaciones,
  coalesce(ev.avg_puntaje, 0) as calificacion_promedio
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
left join total_inscritos_curso tic on tic.curso_id = m.curso_id
left join vieron v on v.leccion_id = l.id
left join completaron c on c.leccion_id = l.id
left join tiempo_visto tv on tv.leccion_id = l.id
left join comentarios com on com.leccion_id = l.id
left join entregas ent on ent.leccion_id = l.id
left join evaluaciones ev on ev.leccion_id = l.id
left join foro_hilos_curso fhc on fhc.curso_id = m.curso_id;
