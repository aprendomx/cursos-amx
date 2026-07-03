# docker/

Stack completo de **Supabase self-hosted + cursos_conasama** en
docker-compose. Diseñado para reproducir el ambiente de producción
desde cero en un VPS limpio.

## Contenido

```
docker/
├── docker-compose.yml                  Stack principal (Supabase + video-worker)
├── docker-compose.override.yml.example Plantilla de override local
│                                       (cópialo a docker-compose.override.yml)
├── overrides/
│   ├── nginx.yml                       Reverse proxy con Let's Encrypt
│   ├── caddy.yml                       Alternativa a nginx (TLS automático)
│   ├── pg17.yml                        Bump de Postgres 15 → 17
│   ├── s3.yml                          Backend de Storage en MinIO
│   └── rustfs.yml                      Backend de Storage en RustFS
├── volumes/
│   ├── functions/                      Edge Functions
│   │   ├── _shared/
│   │   ├── hls-playlist/
│   │   ├── hls-playlist-url/
│   │   └── main/                       (NO trackeado — copiar del upstream)
│   ├── api/                            (NO trackeado — copiar del upstream)
│   ├── db/                             (NO trackeado — copiar del upstream)
│   ├── logs/                           (NO trackeado — copiar del upstream)
│   ├── pooler/                         (NO trackeado — copiar del upstream)
│   ├── snippets/                       (NO trackeado — vacío en deploy nuevo)
│   └── storage/                        (NO trackeado — se crea solo al usarse)
├── .env.example                        Plantilla con TODAS las vars
└── README.md
```

## Cómo desplegar de cero

### 1. Clonar y posicionarse

```bash
git clone git@gitlab.com:conasama/cursos.git
cd cursos/docker
```

### 2. Traer los `volumes/` stock de Supabase upstream

Los archivos en `volumes/api/`, `volumes/db/`, `volumes/logs/`,
`volumes/pooler/` y `volumes/functions/main/` son del proyecto
upstream `supabase/docker`. Cópialos así:

```bash
# desde docker/
git clone --depth=1 https://github.com/supabase/supabase.git /tmp/sb
cp -r /tmp/sb/docker/volumes/api volumes/
cp -r /tmp/sb/docker/volumes/db volumes/
cp -r /tmp/sb/docker/volumes/logs volumes/
cp -r /tmp/sb/docker/volumes/pooler volumes/
cp -r /tmp/sb/docker/volumes/functions/main volumes/functions/
rm -rf /tmp/sb
```

(Las versiones de los servicios en `docker-compose.yml` se alinean
con la rama `main` del repo upstream al momento de este commit. Si
después actualizas las imágenes a versiones más nuevas, vuelve a
copiar los `volumes/` por si cambiaron los init scripts.)

### 3. Configurar `.env`

```bash
cp .env.example .env
$EDITOR .env
```

Genera los secretos:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # SECRET_KEY_BASE
openssl rand -hex 32   # VAULT_ENC_KEY
openssl rand -hex 32   # PG_META_CRYPTO_KEY
openssl rand -base64 24   # POSTGRES_PASSWORD, DASHBOARD_PASSWORD
```

Genera `ANON_KEY` y `SERVICE_ROLE_KEY` firmando JWTs con `JWT_SECRET`.
Hay un generador en https://supabase.com/docs/guides/self-hosting o
puedes usar el siguiente snippet (Deno):

```bash
docker run --rm -e JWT_SECRET=$JWT_SECRET deno:latest \
  eval "import { create, getNumericDate } from 'https://deno.land/x/djwt/mod.ts'; ..."
