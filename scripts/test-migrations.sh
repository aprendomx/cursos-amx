#!/usr/bin/env bash
# scripts/test-migrations.sh — aplica TODO el set de migraciones a una base
# limpia y falla si alguna no entra. Es la prueba que faltaba: sin ella, un
# error de SQL solo se descubre cuando alguien intenta instalar desde cero.
#
# Uso:
#   DB_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/test-migrations.sh
#
# OJO con la base de destino: apúntalo a `postgres`, no a una base creada al
# vuelo. pg_cron solo se puede instalar en la que indica cron.database_name
# (por defecto `postgres`), así que en cualquier otra las migraciones 051 y 052
# fallan con "can only create extension in database postgres". Además es lo que
# hace scripts/migrate.sh en producción, así que la prueba se parece más.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${DB_URL:?Define DB_URL (ej. postgres://postgres:postgres@localhost:5432/amx_test)}"
# pg_cron/pg_net solo existen en la imagen supabase/postgres. Fuera de ella se
# neutraliza la creación de la extensión; el resto de la migración sí se prueba.
STUB_EXT="${STUB_EXTENSIONS:-0}"

echo "==> Stubs de Supabase"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/test/00_supabase_stubs.sql"

echo "==> Aplicando migraciones"
fallidas=0
for f in "$ROOT"/supabase/migrations/0*.sql; do
  nombre="$(basename "$f")"
  src="$f"
  if [[ "$STUB_EXT" == "1" ]]; then
    src="$(mktemp)"
    sed -E 's/create extension if not exists (pg_cron|pg_net)[^;]*;/select 1;/Ig' "$f" > "$src"
  fi
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -1 -f "$src" >/dev/null 2>"$ROOT/.migerr"; then
    echo "  ✅ $nombre"
  else
    echo "  ❌ $nombre"
    grep -E '^psql:.*ERROR|^ERROR' "$ROOT/.migerr" | head -3 | sed 's/^/       /'
    fallidas=$((fallidas + 1))
  fi
done
rm -f "$ROOT/.migerr"

echo "==> Verificación de esquema"
faltantes="$(psql "$DB_URL" -At -c "
  with esperadas(t) as (values
    ('dependencias'),('perfiles'),('cursos'),('modulos'),('lecciones'),
    ('inscripciones'),('progreso'),('comentarios'),('constancias'),('videos'),
    ('preguntas'),('pregunta_opciones'),('intentos_evaluacion'),('foros'),
    ('foro_hilos'),('foro_respuestas'),('entregas_leccion'),('mensajes_chat'),
    ('tiempo_curso'),('feature_toggles'),('cohortes'),('miembros_cohorte'),
    ('tareas'),('entregas'),('entrega_versiones'),('calificaciones'),
    ('rubricas'),('rubrica_criterios'),('rubrica_niveles'),
    ('notificaciones'),('notificacion_plantillas'),('anuncios'),
    ('sesiones_virtuales'),('sesiones_rsvp'),('sesiones_grabaciones'),
    ('sesiones_transcripciones'),('zoom_configuracion'),('push_subscriptions'))
  select t from esperadas where to_regclass('public.' || t) is null;")"

if [[ -n "$faltantes" ]]; then
  echo "  ❌ tablas ausentes:"; echo "$faltantes" | sed 's/^/       /'
  fallidas=$((fallidas + 1))
else
  echo "  ✅ todas las tablas esperadas existen"
fi

# Toda tabla de public debe tener RLS habilitado: con la anon key en el
# cliente, una tabla sin RLS es una tabla pública.
sin_rls="$(psql "$DB_URL" -At -c "
  select c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname <> '_migraciones'
    and not c.relrowsecurity;")"

if [[ -n "$sin_rls" ]]; then
  echo "  ❌ tablas sin RLS habilitado:"; echo "$sin_rls" | sed 's/^/       /'
  fallidas=$((fallidas + 1))
else
  echo "  ✅ todas las tablas de public tienen RLS habilitado"
fi

if [[ "$fallidas" -gt 0 ]]; then
  echo "==> FALLÓ ($fallidas problemas)"; exit 1
fi

echo "==> GRANTs de Supabase sobre las tablas recién creadas"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/test/90_grants.sql"

echo "==> Pruebas de RLS"
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/test/rls.sql" 2>&1 \
     | grep -vE '^(NOTICE|DO|SET|CREATE|INSERT|psql:)' ; then
  echo "==> FALLÓ (pruebas de RLS)"; exit 1
fi

echo "==> OK"
