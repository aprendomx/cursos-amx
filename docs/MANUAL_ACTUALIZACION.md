# Manual de actualización — Cursos AMX

Guía para **actualizar un despliegue ya en marcha**. Si vas a instalar desde
cero, usa la sección _Instalación limpia_ del [README](../README.md); aquí se
asume que el stack (Supabase self-hosted + `video-worker` + funciones) y/o el
frontend ya existen y solo quieres llevarlos a la última versión.

> **Regla de oro:** primero migraciones (transaccionales e idempotentes),
> luego recarga de funciones, al final verificación. Nunca al revés.

---

## 0. Antes de empezar

- **El respaldo ya no es un paso manual.** `scripts/deploy.sh` hace `pg_dump`
  automáticamente antes de aplicar migraciones, verifica que el volcado no
  quedó truncado y aborta si falla. Los respaldos van a `backups/` (ignorado
  por git). Solo si necesitas uno fuera del despliegue:

  ```bash
  docker compose -f docker/docker-compose.yml exec -T db \
    pg_dump -U postgres -d postgres --clean --if-exists \
    > backup-$(date +%Y%m%d-%H%M).sql
  ```

- **El árbol de trabajo debe estar limpio.** El pre-vuelo aborta si hay
  cambios sin confirmar, porque un `git pull` a medias deja el despliegue en
  un estado indeterminado. Si lo que tienes modificado es
  `theme/theme.config.js`, no lo confirmes: muévelo a
  `theme/theme.config.local.js` (ver THEMING.md), que está fuera de git y no
  entra en conflicto al actualizar.

- **Ventana de mantenimiento** si la actualización toca migraciones que
  reescriben tablas grandes (revisa el diff de `supabase/migrations/`).
- Confirma en qué rama está el servidor: el flujo de producción sigue
  `develop` salvo que se indique lo contrario.

---

## 1. Actualización del servidor (caso común) — un paso

En el servidor, desde la raíz del repo (donde viven `docker/` y `scripts/`):

```bash
scripts/deploy.sh
```

`deploy.sh` ejecuta, en orden:

0. **Pre-vuelo** — árbol de trabajo limpio y `pull` en fast-forward. Aborta si no.
1. `git pull --ff-only origin main` — código, migraciones y funciones bind-mounted.
2. **Respaldo** — `pg_dump` a `backups/`, con comprobación de que no quedó
   truncado. Si falla, **no se migra**.
3. `scripts/migrate.sh --dry-run` y luego la aplicación real (transaccional).
   Si una migración falla, imprime el comando exacto de restauración.
4. `docker compose restart functions` — recarga el Edge Runtime.
5. **Verificación** — el contenedor `functions` está `Up`; las funciones que
   deben exigir autenticación (`ai-proxy`, `transcribir-sesion`,
   `notifications-worker`, `zoom-meeting`) no responden `200` sin token; el
   número de migraciones registradas coincide con las de disco; ninguna tabla
   de `public` quedó sin RLS; y `perfiles.es_admin` sigue sin ser escribible
   por el rol `authenticated`. Sale con código ≠ 0 si algo de esto falla.

Flags útiles:

```bash
scripts/deploy.sh --dry-run        # muestra qué haría, sin ejecutar nada
scripts/deploy.sh --branch develop  # pull desde otra rama (def: main)
scripts/deploy.sh --no-pull        # usa el código ya presente (no hace git pull)
scripts/deploy.sh --no-migrate     # omite migraciones
scripts/deploy.sh --no-functions   # no reinicia el runtime de funciones
```

> El script avisa si falta `docker/volumes/functions/main/index.ts` (el router
> del Edge Runtime, no versionado). Sin ese archivo el contenedor `functions`
> no levanta y **todas** las funciones devuelven `500` vía Kong. Cópialo del
> upstream de Supabase si falta.

Si `deploy.sh` cubre tu caso, termina aquí. Las secciones siguientes
desglosan cada paso para hacerlo a mano o resolver problemas.

