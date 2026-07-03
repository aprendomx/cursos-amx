-- supabase/migrations/016_video_buckets.sql

-- Both buckets are private. ingest receives raw mp4s; hls receives the
-- output of the worker. All client access to hls goes through the
-- hls-playlist Edge Function with signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('video-ingest', 'video-ingest', false, 4294967296,   -- 4 GB
   array['video/mp4','video/quicktime','video/x-matroska','video/webm']),
  ('video-hls',    'video-hls',    false, null, null)
on conflict (id) do nothing;

-- Admins can upload to video-ingest
create policy "video-ingest: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "video-ingest: admin read"
  on storage.objects for select
  using (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "video-ingest: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'video-ingest'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

-- video-hls has NO client-facing policies. All access is service-role
-- via the Edge Function. The worker uses service-role to write.
