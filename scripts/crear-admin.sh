#!/usr/bin/env bash
# scripts/crear-admin.sh — crea (o promueve) al primer administrador de una
# instalación de Cursos AMX.
#
# Por qué existe: el rol vive en public.perfiles.es_admin, que nace en false, y
# el trigger perfiles_guard_roles (migraciones 057 y 069) impide que nadie se
# auto-promueva. Sin este script, una instalación recién desplegada no tiene a
# nadie que pueda entrar al panel, y la única salida es escribir el UPDATE a
# mano dentro del contenedor db.
#
# El usuario se da de alta por la API admin de GoTrue, NO con un insert en
# auth.users: GoTrue exige además una fila en auth.identities para permitir el
# inicio de sesión con contraseña, y un insert directo produce una cuenta que
# existe pero no puede entrar (el fallo aparece mucho después, en el login).
#
# La promoción va por psql y no por PostgREST porque el trigger guardián solo
# permite tocar es_admin cuando auth.uid() es nulo — que es justo el caso de
# psql, de forma determinista.
#
# La contraseña generada se muestra UNA vez y no se escribe en ningún archivo:
# ni en docker/.env, ni en los logs. Tampoco viaja por la línea de comandos,
# donde sería visible en `ps` para cualquier usuario del servidor.
#
# Uso:
#   scripts/crear-admin.sh                     # pregunta lo que falte
#   scripts/crear-admin.sh --email a@b.mx --nombres Ana --apellido-paterno Ruiz
#   scripts/crear-admin.sh --email a@b.mx --password         # la pide sin eco
#   scripts/crear-admin.sh --email a@b.mx --nombres Ana \
#     --apellido-paterno Ruiz --imprimir-password            # solo la imprime
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
ENV_FILE="$ROOT/docker/.env"

MIN_PASSWORD=8
LONGITUD_GENERADA=24

EMAIL=""
NOMBRES=""
APELLIDO_PATERNO=""
APELLIDO_MATERNO=""
PASSWORD=""
PEDIR_PASSWORD=0
IMPRIMIR_PASSWORD=0

# ---------------------------------------------------------------------------
# Efectos externos, aislados en dos funciones para poder sustituirlas en las
# pruebas (scripts/test-crear-admin.sh). Todo lo que sale de este proceso pasa
# por aquí.
# ---------------------------------------------------------------------------

# gotrue_admin_api <método> <ruta>   — el cuerpo JSON entra por stdin.
# Imprime el cuerpo de la respuesta, un salto de línea y el código HTTP.
# Arma el archivo de configuración que curl lee por stdin (-K -). Todo lo
# sensible —la llave de servicio y el cuerpo con la contraseña— viaja por aquí
# y no por la línea de comandos, que cualquier usuario del servidor puede leer
# con `ps` mientras dura la llamada.
config_curl() {
  CA_METODO="$1" CA_URL="$2" CA_CUERPO="$3" CA_KEY="$SERVICE_ROLE_KEY" \
  python3 -c '
import os


def cita(valor):
    # Formato de configuración de curl: dentro de comillas dobles solo hay que
    # escapar la barra invertida y la propia comilla.
    return "\"" + valor.replace("\\", "\\\\").replace("\"", "\\\"") + "\""


print("url =", cita(os.environ["CA_URL"]))
print("request =", cita(os.environ["CA_METODO"]))
print("header =", cita("apikey: " + os.environ["CA_KEY"]))
print("header =", cita("Authorization: Bearer " + os.environ["CA_KEY"]))
print("header =", cita("Content-Type: application/json"))
print("data =", cita(os.environ["CA_CUERPO"]))
'
}

gotrue_admin_api() {
  local metodo="$1" ruta="$2" cuerpo salida base
  cuerpo="$(cat)"

  for base in "${API_BASES[@]}"; do
    # -K - : url, cabeceras y cuerpo entran por stdin. En la línea de comandos
    # solo quedan banderas sin valor sensible.
    if salida="$(config_curl "$metodo" "$base$ruta" "$cuerpo" \
      | curl -sS -K - -w $'\n%{http_code}' 2>/dev/null)"; then
      printf '%s' "$salida"
      return 0
    fi
  done

  {
    echo "No se pudo contactar la API de autenticación. URLs probadas:"
    for base in "${API_BASES[@]}"; do echo "  - $base$ruta"; done
    echo "Revisa que el stack esté arriba (docker compose ps) y que"
    echo "API_EXTERNAL_URL en docker/.env sea alcanzable desde este servidor."
  } >&2
  return 1
}

