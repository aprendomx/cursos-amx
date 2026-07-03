#!/usr/bin/env bash
# scripts/deploy.sh — despliegue del stack self-hosted en UN paso:
#   1) git pull          (trae código + migraciones + funciones bind-mounted)
#   2) migraciones        (scripts/migrate.sh — transaccional e idempotente)
#   3) restart functions  (recarga el Edge Runtime con las funciones nuevas)
#   4) verificación        (contenedor Up + la función responde 401, no 500)
#
# Pensado para correrse EN EL SERVIDOR, desde la raíz del repo (donde viven
# docker/ y scripts/).
#
# Uso:
#   scripts/deploy.sh                 # pull + migrar + restart + verificar
#   scripts/deploy.sh --no-pull       # no hace git pull (usa lo ya presente)
#   scripts/deploy.sh --no-migrate    # omite las migraciones
#   scripts/deploy.sh --no-functions  # no reinicia el runtime de funciones
#   scripts/deploy.sh --branch main   # rama a la que hacer pull (def: develop)
#   scripts/deploy.sh --dry-run       # muestra lo que haría sin ejecutar
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"

DO_PULL=1
DO_MIGRATE=1
DO_FUNCTIONS=1
DRY_RUN=0
BRANCH="develop"
# URL pública para el chequeo final; override con PUBLIC_URL=...
PUBLIC_URL="${PUBLIC_URL:-https://REEMPLAZA_CON_TU_DOMINIO_PUBLICO}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull)      DO_PULL=0; shift ;;
    --no-migrate)   DO_MIGRATE=0; shift ;;
    --no-functions) DO_FUNCTIONS=0; shift ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    -h|--help)      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opción desconocida: $1 (ver --help)" >&2; exit 1 ;;
  esac
done

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

run() {
  echo "    \$ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then "$@"; fi
}

# Aviso si falta el router main/ (no versionado): sin él el runtime no arranca
# y TODAS las funciones devuelven 500 vía Kong.
if [[ ! -f "$ROOT/docker/volumes/functions/main/index.ts" ]]; then
  echo "⚠  Falta docker/volumes/functions/main/index.ts (router del Edge Runtime)."
  echo "   Sin él el contenedor 'functions' no levanta. Cópialo del upstream antes de continuar."
fi

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "==> [1/4] git pull origin $BRANCH"
  run git -C "$ROOT" pull origin "$BRANCH"
else
  echo "==> [1/4] git pull omitido (--no-pull)"
fi

if [[ "$DO_MIGRATE" -eq 1 ]]; then
  echo "==> [2/4] Migraciones"
  run "$ROOT/scripts/migrate.sh"
else
  echo "==> [2/4] Migraciones omitidas (--no-migrate)"
fi

if [[ "$DO_FUNCTIONS" -eq 1 ]]; then
  echo "==> [3/4] Recargando Edge Functions"
  run compose restart functions
  echo "    --- logs recientes de functions ---"
  if [[ "$DRY_RUN" -eq 0 ]]; then compose logs --tail=30 functions || true; fi
else
  echo "==> [3/4] Functions sin tocar (--no-functions)"
fi

echo "==> [4/4] Verificación"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "    [dry-run] compose ps functions; curl $PUBLIC_URL/functions/v1/admin-set-password"
else
  compose ps functions || true
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$PUBLIC_URL/functions/v1/admin-set-password" || echo 000)"
  echo "    admin-set-password responde HTTP $code"
  case "$code" in
    401|400) echo "    ✔ El runtime carga y la función corre (auth rechaza sin token)." ;;
    500|502|503|000) echo "    ✘ HTTP $code: el contenedor 'functions' sigue caído. Revisa los logs de arriba." ;;
    *) echo "    HTTP $code (inesperado): revisa manualmente." ;;
  esac
fi

echo "==> Despliegue terminado."
