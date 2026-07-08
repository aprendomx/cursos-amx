-- =========================================================
-- Migration 052: Video Analytics (Fase J — Task 1)
-- =========================================================
--  * video_eventos: eventos crudos del reproductor
--  * video_intervalos: buckets agregados de 10 s
--  * video_analytics_config: configuración singleton
--  * v_video_leccion_stats: métricas por lección
--  * v_curso_video_stats: métricas por curso
--  * agregar_video_intervalos(p_fecha): función de agregación
--  * Cron job para ejecutar la agregación diaria a las 02:00
-- =========================================================

create extension if not exists pg_cron;

-- ==========================================================
-- Step 1 — Tablas base
-- ==========================================================

-- ---------- video_eventos ----------
create table if not exists public.video_eventos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.perfiles(id) on delete cascade,
  leccion_id    uuid not null references public.lecciones(id) on delete cascade,
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  video_id      uuid references public.videos(id) on delete set null,
  evento        text not null
                  check (evento in ('play', 'pause', 'seek', 'tick', 'complete', 'ratechange')),
  tiempo_video  int not null default 0,
  datos         jsonb not null default '{}',
  creado_en     timestamptz not null default now()
);

create index if not exists idx_video_eventos_user_leccion
  on public.video_eventos(user_id, leccion_id, creado_en desc);
create index if not exists video_eventos_curso_idx
  on public.video_eventos(curso_id, creado_en desc);
create index if not exists video_eventos_evento_idx
  on public.video_eventos(evento, creado_en desc);

comment on table public.video_eventos is 'Eventos crudos del reproductor de video (play, pause, seek, tick, complete, ratechange)';
comment on column public.video_eventos.evento is 'Tipo de evento: play, pause, seek, tick, complete, ratechange';
comment on column public.video_eventos.tiempo_video is 'Tiempo en segundos dentro del video cuando ocurrió el evento';
comment on column public.video_eventos.datos is 'Payload JSONB adicional (velocidad, calidad, error_code, etc.)';

alter table public.video_eventos enable row level security;

drop policy if exists "video_eventos: usuario inserta propio" on public.video_eventos;
create policy "video_eventos: usuario inserta propio"
  on public.video_eventos for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "video_eventos: usuario lee propio" on public.video_eventos;
create policy "video_eventos: usuario lee propio"
  on public.video_eventos for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "video_eventos: admin lee todo" on public.video_eventos;
create policy "video_eventos: admin lee todo"
  on public.video_eventos for select to authenticated
  using (public.is_admin());

drop policy if exists "video_eventos: instructor lee curso" on public.video_eventos;
create policy "video_eventos: instructor lee curso"
  on public.video_eventos for select to authenticated
  using (public.is_instructor_de(curso_id));


-- ---------- video_intervalos ----------
create table if not exists public.video_intervalos (
  id              uuid primary key default gen_random_uuid(),
  leccion_id      uuid not null references public.lecciones(id) on delete cascade,
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  fecha           date not null,
  intervalo_inicio int not null,
  duracion_bucket  int not null default 10,
  vistas_unicas   int not null default 0,
  total_visto     int not null default 0,
  abandonos       int not null default 0,
  saltos_adelante int not null default 0,
  saltos_atras    int not null default 0,
  unique (leccion_id, fecha, intervalo_inicio)
);

create index if not exists video_intervalos_leccion_fecha_idx
  on public.video_intervalos(leccion_id, fecha);
create index if not exists video_intervalos_curso_fecha_idx
  on public.video_intervalos(curso_id, fecha);

comment on table public.video_intervalos is 'Buckets agregados de 10 segundos con métricas de reproducción por lección y día';
comment on column public.video_intervalos.intervalo_inicio is 'Segundo de inicio del bucket (0, 10, 20, ...)';
comment on column public.video_intervalos.vistas_unicas is 'Usuarios distintos que reprodujeron este bucket';
comment on column public.video_intervalos.total_visto is 'Segundos totales reproducidos en este bucket (vistas_unicas × duracion_bucket aprox)';
comment on column public.video_intervalos.abandonos is 'Usuarios cuyo último evento del día fue pause/seek/buffer antes del 90% del video';
comment on column public.video_intervalos.saltos_adelante is 'Saltos hacia adelante que aterrizaron en este bucket';
comment on column public.video_intervalos.saltos_atras is 'Saltos hacia atrás que aterrizaron en este bucket';

alter table public.video_intervalos enable row level security;

drop policy if exists "video_intervalos: usuario lee propio" on public.video_intervalos;
create policy "video_intervalos: usuario lee propio"
  on public.video_intervalos for select to authenticated
  using (exists (
    select 1 from public.video_eventos ve
    where ve.leccion_id = video_intervalos.leccion_id
      and ve.user_id = auth.uid()
  ));

drop policy if exists "video_intervalos: admin lee todo" on public.video_intervalos;
create policy "video_intervalos: admin lee todo"
  on public.video_intervalos for select to authenticated
  using (public.is_admin());

