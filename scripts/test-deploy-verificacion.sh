#!/usr/bin/env bash
# Verifica la clasificación de resultados de scripts/deploy.sh sin stack.
#
# Por qué existe: la verificación del despliegue fallaba EN ABIERTO. Cuando una
# comprobación no se podía ejecutar, se reportaba como superada. Tres casos
# reales en la instalación de aprendo.mx: el grupo de funciones daba por buenas
# las respuestas 404 y 500, la comprobación de RLS afirmaba «todas las tablas
# lo tienen» cuando el psql fallaba, y la de escalada de privilegios nunca
# llegó a correr por un uuid inválido sin que nadie se enterara.
#
# La regla —lo que no se pudo comprobar NO está bien— vive en dos funciones
# puras, y aquí se fija su tabla de verdad. Lo que necesita stack (el sondeo
# real, la escalada contra Postgres) se verifica a mano.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OBJETIVO="$ROOT/scripts/deploy.sh"

# shellcheck disable=SC1090
source "$OBJETIVO"

echo "==> Probando la verificación de scripts/deploy.sh"
fallidas=0
ok()    { echo "  ✅ $1"; }
falla() { echo "  ❌ $1" >&2; fallidas=$((fallidas + 1)); }

comprobar() {
  local etiqueta="$1" obtenido="$2" esperado="$3"
  if [[ "${obtenido%%|*}" == "$esperado" ]]; then
    ok "$etiqueta → $esperado"
  else
    falla "$etiqueta → se esperaba '$esperado' y se obtuvo '$obtenido'"
  fi
}

# --- clasificar_http --------------------------------------------------------
echo "  -- clasificar_http --"
comprobar "401 (exige autenticación)"  "$(clasificar_http '401,403' 401)" ok
comprobar "403 (prohibido)"            "$(clasificar_http '401,403' 403)" ok
comprobar "200 (accesible sin token)"  "$(clasificar_http '401,403' 200)" problema
comprobar "404 (función ausente)"      "$(clasificar_http '401,403' 404)" problema
comprobar "500 (runtime no responde)"  "$(clasificar_http '401,403' 500)" problema
comprobar "502 (gateway)"              "$(clasificar_http '401,403' 502)" problema
comprobar "000 (sin conexión)"         "$(clasificar_http '401,403' 000)" no_ejecutable
comprobar "vacío (sin respuesta)"      "$(clasificar_http '401,403' '')"  no_ejecutable

# Los mensajes tienen que llevar a la reparación correcta: un 404 y un 500 no
# se arreglan igual que una función desprotegida.
if [[ "$(clasificar_http '401,403' 200)" == *"SIN exigir autenticación"* ]] \
  && [[ "$(clasificar_http '401,403' 404)" == *"no está desplegada"* ]] \
  && [[ "$(clasificar_http '401,403' 000)" == *"no hubo respuesta"* ]]; then
  ok "cada resultado explica qué revisar"
else
  falla "los mensajes no distinguen los casos"
fi

# --- clasificar_sql ---------------------------------------------------------
echo "  -- clasificar_sql --"
comprobar "psql falló"        "$(clasificar_sql 1 '')"     no_ejecutable
comprobar "salida vacía"      "$(clasificar_sql 0 '')"     no_ejecutable
comprobar "salida '?'"        "$(clasificar_sql 0 '?')"    no_ejecutable
comprobar "solo espacios"     "$(clasificar_sql 0 '  ')"   no_ejecutable
comprobar "valor normal"      "$(clasificar_sql 0 '69')"   ok
comprobar "cero es un valor"  "$(clasificar_sql 0 '0')"    ok

v="$(clasificar_sql 0 '  69  ')"
if [[ "${v#*|}" == "69" ]]; then
  ok "el valor devuelto viene sin espacios alrededor"
else
  falla "el valor no se limpió: '${v#*|}'"
fi

# --- registrar --------------------------------------------------------------
# Es el único sitio que incrementa el contador; si alguna rama deja de sumar,
# vuelve el fallo en abierto.
echo "  -- registrar --"
problemas=0
registrar "prueba" "ok|todo bien" > /dev/null
[[ "$problemas" -eq 0 ]] && ok "un ok no suma problemas" || falla "un ok sumó $problemas"

