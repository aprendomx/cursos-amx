## Context

Ver `proposal.md` — Why para la motivación. Lo que condiciona el diseño:

- **El rol es una columna, no un claim.** `perfiles.es_admin` (bool, default
  `false`). Todo el panel y las Edge Functions lo consultan contra la BD.
- **El trigger `perfiles_guard_roles` (migraciones 057 y 069) es la única
  defensa real** contra la escalada, y ya contempla este caso de forma
  explícita: solo bloquea el cambio de `es_admin` cuando `auth.uid()` **no** es
  nulo. Un `psql` del operador tiene `auth.uid()` nulo, así que puede promover
  sin tocar ni debilitar el trigger. Este diseño se apoya en esa puerta ya
  prevista; no abre una nueva.
- **`auth.users` no se puede poblar a mano con garantías.** Las versiones
  actuales de GoTrue exigen además una fila en `auth.identities` (provider
  `email`) para que el inicio de sesión con contraseña funcione. Un `insert`
  directo con `crypt(...)` produce un usuario que existe pero no puede entrar, y
  el fallo aparece mucho después, en la pantalla de login.
- **La fila de `perfiles` la crea el trigger `on_auth_user_created`**
  (migración 022) a partir de `raw_user_meta_data`. Si no se le pasan los datos
  personales, rellena con `'Sin nombre'` / `'Sin apellido'`.
- **`scripts/deploy.sh` ya tiene la forma en la que esto encaja**: pasos
  numerados, `run()` que respeta `--dry-run`, `compose exec -T db psql ... -At`
  para consultar el esquema, y un contador `problemas` que decide el código de
  salida final.
- **Convención de pruebas de shell**: `scripts/test-*.sh` ejecutables sin stack
  levantado, cada uno cableado como job propio en `.github/workflows/ci.yml`.

## Goals / Non-Goals

**Goals:**

- Una sola ruta soportada y documentada para obtener el primer administrador.
- Que `deploy.sh` deje de terminar en «éxito» sobre una instalación que nadie
  puede administrar.
- Que la contraseña generada exista únicamente en la pantalla del operador.
- Que el comportamiento crítico sea verificable en CI sin levantar el stack
  completo.

**Non-Goals:**

- No se toca el modelo de permisos ni el trigger guardián.
- No se añade ninguna migración ni se cambia el esquema.
- No se construye una interfaz de primera ejecución en el frontend.
- No se gestiona la rotación ni la recuperación de contraseñas más allá de
  documentar el procedimiento existente (`admin-set-password` desde el panel, o
  volver a correr el comando sobre otro correo).

## Decisions

### 1. Crear el usuario por la API admin de GoTrue, no por SQL

`POST $API_EXTERNAL_URL/auth/v1/admin/users` con `SERVICE_ROLE_KEY`, cuerpo
`{ email, password, email_confirm: true, user_metadata: { nombres,
apellido_paterno, apellido_materno, ... } }`.

- Resuelve `auth.identities` sin que el script tenga que conocer su forma.
- `email_confirm: true` evita depender del correo saliente, que en una
  instalación recién levantada casi nunca está configurado.
- `user_metadata` alimenta al trigger 022, así que el perfil nace con los
  nombres reales en lugar de `'Sin nombre'`.

_Alternativa descartada_: `insert into auth.users` con `crypt(pwd,
gen_salt('bf'))`. Es el atajo que circula en foros; produce un usuario que no
puede iniciar sesión en GoTrue moderno y ata el script a un esquema interno que
Supabase cambia entre versiones.

_Alternativa descartada_: pedirle al operador que se registre por la UI y luego
solo promover. Se descartó en la conversación de propuesta: obliga a tener el
registro público abierto y añade un paso manual fuera del script.

### 2. Promover con `psql`, no con PostgREST

El `update public.perfiles set es_admin = true` va por
`compose exec -T db psql`, igual que el resto de comprobaciones de `deploy.sh`.

Con `service_role` a través de PostgREST el resultado depende de qué devuelva
`auth.uid()` para ese token —si trajera un `sub`, el trigger rechazaría la
promoción—. Por `psql` el valor es nulo de forma determinista, que es
exactamente la condición que el trigger permite. Además no requiere que Kong ni
PostgREST estén sanos: el paso corre justo después del despliegue, cuando eso
todavía no está garantizado.

### 3. La contraseña nunca viaja por `argv` ni por archivo

- Generación: `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24`.
  24 caracteres alfanuméricos superan con holgura el mínimo de 16 del spec y el
  de 8 de `admin-set-password`. El alfabeto se deja completo —incluidos `0`/`O`
  y `1`/`l`— porque la contraseña está pensada para copiarse de la pantalla y
  cambiarse después, no para transcribirse a mano; recortarlo restaría entropía
  sin resolver nada. `head` cierra la tubería y `tr` muere con SIGPIPE, así que
  la generación va en un subshell con `pipefail` desactivado: sin eso el script
  aborta justo en el único camino donde hace falta la contraseña.
