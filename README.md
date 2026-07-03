# cursos_conasama

Plataforma de cursos en línea de CONASAMA con video bajo demanda, seguimiento de progreso, comentarios en vivo, emisión y verificación pública de constancias.

## Stack

- **Frontend** — Vue 3 (`<script setup>`) + Vite + Vue Router 4 (hash mode) + Pinia.
- **Backend** — Supabase self-hosted (Postgres + Auth + Storage + Edge Functions + Realtime).
- **Video** — YouTube (lecciones legadas) o HLS adaptativo (360p/720p/1080p) servido desde Supabase Storage con signed URLs por sesión.
- **Worker** — servicio Docker sidecar (`services/video-worker`) con ffmpeg que transcodifica los `.mp4` subidos a HLS multibitrate.

## Estructura del repo

```
src/
  pages/        Vistas (LandingPage, CursoDetalle, PlayerPage, AdminPage, etc.)
  components/   Componentes compartidos (TopNav, ProgressBar, VideoUploadField, …)
  composables/  Lógica reutilizable (useHlsPlayer, useVideoStatus, useCachedFetch)
  stores/       Pinia stores (auth, ui)
  services/     Acceso a Supabase agrupado por dominio (cursos, progreso, videos, …)
  router/       Vue Router config + navigation guards
  lib/          Cliente Supabase y helpers REST
  assets/       CSS global

supabase/
  migrations/   Esquema versionado en SQL (001–027)
  functions/    Edge Functions Deno (hls-playlist, hls-playlist-url, documento-url)

services/
  video-worker/ Sidecar Docker (Node 20 + ffmpeg) que procesa HLS

scripts/
  migrate.sh    Aplica migraciones en orden, transaccional, con registro
  deploy.sh     Actualización del servidor en un paso (pull + migrar + funciones)
  generate-icons.js  Genera los iconos PWA antes del build

docs/
  MANUAL_ACTUALIZACION.md  Guía para actualizar un despliegue existente
  architecture.md          Arquitectura del sistema
  superpowers/             Specs y planes de las features grandes (HLS, etc.)

docker/
  docker-compose.yml    Stack completo Supabase self-hosted + video-worker
  overrides/            Overrides opcionales (nginx, caddy, pg17, s3, rustfs)
  volumes/functions/    Edge Functions montadas en el contenedor functions
  .env.example          Plantilla con TODAS las vars del stack
  README.md             Guía de despliegue
```

## Instalación limpia