# db_psql — psql sobre el contenedor db, igual que scripts/deploy.sh.
db_psql() {
  docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"
}

# ---------------------------------------------------------------------------
# Argumentos
# ---------------------------------------------------------------------------

parsear_argumentos() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --email)             EMAIL="$2"; shift 2 ;;
      --nombres)           NOMBRES="$2"; shift 2 ;;
      --apellido-paterno)  APELLIDO_PATERNO="$2"; shift 2 ;;
      --apellido-materno)  APELLIDO_MATERNO="$2"; shift 2 ;;
      # Sin valor en línea: la contraseña se lee sin eco para que no quede en
      # `ps` ni en el historial del shell.
      --password)          PEDIR_PASSWORD=1; shift ;;
      --imprimir-password) IMPRIMIR_PASSWORD=1; shift ;;
      -h|--help)           sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
      *) echo "opción desconocida: $1 (ver --help)" >&2; exit 1 ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Entorno
# ---------------------------------------------------------------------------

# Lee UNA variable del .env, en un subshell. A propósito no se hace
# `set -a; source docker/.env`: eso volcaría el archivo entero sobre el entorno
# de este script, y un .env que definiera EMAIL o PASSWORD pisaría en silencio
# lo que acaba de teclear el operador.
leer_var_env() {
  (
    set +u
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE" >/dev/null 2>&1 || true
    set +a
    printf '%s' "${!1:-}"
  )
}

cargar_entorno() {
  for binario in curl docker python3; do
    if ! command -v "$binario" >/dev/null 2>&1; then
      echo "Falta '$binario', que este script necesita para funcionar." >&2
      exit 1
    fi
  done

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "No existe $ENV_FILE. Este script se corre en el servidor, sobre una" >&2
    echo "instalación ya desplegada (ver scripts/deploy.sh)." >&2
    exit 1
  fi

  SERVICE_ROLE_KEY="$(leer_var_env SERVICE_ROLE_KEY)"
  API_EXTERNAL_URL="$(leer_var_env API_EXTERNAL_URL)"
  KONG_HTTP_PORT="$(leer_var_env KONG_HTTP_PORT)"

  # Se valida ANTES de pedirle nada al operador: no tiene sentido hacerle
  # teclear un formulario completo para morir en la última llamada.
  if [[ -z "${SERVICE_ROLE_KEY:-}" || "$SERVICE_ROLE_KEY" == *"<"* ]]; then
    echo "SERVICE_ROLE_KEY no está definida (o sigue con el valor de ejemplo)" >&2
    echo "en $ENV_FILE. Sin ella no se puede dar de alta al administrador." >&2
    exit 1
  fi
  if [[ -z "${API_EXTERNAL_URL:-}" ]]; then
    echo "API_EXTERNAL_URL no está definida en $ENV_FILE." >&2
    exit 1
  fi

  # Primero la ruta interna —Kong publicado en el host—, que no depende de DNS
  # ni de certificados, y que funciona aunque el dominio público todavía no
  # resuelva desde el propio servidor. Solo si esa falla se usa la pública.
  API_BASES=()
  if [[ -n "${KONG_HTTP_PORT:-}" ]]; then
    API_BASES+=("http://127.0.0.1:${KONG_HTTP_PORT}")
  fi
  API_BASES+=("${API_EXTERNAL_URL%/}")
}

# ---------------------------------------------------------------------------
# Entrada del operador
# ---------------------------------------------------------------------------

hay_tty() { [[ -t 0 ]]; }

# Pide un dato por pantalla. Sin terminal interactiva NO pregunta: falla
# nombrando el argumento que falta, para no quedarse esperando una respuesta
# que nadie va a teclear (cron, CI, tuberías).
pedir_dato() {
  local variable="$1" etiqueta="$2" argumento="$3" valor
  valor="${!variable}"
  [[ -n "$valor" ]] && return 0

  if ! hay_tty; then
    echo "Falta $argumento y no hay terminal interactiva para preguntarlo." >&2
    echo "Vuelve a correrlo con: $argumento <valor>" >&2
    exit 1
  fi

  while [[ -z "$valor" ]]; do
    printf '%s: ' "$etiqueta" >&2
    read -r valor || { echo >&2; exit 1; }
  done
  printf -v "$variable" '%s' "$valor"
}

