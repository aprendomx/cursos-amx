#!/usr/bin/env bash
# Verifica que kong.yml siga siendo YAML válido DESPUÉS de la sustitución de
# variables que hace docker/volumes/api/kong-entrypoint.sh.
#
# Por qué existe: las expresiones Lua que se inyectan contienen comillas
# simples ('Bearer sb_'). Si alguna línea "Header: $VAR" pasa a comillas
# simples —Prettier lo hace por su cuenta—, el YAML renderizado se rompe,
# Kong no arranca y la instalación se queda sin API. El archivo crudo sigue
# pareciendo correcto, así que solo se detecta renderizando.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KONG_YML="$ROOT/docker/volumes/api/kong.yml"
ENTRYPOINT="$ROOT/docker/volumes/api/kong-entrypoint.sh"

echo "==> Renderizando kong.yml con valores de ejemplo"

# Valores representativos: los que producen el caso difícil son los que llevan
# comillas simples dentro, así que se prueban las dos ramas del entrypoint.
render() {
  env \
    SUPABASE_SECRET_KEY="$1" \
    SUPABASE_PUBLISHABLE_KEY="$2" \
    SERVICE_ROLE_KEY_ASYMMETRIC="srk.ejemplo" \
    ANON_KEY_ASYMMETRIC="anon.ejemplo" \
    SUPABASE_ANON_KEY="anon.legacy" \
    SUPABASE_SERVICE_KEY="service.legacy" \
    DASHBOARD_USERNAME="admin" \
    DASHBOARD_PASSWORD="secreto" \
    bash -c '
      source_entry() { :; }
      # Reproduce la lógica del entrypoint sin arrancar Kong.
      if [ -n "$SUPABASE_SECRET_KEY" ] && [ -n "$SUPABASE_PUBLISHABLE_KEY" ]; then
        export LUA_AUTH_EXPR="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= '"'"'Bearer sb_'"'"' and headers.authorization) or (headers.apikey == '"'"'$SUPABASE_SECRET_KEY'"'"' and '"'"'Bearer $SERVICE_ROLE_KEY_ASYMMETRIC'"'"') or (headers.apikey == '"'"'$SUPABASE_PUBLISHABLE_KEY'"'"' and '"'"'Bearer $ANON_KEY_ASYMMETRIC'"'"') or headers.apikey)"
        export LUA_RT_WS_EXPR="\$((query_params.apikey == '"'"'$SUPABASE_SECRET_KEY'"'"' and '"'"'$SERVICE_ROLE_KEY_ASYMMETRIC'"'"') or query_params.apikey)"
      else
        export LUA_AUTH_EXPR="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= '"'"'Bearer sb_'"'"' and headers.authorization) or headers.apikey)"
        export LUA_RT_WS_EXPR="\$(query_params.apikey)"
      fi
      awk "{
        result = \"\"
        rest = \$0
        while (match(rest, /\\\$[A-Za-z_][A-Za-z_0-9]*/)) {
          varname = substr(rest, RSTART + 1, RLENGTH - 1)
          if (varname in ENVIRON) {
            result = result substr(rest, 1, RSTART - 1) ENVIRON[varname]
          } else {
            result = result substr(rest, 1, RSTART + RLENGTH - 1)
          }
          rest = substr(rest, RSTART + RLENGTH)
        }
        print result rest
      }" '"$KONG_YML"'
    '
}

fallidas=0
for caso in "sb_secret_ejemplo|sb_publishable_ejemplo|con llaves opacas" "||solo llaves legacy"; do
  IFS='|' read -r sk pk etiqueta <<< "$caso"
  salida="$(render "$sk" "$pk")"
  if printf '%s' "$salida" | python3 -c 'import sys, yaml; yaml.safe_load(sys.stdin)' 2>/tmp/kong-yaml.err; then
    echo "  ✅ $etiqueta: el YAML renderizado parsea"
  else
    echo "  ❌ $etiqueta: el YAML renderizado NO parsea" >&2
    sed 's/^/       /' /tmp/kong-yaml.err >&2
    fallidas=$((fallidas + 1))
  fi
done

# Las comillas dobles de estas líneas son funcionales: ver el comentario de
# arriba y .prettierignore.
if grep -qE "^\s+- '[A-Za-z-]+: \\\$LUA_" "$KONG_YML"; then
  echo "  ❌ hay cabeceras con comillas simples; deben ir con dobles" >&2
  grep -nE "^\s+- '[A-Za-z-]+: \\\$LUA_" "$KONG_YML" | sed 's/^/       /' >&2
  fallidas=$((fallidas + 1))
else
  echo "  ✅ las cabeceras con expresiones Lua usan comillas dobles"
fi

[[ $fallidas -eq 0 ]] || { echo "==> FALLÓ"; exit 1; }
echo "==> OK"
