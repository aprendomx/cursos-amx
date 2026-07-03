-- 009_inscripciones_rls_fix.sql
-- Reasegura las policies de RLS para inscripciones.
-- Algunos entornos (self-hosted) pueden no haber aplicado 001/003 completas,
-- o haber dropeado la policy de INSERT durante pruebas. Idempotente.

alter table public.inscripciones enable row level security;

drop policy if exists "inscripciones: leer propias" on public.inscripciones;
create policy "inscripciones: leer propias"
  on public.inscripciones
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "inscripciones: insertar propia" on public.inscripciones;
create policy "inscripciones: insertar propia"
  on public.inscripciones
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Verificación post-aplicación: corre esta query y debe haber 2 filas (select, insert).
-- select policyname, cmd from pg_policies where tablename = 'inscripciones'
--   and policyname like 'inscripciones: %propia%';
