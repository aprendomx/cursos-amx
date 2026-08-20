#!/usr/bin/env bash
# scripts/deploy.sh — despliegue del stack self-hosted en UN paso:
#   0) pre-vuelo          (árbol limpio, pull sin conflictos)
#   1) git pull           (trae código + migraciones + funciones bind-mounted)
#   2) RESPALDO           (pg_dump antes de tocar el esquema — no es opcional)
#   3) migraciones        (dry-run informativo + scripts/migrate.sh)
#   4) restart functions  (recarga el Edge Runtime con las funciones nuevas)
#   5) verificación       (contenedor Up, función responde 401, esquema sano)
#   6) primer admin       (si la instalación no tiene ninguno, lo crea)
#
# Pensado para correrse EN EL SERVIDOR, desde la raíz del repo (donde viven
# docker/ y scripts/).
#
# Uso:
#   scripts/deploy.sh                 # pre-vuelo + pull + respaldo + migrar + restart + verificar
#   scripts/deploy.sh --no-pull       # no hace git pull (usa lo ya presente)
#   scripts/deploy.sh --no-migrate    # omite las migraciones (y el respaldo)
#   scripts/deploy.sh --no-functions  # no reinicia el runtime de funciones
#   scripts/deploy.sh --no-admin      # omite el paso del primer administrador
#   scripts/deploy.sh --branch develop  # rama a la que hacer pull (def: main)
#   scripts/deploy.sh --backup-dir DIR  # dónde dejar el respaldo (def: ./backups)
#   scripts/deploy.sh --skip-backup     # PELIGROSO: migrar sin respaldo previo
#   scripts/deploy.sh --dry-run       # muestra lo que haría sin ejecutar
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"

DO_PULL=1
DO_MIGRATE=1
DO_FUNCTIONS=1
DO_ADMIN=1
DRY_RUN=0
SKIP_BACKUP=0
BRANCH="main"
BACKUP_DIR="$ROOT/backups"
# URL pública para el chequeo final (obligatoria): PUBLIC_URL=https://... scripts/deploy.sh
PUBLIC_URL="${PUBLIC_URL:?Define PUBLIC_URL (ej. PUBLIC_URL=https://cursos.tu-dominio.org)}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull)      DO_PULL=0; shift ;;
    --no-migrate)   DO_MIGRATE=0; shift ;;
    --no-functions) DO_FUNCTIONS=0; shift ;;
    --no-admin)     DO_ADMIN=0; shift ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    --backup-dir)   BACKUP_DIR="$2"; shift 2 ;;
    --skip-backup)  SKIP_BACKUP=1; shift ;;
    -h|--help)      sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opción desconocida: $1 (ver --help)" >&2; exit 1 ;;
  esac
done

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

run() {
  echo "    \$ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then "$@"; fi
}

# Archivos sin los que el stack NO arranca. Estuvieron sin versionar y docker
# los creaba como directorios vacíos: vector entraba en bucle de reinicio y el
# resto de servicios caía detrás, con un error que no señalaba la causa.
faltan=()
for f in \
  docker/volumes/functions/main/index.ts \
  docker/volumes/api/kong.yml \
  docker/volumes/logs/vector.yml \
  docker/volumes/pooler/pooler.exs \
  docker/volumes/db/roles.sql \
  docker/volumes/db/jwt.sql \
  docker/volumes/db/realtime.sql \
  docker/volumes/db/webhooks.sql \
  docker/volumes/db/logs.sql \
  docker/volumes/db/pooler.sql \
  docker/volumes/db/_supabase.sql
do
  [[ -f "$ROOT/$f" ]] || faltan+=("$f")
