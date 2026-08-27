-- 004 — Agregar en la base, no en el navegador.
--
-- Del mismo diagnóstico que la 003. Ocho informes del panel descargaban 10 000
-- filas cada uno para producir unas decenas, y la portada pública descargaba la
-- tabla `inscripciones` entera para pintar un número. Aquí viven esas
-- agregaciones como vistas y funciones.
--
-- Además del coste, el `limit=10000` del cliente tenía un defecto peor: al
-- superarlo, los informes empezaban a MENTIR en silencio. Un GROUP BY no.

-- ---------------------------------------------------------------------
-- Cifras de la portada.
--
-- SECURITY DEFINER y accesible a anónimos a propósito: son tres números
-- agregados que la portada ya anuncia como reclamo. Devuelve conteos, nunca
-- filas, así que no expone quién está inscrito ni en qué.
--
-- Antes la portada hacía `select user_id from inscripciones` sin sesión: la RLS
-- lo rechazaba con 401 en CADA visita anónima y el contador salía siempre en 0.
create or replace function public.stats_portada()
returns table (
  servidores_inscritos bigint,
  constancias_emitidas bigint,
  cursos_publicados bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(distinct user_id) from public.inscripciones),
    (select count(*) from public.constancias),
    (select count(*) from public.cursos where publicado)
$$;

revoke all on function public.stats_portada() from public;
grant execute on function public.stats_portada() to anon, authenticated;

comment on function public.stats_portada() is
  'Tres conteos agregados para la portada pública. No expone filas.';

-- ---------------------------------------------------------------------
-- Informes del panel.
--
-- Todas con security_invoker: heredan la RLS de sus tablas, así que solo ve
-- datos quien ya podía verlos (administración). La vista no abre ninguna
-- puerta nueva, solo evita el viaje de las filas crudas.

-- Inscripciones por dependencia.
create or replace view public.v_reporte_inscripciones_dependencia
with (security_invoker = true) as
select
  coalesce(d.nombre, 'Sin dependencia') as dependencia,
  coalesce(d.siglas, '—') as siglas,
  count(*) as inscripciones
from public.inscripciones i
left join public.perfiles p on p.id = i.user_id
left join public.dependencias d on d.id = p.dependencia_id
group by 1, 2
order by 3 desc;

-- Inscripciones por mes, últimos 12 meses (incluidos los meses en cero: la
-- serie temporal debe tener todos sus puntos o el gráfico miente por omisión).
create or replace view public.v_reporte_inscripciones_mes
with (security_invoker = true) as
with meses as (
  select to_char(generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  ), 'YYYY-MM') as mes
)
select m.mes, count(i.*) as inscripciones
from meses m
left join public.inscripciones i
  on to_char(i.inscrito_en, 'YYYY-MM') = m.mes
group by m.mes
order by m.mes;

-- Constancias por mes, mismos 12 meses.
create or replace view public.v_reporte_constancias_mes
with (security_invoker = true) as
with meses as (
  select to_char(generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  ), 'YYYY-MM') as mes
)
select m.mes, count(c.*) as constancias
from meses m
left join public.constancias c
  on to_char(c.emitida_en, 'YYYY-MM') = m.mes
group by m.mes
order by m.mes;

-- Tasa de aprobación por curso.
create or replace view public.v_reporte_tasa_curso
with (security_invoker = true) as
select
  c.titulo as curso,
  coalesce(c.nivel, '—') as nivel,
  (select count(*) from public.inscripciones i where i.curso_id = c.id) as inscritos,
  (select count(*) from public.constancias k where k.curso_id = c.id) as constancias,
  case
    when (select count(*) from public.inscripciones i where i.curso_id = c.id) > 0
    then round(
      (select count(*) from public.constancias k where k.curso_id = c.id)::numeric * 100
      / (select count(*) from public.inscripciones i where i.curso_id = c.id), 1
    )
  end as tasa_pct
from public.cursos c
order by inscritos desc;

-- Horas de estudio por usuario (suma de segundos vistos).
create or replace view public.v_reporte_horas_usuario
with (security_invoker = true) as
select
  coalesce(p.nombres_completos, 'Usuario') as usuario,
  coalesce(d.siglas, '—') as dependencia,
  round(sum(pr.segundos_vistos)::numeric / 3600, 2) as horas
from public.progreso pr
join public.perfiles p on p.id = pr.user_id
left join public.dependencias d on d.id = p.dependencia_id
group by 1, 2
order by 3 desc;

-- Usuarios activos en los últimos 30 días.
create or replace view public.v_reporte_usuarios_actividad
with (security_invoker = true) as
with base as (
  select
    (select count(*) from public.perfiles) as total,
    (select count(distinct user_id) from public.progreso
      where completado and completado_en >= now() - interval '30 days') as activos
)
select
  'Activos (últimos 30 días)' as categoria, activos as cantidad,
  case when total > 0 then round(activos::numeric * 100 / total, 1) end as porcentaje, 1 as orden
from base
union all
select 'Inactivos', total - activos,
  case when total > 0 then round((total - activos)::numeric * 100 / total, 1) end, 2
from base
union all
select 'Total registrados', total, 100, 3
from base
order by orden;

-- Lecciones más vistas.
create or replace view public.v_reporte_top_lecciones
with (security_invoker = true) as
select
  l.titulo as leccion,
  coalesce(c.titulo, '—') as curso,
  count(*) as vistas
from public.progreso pr
join public.lecciones l on l.id = pr.leccion_id
left join public.modulos m on m.id = l.modulo_id
left join public.cursos c on c.id = m.curso_id
group by 1, 2
order by 3 desc;

-- Tiempo activo por usuario y curso.
create or replace view public.v_reporte_tiempo_curso
with (security_invoker = true) as
select
  coalesce(p.nombres_completos, 'Usuario') as usuario,
  coalesce(d.siglas, '—') as dependencia,
  coalesce(c.titulo, '—') as curso,
  t.segundos_activos
from public.tiempo_curso t
join public.perfiles p on p.id = t.user_id
left join public.dependencias d on d.id = p.dependencia_id
left join public.cursos c on c.id = t.curso_id
order by t.segundos_activos desc;
