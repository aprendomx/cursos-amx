-- =========================================================
-- verify_storage.sql — verificación post-install de Storage
-- =========================================================
-- Corre después de aplicar las migraciones (paso 5 del README).
-- Confirma que los 5 buckets que usa el frontend existen con la
-- visibilidad correcta y que storage.objects tiene RLS + policies.
--
-- Uso:
--   docker compose -f docker/docker-compose.yml exec -T db \
--     psql -U postgres -d postgres < supabase/verify_storage.sql
--
-- Salida esperada: la columna estado debe decir OK en cada fila;
-- bucket_policies > 0 y rls_habilitado = t.
-- =========================================================

-- 1. Buckets esperados vs. creados
with esperados(id, publico) as (
  values
    ('video-ingest',   false),
    ('video-hls',      false),
    ('lesson-docs',    false),
    ('curso-portadas', true),
    ('entregas',       false)
)
select
  e.id                                               as bucket,
  e.publico                                          as publico_esperado,
  b.public                                           as publico_real,
  case
    when b.id is null                       then 'FALTA  ✗'
    when b.public is distinct from e.publico then 'VISIBILIDAD MAL  ✗'
    else 'OK  ✓'
  end                                                as estado
from esperados e
left join storage.buckets b on b.id = e.id
order by e.id;

-- 2. RLS habilitado en storage.objects + número de policies
select
  c.relrowsecurity                                   as rls_habilitado,
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects') as bucket_policies,
  case when c.relrowsecurity then 'OK  ✓' else 'RLS OFF  ✗' end as estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage' and c.relname = 'objects';
