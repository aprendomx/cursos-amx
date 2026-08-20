#!/usr/bin/env bash
# scripts/deploy.sh — despliegue del stack self-hosted en UN paso:
#   0) pre-vuelo          (árbol limpio, pull sin conflictos)
#   1) git pull           (trae código + migraciones + funciones bind-mounted)
#   2) RESPALDO           (pg_dump antes de tocar el esquema — no es opcional)
#   3) migraciones        (dry-run informativo + scripts/migrate.sh)
#   4) restart functions  (recarga el Edge Runtime con las funciones nuevas)
#   5) verificación       (contenedor Up, funciones exigen 401, esquema sano,
#                          escalada de privilegios bloqueada)
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
#
# URL de verificación: se toma API_EXTERNAL_URL de docker/.env. Es la URL de la
# API (https://api.tu-dominio.org), NO la del frontend: todas las
# comprobaciones van contra $URL/functions/v1/… y contra la URL equivocada
# responden 404. Para anularla:
#   PUBLIC_URL=https://api.tu-dominio.org scripts/deploy.sh
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
# La URL contra la que se verifica es la de la API, no la del frontend: todas
# las comprobaciones van contra $URL_API/functions/v1/…. Se resuelve en
# resolver_url_api(), ya con los argumentos parseados.
URL_API=""
ORIGEN_URL=""

parsear_argumentos() {
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
    -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opción desconocida: $1 (ver --help)" >&2; exit 1 ;;
  esac
done
}


compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

run() {
  echo "    \$ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then "$@"; fi
}


# Lee UNA variable de docker/.env en un subshell. No se hace `set -a; source`
# porque eso volcaría el archivo entero sobre el entorno del script y sus
# propias variables (BRANCH, BACKUP_DIR…) podrían quedar pisadas en silencio.
leer_var_env() {
  local archivo="$ROOT/docker/.env"
  [[ -f "$archivo" ]] || return 0
  (
    set +u
    set -a
    # shellcheck disable=SC1090
    source "$archivo" >/dev/null 2>&1 || true
    set +a
    printf '%s' "${!1:-}"
  )
}

# PUBLIC_URL dejó de ser obligatoria: por defecto se toma API_EXTERNAL_URL de
# docker/.env, que es la URL correcta y ya está declarada ahí. Antes había que
# pasarla a mano y el ejemplo de la cabecera apuntaba al frontend; con esa URL
# todas las funciones responden 404 y la verificación las daba por buenas.
resolver_url_api() {
  if [[ -n "${PUBLIC_URL:-}" ]]; then
    URL_API="${PUBLIC_URL%/}"
    ORIGEN_URL="la variable PUBLIC_URL"
  else
    URL_API="$(leer_var_env API_EXTERNAL_URL)"
    URL_API="${URL_API%/}"
    ORIGEN_URL="API_EXTERNAL_URL de docker/.env"
  fi

  if [[ -z "$URL_API" ]]; then
    echo "✘ No se pudo determinar la URL de la API." >&2
    echo "  Define API_EXTERNAL_URL en $ROOT/docker/.env, o pasa" >&2
    echo "  PUBLIC_URL=https://api.tu-dominio.org scripts/deploy.sh" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Clasificación de resultados
# ---------------------------------------------------------------------------
# La verificación fallaba EN ABIERTO: cuando una comprobación no se podía
# ejecutar, se reportaba como superada. Tres casos reales, encontrados en la
# instalación de aprendo.mx:
#
#   * el grupo de funciones hacía `if 200 -> ✘ else -> ✔`, así que 404 (función
#     ausente), 500 (el runtime no la encuentra) y 000 (sin conexión) pasaban
#     como «exige autenticación»;
#   * la comprobación de RLS imprimía «todas las tablas tienen RLS» cuando el
#     psql fallaba;
#   * la de escalada de privilegios llevaba un uuid inválido, nunca corrió, y
#     su fallo era un aviso que nadie contaba.
#
# La regla es una y vive aquí: lo que no se pudo comprobar NO está bien. Estas
# dos funciones son puras —no imprimen, no tocan nada— para poder probarlas sin
# levantar el stack (scripts/test-deploy-verificacion.sh).

# clasificar_http <esperados-separados-por-coma> <codigo>
# Imprime "<veredicto>|<mensaje>" con veredicto ok | problema | no_ejecutable.
clasificar_http() {
  local esperados="$1" codigo="$2"

  # 000 y la cadena vacía no son códigos de estado: son la AUSENCIA de
  # respuesta. Merecen su propio mensaje, porque se reparan en otro sitio que
  # un 404.
  if [[ -z "$codigo" || "$codigo" == "000" ]]; then
    echo "no_ejecutable|no hubo respuesta (¿contenedor caído o URL inalcanzable?)"
    return 0
  fi

  if [[ ",$esperados," == *",$codigo,"* ]]; then
    echo "ok|responde $codigo"
    return 0
  fi

  case "$codigo" in
    200|201|204) echo "problema|responde $codigo SIN exigir autenticación" ;;
    404)         echo "problema|responde 404: la función no está desplegada" ;;
    5*)          echo "problema|responde $codigo: la función no está respondiendo" ;;
    *)           echo "problema|responde $codigo, que no es lo esperado ($esperados)" ;;
  esac
}