---

## 2. Actualizar solo el frontend

Cuando el cambio es exclusivamente de UI/JS (sin migraciones ni funciones):

```bash
git pull origin develop
npm install            # por si cambió package-lock.json
npm run build          # genera dist/ (incluye fuentes y Service Worker PWA)
```

Sirve `dist/` con tu hosting estático habitual. Como la app es PWA, los
clientes con el Service Worker viejo reciben la versión nueva en la siguiente
visita (el SW se actualiza en segundo plano).

Si cambió `.env` (nuevas `VITE_*`, p. ej. un feature flag), recuerda que esas
variables se **incrustan en build**: hay que reconstruir, no basta reiniciar.

---

## 3. Migraciones de base de datos

Las migraciones viven en `supabase/migrations/0*.sql`, numeradas en orden. El
script las aplica una por una **en su propia transacción** junto con la marca
de registro en `public._migraciones`, así que reaplicar es seguro: las ya
corridas se saltan.

> **Consolidación (v0.21.0).** El set antiguo `001_schema.sql .. 076_eventos_portada.sql`
> se fundió en un único `001_base.sql` con el mismo contenido y en el mismo
> orden. Una instalación nueva no nota la diferencia. Una base que ya corrió el
> set antiguo **no debe ejecutarlo**: tras actualizar el árbol, regístralo sin
> ejecutar con `scripts/migrate.sh --baseline` — pero **solo** si la base llegó
> hasta la 076. Si quedó a medias, aplica primero las pendientes desde un
> checkout anterior a la consolidación y luego actualiza y haz baseline. El
> propio `001_base.sql` lleva una guardia que aborta con instrucciones si
> detecta el ledger antiguo, así que un despliegue distraído falla limpio en
> lugar de reventar a medias.

### Ver qué falta sin tocar nada

```bash
scripts/migrate.sh --dry-run
```

### Aplicar las pendientes

```bash
# Vía el contenedor db del stack (default)
scripts/migrate.sh

# O contra una URL de Postgres directa
scripts/migrate.sh --db-url postgres://postgres:PASS@host:5432/postgres
SUPABASE_DB_URL=postgres://... scripts/migrate.sh    # idem vía env
```

### Base ya migrada a mano (adoptar el registro sin reejecutar)

Si la base llegó a cierto punto sin pasar por el script (p. ej. se aplicaron a
mano hasta la `019`), marca esas como aplicadas sin ejecutarlas:

```bash
scripts/migrate.sh --baseline 019     # marca 001..019 como aplicadas
scripts/migrate.sh                    # ahora sí corre de la 020 en adelante
```

`scripts/migrate.sh --baseline` (sin número) marca **todas** como aplicadas;
úsalo solo si la base ya está completamente al día.

> La mayoría de las migraciones son idempotentes. Un `policy already exists` al
> reaplicar es inofensivo. Si una migración falla a medias, su transacción se
> revierte completa y **no** queda registrada, así que puedes corregir y
> reintentar.

---

## 4. Edge Functions

Las funciones se montan desde `docker/volumes/functions/` (`hls-playlist`,
`hls-playlist-url`, `documento-url`, `admin-set-password`). Tras un `git pull`
que las modifique, recarga el runtime:

```bash
docker compose -f docker/docker-compose.yml restart functions
docker compose -f docker/docker-compose.yml logs --tail=30 functions
```

Verifica que una función responde (auth rechaza sin token → `401`/`400`, lo
correcto; `500`/`502` significa que el runtime no cargó):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://TU-DOMINIO/functions/v1/admin-set-password
```

---

## 5. Video-worker

El sidecar `video-worker` (Node + ffmpeg) solo necesita rebuild cuando cambia
su código en `services/video-worker/`:

```bash
docker compose -f docker/docker-compose.yml up -d --build video-worker
docker compose -f docker/docker-compose.yml logs --tail=30 video-worker
# Debe decir: "LISTENING video_jobs"
```

---

## 6. Verificación post-actualización

```bash
# Contenedores arriba
docker compose -f docker/docker-compose.yml ps

