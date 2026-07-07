-- =========================================================
-- Migration 050: Reportes Personalizables + Financieros (Fase H3)
-- =========================================================
-- Módulo 3 — Analytics.
--  * reportes_favoritos: filtros guardados por usuario.
--  * reportes_programados: reportes con ejecución recurrente.
--  * reportes_historial: log de ejecuciones programadas.
--  * v_costos_infraestructura: estimación de costos de storage + IA.
--  * v_inscripciones_tiempo: inscripciones agregadas por día.
--  * v_cursos_populares: ranking de cursos por inscripciones y finalización.
-- =========================================================

-- ---------- Ajuste de schema para vistas financieras ----------
-- La vista de costos requiere tamanio_bytes en videos.
alter table public.videos
  add column if not exists tamanio_bytes bigint not null default 0;

-- ---------- Tablas de reportes personalizables ----------

create table if not exists public.reportes_favoritos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  nombre       text not null,
  tipo_reporte text not null check (tipo_reporte in ('instructor','admin','financiero','engagement')),
  filtros      jsonb not null default '{}',
  creado_en    timestamptz not null default now()
);

create index if not exists reportes_favoritos_usuario_idx
  on public.reportes_favoritos(usuario_id);

alter table public.reportes_favoritos enable row level security;

drop policy if exists "reportes_favoritos: usuario ve lo suyo" on public.reportes_favoritos;
create policy "reportes_favoritos: usuario ve lo suyo"
  on public.reportes_favoritos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


create table if not exists public.reportes_programados (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users(id) on delete cascade,
  nombre            text not null,
  tipo_reporte      text not null,
  filtros           jsonb not null default '{}',
  frecuencia        text not null check (frecuencia in ('diario','semanal','mensual')),
  ultima_ejecucion  timestamptz,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

create index if not exists reportes_programados_usuario_idx
  on public.reportes_programados(usuario_id);

alter table public.reportes_programados enable row level security;

drop policy if exists "reportes_programados: usuario ve lo suyo" on public.reportes_programados;
create policy "reportes_programados: usuario ve lo suyo"
  on public.reportes_programados for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


create table if not exists public.reportes_historial (
  id                uuid primary key default gen_random_uuid(),
  programado_id     uuid not null references public.reportes_programados(id) on delete cascade,
  estado            text not null check (estado in ('exitoso','error')),
  resultado_resumen  jsonb not null default '{}',
  ejecutado_en      timestamptz not null default now()
);

create index if not exists reportes_historial_programado_idx
  on public.reportes_historial(programado_id);

alter table public.reportes_historial enable row level security;

drop policy if exists "reportes_historial: usuario ve lo suyo" on public.reportes_historial;
create policy "reportes_historial: usuario ve lo suyo"
  on public.reportes_historial for all to authenticated
  using (
    programado_id in (
      select id from public.reportes_programados where usuario_id = auth.uid()
    )
  );


-- ---------- Vista: costos de infraestructura ----------
drop view if exists public.v_costos_infraestructura;
create view public.v_costos_infraestructura as
with videos_stats as (
  select
    count(*) as total_videos,
    coalesce(sum(tamanio_bytes), 0)::numeric / 1e9 as gb
  from public.videos
),
-- Usamos entregas_leccion como proxy de documentos almacenados,
-- ya que el LMS no cuenta con una tabla central de documentos.
documentos_stats as (
  select
    count(*) as total_documentos,
    coalesce(sum(archivo_bytes), 0)::numeric / 1e9 as gb
  from public.entregas_leccion
),
ia_stats as (
  select
    count(*) as total_llamadas,
    coalesce(sum(tokens_input + tokens_output), 0) as total_tokens,
    coalesce(sum(cost_usd), 0)::numeric as costo_ia_usd
  from public.ai_usage_logs
)
select
  v.total_videos,
  round(v.gb, 3) as almacenamiento_videos_gb,
  d.total_documentos,
  round(d.gb, 3) as almacenamiento_docs_gb,
  ia.total_llamadas,
  ia.total_tokens,
  round(ia.costo_ia_usd, 4) as costo_ia_usd,
  round(
    coalesce(v.gb * 0.023, 0)
    + coalesce(d.gb * 0.023, 0)
    + coalesce(ia.costo_ia_usd, 0),
    4
  ) as costo_total_estimado_usd
from videos_stats v
cross join documentos_stats d
cross join ia_stats ia;


-- ---------- Vista: inscripciones en el tiempo ----------
drop view if exists public.v_inscripciones_tiempo;
create view public.v_inscripciones_tiempo as
select
  date(inscrito_en) as fecha,
  count(*) as total_inscripciones,
  count(distinct curso_id) as cursos_distintos
from public.inscripciones
group by date(inscrito_en)
order by fecha desc;


-- ---------- Vista: cursos más populares ----------
drop view if exists public.v_cursos_populares;
create view public.v_cursos_populares as
with lecciones_por_curso as (
  select m.curso_id, count(l.id) as total
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_inscritos as (
  select curso_id, count(*) as n
  from public.inscripciones
  group by curso_id
),
lecciones_completadas as (
  select i.curso_id, i.user_id, count(p.leccion_id) as n
  from public.inscripciones i
  join public.progreso p on p.user_id = i.user_id
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado and m.curso_id = i.curso_id
  group by i.curso_id, i.user_id
),
total_completados as (
  select lc.curso_id, count(*) as n
  from lecciones_completadas lc
  join lecciones_por_curso lpc on lpc.curso_id = lc.curso_id
  where lc.n = lpc.total
  group by lc.curso_id
),
total_eventos as (
  select
    coalesce(cm.id, lm.curso_id) as curso_id,
    count(ls.id) as n
  from public.lrs_statements ls
  left join public.cursos cm
    on cm.id = ls.object_id and ls.object_type = 'course'
  left join public.lecciones l
    on l.id = ls.object_id and ls.object_type = 'lesson'
  left join public.modulos lm
    on lm.id = l.modulo_id
  where cm.id is not null or lm.curso_id is not null
  group by coalesce(cm.id, lm.curso_id)
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(ti.n, 0) as total_inscripciones,
  coalesce(tc.n, 0) as total_completados,
  coalesce(te.n, 0) as total_eventos,
  round(
    coalesce(tc.n::numeric / nullif(ti.n, 0) * 100, 0),
    1
  ) as tasa_finalizacion
from public.cursos c
left join total_inscritos ti on ti.curso_id = c.id
left join total_completados tc on tc.curso_id = c.id
left join total_eventos te on te.curso_id = c.id
order by coalesce(ti.n, 0) desc;