# clasificar_sql <estado-de-salida> <salida>
# Imprime "<veredicto>|<valor-o-mensaje>". El valor solo se devuelve cuando la
# consulta se ejecutó: quien llama decide qué significa.
clasificar_sql() {
  local estado="$1" salida="$2"
  salida="${salida#"${salida%%[![:space:]]*}"}"
  salida="${salida%"${salida##*[![:space:]]}"}"

  if [[ "$estado" != "0" ]]; then
    echo "no_ejecutable|psql terminó con código $estado"
    return 0
  fi
  if [[ -z "$salida" || "$salida" == "?" ]]; then
    echo "no_ejecutable|la consulta no devolvió resultado"
    return 0
  fi
  echo "ok|$salida"
}

# Consume un veredicto y decide qué imprimir y si suma a $problemas. Es el
# ÚNICO sitio donde se incrementa el contador: mientras cada comprobación
# decidiera por su cuenta qué es un éxito, la siguiente que se añadiera podría
# volver a fallar en abierto.
registrar() {
  local etiqueta="$1" veredicto="${2%%|*}" detalle="${2#*|}"
  case "$veredicto" in
    ok)            echo "    ✔ $etiqueta: $detalle" ;;
    problema)      echo "    ✘ $etiqueta: $detalle" >&2; problemas=$((problemas + 1)) ;;
    no_ejecutable) echo "    ✘ $etiqueta: NO SE PUDO COMPROBAR — $detalle" >&2
                   problemas=$((problemas + 1)) ;;
  esac
}

