#!/usr/bin/env bash
# scripts/migrate.sh — aplica supabase/migrations/*.sql en orden y lleva
# registro en public._migraciones para no reaplicar las que ya corrieron.
#
# Cada migración se ejecuta en UNA transacción junto con su marca de
# registro: o entra completa, o no entra.
#
# Uso:
#   scripts/migrate.sh                    # vía contenedor db del stack (docker/)
#   scripts/migrate.sh --db-url URL       # psql directo a esa URL
#   SUPABASE_DB_URL=postgres://... scripts/migrate.sh    # idem vía env
#   scripts/migrate.sh --dry-run          # lista pendientes sin aplicar nada
#   scripts/migrate.sh --baseline         # marca TODAS como aplicadas sin ejecutarlas
#   scripts/migrate.sh --baseline 019     # marca 001..019 como aplicadas (base ya
#                                         # migrada a mano hasta la 019)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"

DB_URL="${SUPABASE_DB_URL:-}"
DRY_RUN=0
BASELINE=0
BASELINE_HASTA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)   DB_URL="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --baseline)
      BASELINE=1; shift
      if [[ $# -gt 0 && "$1" != -* ]]; then BASELINE_HASTA="$1"; shift; fi
      ;;
    -h|--help)  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opción desconocida: $1 (ver --help)" >&2; exit 1 ;;
  esac
done

run_psql() {
  if [[ -n "$DB_URL" ]]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"
  else
    docker compose -f "$COMPOSE_FILE" exec -T db \
      psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
  fi
}

if [[ -n "$DB_URL" ]]; then
  echo "==> Modo: psql directo"
else
  echo "==> Modo: docker ($COMPOSE_FILE, servicio db)"
fi

# Conectividad + tabla de registro
run_psql -c "create table if not exists public._migraciones (
  nombre text primary key,
  aplicada_en timestamptz not null default now()
);" >/dev/null

aplicadas="$(run_psql -At -c "select nombre from public._migraciones order by nombre;")"

total=0 saltadas=0 hechas=0
for f in "$MIGRATIONS_DIR"/0*.sql; do
  nombre="$(basename "$f")"
  prefijo="${nombre%%_*}"
  total=$((total + 1))

  if grep -qxF "$nombre" <<<"$aplicadas"; then
    saltadas=$((saltadas + 1))
    continue
  fi

  if [[ "$BASELINE" -eq 1 ]]; then
    if [[ -n "$BASELINE_HASTA" && "$prefijo" > "$BASELINE_HASTA" ]]; then
      echo "    pendiente (fuera de baseline): $nombre"
      continue
    fi
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "    [dry-run] marcaría como aplicada: $nombre"
      continue
    fi
    run_psql -c "insert into public._migraciones (nombre) values ('$nombre') on conflict do nothing;" >/dev/null
    echo "    baseline: $nombre marcada como aplicada (no ejecutada)"
    hechas=$((hechas + 1))
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "    [dry-run] pendiente: $nombre"
    continue
  fi

  echo "==> Aplicando $nombre"
  {
    cat "$f"
    printf "\ninsert into public._migraciones (nombre) values ('%s');\n" "$nombre"
  } | run_psql -1 -f -
  hechas=$((hechas + 1))
done

echo "==> Listo: $total migraciones, $saltadas ya aplicadas, $hechas procesadas ahora."