pedir_datos() {
  pedir_dato EMAIL            'Correo del administrador' --email
  validar_email

  # Los datos personales solo hacen falta al dar de alta a alguien nuevo; a un
  # usuario existente no se le tocan. Por eso se piden después de saber cuál de
  # los dos casos es (ver main).
}

pedir_datos_personales() {
  pedir_dato NOMBRES          'Nombres'                  --nombres
  pedir_dato APELLIDO_PATERNO 'Apellido paterno'         --apellido-paterno

  if [[ -z "$APELLIDO_MATERNO" ]] && hay_tty; then
    printf 'Apellido materno (opcional): ' >&2
    read -r APELLIDO_MATERNO || true
  fi
}

# El correo es el único dato del operador que acaba dentro de una consulta SQL.
# Esta validación es también lo que hace segura esa interpolación: el patrón no
# admite comillas ni espacios. Los nombres nunca tocan SQL — van solo al JSON,
# donde python los escapa.
validar_email() {
  if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo "El correo '$EMAIL' no es válido." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Contraseña
# ---------------------------------------------------------------------------

generar_password() {
  # head cierra la tubería en cuanto junta los caracteres pedidos, así que tr
  # muere con SIGPIPE (141). Con pipefail activo eso haría fallar el script
  # entero justo aquí, en el único camino donde sí hay que generar la clave:
  # de ahí el subshell con pipefail desactivado.
  (
    set +o pipefail
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$LONGITUD_GENERADA"
  )
}

leer_password() {
  local intento
  if hay_tty; then
    printf 'Contraseña (no se muestra): ' >&2
    read -rs intento || { echo >&2; exit 1; }
    echo >&2
  else
    read -rs intento || true
  fi

  if [[ ${#intento} -lt $MIN_PASSWORD ]]; then
    echo "La contraseña debe tener al menos $MIN_PASSWORD caracteres." >&2
    exit 1
  fi
  PASSWORD="$intento"
}

resolver_password() {
  if [[ "$PEDIR_PASSWORD" -eq 1 ]]; then
    leer_password
    PASSWORD_GENERADA=0
  else
    PASSWORD="$(generar_password)"
    PASSWORD_GENERADA=1
  fi
}

# ---------------------------------------------------------------------------
# Cuerpo de la petición
# ---------------------------------------------------------------------------

# Se arma con python para que acentos, apóstrofos y apellidos compuestos queden
# correctamente escapados. Los valores viajan por el entorno, no por argumentos:
# el entorno de un proceso solo lo lee su dueño, la línea de comandos la lee
# cualquiera.
cuerpo_alta() {
  CA_EMAIL="$EMAIL" \
  CA_PASSWORD="$PASSWORD" \
  CA_NOMBRES="$NOMBRES" \
  CA_APELLIDO_PATERNO="$APELLIDO_PATERNO" \
  CA_APELLIDO_MATERNO="$APELLIDO_MATERNO" \
  python3 -c '
import json, os

metadata = {
    "nombres": os.environ["CA_NOMBRES"],
    "apellido_paterno": os.environ["CA_APELLIDO_PATERNO"],
}
materno = os.environ.get("CA_APELLIDO_MATERNO", "")
if materno:
    metadata["apellido_materno"] = materno

print(json.dumps({
    "email": os.environ["CA_EMAIL"],
    "password": os.environ["CA_PASSWORD"],
    # Sin esto el alta depende del correo saliente, que en una instalación
    # recién levantada casi nunca está configurado.
    "email_confirm": True,
    # aviso_privacidad se deja en su default (false) a propósito: el
    # consentimiento lo otorga la persona en la interfaz, no el instalador
    # en su nombre.
    "user_metadata": metadata,
}))
'
}

# ---------------------------------------------------------------------------
# Operaciones sobre la instalación
# ---------------------------------------------------------------------------

# Devuelve el uuid del usuario con ese correo, o cadena vacía. La comparación
# es insensible a mayúsculas porque GoTrue normaliza el correo al guardarlo.
buscar_usuario() {
  db_psql -c "select id from auth.users where lower(email) = lower('$EMAIL') limit 1;" \
    | tr -d '[:space:]'
}

es_ya_admin() {
  local uid="$1" valor
  valor="$(db_psql -c "select coalesce(es_admin, false) from public.perfiles where id = '$uid';" \
    | tr -d '[:space:]')"
  [[ "$valor" == "t" ]]
}

# Da de alta al usuario y devuelve su uuid.
alta_usuario() {
  local respuesta cuerpo codigo uid

  respuesta="$(cuerpo_alta | gotrue_admin_api POST /auth/v1/admin/users)" || exit 1
  codigo="${respuesta##*$'\n'}"
  cuerpo="${respuesta%$'\n'*}"

  if [[ "$codigo" != "200" && "$codigo" != "201" ]]; then
    {
      echo "La API de autenticación rechazó el alta (HTTP $codigo)."
      # El cuerpo del error puede traer la contraseña de vuelta en algunos
      # errores de validación, así que se extrae solo el mensaje.
      CA_CUERPO="$cuerpo" python3 -c '
import json, os
try:
    d = json.loads(os.environ["CA_CUERPO"])
    print("  " + str(d.get("msg") or d.get("error_description") or d.get("error") or d))
except Exception:
    print("  (respuesta no interpretable)")
'
    } >&2
    exit 1
  fi

  uid="$(CA_CUERPO="$cuerpo" python3 -c '
import json, os
print(json.loads(os.environ["CA_CUERPO"]).get("id", ""))
')"

  if [[ -z "$uid" ]]; then
    echo "El alta respondió $codigo pero sin identificador de usuario." >&2
    exit 1
  fi
  printf '%s' "$uid"
}

# El trigger perfiles_guard_roles permite este UPDATE porque por psql
# auth.uid() es nulo. No se toca la contraseña ni los datos personales.
promover() {
  local uid="$1" filas
  # El UPDATE va envuelto en un CTE para que la salida sea UNA sola cifra.
  # Con `update ... returning 1`, psql -At imprime también su etiqueta de
  # comando y devuelve "1\nUPDATE 1": la comprobación de abajo fallaba aunque
  # la promoción hubiera funcionado, y el script moría sin llegar a mostrar la
  # contraseña recién generada, que se perdía para siempre.
  filas="$(db_psql -c "with promovido as (
      update public.perfiles set es_admin = true, actualizado_en = now()
       where id = '$uid' returning 1
    ) select count(*) from promovido;" | tr -d '[:space:]')"

  if [[ "$filas" != "1" ]]; then
    {
      echo "No se pudo promover a administrador: existe la cuenta de acceso de"
      echo "$EMAIL pero no su fila en public.perfiles, que debería haber creado"
      echo "el trigger on_auth_user_created (migración 022)."
      echo
      echo "Volver a ejecutar este comando es seguro y no duplica nada, pero si"
      echo "el error persiste el problema está en ese trigger: compruébalo con"
      echo "  scripts/migrate.sh --dry-run"
    } >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------

informar_alta() {
  if [[ "$IMPRIMIR_PASSWORD" -eq 1 ]]; then
    # Modo capturable por automatizaciones: solo la contraseña, sin adornos.
    printf '%s\n' "$PASSWORD"
    echo "✔ $EMAIL creado como administrador." >&2
    return
  fi

  echo
  echo "✔ Usuario creado y promovido a administrador."
  echo
  echo "  Correo:      $EMAIL"
  if [[ "$PASSWORD_GENERADA" -eq 1 ]]; then
    echo "  Contraseña:  $PASSWORD"
    echo
    echo "  ⚠ Se muestra UNA sola vez y no queda guardada en ningún lado."
    echo "    Anótala ahora."
  else
    echo "  Contraseña:  la que acabas de teclear."
  fi
  echo
}

informar_promocion() {
  echo
  echo "✔ $EMAIL ya tenía cuenta: se promovió a administrador."
  echo "  Su contraseña no cambió; entra con la que ya conocía."
  echo
}

informar_sin_cambios() {
  echo "✔ $EMAIL ya era administrador. Nada que hacer."
}

# ---------------------------------------------------------------------------

main() {
  parsear_argumentos "$@"
  cargar_entorno
  pedir_datos

  local uid
  uid="$(buscar_usuario)"

  if [[ -n "$uid" ]]; then
    # Usuario existente: ni se duplica, ni se le cambia la contraseña, ni se
    # tocan sus datos personales. Volver a correr el comando es seguro.
    if es_ya_admin "$uid"; then
      informar_sin_cambios
      exit 0
    fi
    promover "$uid"
    informar_promocion
    exit 0
  fi

  pedir_datos_personales
  resolver_password
  uid="$(alta_usuario)"
  promover "$uid"
  informar_alta
}

# Solo corre si se ejecuta; si se hace `source` (las pruebas), únicamente
# define las funciones para poder sustituir gotrue_admin_api y db_psql.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