main() {
  parsear_argumentos "$@"
  resolver_url_api

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
echo "    URL de la API: $URL_API  (origen: $ORIGEN_URL)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "    [dry-run] compose ps functions; sondeo de $URL_API; curl a las"
  echo "              funciones; chequeos de esquema y de escalada"
else
  compose ps functions || true

  # --- 1. ¿La URL enruta a la API? ---
  # Sin esto, una URL equivocada produce una tanda de ✔ falsos: contra el
  # frontend TODAS las funciones responden 404. Se sondea antes que nada y, si
  # no responde como API, se omite el grupo entero en lugar de mentir.
  sonda="$(curl -s -o /dev/null -w '%{http_code}' "$URL_API/auth/v1/health" || echo 000)"
  api_viva=0
  case "$sonda" in
    401|403|200)
      echo "    ✔ La URL enruta a la API (auth responde $sonda)"
      api_viva=1 ;;
    *)
      echo "    ✘ $URL_API no responde como API (auth devolvió $sonda)." >&2
      echo "      Origen de la URL: $ORIGEN_URL. Debe ser la URL de la API," >&2
      echo "      no la del frontend. Se omiten las comprobaciones de funciones:" >&2
      echo "      contra la URL equivocada todas darían un resultado engañoso." >&2
      problemas=$((problemas + 1)) ;;
  esac

  # --- 2. Las funciones exigen autenticación ---
  # Solo 401/403 cuentan como superado. Un 404 o un 5xx significan que la
  # función no está respondiendo, no que esté protegida.
  if [[ "$api_viva" -eq 1 ]]; then
    for fn in admin-set-password ai-proxy transcribir-sesion notifications-worker zoom-meeting; do
      c="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
        -H 'content-type: application/json' -d '{}' \
        "$URL_API/functions/v1/$fn" || echo 000)"
      registrar "$fn" "$(clasificar_http '401,403' "$c")"
    done
  fi

  # --- 3. Migraciones registradas ---
  if aplicadas="$(compose exec -T db psql -U postgres -d postgres -At \
    -c "select count(*) from public._migraciones;" 2>/dev/null)"
  then estado_sql=0; else estado_sql=$?; fi
  en_disco="$(ls -1 "$ROOT"/supabase/migrations/0*.sql | wc -l | tr -d ' ')"
  veredicto="$(clasificar_sql "$estado_sql" "$aplicadas")"
  if [[ "${veredicto%%|*}" != "ok" ]]; then
    registrar "migraciones" "$veredicto"
  elif [[ "${veredicto#*|}" != "$en_disco" ]]; then
    registrar "migraciones" "problema|${veredicto#*|} registradas / $en_disco en disco: no coinciden (scripts/migrate.sh --dry-run)"
  else
    registrar "migraciones" "ok|$en_disco registradas / $en_disco en disco"
  fi

  # --- 4. RLS en todas las tablas de public ---
  # Se pregunta por el NÚMERO de tablas desprotegidas y no por su lista: así
  # «ninguna» es un 0 legítimo y se distingue de una consulta que no corrió,
  # que antes se colaba como ✔.
  if sin_rls="$(compose exec -T db psql -U postgres -d postgres -At -c \
    "select count(*) || ':' || coalesce(string_agg(c.relname, ', '), '') from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not c.relrowsecurity;" 2>/dev/null)"
  then estado_sql=0; else estado_sql=$?; fi
  veredicto="$(clasificar_sql "$estado_sql" "$sin_rls")"
  if [[ "${veredicto%%|*}" != "ok" ]]; then
    registrar "RLS" "$veredicto"
  else
    valor="${veredicto#*|}"
    if [[ "${valor%%:*}" == "0" ]]; then
      registrar "RLS" "ok|todas las tablas de public lo tienen habilitado"
    else
      registrar "RLS" "problema|tablas SIN RLS (públicas con la anon key): ${valor#*:}"
    fi
  fi

  # --- 5. La escalada de privilegios sigue bloqueada ---
  # Se comprueba FUNCIONALMENTE, no con has_column_privilege: ese devuelve true
  # aunque el sistema esté protegido, porque Supabase concede UPDATE a nivel de
  # tabla y un revoke de columna no lo anula. Lo que bloquea de verdad es el
  # trigger perfiles_guard_roles (migraciones 057 y 069), así que se prueba
  # intentando la escalada dentro de una transacción que luego se revierte.
  #
  # El uuid de abajo llevaba '4beef' —cinco dígitos— y Postgres rechazaba el
  # literal entero: esta comprobación NUNCA llegó a ejecutarse, y su fallo era
  # un aviso que no contaba. Ahora el error de psql se captura y se reporta.
  #
  # La primera línea del resultado comprueba que auth.uid() resuelve al usuario
  # simulado. Sin eso, el update no afectaría a ninguna fila y la comprobación
  # pasaría sin haber probado nada — el mismo falso verde que la migración 069
  # denuncia del has_column_privilege.
  if escalada="$(compose exec -T db psql -U postgres -d postgres -At <<'SQL' 2>&1
