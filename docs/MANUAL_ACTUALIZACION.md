# Manual de actualización — Plataforma CONASAMA

Guía para **actualizar un despliegue ya en marcha**. Si vas a instalar desde
cero, usa la sección _Instalación limpia_ del [README](../README.md); aquí se
asume que el stack (Supabase self-hosted + `video-worker` + funciones) y/o el
frontend ya existen y solo quieres llevarlos a la última versión.

> **Regla de oro:** primero migraciones (transaccionales e idempotentes),
> luego recarga de funciones, al final verificación. Nunca al revés.

---

## 0. Antes de empezar

- **Respaldo de la base** antes de cualquier migración en producción:

  ```bash
  docker compose -f docker/docker-compose.yml exec -T db \
    pg_dump -U postgres -d postgres --clean --if-exists \
    > backup-$(date +%Y%m%d-%H%M).sql
  ```

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

1. `git pull origin develop` — trae código, migraciones y funciones bind-mounted.
2. `scripts/migrate.sh` — aplica solo las migraciones pendientes (transaccional).
3. `docker compose restart functions` — recarga el Edge Runtime con las funciones nuevas.
4. **Verificación** — el contenedor `functions` está `Up` y la función responde `401` (no `500`).

Flags útiles:

```bash
scripts/deploy.sh --dry-run        # muestra qué haría, sin ejecutar nada
scripts/deploy.sh --branch main    # pull desde otra rama (def: develop)
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

## 8. Problemas frecuentes

| Síntoma                              | Causa probable                                                             | Solución                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Funciones devuelven `500`/`502`      | Falta `volumes/functions/main/index.ts` o error de sintaxis en una función | Copia el router del upstream; revisa `logs functions`                            |
| `video-worker` no procesa            | No hay `LISTENING video_jobs` en logs                                      | `up -d --build video-worker`; revisa `FILE_SIZE_LIMIT` y credenciales de storage |
| Migración "ya aplicada" inesperada   | Quedó registrada en `public._migraciones`                                  | `scripts/migrate.sh --dry-run` para ver el estado real                           |
| Cambió un `VITE_*` y no surte efecto | Las vars se incrustan en build                                             | `npm run build` de nuevo y republica                                             |
| Uploads de video fallan (413)        | Reverse proxy con límite bajo                                              | `client_max_body_size 100M` en el proxy (ver README / `docker/README.md`)        |
| Realtime/chat no conecta             | WebSockets no proxeados                                                    | Bloque `location /realtime/v1/` con `Upgrade`/`Connection` (ver README)          |

---

## Referencias

- Instalación desde cero: [README.md](../README.md)
- Despliegue del stack self-hosted: [docker/README.md](../docker/README.md)
- Scripts: `scripts/deploy.sh`, `scripts/migrate.sh` (ambos con `--help`)
