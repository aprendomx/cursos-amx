#!/usr/bin/env bash
# Verifica scripts/crear-admin.sh sin levantar el stack.
#
# Por qué existe: el script crea usuarios y otorga privilegios de administrador.
# Sus caminos de error —correo inválido, contraseña corta, falta de terminal—
# son justo los que nadie prueba a mano, y el que se cuelgue esperando entrada
# en un despliegue automatizado no se descubre hasta que pasa en producción.
#
# Los dos efectos externos del script (gotrue_admin_api y db_psql) son funciones
# precisamente para poder sustituirlas aquí por dobles. Lo que necesita base de
# datos real —alta, promoción, idempotencia de verdad— se verifica a mano contra
# la instancia de desarrollo.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OBJETIVO="$ROOT/scripts/crear-admin.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ENV_FALSO="$TMP/.env"
cat > "$ENV_FALSO" <<'ENV'
SERVICE_ROLE_KEY=jwt-de-prueba
API_EXTERNAL_URL=https://api.ejemplo.test
KONG_HTTP_PORT=8000
ENV

echo "==> Probando scripts/crear-admin.sh"
fallidas=0

# Ejecuta main() con los efectos externos sustituidos.
#
#   CA_UID       uuid que devuelve la búsqueda en auth.users ('' = no existe)
#   CA_ES_ADMIN  't' o 'f' para el perfil encontrado
#   CA_FILAS     filas que devuelve el update de promoción (def. 1)
#   CA_HTTP      código HTTP del alta (def. 200)
#
# Deja en $TMP/llamadas el registro de qué se invocó y en $TMP/cuerpo.json el
# cuerpo que recibió la API.
correr() {
  : > "$TMP/llamadas"
  : > "$TMP/cuerpo.json"
  bash -c '
    source "'"$OBJETIVO"'"
    ENV_FILE="'"$ENV_FALSO"'"
    TMP="'"$TMP"'"

    gotrue_admin_api() {
      echo "gotrue $1 $2" >> "$TMP/llamadas"
      cat > "$TMP/cuerpo.json"
      printf "%s\n%s" "{\"id\":\"11111111-2222-3333-4444-555555555555\"}" "${CA_HTTP:-200}"
    }

    db_psql() {
      local consulta="$*"
      case "$consulta" in
        *"from auth.users"*)
          echo "db:buscar" >> "$TMP/llamadas"; printf "%s" "${CA_UID:-}" ;;
        *"coalesce(es_admin"*)
          echo "db:es_admin" >> "$TMP/llamadas"; printf "%s" "${CA_ES_ADMIN:-f}" ;;
        *"update public.perfiles"*)
          echo "db:promover" >> "$TMP/llamadas"
          # psql -At imprime SU ETIQUETA DE COMANDO además de las filas: un
          # `update ... returning 1` suelto devuelve "1\nUPDATE 1", no "1".
          # El doble lo reproduce porque el script real se tragó ese defecto
          # en el servidor: la promoción funcionaba, la comprobación fallaba y
          # la contraseña recién generada se perdía. Envolver el update en un
          # CTE deja la salida limpia; si alguien lo desenvuelve, esto falla.
          case "$consulta" in
            *"with promovido as"*) printf "%s" "${CA_FILAS:-1}" ;;
            *) printf "%s\nUPDATE %s" "${CA_FILAS:-1}" "${CA_FILAS:-1}" ;;
          esac ;;
        *)
          echo "db:desconocida" >> "$TMP/llamadas" ;;
      esac
    }

    main "$@"
  ' _ "$@"
}

ok()    { echo "  ✅ $1"; }
falla() { echo "  ❌ $1" >&2; fallidas=$((fallidas + 1)); }

# --- Caso: correo inválido -------------------------------------------------
salida="$(correr --email 'sin-arroba' 2>&1 < /dev/null)"; codigo=$?
if [[ $codigo -ne 0 ]] && [[ "$salida" == *"no es válido"* ]] && [[ ! -s "$TMP/llamadas" ]]; then
  ok "correo inválido: falla y no toca nada"
else
  falla "correo inválido: código=$codigo salida='$salida' llamadas='$(cat "$TMP/llamadas")'"
fi

# --- Caso: contraseña explícita demasiado corta ----------------------------
salida="$(printf 'corta\n' | CA_UID='' correr --email 'ana@ejemplo.test' \
  --nombres Ana --apellido-paterno Ruiz --password 2>&1)"; codigo=$?
if [[ $codigo -ne 0 ]] && [[ "$salida" == *"al menos 8 caracteres"* ]]; then
  ok "contraseña corta: falla mencionando el mínimo"
else
  falla "contraseña corta: código=$codigo salida='$salida'"
fi

# --- Caso: sin TTY y sin --email -------------------------------------------
# El fallo importante no es el código de salida sino que NO se quede esperando.
salida="$(correr 2>&1 < /dev/null)"; codigo=$?
if [[ $codigo -ne 0 ]] && [[ "$salida" == *"--email"* ]] && [[ "$salida" == *"terminal interactiva"* ]]; then
  ok "sin terminal y sin --email: falla nombrando el argumento"
else
  falla "sin terminal y sin --email: código=$codigo salida='$salida'"
fi