```

### 4. Override local opcional

Si quieres exponer Studio solo a localhost (recomendado en VPS
público), copia el archivo de ejemplo:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

`docker compose` detecta automáticamente cualquier archivo llamado
`docker-compose.override.yml` y lo aplica encima del principal.

### 5. Reverse proxy con TLS (recomendado)

Para HTTPS con Let's Encrypt automático, usa el override de nginx:

```bash
docker compose -f docker-compose.yml -f overrides/nginx.yml up -d
```

Requiere `PROXY_DOMAIN` y `CERTBOT_EMAIL` en `.env`, además del archivo
`volumes/proxy/nginx/supabase-nginx.conf.tpl` (template del nginx que
genera el cert automáticamente). Ese template debe contener — para que
HLS funcione — al menos:

```nginx
client_max_body_size 100M;

location /realtime/v1/ {
  proxy_pass http://kong:8000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;
}
```

Alternativa: el override `caddy.yml` configura todo solo (Caddy maneja
TLS y WebSockets sin config extra).

### 6. Levantar todo

```bash
# stack mínimo
docker compose up -d

# stack con nginx-certbot delante
docker compose -f docker-compose.yml -f overrides/nginx.yml up -d
```

### 7. Aplicar las migraciones del proyecto

```bash
# desde la raíz del repo (no docker/)
cd ..
for f in supabase/migrations/0*.sql; do
  docker compose -f docker/docker-compose.yml exec -T db \
    psql -U postgres -d postgres < "$f"
done
```

### 8. Verificar

```bash
docker compose ps
docker compose logs --tail=30 video-worker   # debe decir "LISTENING video_jobs"
docker compose logs --tail=20 functions      # debe arrancar sin import errors
```

Abre `https://api.tu-dominio.mx` — Studio debe responder.

## Operación

```bash
# arrancar
docker compose up -d

# detener
docker compose stop

# logs en vivo de un servicio
docker compose logs -f video-worker

# rebuild del worker tras editar src/
docker compose build --no-cache video-worker
docker compose up -d --force-recreate video-worker

# aplicar una nueva migración
docker compose exec -T db psql -U postgres -d postgres \
  < ../supabase/migrations/017_propagate_duracion.sql

# deploy de funciones (las funciones están bind-mounted desde docker/volumes/functions/
# que a su vez es donde viven en este repo, así que git pull + restart basta)
docker compose restart functions
```

## Variables críticas

| Var                                                  | Por qué                                          | Valor mínimo                      |
| ---------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| `FILE_SIZE_LIMIT` (hardcoded en compose, línea ~388) | Sin esto los uploads >50 MB fallan               | `5368709120` (5 GB)               |
| `SUPABASE_PUBLIC_URL`                                | Las funciones HLS reescriben URLs con este valor | tu dominio HTTPS público          |
| `JWT_SECRET`                                         | Firma de tokens                                  | 32 bytes random                   |
| `MAX_CONCURRENT` (video-worker)                      | Cuántos transcodes en paralelo                   | `1` (2 vCPU); subir si tienes más |

## Diferencias con upstream Supabase

Este compose añade sobre el `docker-compose.yml` de `supabase/docker`:

1. Servicio `video-worker` con build a `../services/video-worker`.
2. `storage:` con `FILE_SIZE_LIMIT: 5368709120` en lugar de 50 MB default.
3. `functions:` con `SUPABASE_PUBLIC_URL` añadida (ya viene en upstream
   reciente pero la dejo explícita).

Todo lo demás es upstream tal cual.

## Troubleshooting

| Síntoma                                         | Causa típica                     | Fix                                             |
| ----------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Upload se cuelga >100 MB                        | nginx delante no permite tamaño  | bump `client_max_body_size`                     |
| Upload 413 "Maximum size exceeded"              | `FILE_SIZE_LIMIT` del storage    | bump en `.env` y `docker compose up -d storage` |
| WebSocket falla                                 | Reverse proxy no permite Upgrade | agregar `Connection: upgrade`                   |
| HLS player carga URL con `kong:8000`            | `SUPABASE_PUBLIC_URL` no está    | setear en `.env` + restart `functions`          |
| Worker dice "LISTENING" pero no transcodifica   | NOTIFY no propagó                | revisar trigger `videos_notify`                 |
| Migración 016 falla con "policy already exists" | Reaplicación parcial             | inofensivo, ya estaba creada                    |
