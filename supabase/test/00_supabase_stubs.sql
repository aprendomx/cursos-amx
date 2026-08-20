-- supabase/test/00_supabase_stubs.sql
-- Mínimo indispensable para aplicar supabase/migrations/*.sql contra un
-- PostgreSQL "pelado" (CI, o un psql local) sin levantar el stack completo.
-- NO usar en producción: en una instalación real todo esto lo provee Supabase.
--
-- Uso:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/test/00_supabase_stubs.sql
--   for f in supabase/migrations/0*.sql; do psql "$DB" -v ON_ERROR_STOP=1 -1 -f "$f"; done

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists cron;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;

do $$
begin
  create role anon;                exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated;       exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role;        exception when duplicate_object then null;
end $$;

-- ---------- auth ----------
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb,
  encrypted_password text,
  created_at         timestamptz default now()
);

-- auth.uid() lee el claim que PostgREST inyecta por petición. En pruebas se
-- simula con:  set local request.jwt.claim.sub = '<uuid>';
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;

-- ---------- storage ----------
create table if not exists storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  metadata   jsonb
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

create or replace function storage.filename(name text) returns text
  language sql immutable as $$ select split_part(name, '/', -1) $$;

-- ---------- pg_cron / pg_net (no disponibles fuera de la imagen de Supabase) ----------
create or replace function cron.schedule(text, text, text) returns bigint
  language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(text) returns boolean
  language sql as $$ select true $$;

-- ---------- realtime ----------
do $$
begin
  create publication supabase_realtime;
exception when duplicate_object then null;
end $$;

-- ---------- GRANTs por defecto de Supabase ----------
-- Reproduce lo que hace el bootstrap de Supabase sobre el schema public.
-- Es importante que estén: sin ellos las pruebas de RLS darían "permission
-- denied" por GRANT y no por política, y no probarían nada.
grant usage on schema public  to anon, authenticated, service_role;
grant usage on schema auth     to anon, authenticated, service_role;
grant usage on schema storage  to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
