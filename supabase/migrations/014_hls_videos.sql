-- supabase/migrations/014_hls_videos.sql
-- HLS video support: videos table, lecciones.video_id FK,
-- NOTIFY trigger for worker wake-up, get_video_playback RPC.

-- Lifecycle enum
create type public.video_status as enum
  ('uploading','pending','processing','ready','failed');

-- One row per video processing job. leccion_id can become null if the
-- lesson is deleted; the file is then cleaned up by the worker cron.
create table public.videos (
  id              uuid primary key default gen_random_uuid(),
  leccion_id      uuid references public.lecciones(id) on delete set null,
  status          public.video_status not null default 'uploading',
  source_path     text,
  hls_path        text,
  poster_path     text,
  duracion_seg    int,
  error_msg       text,
  created_by      uuid references public.perfiles(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index videos_leccion_idx on public.videos(leccion_id);
create index videos_status_idx  on public.videos(status);

-- Touch actualizado_en automatically
create or replace function public.videos_touch_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

create trigger videos_set_actualizado_en before update on public.videos
  for each row execute function public.videos_touch_actualizado_en();

-- Link from lecciones (coexists with url_youtube)
alter table public.lecciones
  add column video_id uuid references public.videos(id) on delete set null;

-- Realtime so the admin sees status transitions live
alter publication supabase_realtime add table public.videos;

-- RLS
alter table public.videos enable row level security;
create policy "videos: leer" on public.videos for select using (true);
create policy "videos: admin" on public.videos for all
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- NOTIFY trigger: wake the worker when a row enters 'pending'
create or replace function public.notify_video_job() returns trigger
language plpgsql as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform pg_notify('video_jobs', new.id::text);
  end if;
  return new;
end $$;

create trigger videos_notify after insert or update on public.videos
  for each row execute function public.notify_video_job();

-- Authorization RPC: returns playback paths only if the caller is admin
-- or enrolled in the video's course AND the video is ready.
create or replace function public.get_video_playback(p_video_id uuid)
returns table(hls_path text, poster_path text, duracion_seg int)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_curso uuid;
  v_leccion uuid;
  v_is_admin boolean;
  v_inscrito boolean;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select es_admin into v_is_admin from public.perfiles where id = v_user;

  select v.leccion_id, m.curso_id
    into v_leccion, v_curso
  from public.videos v
  join public.lecciones l on l.id = v.leccion_id
  join public.modulos m   on m.id = l.modulo_id
  where v.id = p_video_id and v.status = 'ready';

  if v_leccion is null then
    raise exception 'video not ready' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_admin, false) then
    select exists(
      select 1 from public.inscripciones
      where user_id = v_user and curso_id = v_curso
    ) into v_inscrito;
    if not v_inscrito then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  return query
    select v.hls_path, v.poster_path, v.duracion_seg
    from public.videos v where v.id = p_video_id;
end $$;

revoke all on function public.get_video_playback(uuid) from public;
grant execute on function public.get_video_playback(uuid) to authenticated;
