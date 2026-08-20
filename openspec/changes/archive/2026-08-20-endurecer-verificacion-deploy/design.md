## Context

Ver `proposal.md` — Why para los tres fallos concretos y cómo se encontraron.
Lo que condiciona el diseño:

- El bloque `[5/6] Verificación` de `scripts/deploy.sh` ya tiene la pieza
  correcta: un contador `problemas` que decide el código de salida. El problema
  no es que falte el mecanismo, es que varias ramas no lo usan.
- Las comprobaciones son de dos familias con fallos distintos: las **HTTP**
  (curl contra `$PUBLIC_URL/functions/v1/…`) y las **SQL** (`compose exec -T db
psql`). Las HTTP fallan por códigos inesperados o falta de conexión; las SQL
  por error de consulta o por no poder ejecutar `psql`.
- El patrón `$(... 2>/dev/null || echo '?')` aparece en varias comprobaciones y
  es el origen del fallo en abierto: colapsa «no se pudo» en un valor que luego
  se compara como si fuera un resultado.
- `PUBLIC_URL` es obligatoria (`${PUBLIC_URL:?...}`) y su ejemplo apunta al
  frontend, pero todos sus usos van contra `/functions/v1/…`. La URL correcta
  ya está en `docker/.env` como `API_EXTERNAL_URL`.
- Comprobado en vivo el 20 de agosto de 2026 en `aprendo.mx`: con el uuid
  corregido, `auth.uid()` resuelve dentro del bloque y el trigger rechaza con
  `42501`. El diseño de esa comprobación es correcto.
- Convención de pruebas del repo: `scripts/test-*.sh` sin stack, un job por
  script en `.github/workflows/ci.yml`.

## Goals / Non-Goals

**Goals:**

- Que ninguna rama de la verificación pueda declarar superada una comprobación
  que no se ejecutó.
- Que el operador vea qué URL se está comprobando y de dónde salió.
- Que la clasificación de resultados HTTP y SQL sea comprobable en CI sin stack.

**Non-Goals:**

- No se añaden comprobaciones nuevas más allá del sondeo de la URL: el alcance
  es arreglar las que ya existen.
- No se toca el modelo de permisos ni se añaden migraciones.
- No se cambia el paso `[6/6]`, que ya sigue la regla correcta salvo su rama
  `?`, alineada aquí por coherencia.

## Decisions

### 1. Una función de clasificación por familia, en vez de arreglar cada `if`

Dos funciones puras, sin efectos, que reciben el resultado crudo y devuelven un
veredicto (`ok` / `problema` / `no_ejecutable`) más un mensaje:

- `clasificar_http <esperados> <codigo>`
- `clasificar_sql <estado> <salida>`

El bloque de verificación pasa a invocarlas y a sumar `problemas` en un solo
sitio.

Se prefiere esto a corregir las cinco condiciones por separado porque el fallo
no fue un descuido puntual sino la ausencia de una regla común: mientras cada
comprobación decida por su cuenta qué es un éxito, la siguiente que se añada
volverá a poder fallar en abierto. Además son funciones puras, que es lo que
permite probarlas sin stack.

_Alternativa descartada_: arreglar cada rama in situ. Menos código, pero deja el
mismo terreno para que el fallo vuelva.

### 2. `000` y «sin código» se tratan aparte de los códigos HTTP

`curl -w '%{http_code}'` devuelve `000` cuando no hubo respuesta. No es un
código de estado sino la ausencia de uno, y merece un mensaje propio: «no hubo
conexión» lleva a revisar el contenedor o la red, mientras que `404` lleva a
revisar el despliegue de la función. Confundirlos fue parte de lo que hizo
invisible el problema.

### 3. El sondeo de la URL corta las comprobaciones de funciones

Si la URL no enruta a la API, ejecutar las cinco comprobaciones solo produce
ruido engañoso — cinco ✔ falsos, que es literalmente lo que pasó. Se sondea una
ruta de la API y, si no responde como tal, se reporta el problema y se omite el
grupo entero, diciéndolo.

En la instalación de referencia, `/auth/v1/health` y `/rest/v1/` responden `401`
a través de Kong, y una función inexistente responde `500`. El sondeo se apoya
en «responde como API», no en un `200`, que no se obtiene sin credenciales.

### 4. `PUBLIC_URL` pasa a ser anulación, no obligación

Orden de resolución: `PUBLIC_URL` del entorno → `API_EXTERNAL_URL` de
`docker/.env` → error explicando ambos orígenes. La salida dice siempre cuál se
usó y de dónde salió.

Se mantiene el nombre `PUBLIC_URL` para no romper invocaciones existentes; lo
que cambia es que deja de ser obligatoria y que la ayuda dice qué URL es.

_Alternativa descartada_: renombrarla a `API_URL`. Más claro, pero rompe a quien
ya la tenga en un cron o un runbook, sin ganar nada que no dé la documentación.

### 5. El uuid de la comprobación de escalada, y por qué no basta con cambiarlo

Se corrige a un literal válido. Pero cambiar el uuid sin más dejaría la
comprobación igual de frágil ante el siguiente error de SQL, porque su rama de
fallo sigue siendo un aviso no contado. Por eso se corrige junto con la
reclasificación: el error de consulta pasa a ser problema y su mensaje incluye
lo que devolvió Postgres, que es lo que habría delatado el uuid inválido el
primer día.

La comprobación también gana una **aserción de que la sesión simulada es
efectiva**: si `auth.uid()` no resolviera al usuario simulado, el `update` no
afectaría a ninguna fila y la comprobación pasaría sin haber probado nada. Es el
mismo modo de fallo que el `has_column_privilege` que la migración 069 ya
denuncia, y conviene cerrarlo antes de que alguien lo descubra por las malas.

### 6. Pruebas: las funciones puras en CI, el resto a mano

`scripts/test-deploy-verificacion.sh` cubre la tabla de clasificación —`401` y
`403` superan; `200`, `404`, `500`, `000` y una salida vacía son problema— y que
el recuento de problemas se incrementa donde debe, obteniendo las funciones por
`source` de `deploy.sh`.

Esto exige que `deploy.sh` sea _sourceable_: hoy ejecuta al cargarse. Se
envuelve el cuerpo de forma que definir las funciones no dispare el despliegue,
igual que se hizo en `scripts/crear-admin.sh`.

Lo que necesita stack —el sondeo real, la escalada contra Postgres— se verifica
a mano contra la instalación de desarrollo y queda anotado en las tareas.

## Risks / Trade-offs

- **Despliegues que hoy pasan empezarán a fallar** → es el objetivo, pero puede
  sorprender. La salida nombra qué comprobación falló y por qué, y `--dry-run`
  permite verlo sin desplegar.
- **Aparece una escalada abierta real en alguna instalación** → sería un
  hallazgo legítimo. En `aprendo.mx` ya se comprobó a mano que está bloqueada.
- **Hacer `deploy.sh` sourceable puede alterar su ejecución** → es el cambio de
  mayor riesgo del lote, porque toca un script de despliegue en producción. Se
  verifica con un `--dry-run` completo antes y después, comparando la salida.
- **El sondeo añade una petición más al despliegue** → coste despreciable frente
  a descubrir tarde que se estaba verificando la URL equivocada.

## Migration Plan

Sin migración de datos ni de esquema. Se despliega como cualquier cambio de
scripts.

Rollback: revertir `scripts/deploy.sh`. La comprobación de escalada revierte su
propia transacción, así que no deja estado que deshacer.