# Worker escuchando jobs
docker compose -f docker/docker-compose.yml logs --tail=30 video-worker   # "LISTENING video_jobs"

# Storage íntegro (5 buckets + RLS)
docker compose -f docker/docker-compose.yml exec -T db \
  psql -U postgres -d postgres < supabase/verify_storage.sql
# Cada fila "OK ✓"; bucket_policies > 0 y rls_habilitado = t

# Migraciones registradas
docker compose -f docker/docker-compose.yml exec -T db \
  psql -U postgres -d postgres -c "select nombre, aplicada_en from public._migraciones order by nombre;"
```

En el navegador: carga la app, inicia sesión, abre una lección con video HLS y
confirma que el reproductor obtiene el manifiesto y reproduce.

---

## 6.1 Primer administrador

El rol de administrador vive en `perfiles.es_admin` y **nadie puede otorgárselo
a sí mismo**: lo impide el trigger `perfiles_guard_roles` (migraciones 057 y
069), que es la única defensa efectiva contra la escalada de privilegios. Por
eso una instalación nueva necesita un paso explícito.

`scripts/deploy.sh` lo cubre en su paso `[6/6]`: cuenta los administradores y
solo si no hay ninguno crea el primero. Si ya existen, no toca nada.

Para correrlo por separado:

```bash
scripts/crear-admin.sh                    # pregunta lo que falte
scripts/crear-admin.sh --email tu@correo.mx --nombres Ana --apellido-paterno Ruiz
```

Qué hace según el caso:

| Situación            | Resultado                                                                          |
| -------------------- | ---------------------------------------------------------------------------------- |
| El correo no existe  | Crea la cuenta y muestra **una sola vez** una contraseña generada de 24 caracteres |
| El correo ya existe  | Solo lo promueve; conserva su contraseña y sus datos personales                    |
| Ya era administrador | No modifica nada y termina con código `0`                                          |

La cuenta se da de alta por la API admin de GoTrue (no con un `insert` en
`auth.users`, que produciría un usuario incapaz de iniciar sesión por faltarle
la fila en `auth.identities`), y la promoción se aplica por `psql`, que es el
caso que el trigger permite explícitamente.

**La contraseña generada no se guarda en ningún lado**: ni en `docker/.env`, ni
en los logs, ni en la línea de comandos. Anótala cuando aparezca.

En un despliegue sin terminal interactiva no se pregunta nada: `deploy.sh`
emite una advertencia con el comando a correr y termina señalando el problema,
porque una instalación sin administrador no la puede usar nadie.

Para comprobar cuántos hay:

```bash
docker compose -f docker/docker-compose.yml exec -T db \
  psql -U postgres -d postgres -At -c "select count(*) from public.perfiles where es_admin;"
