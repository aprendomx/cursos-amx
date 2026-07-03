-- =========================================================
-- Migration 020: bucket público para portadas de curso
-- =========================================================
-- Las portadas se muestran directamente desde URL pública en
-- la landing, catálogo y cards del curso, así que el bucket es
-- público. La escritura queda restringida a admins por policy
-- sobre storage.objects.
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'curso-portadas',
  'curso-portadas',
  true,           -- público para servir directamente
  10485760,       -- 10 MB
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

-- Lectura pública (anonymous) ya viene del flag public=true del bucket,
-- pero declaramos la policy explícita para clarity.
create policy "curso-portadas: lectura pública"
  on storage.objects for select
  using (bucket_id = 'curso-portadas');

create policy "curso-portadas: admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "curso-portadas: admin update"
  on storage.objects for update
  using (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );

create policy "curso-portadas: admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'curso-portadas'
    and (select es_admin from public.perfiles where id = auth.uid())
  );
