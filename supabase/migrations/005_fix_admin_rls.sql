-- ==========================================================
-- Fix: policies de admin para INSERT/UPDATE/DELETE en
-- cursos / modulos / lecciones, con USING + WITH CHECK
-- explicitos. Restringidas al rol "authenticated".
-- ==========================================================

-- Cursos
drop policy if exists "cursos: admin" on public.cursos;
create policy "cursos: admin write"
  on public.cursos
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Modulos
drop policy if exists "modulos: admin" on public.modulos;
create policy "modulos: admin write"
  on public.modulos
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));

-- Lecciones
drop policy if exists "lecciones: admin" on public.lecciones;
create policy "lecciones: admin write"
  on public.lecciones
  as permissive
  for all
  to authenticated
  using ((select es_admin from public.perfiles where id = auth.uid()))
  with check ((select es_admin from public.perfiles where id = auth.uid()));
