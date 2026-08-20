-- supabase/test/00_supabase_stubs.sql
-- Mínimo indispensable para aplicar supabase/migrations/*.sql fuera del stack
-- completo de Supabase.
--
-- Tiene que funcionar en DOS entornos muy distintos:
--
--   1. Un PostgreSQL "pelado" (psql local, contenedor postgres a secas), donde
--      no existe nada de Supabase y hay que fabricarlo todo.
--   2. La imagen supabase/postgres, donde `auth`, `storage`, `cron` y los roles
--      YA existen, pertenecen a otros dueños y el usuario `postgres` NO tiene
--      permiso de creación sobre ellos.
--
-- Por eso todo va condicionado a que el objeto falte, y las concesiones se
-- envuelven para tolerar `insufficient_privilege`: en el entorno 2 no hacen
-- falta, porque el stack real ya las otorgó.
--
-- NO usar en producción.

-- ---------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------
do $$
begin
  create schema if not exists auth;
exception when insufficient_privilege then null;
end $$;

do $$
begin
  create schema if not exists storage;
exception when insufficient_privilege then null;
end $$;

create schema if not exists extensions;

do $$
begin
  create schema if not exists cron;
exception when insufficient_privilege then null;
end $$;

-- pgcrypto: las migraciones lo invocan como `extensions.gen_random_bytes`,
-- porque en Supabase vive en el schema `extensions` (ver la nota de la
-- migración 012). Si la instalación local lo dejó en `public`, se tiende un
-- puente en vez de fallar: dónde acabó instalado es accidental.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;

do $$
begin
  if to_regprocedure('extensions.gen_random_bytes(integer)') is null
     and to_regprocedure('public.gen_random_bytes(integer)') is not null then
    execute $f$
      create function extensions.gen_random_bytes(integer) returns bytea
      language sql volatile as $b$ select public.gen_random_bytes($1) $b$
    $f$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Roles de PostgREST
-- ---------------------------------------------------------------------
do $$ begin create role anon;         exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role;  exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------
-- Solo si no existe ya la tabla real de GoTrue.
do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id                 uuid primary key default gen_random_uuid(),
      email              text,
      raw_user_meta_data jsonb,
      encrypted_password text,
      created_at         timestamptz default now()
    );
  end if;
exception when insufficient_privilege then null;
end $$;

-- auth.uid() lee el claim que PostgREST inyecta por petición. La versión real
-- de Supabase lee exactamente el mismo GUC, así que si ya existe se respeta.
-- En pruebas se simula con:  set local request.jwt.claim.sub = '<uuid>';
do $$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $f$
      create function auth.uid() returns uuid language sql stable as
      $b$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $b$
    $f$;
  end if;
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    create table storage.buckets (
      id                 text primary key,
      name               text,
      public             boolean,
      file_size_limit    bigint,
      allowed_mime_types text[],
      created_at         timestamptz default now()
    );
  else
    -- La imagen de Supabase trae `storage.buckets` pero con la forma mínima:
    -- las columnas `public`, `file_size_limit` y `allowed_mime_types` las
    -- añaden las migraciones del servicio de Storage, que en un contenedor
    -- pelado no han corrido. Las migraciones 016, 019, 020 y 025 sí las usan.
    alter table storage.buckets add column if not exists public boolean;
    alter table storage.buckets add column if not exists file_size_limit bigint;
    alter table storage.buckets add column if not exists allowed_mime_types text[];
  end if;

  if to_regclass('storage.objects') is null then
    create table storage.objects (
      id         uuid primary key default gen_random_uuid(),
      bucket_id  text,
      name       text,
      owner      uuid,
      created_at timestamptz default now(),
      metadata   jsonb
    );
    alter table storage.objects enable row level security;
  end if;

  if to_regprocedure('storage.foldername(text)') is null then
    execute $f$
      create function storage.foldername(name text) returns text[]
      language sql immutable as $b$ select string_to_array(name, '/') $b$
    $f$;
  end if;

  if to_regprocedure('storage.filename(text)') is null then
    execute $f$
      create function storage.filename(name text) returns text
      language sql immutable as $b$ select split_part(name, '/', -1) $b$
    $f$;
  end if;
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------
-- pg_cron / pg_net
-- ---------------------------------------------------------------------
-- En la imagen de Supabase las extensiones reales existen; fuera de ella se
-- fabrican firmas compatibles para que las migraciones no revienten.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    execute $f$
      create function cron.schedule(text, text, text) returns bigint
      language sql as $b$ select 1::bigint $b$
    $f$;
  end if;

  if to_regprocedure('cron.unschedule(text)') is null then
    execute $f$
      create function cron.unschedule(text) returns boolean
      language sql as $b$ select true $b$
    $f$;
  end if;
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$
begin
  create publication supabase_realtime;
exception
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------
-- GRANTs por defecto de Supabase
-- ---------------------------------------------------------------------
-- Importa que estén: sin ellos las pruebas de RLS darían "permission denied"
-- por GRANT y no por política, y no probarían nada. En la imagen real ya están
-- otorgados y estas sentencias son inocuas.
-- Se concede solo sobre lo que existe y solo si se puede: en la imagen real
-- estos permisos ya están dados y el usuario que corre las migraciones no es
-- dueño de `auth` ni de `storage`.
do $$
declare sch text;
begin
  foreach sch in array array['public', 'auth', 'storage'] loop
    if exists (select 1 from information_schema.schemata where schema_name = sch) then
      begin
        execute format('grant usage on schema %I to anon, authenticated, service_role', sch);
      exception when insufficient_privilege then null;
      end;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('auth.uid()') is not null then
    grant execute on function auth.uid() to anon, authenticated, service_role;
  end if;
exception when insufficient_privilege then null;
end $$;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