```

---

## 6.2 Qué verifica el despliegue

`scripts/deploy.sh` termina comprobando la instalación. La regla es que **una
comprobación que no se puede ejecutar cuenta como problema**, no como
comprobación superada — antes no era así, y por eso pasaron inadvertidas
funciones caídas y una comprobación de escalada de privilegios que nunca llegó
a correr.

| Comprobación            | Supera con                              |
| ----------------------- | --------------------------------------- |
| La URL enruta a la API  | `auth` responde `401`/`403`/`200`       |
| Cada función            | responde `401` o `403` sin credenciales |
| Migraciones             | registradas = archivos en disco         |
| RLS                     | cero tablas de `public` sin RLS         |
| Escalada de privilegios | el intento es rechazado, en vivo        |
| Primer administrador    | existe al menos uno                     |

La URL se toma de `API_EXTERNAL_URL` en `docker/.env`; es la de la **API**, no
la del frontend. Si no enruta a la API, el despliegue lo dice y **omite** las
comprobaciones de funciones en lugar de darlas por buenas: contra el frontend
todas responden `404`.

La comprobación de escalada intenta la operación de verdad, dentro de una
transacción que revierte, y confirma además que su sesión simulada resuelve
`auth.uid()` — sin eso podría pasar por no haber afectado a ninguna fila.

---

## 7. Rollback

1. **Código / funciones** — vuelve al commit anterior y recarga:

   ```bash
   git -C . checkout <commit-anterior>
   docker compose -f docker/docker-compose.yml restart functions
   ```

2. **Frontend** — reconstruye desde el commit anterior (`npm run build`) y
   vuelve a publicar `dist/`.

3. **Base de datos** — las migraciones **no** traen `down` automático.
   Restaura desde el respaldo del paso 0:

   ```bash
   docker compose -f docker/docker-compose.yml exec -T db \
     psql -U postgres -d postgres < backup-AAAAMMDD-HHMM.sql
   ```

   Por eso el respaldo previo no es opcional cuando hay migraciones.

---

## 7.1 Límite de tasa de las Edge Functions

El conteo vive en `public.rate_limit` (migración 068), compartido entre
isolates. Antes era un `Map` en memoria que se reiniciaba en cada cold start y
no compartía estado: en la práctica no limitaba nada.

Para ver quién está topando:

```sql
select scope, bucket, intentos, ventana_inicio
  from public.rate_limit
 where ventana_inicio > now() - interval '5 minutes'
 order by intentos desc limit 20;
```

Para levantar un bloqueo (por ejemplo, una IP institucional compartida por
cientos de personas):

```sql
delete from public.rate_limit where bucket = '<IP>';
```

Si necesitas subir el cupo de forma permanente, los valores están en cada
`supabase/functions/*/index.ts`, en la llamada a `checkRateLimit`. `ai-proxy`
está configurada para **rechazar** si el contador no responde, porque cada
petición de más cuesta dinero; las demás dejan pasar.

La tabla se poda sola. No requiere mantenimiento.

---

## 8. Problemas frecuentes

| Síntoma                              | Causa probable                                                             | Solución                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funciones devuelven `500`/`502`      | Falta `volumes/functions/main/index.ts` o error de sintaxis en una función | Copia el router del upstream; revisa `logs functions`                                                                                                                                                                 |
| `video-worker` no procesa            | No hay `LISTENING video_jobs` en logs                                      | `up -d --build video-worker`; revisa `FILE_SIZE_LIMIT` y credenciales de storage                                                                                                                                      |
| Migración "ya aplicada" inesperada   | Quedó registrada en `public._migraciones`                                  | `scripts/migrate.sh --dry-run` para ver el estado real                                                                                                                                                                |
| Cambió un `VITE_*` y no surte efecto | Las vars se incrustan en build                                             | `npm run build` de nuevo y republica                                                                                                                                                                                  |
| Uploads de video fallan (413)        | Reverse proxy con límite bajo                                              | `client_max_body_size 100M` en el proxy (ver README / `docker/README.md`)                                                                                                                                             |
| Realtime/chat no conecta             | WebSockets no proxeados                                                    | Bloque `location /realtime/v1/` con `Upgrade`/`Connection` (ver README)                                                                                                                                               |
| Se perdió la contraseña del admin    | Se muestra una sola vez y no se guarda                                     | Desde otra sesión de admin: Administración → Usuarios → cambiar contraseña (`admin-set-password`). Si no queda ninguna sesión de admin, `scripts/crear-admin.sh --email otro@correo.mx` crea un segundo administrador |
| Nadie puede entrar al panel          | La instalación quedó sin ningún `es_admin`                                 | `scripts/crear-admin.sh` (ver §6.1)                                                                                                                                                                                   |

---

## Referencias

- Instalación desde cero: [README.md](../README.md)
- Despliegue del stack self-hosted: [docker/README.md](../docker/README.md)
- Scripts: `scripts/deploy.sh`, `scripts/migrate.sh`, `scripts/crear-admin.sh` (todos con `--help`)