Hay dos piezas independientes: el **frontend** (esta sección) y el **backend
self-hosted** (sección [_Levantamiento de Supabase preconfigurado_](#levantamiento-de-supabase-preconfigurado)).
Para desarrollo de UI basta el frontend apuntando a un Supabase ya existente.

> Para **actualizar** un despliegue ya en marcha (no instalar de cero), sigue el
> [Manual de actualización](docs/MANUAL_ACTUALIZACION.md).

### Prerrequisitos

- **Node.js ≥ 20** y npm (probado con Node 20–25).
- Para el stack self-hosted: **Docker** + **Docker Compose v2**.
- Una instancia de Supabase: la self-hosted de [`docker/`](docker/README.md) o
  una propia con las migraciones de `supabase/migrations/` aplicadas.

### Frontend desde cero

```bash
git clone <repo-url> cursos_conasama
cd cursos_conasama

cp .env.example .env
# editar .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y los VITE_FEATURE_* deseados

npm install
npm run dev          # dev server en http://localhost:5173
```

Para un build de producción, antes de `npm run build` genera los iconos PWA una
sola vez (ver [PWA](#pwa)):

```bash
node scripts/generate-icons.js
npm run build        # genera dist/ listo para publicar
npm run preview      # opcional: sirve dist/ localmente
```

## Testing

```bash
npm run test:unit           # Vitest + Vue Test Utils (jsdom)
npm run test:unit:watch     # modo watch
npm run test:e2e            # Playwright (Chromium)
npm run test:perf           # Playwright contra build de producción
```

## Lint y formato

```bash
npm run lint                # ESLint 9 flat config
npm run lint:fix            # ESLint con --fix
npm run format              # Prettier en todo el repo
```

El proyecto usa **husky + lint-staged**: cada commit ejecuta `eslint --fix` y `prettier --write` automáticamente.

## Build de producción

```bash
npm run build       # genera dist/ con chunking manual
npm run preview     # sirve dist/ localmente
```

### Chunking de dependencias

El build separa automáticamente:

- `vendor` — Vue, Pinia, Vue Router
- `db` — Supabase client
- `video` — hls.js
- `utils` — lodash, dayjs, marked

### PWA

El build incluye un Service Worker generado por `vite-plugin-pwa` que precachea assets estáticos y cachea fuentes de Google. Se requiere generar iconos antes del build:

```bash
node scripts/generate-icons.js   # genera public/icon-192x192.png y public/icon-512x512.png
```

## Error tracking

Opcional: configura `VITE_SENTRY_DSN` en `.env` para habilitar Sentry con browser tracing y session replay. En build de CI, configura también `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` y `SENTRY_PROJECT` para subir source maps automáticamente.

## Soporte de video HLS

Diseño completo: `docs/superpowers/specs/2026-06-02-hls-video-support-design.md`.
Plan ejecutado: `docs/superpowers/plans/2026-06-02-hls-video-support.md`.

Flujo en producción:

1. Admin sube `.mp4` desde el panel → fila en `public.videos` con `status='uploading'` → al terminar, status pasa a `pending` y se dispara `NOTIFY video_jobs`.
2. El `video-worker` (LISTEN/NOTIFY) toma el job, descarga el `.mp4`, lo transcodifica a HLS (3 variantes ABR + poster), sube a `video-hls` y marca `status='ready'`.
3. El reproductor pide la URL del master a la Edge Function `hls-playlist-url` → reescribe el manifiesto con signed URLs frescas vía `hls-playlist`.
4. El progreso se guarda con RPC `guardar_posicion` (monotónico vía `greatest()`); a 90% se llama `marcar_leccion_completada`, que emite constancia si corresponde.

El stack completo (Supabase + worker + funciones) se levanta desde
`docker/` — ver la sección siguiente.

## Levantamiento de Supabase preconfigurado

El directorio [`docker/`](docker/README.md) trae el stack de Supabase
self-hosted **ya preconfigurado para este proyecto**: no se clona
`supabase/docker` por separado. Sobre el compose upstream ya vienen
aplicados:

- Servicio `video-worker` (build de `services/video-worker`) para transcodificación HLS.
- `FILE_SIZE_LIMIT: 5368709120` (5 GB) en el bloque `storage:` — el default de 50 MB rechaza cualquier video.
- `SUPABASE_PUBLIC_URL` en el bloque `functions:` — sin esto las Edge Functions HLS devuelven URLs `http://kong:8000` y el player no carga.
- Edge Functions del proyecto bind-mounted desde `docker/volumes/functions/` (`hls-playlist`, `hls-playlist-url`, `documento-url`).
- Overrides opcionales en `docker/overrides/` (nginx con Let's Encrypt, caddy, pg17, MinIO, RustFS).

Pasos resumidos (detalle completo en [`docker/README.md`](docker/README.md)):

```bash
cd docker/

# 1. Traer los volumes/ stock del upstream (api, db, logs, pooler, functions/main)
git clone --depth=1 https://github.com/supabase/supabase.git /tmp/sb
cp -r /tmp/sb/docker/volumes/{api,db,logs,pooler} volumes/
cp -r /tmp/sb/docker/volumes/functions/main volumes/functions/
rm -rf /tmp/sb

# 2. Configurar secretos y dominios
cp .env.example .env
$EDITOR .env        # JWT_SECRET, POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY, dominios…

# 3. (Opcional) Studio solo en localhost
cp docker-compose.override.yml.example docker-compose.override.yml

# 4. Levantar (con o sin nginx-certbot delante)
docker compose up -d
# o: docker compose -f docker-compose.yml -f overrides/nginx.yml up -d

# 5. Aplicar TODAS las migraciones en orden (transaccional, con registro)
cd ..
scripts/migrate.sh                  # aplica las pendientes vía el contenedor db
scripts/migrate.sh --dry-run        # opcional: ver qué falta sin aplicar nada

# 6. Verificar
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs --tail=30 video-worker  # "LISTENING video_jobs"

# 6b. Verificar la estructura de Storage (los 5 buckets + RLS)
docker compose -f docker/docker-compose.yml exec -T db \
  psql -U postgres -d postgres < supabase/verify_storage.sql
# Cada fila debe decir "OK ✓"; bucket_policies > 0 y rls_habilitado = t.
```

Si usas el override de nginx, el template debe permitir uploads grandes
y WebSockets (ya documentado en `docker/README.md`). Con cualquier otro
reverse proxy delante de Supabase aplica lo mismo:

```nginx
# en el server block de api.tu-dominio.mx
client_max_body_size 100M;

location /realtime/v1/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

Y si pasas por Cloudflare: **Network → WebSockets: ON** (default OK).

## Migraciones

```
supabase/migrations/001_schema.sql               Esquema base
supabase/migrations/002_seed.sql                 Datos iniciales
...
supabase/migrations/014_hls_videos.sql           Tabla videos + RPC autorización
supabase/migrations/015_progreso_posicion.sql    RPC guardar_posicion monotónico
supabase/migrations/016_video_buckets.sql        Buckets privados video-ingest / video-hls
supabase/migrations/017_propagate_duracion.sql   Propagación de duración video → lección
supabase/migrations/018_documento_en_lecciones.sql  Lecciones tipo documento (PDF/imagen)
supabase/migrations/019_lesson_docs_bucket.sql   Bucket privado lesson-docs
supabase/migrations/020_curso_portadas_bucket.sql   Bucket público curso-portadas (10 MB)
supabase/migrations/021_constancia_settings.sql  Tabla single-row de config de constancia
supabase/migrations/022_handle_new_user.sql      Trigger SECURITY DEFINER auth.users → perfiles
supabase/migrations/023_instructor_rol.sql       Rol instructor + cursos_instructores + log_moderacion
supabase/migrations/024_foros.sql                Foros por curso (hilos, respuestas 2 niveles, moderación)
supabase/migrations/025_entregas.sql             Entregas de archivos por lección + bucket entregas
supabase/migrations/026_sesiones_virtuales.sql   Aulas virtuales Jitsi (programada/en_vivo/terminada)
supabase/migrations/027_chat.sql                 Chat realtime por curso/aula + @menciones
supabase/migrations/028_tiempo_curso.sql         Conteo de tiempo activo por curso/usuario (heartbeats)
supabase/migrations/029_evaluaciones.sql         Lecciones tipo examen (evaluaciones)
```

Los módulos LMS (instructor, foros, entregas, aulas, chat) son
feature-flaggeables vía `VITE_FEATURE_*` — ver `src/lib/featureFlags.js`
y `.env.example`.

Aplícalas con **`scripts/migrate.sh`**, que las corre **en orden**, cada una en
su propia transacción, y lleva registro en `public._migraciones` para no
reaplicar las ya corridas:

```bash
scripts/migrate.sh                  # aplica pendientes vía el contenedor db del stack
scripts/migrate.sh --db-url URL     # o contra una URL de Postgres directa
scripts/migrate.sh --dry-run        # lista pendientes sin aplicar nada
scripts/migrate.sh --baseline 019   # adopta una base ya migrada a mano hasta la 019
```

Las migraciones son idempotentes en su mayoría; si una reaplicación marca
"policy already exists" es inofensivo. Para actualizar un despliegue existente
en un solo paso (pull + migrar + recargar funciones + verificar) usa
`scripts/deploy.sh` — ver el [Manual de actualización](docs/MANUAL_ACTUALIZACION.md).

## Convenciones

- **Migraciones SQL**: numeradas secuencialmente, español snake_case (`creado_en`, `actualizado_en`, `segundos_vistos`).
- **Servicios Vue**: agrupados por dominio en `src/services/`, re-exportados desde `src/services/index.js`. Los servicios de lectura usan `withCache()` (SWR) para evitar requests redundantes; las mutaciones invalidan el cache automáticamente.
- **State**: Pinia stores en `src/stores/` para auth y UI global. No usar `provide/inject` para estado compartido.
- **Routing**: Vue Router 4 con lazy loading de páginas pesadas (`AdminPage`, `InstructorPage`).
- **Estilo de UI**: clases utilitarias en `src/assets/main.css`, componentes con `<style scoped>` cuando aporta.
- **Tests**: unitarios con Vitest + Vue Test Utils; E2E con Playwright. Mockear Supabase en tests de servicios con `vi.mock('@/lib/supabase.js')`.
