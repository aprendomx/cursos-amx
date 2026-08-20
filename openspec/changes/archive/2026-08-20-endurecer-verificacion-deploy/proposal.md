## Why

El paso de verificación de `scripts/deploy.sh` **falla en abierto**: cuando no
consigue comprobar algo, lo reporta como correcto. Se descubrió probando el
despliegue en la instalación de `aprendo.mx` el 20 de agosto de 2026, y no es
un caso hipotético — dos de los fallos estaban activos en producción:

1. **La comprobación de escalada de privilegios nunca ha corrido.** Usa el uuid
   `00000000-dead-4beef-8000-000000000001`, cuyo tercer grupo tiene cinco
   dígitos hexadecimales en lugar de cuatro. Postgres rechaza el literal con
   `invalid input syntax for type uuid`, el bloque entero falla y el script
   imprime `⚠ No se pudo comprobar la escalada de privilegios` sin contarlo
   como problema. `deploy.sh` anuncia esa comprobación como «probada en vivo» y
   es la defensa que las migraciones 057 y 069 describen como la única
   efectiva. Verificado: con un uuid válido la comprobación funciona —
   `auth.uid()` resuelve y el trigger bloquea con `42501`—, así que el diseño
   era correcto y solo el literal estaba mal escrito.

2. **Las cuatro funciones que «exigen autenticación» pasan en verde estando
   caídas.** La condición es `if 200 → ✘ else → ✔`, de modo que `404` (función
   ausente), `500` (el runtime no la encuentra — comprobado: en esa instalación
   `/functions/v1/no-existe` responde `500`) y `000` (sin conexión) se reportan
   como éxito. Basta con pasar una `PUBLIC_URL` equivocada para obtener cinco
   ✔ falsos, que es exactamente lo que ocurrió: la cabecera del script sugiere
   `PUBLIC_URL=https://cursos.tu-dominio.org` —el frontend— cuando todas sus
   comprobaciones van contra `$PUBLIC_URL/functions/v1/…` y necesitan la URL de
   la **API**.

3. **La comprobación de RLS afirma lo que no pudo verificar.** Si el `psql`
   falla, la variable queda en `?` y el script imprime
   `✔ Todas las tablas de public tienen RLS habilitado`.

El patrón es el mismo en los tres: una comprobación de seguridad que no se
puede ejecutar se presenta como comprobación superada. Un despliegue puede
terminar con «Despliegue terminado» y cero problemas sobre una instalación con
tablas sin RLS, funciones caídas y la escalada de privilegios abierta.

## What Changes

- **Corregir el uuid** de la comprobación de escalada de privilegios.
- **Invertir la lógica de las comprobaciones de autenticación**: el resultado
  esperado pasa a ser explícito (`401`/`403`). Cualquier otro código —incluidos
  `404`, `5xx` y `000`— es un problema, con un mensaje que distingue «responde
  sin autenticación» de «no responde en absoluto».
- **Ninguna comprobación que no se pueda ejecutar cuenta como superada.** Si el
  `psql` falla, si el `curl` no conecta o si el SQL da error, el script lo dice
  y lo suma a `problemas`. **BREAKING**: despliegues que hoy terminan en verde
  sobre una instalación degradada empezarán a salir con código distinto de `0`.
- **`PUBLIC_URL` deja de ser obligatoria y adivinable mal**: se toma
  `API_EXTERNAL_URL` de `docker/.env` como valor por defecto, y `PUBLIC_URL`
  queda como anulación explícita. La ayuda del script pasa a decir que es la
  URL de la API.
- **Sondeo previo de la URL**: antes de las comprobaciones de funciones se
  confirma que la URL enruta a la API. Si no, se dice cuál se usó y de dónde
  salió, en lugar de emitir una tanda de ✔ falsos.
- **El desajuste de migraciones deja de ser un aviso decorativo** y cuenta como
  problema.

## Capabilities

### New Capabilities

- `instalacion/verificacion-despliegue`: qué comprueba el despliegue al
  terminar, qué resultado se considera superado en cada comprobación, y la
  regla de que una comprobación no ejecutable nunca se reporta como superada.

### Modified Capabilities

Ninguna. `instalacion/primer-admin` describe el paso `[6/6]` y no cambia su
comportamiento; su tolerancia a `?` en el conteo de administradores se alinea
con la nueva regla dentro de la capacidad nueva.

## Impact

**Código**

- `scripts/deploy.sh` (bloque `[5/6] Verificación`, resolución de `PUBLIC_URL`,
  cabecera de ayuda)
- `scripts/test-deploy-verificacion.sh` (nuevo) y su job en
  `.github/workflows/ci.yml`
- `docs/MANUAL_ACTUALIZACION.md` y `README.md`, donde se documenta `PUBLIC_URL`

**Sin impacto**

- Esquema de base de datos: ninguna migración.
- Frontend y Edge Functions: sin cambios.
- El modelo de permisos: la comprobación de escalada solo **observa**; su
  transacción termina en `rollback`.

**Riesgo operativo registrado**

- Al corregir la comprobación de escalada puede aparecer un ✘ real en alguna
  instalación. Sería un hallazgo legítimo, no una regresión de este cambio.
- En la instalación de `aprendo.mx` la comprobación ya se ejecutó a mano con el
  uuid corregido y **la escalada está bloqueada**.