problemas=0
registrar "prueba" "problema|algo pasa" 2>/dev/null >/dev/null
[[ "$problemas" -eq 1 ]] && ok "un problema suma 1" || falla "un problema sumó $problemas"

problemas=0
registrar "prueba" "no_ejecutable|no se pudo" 2>/dev/null >/dev/null
[[ "$problemas" -eq 1 ]] && ok "una comprobación no ejecutable suma 1" \
  || falla "no_ejecutable sumó $problemas (¡fallo en abierto!)"

salida="$(registrar "RLS" "no_ejecutable|psql murió" 2>&1 >/dev/null)"
if [[ "$salida" == *"NO SE PUDO COMPROBAR"* ]]; then
  ok "lo no comprobable se anuncia como tal, no como superado"
else
  falla "el mensaje no dice que no se pudo comprobar: '$salida'"
fi

# --- resolver_url_api -------------------------------------------------------
echo "  -- resolver_url_api --"
salida="$(PUBLIC_URL=https://api.ejemplo.test/ bash -c "
  source '$OBJETIVO'
  resolver_url_api
  echo \"\$URL_API|\$ORIGEN_URL\"")"
if [[ "$salida" == "https://api.ejemplo.test|la variable PUBLIC_URL" ]]; then
  ok "PUBLIC_URL tiene prioridad y se le quita la barra final"
else
  falla "resolución con PUBLIC_URL: '$salida'"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/docker" "$TMP/scripts"
echo 'API_EXTERNAL_URL=https://api.desde-env.test' > "$TMP/docker/.env"
cp "$OBJETIVO" "$TMP/scripts/deploy.sh"
salida="$(bash -c "
  unset PUBLIC_URL
  source '$TMP/scripts/deploy.sh'
  resolver_url_api
  echo \"\$URL_API|\$ORIGEN_URL\"")"
if [[ "$salida" == "https://api.desde-env.test|API_EXTERNAL_URL de docker/.env" ]]; then
  ok "sin PUBLIC_URL se toma API_EXTERNAL_URL de docker/.env"
else
  falla "resolución desde docker/.env: '$salida'"
fi

echo 'API_EXTERNAL_URL=' > "$TMP/docker/.env"
if salida="$(bash -c "
  unset PUBLIC_URL
  source '$TMP/scripts/deploy.sh'
  resolver_url_api" 2>&1)"; then
  falla "sin ninguna URL debería fallar, y devolvió éxito"
elif [[ "$salida" == *"API_EXTERNAL_URL"* && "$salida" == *"PUBLIC_URL"* ]]; then
  ok "sin ninguna URL falla nombrando los dos orígenes"
else
  falla "el error no nombra ambos orígenes: '$salida'"
fi

# --- el uuid de la comprobación de escalada ---------------------------------
# Llevaba '4beef' (cinco dígitos hexadecimales) y Postgres rechazaba el literal
# entero: la comprobación nunca corrió. Se fija su forma aquí.
echo "  -- comprobación de escalada --"
uuids="$(grep -oE "'[0-9a-f]{8}-[0-9a-z]+-[0-9a-z]+-[0-9a-z]+-[0-9a-z]+'" "$OBJETIVO" | tr -d "'" | sort -u)"
malos=0
for u in $uuids; do
  [[ "$u" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || { echo "       uuid inválido: $u" >&2; malos=1; }
done
[[ "$malos" -eq 0 ]] && ok "todos los uuid literales son válidos" || falla "hay uuid inválidos"

if grep -q "SESION_INEFECTIVA" "$OBJETIVO" && grep -q "rollback;" "$OBJETIVO"; then
  ok "la comprobación asegura que la sesión simulada es efectiva y revierte"
else
  falla "falta la aserción de sesión efectiva o el rollback"
fi

[[ $fallidas -eq 0 ]] || { echo "==> FALLÓ ($fallidas)"; exit 1; }
echo "==> OK"