drop policy if exists "video_intervalos: instructor lee curso" on public.video_intervalos;
create policy "video_intervalos: instructor lee curso"
  on public.video_intervalos for select to authenticated
  using (public.is_instructor_de(curso_id));


-- ---------- video_analytics_config (singleton) ----------
create table if not exists public.video_analytics_config (
  id                    int primary key default 1 check (id = 1),
  tracking_activo       boolean not null default true,
  bucket_segundos       int not null default 10,
  eventos_batch_interval int not null default 60,
  guardar_eventos_crudos boolean not null default true
);

comment on table public.video_analytics_config is 'Configuración singleton del sistema de analytics de video';
comment on column public.video_analytics_config.bucket_segundos is 'Tamaño de cada bucket de agregación en segundos';
comment on column public.video_analytics_config.eventos_batch_interval is 'Intervalo en segundos para envío batch de eventos desde el cliente';
comment on column public.video_analytics_config.guardar_eventos_crudos is 'Si se deben persistir los eventos crudos además de los buckets agregados';

alter table public.video_analytics_config enable row level security;

drop policy if exists "video_analytics_config: admin" on public.video_analytics_config;
create policy "video_analytics_config: admin"
  on public.video_analytics_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "video_analytics_config: authenticated read" on public.video_analytics_config;
create policy "video_analytics_config: authenticated read"
  on public.video_analytics_config for select to authenticated
  using (true);

insert into public.video_analytics_config (id, tracking_activo, bucket_segundos, eventos_batch_interval, guardar_eventos_crudos)
values (1, true, 10, 60, true)
on conflict (id) do nothing;


-- ==========================================================
-- Step 2 — Vistas
-- ==========================================================

-- ---------- v_video_leccion_stats ----------
drop view if exists public.v_video_leccion_stats;
create view public.v_video_leccion_stats as
with event_stats as (
  select
    ve.leccion_id,
    count(distinct ve.user_id) as total_vistas_unicas,
    count(*) filter (where ve.evento = 'complete') as total_completados
  from public.video_eventos ve
  group by ve.leccion_id
),
interval_stats as (
  select
    leccion_id,
    coalesce(sum(total_visto), 0)     as total_segundos_vistos,
    coalesce(sum(abandonos), 0)       as total_abandonos,
    coalesce(sum(saltos_adelante), 0) as total_saltos_adelante,
    coalesce(sum(saltos_atras), 0)    as total_saltos_atras
  from public.video_intervalos
  group by leccion_id
)
select
  l.id as leccion_id,
  m.curso_id,
  l.titulo as leccion_titulo,
  coalesce(v.duracion_seg, l.duracion_seg, 0) as duracion_segundos,
  coalesce(es.total_vistas_unicas, 0)     as total_vistas_unicas,
  coalesce(is_.total_segundos_vistos, 0)  as total_segundos_vistos,
  round(
    coalesce(es.total_completados::numeric / nullif(es.total_vistas_unicas, 0) * 100, 0),
    2
  ) as tasa_completitud_pct,
  round(
    coalesce(is_.total_abandonos::numeric / nullif(es.total_vistas_unicas, 0) * 100, 0),
    2
  ) as tasa_abandono_pct,
  round(
    coalesce(is_.total_saltos_adelante::numeric / nullif(es.total_vistas_unicas, 0), 0),
    2
  ) as avg_saltos_adelante,
  round(
    coalesce(is_.total_saltos_atras::numeric / nullif(es.total_vistas_unicas, 0), 0),
    2
  ) as avg_saltos_atras
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
left join public.videos v on v.leccion_id = l.id
left join event_stats es on es.leccion_id = l.id
left join interval_stats is_ on is_.leccion_id = l.id
where l.tipo_material = 'video';

comment on view public.v_video_leccion_stats is 'Métricas agregadas de reproducción por lección (completitud, abandono, tiempo visto)';


-- ---------- v_curso_video_stats ----------
drop view if exists public.v_curso_video_stats;
create view public.v_curso_video_stats as
select
  v.curso_id,
  c.titulo as curso_titulo,
  count(*) as total_lecciones_video,
  round(coalesce(avg(v.tasa_completitud_pct), 0), 2)       as avg_tasa_completitud,
  round(coalesce(avg(v.total_segundos_vistos::numeric / nullif(v.duracion_segundos, 0)), 0), 2) as avg_ratio_visto,
  round(coalesce(max(v.tasa_abandono_pct), 0), 2)          as max_tasa_abandono,
  round(coalesce(min(v.tasa_completitud_pct), 0), 2)       as min_tasa_completitud
from public.v_video_leccion_stats v
join public.cursos c on c.id = v.curso_id
group by v.curso_id, c.titulo;

comment on view public.v_curso_video_stats is 'Métricas agregadas de reproducción por curso (avg completitud, max abandono)';


-- ==========================================================
-- Step 3 — Función de agregación y cron
-- ==========================================================