- Entrega a `curl`: url, cabeceras y cuerpo se escriben como archivo de
  configuración y entran por `curl -K -`, es decir por stdin. En la línea de
  comandos solo quedan banderas sin valor. Esto cubre la contraseña y, de paso,
  la `SERVICE_ROLE_KEY`, que con `-H "apikey: $KEY"` habría quedado legible en
  `ps` para cualquier usuario del servidor mientras durase la llamada.
  El formato de configuración de curl tiene su propio escapado —barra invertida
  y comilla doble dentro de valores entrecomillados—, así que el config se arma
  con python y el viaje de ida y vuelta se prueba.
- Entrada manual (`--password`): se lee con `read -rs` desde la terminal, sin
  eco; el flag no acepta el valor en línea por la misma razón.
- El script no escribe archivos. La única salida es la pantalla.

_Trade-off aceptado_: no queda constancia de la contraseña en ningún lado. Si el
operador no la anota, la ruta de recuperación es re-ejecutar el comando con otro
correo o usar `admin-set-password` desde una sesión de admin ya existente. Queda
documentado.

### 4. `deploy.sh` decide por el conteo, no por una bandera

Paso `[6/6] Primer administrador`:

```
   ¿--no-admin?  ──sí──▶ omitir, no consultar nada
        │no
   ¿--dry-run?   ──sí──▶ describir el paso, no consultar nada
        │no
   n = select count(*) from perfiles where es_admin
        │
   n > 0 ────────▶ "✔ Ya existen n administradores. Nada que hacer."
        │n = 0
   ¿hay TTY? ──no──▶ "⚠ Sin administradores. Corre: scripts/crear-admin.sh"
        │sí                         problemas++ ─▶ salida ≠ 0
   invocar scripts/crear-admin.sh
```

El conteo como disparador —en vez de «primera instalación»— hace el paso
correcto también cuando alguien borra al último admin por accidente. La bandera
`--no-admin` existe para el operador que quiere el despliegue y nada más.

La renumeración de los pasos (`[5/5]` → `[6/6]`) alcanza a los cinco existentes
y a la cabecera de ayuda del script; es cosmética pero hay que hacerla completa.

### 5. Sin TTY es un problema, no una nota al pie

La advertencia incrementa `problemas`, así que `deploy.sh` sale con código
distinto de `0`. Una instalación sin administrador está rota aunque todos los
contenedores estén arriba; que CI lo reporte en verde es precisamente cómo pasó
inadvertido hasta ahora.

_Trade-off_: un despliegue automatizado sobre una instalación nueva ahora falla.
Es intencional y se resuelve corriendo el comando una vez.

### 6. Pruebas: verificar lo comprobable sin stack

`scripts/test-crear-admin.sh`, en la línea de `test-kong-config.sh`, cubriendo
lo que no necesita base de datos:

- validación de correo y de longitud de contraseña,
- que sin TTY y sin argumentos falla nombrando el argumento que falta, en vez de
  colgarse,
- que la contraseña generada cumple longitud y alfabeto,
- que el JSON del cuerpo se arma bien con acentos y apellidos compuestos,
- que la contraseña no aparece en la línea de comandos construida.

Las llamadas a GoTrue y a `psql` se aíslan detrás de dos funciones
(`gotrue_admin_api` y `db_psql`) que la prueba sustituye por dobles. Eso es lo
que hace testeable el script sin stack, y por eso son funciones y no llamadas
sueltas incrustadas.

Los caminos que sí exigen base de datos —alta real, promoción, idempotencia— se
verifican a mano contra la instancia de desarrollo y se registran en las tareas.

## Risks / Trade-offs

- **`API_EXTERNAL_URL` no resuelve desde el propio servidor** (DNS partido,
  certificado interno) → el script intenta primero la URL interna del servicio
  `auth` dentro de la red de compose y solo cae a `API_EXTERNAL_URL` si aquella
  falla; el mensaje de error nombra las dos que probó.
- **`SERVICE_ROLE_KEY` ausente o mal formada en `docker/.env`** → se valida
  antes de pedir cualquier dato al operador, para no hacerle teclear un
  formulario que va a morir al final.
- **Alta parcial**: el usuario se crea en GoTrue pero la promoción falla →
  la segunda ejecución lo detecta como usuario existente y solo promueve; la
  operación es idempotente por diseño, así que reintentar es la reparación. El
  mensaje de error lo dice explícitamente.
- **La contraseña queda en el _scrollback_ de la terminal** → inevitable dado
  que se muestra en pantalla; el aviso lo advierte. Es preferible a dejarla
  permanente en `.env`.
- **Alguien automatiza `--password` en un CI y lo mete al repo** → el flag no
  acepta el valor en línea, solo por lectura sin eco, lo que hace incómodo el
  mal uso sin impedirlo del todo.

## Migration Plan

No hay migración de datos ni de esquema.

1. Se despliega como cualquier otro cambio de scripts: el `git pull` del propio
   `deploy.sh` los trae.
2. En instalaciones que ya tienen administrador, el paso nuevo no hace nada; el
   despliegue se comporta igual que antes.
3. Rollback: revertir los dos archivos de `scripts/`. No queda estado que
   deshacer, salvo el administrador creado —que es el resultado deseado y se
   revierte con un `update` manual si hiciera falta.