# --- Caso: la contraseña generada ------------------------------------------
generada="$(bash -c 'source "'"$OBJETIVO"'"; generar_password')"
if [[ ${#generada} -eq 24 ]] && [[ "$generada" =~ ^[A-Za-z0-9]{24}$ ]]; then
  ok "la contraseña generada tiene 24 caracteres del alfabeto esperado"
else
  falla "contraseña generada inesperada: '${generada}' (${#generada} caracteres)"
fi

# --- Caso: alta de un usuario nuevo, con acentos y apellido compuesto ------
salida="$(CA_UID='' correr --email 'maria@ejemplo.test' \
  --nombres 'María José' --apellido-paterno 'de la Peña' \
  --apellido-materno 'Ñúñez' 2>&1 < /dev/null)"; codigo=$?

cuerpo="$(cat "$TMP/cuerpo.json")"
leido() { CA_JSON="$cuerpo" python3 -c "
import json, os
d = json.loads(os.environ['CA_JSON'])
ruta = '$1'.split('.')
for p in ruta:
    d = d[p]
print(d)
" 2>/dev/null; }

if [[ $codigo -eq 0 ]] \
  && [[ "$(leido user_metadata.nombres)" == 'María José' ]] \
  && [[ "$(leido user_metadata.apellido_paterno)" == 'de la Peña' ]] \
  && [[ "$(leido user_metadata.apellido_materno)" == 'Ñúñez' ]] \
  && [[ "$(leido email_confirm)" == 'True' ]]; then
  ok "el cuerpo JSON conserva acentos y apellidos compuestos"
else
  falla "cuerpo JSON incorrecto: '$cuerpo' (código=$codigo, salida='$salida')"
fi

if [[ "$salida" == *"UNA sola vez"* ]] && [[ "$salida" == *"Contraseña:"* ]]; then
  ok "el alta imprime la contraseña con el aviso de una sola vez"
else
  falla "el alta no imprimió el aviso: '$salida'"
fi

# --- Caso: la contraseña llega por stdin, no por la línea de comandos ------
enviada="$(leido password)"
if [[ -n "$enviada" ]] && [[ "$enviada" =~ ^[A-Za-z0-9]{24}$ ]]; then
  ok "la contraseña viaja en el cuerpo, entregado por stdin"
else
  falla "la contraseña no llegó en el cuerpo: '$enviada'"
fi

# curl recibe url, cabeceras y cuerpo por stdin (-K -). En 'ps' no debe quedar
# ni la contraseña ni la llave de servicio mientras dura la llamada.
if grep -q -- 'curl -sS -K -' "$OBJETIVO" \
  && ! grep -qE '(-d|--data(-raw|-binary)?|--url) +"?\$' "$OBJETIVO" \
  && ! grep -qE '\-H +.[^"]*\$(SERVICE_ROLE_KEY|PASSWORD)' "$OBJETIVO"; then
  ok "curl recibe cuerpo y llave por stdin, nunca como argumento"
else
  falla "hay un valor sensible pasado como argumento a curl (visible en 'ps')"
fi

# El archivo de configuración que lee curl tiene su propio escapado: si se
# rompe, la contraseña llega alterada y la cuenta nace inservible.
config="$(
  source "$OBJETIVO"
  SERVICE_ROLE_KEY="llave"
  config_curl POST "http://ejemplo.test/x" '{"p":"a\"b"}'
)"
esperado='data = "{\"p\":\"a\\\"b\"}"'
if [[ "$config" == *"$esperado"* ]] && [[ "$config" == *'header = "apikey: llave"'* ]]; then
  ok "el config de curl escapa comillas y barras invertidas del cuerpo"
else
  falla "escapado incorrecto en el config de curl: '$config'"
fi

# --- Caso: usuario existente → se promueve, no se da de alta ---------------
salida="$(CA_UID='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' CA_ES_ADMIN='f' \
  correr --email 'ya@ejemplo.test' 2>&1 < /dev/null)"; codigo=$?
llamadas="$(cat "$TMP/llamadas")"
if [[ $codigo -eq 0 ]] && [[ "$llamadas" == *"db:promover"* ]] \
  && [[ "$llamadas" != *"gotrue"* ]] && [[ "$salida" == *"ya tenía cuenta"* ]] \
  && [[ "$salida" != *"Contraseña:"* ]]; then
  ok "usuario existente: se promueve sin alta ni contraseña nueva"
else
  falla "usuario existente: código=$codigo llamadas='$llamadas' salida='$salida'"
fi

# --- Caso: ya era administrador → idempotente, sin escrituras --------------
salida="$(CA_UID='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' CA_ES_ADMIN='t' \
  correr --email 'ya@ejemplo.test' 2>&1 < /dev/null)"; codigo=$?
llamadas="$(cat "$TMP/llamadas")"
if [[ $codigo -eq 0 ]] && [[ "$llamadas" != *"db:promover"* ]] \
  && [[ "$llamadas" != *"gotrue"* ]] && [[ "$salida" == *"ya era administrador"* ]]; then
  ok "ya era administrador: sale 0 sin ninguna escritura"
else
  falla "ya era administrador: código=$codigo llamadas='$llamadas' salida='$salida'"
fi

[[ $fallidas -eq 0 ]] || { echo "==> FALLÓ ($fallidas)"; exit 1; }
echo "==> OK"
