-- 010_inscripciones_select_uid.sql
-- Reescribe las policies de inscripciones con el patrón Supabase recomendado
-- ((select auth.uid()) = user_id). Ese wrapper en SELECT:
--   1) Es más performante (auth.uid() se cachea por query).
--   2) Resuelve auth.uid() de forma explícita evitando ambigüedades de
--      search_path o posibles funciones shadow.

drop policy if exists "inscripciones: leer propias" on public.inscripciones;
create policy "inscripciones: leer propias"
  on public.inscripciones
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "inscripciones: insertar propia" on public.inscripciones;
create policy "inscripciones: insertar propia"
  on public.inscripciones
  for insert
  with check ((select auth.uid()) = user_id);