create or replace function public.agregar_video_intervalos(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket int;
begin
  -- Tamaño del bucket desde configuración
  select bucket_segundos into v_bucket
  from public.video_analytics_config
  where id = 1;

  if v_bucket is null or v_bucket <= 0 then
    v_bucket := 10;
  end if;

  -- Idempotencia: eliminar buckets existentes del día
  delete from public.video_intervalos where fecha = p_fecha;

  -- -----------------------------------------------------------------
  -- 1. Buckets base: vistas únicas y tiempo visto a partir de
  --    eventos 'tick'. Cada evento de tick implica que el
  --    usuario estaba reproduciendo el bucket que contiene
  --    tiempo_video.
  -- -----------------------------------------------------------------
  with tick_buckets as (
    select distinct
      leccion_id,
      curso_id,
      user_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start
    from public.video_eventos
    where date(creado_en) = p_fecha
      and evento = 'tick'
  ),
  bucket_agg as (
    select
      leccion_id,
      curso_id,
      p_fecha as fecha,
      bucket_start as intervalo_inicio,
      v_bucket as duracion_bucket,
      count(distinct user_id) as vistas_unicas,
      count(distinct user_id) * v_bucket as total_visto
    from tick_buckets
    group by leccion_id, curso_id, bucket_start
  )
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto)
  select * from bucket_agg;

  -- -----------------------------------------------------------------
  -- 2. Abandonos: usuarios cuyo último evento del día para esa
  --    lección fue pause/seek/buffer (no 'complete') y antes del 90%
  --    de la duración del video.
  -- -----------------------------------------------------------------
  with last_events as (
    select distinct on (leccion_id, user_id)
      leccion_id,
      user_id,
      curso_id,
      evento,
      tiempo_video
    from public.video_eventos
    where date(creado_en) = p_fecha
    order by leccion_id, user_id, creado_en desc
  ),
  video_durations as (
    select
      l.id as leccion_id,
      coalesce(v.duracion_seg, l.duracion_seg, 0) as duracion
    from public.lecciones l
    left join public.videos v on v.leccion_id = l.id
  )
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, abandonos)
  select
    le.leccion_id,
    le.curso_id,
    p_fecha,
    (le.tiempo_video / v_bucket) * v_bucket,
    v_bucket,
    0,
    0,
    count(*)
  from last_events le
  join video_durations vd on vd.leccion_id = le.leccion_id
  where le.evento in ('pause', 'seek', 'buffer')
    and vd.duracion > 0
    and le.tiempo_video < (vd.duracion * 0.9)
  group by le.leccion_id, le.curso_id, (le.tiempo_video / v_bucket) * v_bucket
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set abandonos = public.video_intervalos.abandonos + excluded.abandonos;

  -- -----------------------------------------------------------------
  -- 3. Saltos hacia adelante y hacia atrás. Comparamos tiempo_video
  --    con el evento inmediatamente anterior del mismo usuario en
  --    la misma lección.
  -- -----------------------------------------------------------------
  with seek_events as (
    select
      leccion_id,
      user_id,
      tiempo_video,
      lag(tiempo_video) over (
        partition by leccion_id, user_id order by creado_en
      ) as prev_tiempo,
      curso_id
    from public.video_eventos
    where date(creado_en) = p_fecha
      and evento = 'seek'
  ),
  forward_seeks as (
    select
      leccion_id,
      curso_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start,
      count(*) as n
    from seek_events
    where tiempo_video > coalesce(prev_tiempo, 0)
    group by leccion_id, curso_id, (tiempo_video / v_bucket) * v_bucket
  ),
  backward_seeks as (
    select
      leccion_id,
      curso_id,
      (tiempo_video / v_bucket) * v_bucket as bucket_start,
      count(*) as n
    from seek_events
    where tiempo_video < coalesce(prev_tiempo, 0)
    group by leccion_id, curso_id, (tiempo_video / v_bucket) * v_bucket
  )
  -- Merge forward seeks
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, saltos_adelante)
  select
    leccion_id,
    curso_id,
    p_fecha,
    bucket_start,
    v_bucket,
    0,
    0,
    n
  from forward_seeks
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set saltos_adelante = public.video_intervalos.saltos_adelante + excluded.saltos_adelante;

  -- Merge backward seeks
  insert into public.video_intervalos
    (leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket, vistas_unicas, total_visto, saltos_atras)
  select
    leccion_id,
    curso_id,
    p_fecha,
    bucket_start,
    v_bucket,
    0,
    0,
    n
  from backward_seeks
  on conflict (leccion_id, fecha, intervalo_inicio)
  do update set saltos_atras = public.video_intervalos.saltos_atras + excluded.saltos_atras;

end;
$$;

grant execute on function public.agregar_video_intervalos(date) to authenticated;


-- ---------- Cron job ----------
do $$
begin
  perform cron.unschedule('video-analytics-aggregate');
exception when others then
  null;
end $$;

select cron.schedule(
  'video-analytics-aggregate',
  '0 2 * * *',
  'select public.agregar_video_intervalos(current_date - 1)'
);