done
if [[ ${#faltan[@]} -gt 0 ]]; then
  echo "✘ Faltan archivos de configuración del stack:" >&2
  printf '    %s\n' "${faltan[@]}" >&2
  echo "  Sin ellos docker los crea como DIRECTORIOS y el stack no levanta." >&2
  echo "  Recupéralos del repositorio (git checkout docker/volumes) antes de continuar." >&2
  exit 1
fi

# Los scripts de db/ solo se ejecutan al inicializar el volumen por primera vez.
# Si ya existe data/ pero los roles no están, los servicios fallarán con
# "password authentication failed": es más útil avisarlo aquí.
if [[ -d "$ROOT/docker/volumes/db/data" && ! -f "$ROOT/docker/volumes/db/roles.sql" ]]; then
  echo "⚠  El volumen de datos existe pero faltan los scripts de init." >&2
fi

echo "==> [0/6] Pre-vuelo"
if [[ "$DO_PULL" -eq 1 ]]; then
  # Un árbol sucio hace que `git pull` aborte a media faena y deje el
  # despliegue en un estado indeterminado. Se detecta ANTES de tocar nada.
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    echo "    ✘ El árbol de trabajo tiene cambios sin confirmar:" >&2
    git -C "$ROOT" status --short | sed 's/^/      /' >&2
    echo "      Confirma, descarta o guarda esos cambios antes de desplegar." >&2
    echo "      Suele ser theme/theme.config.js: ver THEMING.md (usa theme.config.local.js)." >&2
    exit 1
  fi
  # Comprobar que el merge es limpio ANTES de aplicarlo.
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git -C "$ROOT" fetch origin "$BRANCH"
    if ! git -C "$ROOT" merge-base --is-ancestor HEAD "origin/$BRANCH" 2>/dev/null; then
      echo "    ⚠  HEAD no es ancestro de origin/$BRANCH: el pull no será un fast-forward."
      echo "       Revisa el estado del repo en el servidor antes de continuar." >&2
      exit 1
    fi
  fi
  echo "    ✔ Árbol limpio y pull en fast-forward."
else
  echo "    (pull omitido: no se comprueba el estado del árbol)"
fi

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "==> [1/6] git pull origin $BRANCH"
  run git -C "$ROOT" pull --ff-only origin "$BRANCH"
else
  echo "==> [1/6] git pull omitido (--no-pull)"
fi

# Kong es la puerta de toda la API. Si su configuración no parsea tras la
# sustitución de variables, el contenedor no arranca y la instalación queda
# sin backend, aunque el frontend siga sirviéndose. Se comprueba aquí, después
# del pull y antes de tocar la base, para no descubrirlo al reiniciar el stack.
if [[ -x "$ROOT/scripts/test-kong-config.sh" ]]; then
  echo "==> Verificando la configuración de Kong"
  if ! "$ROOT/scripts/test-kong-config.sh" | sed 's/^/    /'; then
    echo "    ✘ kong.yml no parsea tras renderizarse. Se aborta el despliegue." >&2
    exit 1
  fi
fi

BACKUP_FILE=""
if [[ "$DO_MIGRATE" -eq 1 ]]; then
  echo "==> [2/6] Respaldo de la base"
  if [[ "$SKIP_BACKUP" -eq 1 ]]; then
    echo "    ⚠  OMITIDO por --skip-backup. Las migraciones no tienen bajada:"
    echo "       si algo sale mal, la única reversa es un respaldo que no existe."
  else
    BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql"
    run mkdir -p "$BACKUP_DIR"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "    [dry-run] pg_dump -> $BACKUP_FILE"
    else
      echo "    Volcando a $BACKUP_FILE ..."
      if ! compose exec -T db pg_dump -U postgres -d postgres --clean --if-exists \
           > "$BACKUP_FILE"; then
        echo "    ✘ Falló el respaldo. NO se aplican migraciones." >&2
        rm -f "$BACKUP_FILE"
        exit 1
      fi
      # Un pg_dump que falla a media escritura deja un archivo truncado que
      # parece válido. Se comprueba que termine como termina un volcado sano.
      if ! tail -5 "$BACKUP_FILE" | grep -q "PostgreSQL database dump complete"; then
        echo "    ✘ El respaldo parece truncado (sin marca de fin). NO se migra." >&2
        exit 1
      fi
      echo "    ✔ Respaldo OK ($(du -h "$BACKUP_FILE" | cut -f1))"
    fi
  fi

  echo "==> [3/6] Migraciones"
  echo "    --- pendientes ---"
  run "$ROOT/scripts/migrate.sh" --dry-run
  if ! run "$ROOT/scripts/migrate.sh"; then
    echo "    ✘ Falló la migración." >&2
    if [[ -n "$BACKUP_FILE" ]]; then
      echo "       Para revertir el esquema:" >&2
      echo "         compose exec -T db psql -U postgres -d postgres < $BACKUP_FILE" >&2
      echo "       OJO: restaurar descarta todo lo ocurrido desde el respaldo." >&2
    fi
    exit 1
  fi
else
  echo "==> [2/6] Respaldo omitido (--no-migrate)"
  echo "==> [3/6] Migraciones omitidas (--no-migrate)"
fi

if [[ "$DO_FUNCTIONS" -eq 1 ]]; then
  echo "==> [4/6] Recargando Edge Functions"

  # Las funciones se escriben en supabase/functions/ pero el contenedor monta
  # docker/volumes/functions/. Sin sincronizar, se despliega lo que hubiera ahí
  # de antes: en la instalación de aprendo.mx había 5 funciones viejas frente a
  # las 13 del repositorio, y ninguna de las correcciones de autenticación
  # llegaba al runtime.
  echo "    Sincronizando supabase/functions -> docker/volumes/functions"
  for fn in "$ROOT"/supabase/functions/*/; do
    nombre="$(basename "$fn")"
    run rm -rf "$ROOT/docker/volumes/functions/$nombre"
    run cp -r "$fn" "$ROOT/docker/volumes/functions/$nombre"
  done
  if [[ -f "$ROOT/supabase/functions/deno.json" ]]; then
    run cp "$ROOT/supabase/functions/deno.json" "$ROOT/docker/volumes/functions/"
  fi
  run compose restart functions
  echo "    --- logs recientes de functions ---"
  if [[ "$DRY_RUN" -eq 0 ]]; then compose logs --tail=30 functions || true; fi
else
  echo "==> [4/6] Functions sin tocar (--no-functions)"
fi

echo "==> [5/6] Verificación"
problemas=0
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "    [dry-run] compose ps functions; curl $PUBLIC_URL/functions/v1/...; chequeos de esquema"
else
  compose ps functions || true

  # --- 1. El Edge Runtime carga ---
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$PUBLIC_URL/functions/v1/admin-set-password" || echo 000)"
  case "$code" in
    401|400) echo "    ✔ Edge Runtime arriba (admin-set-password rechaza sin token: $code)" ;;
    500|502|503|000)
      echo "    ✘ admin-set-password devuelve $code: el contenedor 'functions' está caído." >&2
      problemas=$((problemas + 1)) ;;
    *) echo "    ⚠  admin-set-password devuelve $code (inesperado): revisa a mano." ;;
  esac

  # --- 2. Las funciones que antes eran anónimas ahora rechazan ---
  # Si alguna de estas responde 200 sin token, la migración de seguridad no
  # llegó al runtime (típicamente: falta reiniciar el contenedor 'functions').
  for fn in ai-proxy transcribir-sesion notifications-worker zoom-meeting; do
    c="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'content-type: application/json' -d '{}' \
      "$PUBLIC_URL/functions/v1/$fn" || echo 000)"
    if [[ "$c" == "200" ]]; then
      echo "    ✘ $fn responde 200 SIN autenticación. Revisa el despliegue." >&2
      problemas=$((problemas + 1))
    else
      echo "    ✔ $fn exige autenticación (HTTP $c)"
    fi
  done

  # --- 3. Esquema: migraciones registradas y RLS en todas las tablas ---
  aplicadas="$(compose exec -T db psql -U postgres -d postgres -At \
    -c "select count(*) from public._migraciones;" 2>/dev/null || echo '?')"
  en_disco="$(ls -1 "$ROOT"/supabase/migrations/0*.sql | wc -l | tr -d ' ')"
  echo "    Migraciones: $aplicadas registradas / $en_disco en disco"
  if [[ "$aplicadas" != "$en_disco" ]]; then
    echo "    ⚠  No coinciden. Revisa 'scripts/migrate.sh --dry-run'."
  fi

  sin_rls="$(compose exec -T db psql -U postgres -d postgres -At -c \
    "select string_agg(c.relname, ', ') from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not c.relrowsecurity;" 2>/dev/null || echo '?')"
  if [[ -n "$sin_rls" && "$sin_rls" != "?" ]]; then
    echo "    ✘ Tablas SIN RLS (con la anon key en el cliente, son públicas): $sin_rls" >&2
    problemas=$((problemas + 1))
  else
    echo "    ✔ Todas las tablas de public tienen RLS habilitado"
  fi

  # --- 4. La escalada de privilegios sigue bloqueada ---
  # Se comprueba FUNCIONALMENTE, no con has_column_privilege: ese devuelve true
  # aunque el sistema esté protegido, porque Supabase concede UPDATE a nivel de
  # tabla y un revoke de columna no lo anula. Lo que bloquea de verdad es el
  # trigger perfiles_guard_roles (migraciones 057 y 069), así que se prueba
  # intentando la escalada dentro de una transacción que luego se revierte.
  escalada="$(compose exec -T db psql -U postgres -d postgres -At <<'SQL' 2>/dev/null || echo '?'
begin;
insert into auth.users (id, email)
  values ('00000000-dead-4beef-8000-000000000001', 'verificacion@local')
  on conflict (id) do nothing;
insert into public.perfiles (id, nombres, apellido_paterno, correo)
  values ('00000000-dead-4beef-8000-000000000001', 'Verificacion', 'Despliegue', 'verificacion@local')
  on conflict (id) do nothing;
do $guard$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-dead-4beef-8000-000000000001';
  update public.perfiles set es_admin = true where id = auth.uid();
  reset role;
exception when others then reset role;
end $guard$;
select coalesce((select es_admin from public.perfiles
                  where id = '00000000-dead-4beef-8000-000000000001'), false)::text;
rollback;
SQL
)"
  case "$escalada" in
    *t*) echo "    ✘ ESCALADA ABIERTA: un usuario puede hacerse administrador." >&2
         problemas=$((problemas + 1)) ;;
    *f*) echo "    ✔ La escalada a administrador está bloqueada (probada en vivo)" ;;
    *)   echo "    ⚠  No se pudo comprobar la escalada de privilegios." ;;
  esac
fi

# ---------------------------------------------------------------------------
# [6/6] Primer administrador
# ---------------------------------------------------------------------------
# Una instalación sin nadie con es_admin no la puede administrar nadie: el
# trigger perfiles_guard_roles (057 y 069) impide que un usuario se promueva a
# sí mismo, y con razón. Hasta que existió este paso, deploy.sh terminaba en
# verde sobre una instalación inutilizable.
#
# El disparador es el CONTEO, no «es la primera instalación»: así también hace
# lo correcto si alguien borra al último administrador por accidente.
if [[ "$DO_ADMIN" -eq 0 ]]; then
  echo "==> [6/6] Primer administrador omitido (--no-admin)"
elif [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> [6/6] Primer administrador"
  echo "    [dry-run] contaría los administradores y, si no hubiera ninguno,"
  echo "              ejecutaría scripts/crear-admin.sh"
else
  echo "==> [6/6] Primer administrador"
  admins="$(compose exec -T db psql -U postgres -d postgres -At \
    -c "select count(*) from public.perfiles where es_admin;" 2>/dev/null \
    | tr -d '[:space:]' || echo '?')"

  case "$admins" in
    '?'|'')
      echo "    ⚠  No se pudo contar los administradores. Revísalo a mano." ;;
    0)
      if [[ -t 0 ]]; then
        echo "    Detectados 0 administradores."
        echo "    → creando el primero…"
        # Si el operador cancela o el alta falla, se cuenta como problema en
        # lugar de abortar el despliegue con un error crudo de set -e.
        if ! "$ROOT/scripts/crear-admin.sh"; then
          echo "    ✘ No se pudo crear el primer administrador." >&2
          problemas=$((problemas + 1))
        fi
      else
        # Sin terminal no se pregunta nada: se avisa y se cuenta como problema,
        # para no reportar éxito sobre una instalación que nadie puede usar.
        echo "    ✘ No hay ningún administrador y no hay terminal interactiva" >&2
        echo "      para crearlo. Nadie puede entrar al panel. Corre ahora:" >&2
        echo "" >&2
        echo "        scripts/crear-admin.sh" >&2
        problemas=$((problemas + 1))
      fi ;;
    *)
      echo "    ✔ Ya existen $admins administrador(es). Nada que hacer." ;;
  esac
fi

if [[ "$problemas" -gt 0 ]]; then
  echo "==> Despliegue terminado CON $problemas problema(s). Revisa lo marcado con ✘." >&2
  if [[ -n "$BACKUP_FILE" ]]; then
    echo "    Respaldo de esta corrida: $BACKUP_FILE" >&2
  fi
  exit 1
fi

echo "==> Despliegue terminado."
if [[ -n "$BACKUP_FILE" ]]; then
  echo "    Respaldo: $BACKUP_FILE"
fi
