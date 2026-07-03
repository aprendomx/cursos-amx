-- supabase/migrations/019_lesson_docs_bucket.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-docs', 'lesson-docs', false, 52428800,  -- 50 MB
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

create policy "lesson-docs: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "lesson-docs: admin read"
  on storage.objects for select
  using (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "lesson-docs: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'lesson-docs'
    and (select es_admin from public.perfiles where id = auth.uid())
  );
