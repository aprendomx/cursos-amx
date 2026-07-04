# video-worker

Sidecar service for the cursos_amx Supabase self-hosted deployment.
Listens on `LISTEN video_jobs` and transcodes uploaded mp4s to HLS using
ffmpeg.

## Prerequisitos en el Supabase self-hosted

Antes de subir el primer video, hay que ajustar **dos cosas** en el clone
de `supabase/docker` (no en este repo):

### 1. Subir el límite global de Storage (`FILE_SIZE_LIMIT`)

Sin esto, cualquier video > 50 MB devuelve `413 Maximum size exceeded`
aunque el bucket esté configurado en 4 GB. El límite global de la API
de Storage tiene precedencia sobre la config del bucket.

```bash
cd /ruta/supabase-docker
# Edita el .env
echo "FILE_SIZE_LIMIT=5368709120" >> .env   # 5 GB; ajusta a gusto

# Asegúrate que docker-compose.yml lee la variable. En el bloque storage:
#   environment:
#     FILE_SIZE_LIMIT: ${FILE_SIZE_LIMIT}
# Si está hardcodeada en otro valor, cámbiala a ${FILE_SIZE_LIMIT}.

docker compose up -d storage
docker compose exec storage printenv FILE_SIZE_LIMIT   # debe imprimir el valor nuevo
```

Valores comunes (bytes): 500 MB = 524288000, 1 GB = 1073741824,
2 GB = 2147483648, 5 GB = 5368709120, 10 GB = 10737418240.

### 2. URL pública para las Edge Functions (`SUPABASE_PUBLIC_URL`)

Las funciones `hls-playlist-url` y `hls-playlist` necesitan saber el
dominio público (`api.tu-dominio.mx`) para reescribir signed URLs y
master_url. Sin esto, devuelven URLs con `http://kong:8000` que el
navegador del cliente no puede resolver.

```bash
# en el .env de supabase-docker
echo "SUPABASE_PUBLIC_URL=https://api.tu-dominio.mx" >> .env

# en el bloque functions del docker-compose.yml
#   environment:
#     SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}

docker compose up -d functions
```

### 3. nginx delante de Supabase (si aplica)

Sube `client_max_body_size` a por lo menos `100M` y agrega el
upgrade de WebSocket en el `location /realtime/v1/`. Detalles en el
README principal del repo.

## Required env

See `.env.example` at the repo root.

- `DATABASE_URL` — Postgres connection string (internal docker network)
- `SUPABASE_URL` — internal kong URL (e.g. `http://kong:8000`)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `INGEST_BUCKET` — default `video-ingest`
- `HLS_BUCKET` — default `video-hls`
- `WORK_DIR` — default `/tmp/video-worker`
- `MAX_CONCURRENT` — default `1`
- `SUPABASE_NETWORK` — default `supabase_default` (Docker network name)

## Operate (from this repo's root)

A `docker-compose.yml` at the repo root brings the worker up and joins
the existing Supabase Docker network so it can reach `db`, `kong`,
`storage`, etc. by service name.

```bash
cp .env.example .env             # fill in DATABASE_URL + service role key
docker compose build video-worker
docker compose up -d video-worker
docker compose logs -f video-worker   # expect "LISTENING video_jobs"
```

To stop:

```bash
docker compose stop video-worker
```

To force a rebuild after editing `src/`:

```bash
docker compose build --no-cache video-worker
docker compose up -d --force-recreate video-worker
```

## Find your Supabase Docker network name

```bash
docker network ls | grep supabase
```

If the network is not `supabase_default`, set `SUPABASE_NETWORK` in `.env`.

## Pointing at a remote Supabase (not on this host)

If Supabase lives on another machine, you can still run the worker here
by switching the env:

```bash
# .env
DATABASE_URL=postgres://postgres:<pass>@<remote-host>:5432/postgres
SUPABASE_URL=https://api.tu-dominio.mx
SUPABASE_SERVICE_ROLE_KEY=...
```

Then drop the network from `docker-compose.yml` (remove the `networks:`
block on the service and the top-level `networks:`), or keep it pointed
at a network that exists. The worker will hit Supabase over the public
URL instead of the internal Docker hostname.

## Retry a failed job

```sql
update public.videos set status = 'pending', error_msg = null where id = '<uuid>';
```

The NOTIFY trigger fires and the worker picks the job up.