begin;
insert into auth.users (id, email)
  values ('00000000-dead-4bee-8000-000000000001', 'verificacion@local')
  on conflict (id) do nothing;
insert into public.perfiles (id, nombres, apellido_paterno, correo)
  values ('00000000-dead-4bee-8000-000000000001', 'Verificacion', 'Despliegue', 'verificacion@local')
  on conflict (id) do nothing;
-- La medición de auth.uid() va en su PROPIO bloque, sin manejador de
-- excepciones. Un BEGIN…EXCEPTION abre una subtransacción y, al capturar el
-- error de la escalada —que es el resultado esperado—, revertiría también el
-- set_config de la medición: la comprobación se acusaba a sí misma de tener
-- la sesión inefectiva en una instalación sana.
do $medir$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-dead-4bee-8000-000000000001';
  perform set_config('sesion.uid_efectivo',
    coalesce(auth.uid()::text, 'NULO'), true);
  reset role;
end $medir$;
do $guard$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-dead-4bee-8000-000000000001';
  update public.perfiles set es_admin = true where id = auth.uid();
  reset role;
exception when others then reset role;
end $guard$;
select case when current_setting('sesion.uid_efectivo', true)
              = '00000000-dead-4bee-8000-000000000001'
            then 'SESION_OK' else 'SESION_INEFECTIVA' end
       || '/' ||
       coalesce((select es_admin from public.perfiles
                  where id = '00000000-dead-4bee-8000-000000000001'), false)::text;
rollback;
SQL
)"
  then estado_sql=0; else estado_sql=$?; fi
  # De toda la salida de psql interesa la línea del veredicto.
  # El `|| true` no es decorativo: grep sin coincidencias devuelve 1 y con
  # pipefail mataría el script justo cuando hay que reportar que falló.
  resultado="$(printf '%s\n' "$escalada" | grep -oE 'SESION_(OK|INEFECTIVA)/(t|f|true|false)' | tail -1 || true)"
  if [[ "$estado_sql" != "0" || -z "$resultado" ]]; then
    detalle="$(printf '%s' "$escalada" | grep -iE 'error|fatal' | head -1 || true)"
    registrar "escalada de privilegios" \
      "no_ejecutable|${detalle:-psql no devolvió un veredicto interpretable}"
  else
    case "$resultado" in
      SESION_INEFECTIVA/*)
        registrar "escalada de privilegios" \
          "problema|la sesión simulada no resolvió auth.uid(): la comprobación habría pasado sin probar nada" ;;
      */t|*/true)
        registrar "escalada de privilegios" \
          "problema|ABIERTA: un usuario puede hacerse administrador" ;;
      *)
        registrar "escalada de privilegios" "ok|bloqueada (probada en vivo)" ;;
    esac
  fi

  # La comprobación anterior revierte su transacción; se confirma que no dejó
  # rastro, porque una verificación que ensucia la base no es una verificación.
  if resto="$(compose exec -T db psql -U postgres -d postgres -At \
    -c "select count(*) from auth.users where email = 'verificacion@local';" 2>/dev/null)"
  then estado_sql=0; else estado_sql=$?; fi
  veredicto="$(clasificar_sql "$estado_sql" "$resto")"
  if [[ "${veredicto%%|*}" == "ok" && "${veredicto#*|}" != "0" ]]; then
    registrar "limpieza de la comprobación" \
      "problema|quedaron ${veredicto#*|} filas de prueba en auth.users"
  fi
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
      # Misma regla que el resto de la verificación: lo que no se pudo
      # comprobar no está bien.
      echo "    ✘ No se pudo contar los administradores." >&2
      problemas=$((problemas + 1)) ;;
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

}

# Solo se despliega al ejecutarlo. Con `source` únicamente se definen las
# funciones, que es como las prueba scripts/test-deploy-verificacion.sh.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
