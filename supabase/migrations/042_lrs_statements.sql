-- =========================================================
-- Migration 042: LRS Statements (xAPI-style learning records)
-- =========================================================
-- Módulo 3 — Analytics.
--  * Almacena eventos de aprendizaje (actor, verb, object, result).
--  * BRIN index en stored_at para consultas de rango temporal.
--  * RLS: admin lee todo; cada usuario inserta solo sus propios eventos.
-- =========================================================

create table if not exists public.lrs_statements (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users(id) on delete cascade,
  verb        text not null
                check (verb in ('initialized','completed','watched','answered',
                                'commented','submitted','logged_in','attempted',
                                'passed','failed')),
  object_type text not null
                check (object_type in ('course','lesson','quiz','forum',
                                       'assignment','platform')),
  object_id   uuid,
  result_json jsonb not null default '{}'::jsonb,
  timestamp   timestamptz not null default now(),
  stored_at   timestamptz not null default now()
);

create index if not exists lrs_statements_actor_timestamp_idx
  on public.lrs_statements(actor_id, timestamp desc);
create index if not exists lrs_statements_verb_timestamp_idx
  on public.lrs_statements(verb, timestamp desc);
create index if not exists lrs_statements_object_idx
  on public.lrs_statements(object_type, object_id);
create index if not exists lrs_statements_timestamp_brin_idx
  on public.lrs_statements using brin(stored_at);

-- ---------- RLS ----------
alter table public.lrs_statements enable row level security;

drop policy if exists "lrs_statements: leer admin" on public.lrs_statements;
create policy "lrs_statements: leer admin"
  on public.lrs_statements for select to authenticated
  using (public.is_admin());

drop policy if exists "lrs_statements: insertar propio" on public.lrs_statements;
create policy "lrs_statements: insertar propio"
  on public.lrs_statements for insert to authenticated
  with check (actor_id = auth.uid());
