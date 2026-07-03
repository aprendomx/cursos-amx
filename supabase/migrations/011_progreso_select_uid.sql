-- 011_progreso_select_uid.sql
-- Reescribe las policies de progreso con el patrón Supabase recomendado
-- ((select auth.uid()) = user_id), igual que se hizo en 010 para inscripciones.
-- Sin este workaround, las policies con auth.uid() directo pueden fallar a
-- evaluar (probable issue de search_path/deparse en self-hosted) y los
-- SELECT del usuario regresan 0 filas aunque la RPC security-definer
-- haya insertado correctamente.

drop policy if exists "progreso: leer propio" on public.progreso;
create policy "progreso: leer propio"
  on public.progreso
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "progreso: insertar propio" on public.progreso;
create policy "progreso: insertar propio"
  on public.progreso
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "progreso: actualizar propio" on public.progreso;
create policy "progreso: actualizar propio"
  on public.progreso
  for update
  using ((select auth.uid()) = user_id);
