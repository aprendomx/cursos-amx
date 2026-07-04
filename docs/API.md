# API REST — Especificación OpenAPI 3.0

> **Estado:** Documentación de referencia. Los endpoints listados son los que expone PostgREST (REST API de Supabase) y las Edge Functions Deno.

## Base URL

```
https://api.tu-dominio.mx/rest/v1          # PostgREST
https://api.tu-dominio.mx/functions/v1     # Edge Functions
```

## Autenticación

Todas las peticiones requieren:

- Header `apikey: <ANON_KEY>`
- Header `Authorization: Bearer <JWT>` (obtenido vía Supabase Auth)

## Endpoints de Recursos (PostgREST)

### Cursos

```
GET    /cursos?select=*&publicado=eq.true&order=creado_en.desc
GET    /cursos?select=*&slug=eq.{slug}&limit=1
POST   /cursos
PATCH  /cursos?id=eq.{id}
DELETE /cursos?id=eq.{id}
```

**Schema:**

```yaml
Curso:
  type: object
  properties:
    id:         { type: string, format: uuid }
    slug:       { type: string, unique: true }
    titulo:     { type: string }
    descripcion:{ type: string }
    imagen_portada: { type: string, nullable: true }
    nivel:      { type: string, enum: [Fundamental, Intermedio, Avanzado] }
    duracion_min:{ type: integer, default: 0 }
    publicado:  { type: boolean, default: false }
    creado_en:  { type: string, format: date-time }
```

### Módulos

```
GET    /modulos?select=*&curso_id=eq.{cursoId}&order=orden
POST   /modulos
PATCH  /modulos?id=eq.{id}
DELETE /modulos?id=eq.{id}
```

### Lecciones

```
GET    /lecciones?select=*&modulo_id=eq.{moduloId}&order=orden
POST   /lecciones
PATCH  /lecciones?id=eq.{id}
DELETE /lecciones?id=eq.{id}
```

### Inscripciones

```
GET    /inscripciones?select=*&user_id=eq.{userId}
POST   /inscripciones
DELETE /inscripciones?id=eq.{id}
```

### Progreso

```
GET    /progreso?select=*&user_id=eq.{userId}&leccion_id=eq.{leccionId}
POST   /progreso
PATCH  /progreso?id=eq.{id}
```

### Perfiles

```
GET    /perfiles?select=*&id=eq.{userId}
PATCH  /perfiles?id=eq.{userId}
```

### Constancias

```
GET    /constancias?select=*&user_id=eq.{userId}
GET    /constancias?select=*&folio=eq.{folio}
```

## Edge Functions

### `hls-playlist-url`

```
POST /functions/v1/hls-playlist-url
Content-Type: application/json
Authorization: Bearer <JWT>
```

**Request:**

```json
{ "video_id": "uuid-del-video" }
```

**Response:**

```json
{
  "master_url": "https://api.../functions/v1/hls-playlist?video=...&path=master.m3u8&t=...",
  "poster_url": "https://cdn.../signed-poster.jpg",
  "duracion_seg": 3600,
  "expires_in": 14400
}
```

### `hls-playlist`

```
GET /functions/v1/hls-playlist?video={videoId}&path=master.m3u8&t={jwt}
```

**Response:** `application/vnd.apple.mpegurl` (archivo `.m3u8` con URLs firmadas por segmento)

### `documento-url`

```
POST /functions/v1/documento-url
Content-Type: application/json
Authorization: Bearer <JWT>
```

**Request:**

```json
{ "path": "lesson-docs/abc123.pdf" }
```

**Response:**

```json
{ "signed_url": "https://cdn.../signed.pdf?token=...", "expires_in": 3600 }
```

### `admin-set-password`

```
POST /functions/v1/admin-set-password
Content-Type: application/json
Authorization: Bearer <JWT>
```

**Request:**

```json
{ "user_id": "uuid", "password": "nueva-contraseña" }
```

**Response:** `204 No Content` o `403` si no es admin.

## RPC (Funciones PostgreSQL)

### `obtener_evaluacion`

```
POST /rest/v1/rpc/obtener_evaluacion
```

**Request:**

```json
{ "p_leccion": "uuid-leccion" }
```

**Response:** JSON con preguntas, opciones, config de evaluación e intentos usados.

### `calificar_evaluacion`

```
POST /rest/v1/rpc/calificar_evaluacion
```

**Request:**

```json
{ "p_leccion": "uuid-leccion", "p_respuestas": { "pregunta-id": ["opcion-id"] } }
```

**Response:** JSON con puntaje, aprobado, número de intento e intentos restantes.

### `marcar_leccion_completada`

```
POST /rest/v1/rpc/marcar_leccion_completada
```

**Request:**

```json
{ "p_leccion_id": "uuid-leccion" }
```

**Response:** `true` o excepción si ya estaba completada.

### `get_video_playback`

```
POST /rest/v1/rpc/get_video_playback
```

**Request:**

```json
{ "p_video_id": "uuid-video" }
```

**Response:** JSON con `hls_path`, `poster_path`, `duracion_seg`.

### `esta_inscrito`

```
POST /rest/v1/rpc/esta_inscrito
```

**Request:**

```json
{ "p_curso_id": "uuid-curso" }
```

**Response:** `true` / `false`

## Rate Limiting

Todas las Edge Functions implementan rate limiting:

- 100 requests/min por IP
- Headers de respuesta: `X-RateLimit-Remaining`, `Retry-After`

## Errores comunes

| Status | Código              | Significado                                     |
| ------ | ------------------- | ----------------------------------------------- |
| 401    | `jwt_invalid`       | Sesión expirada o token inválido                |
| 403    | `rls_violation`     | Permisos insuficientes (no admin / no inscrito) |
| 404    | `not_found`         | Recurso no existe                               |
| 409    | `23505`             | Violación de unicidad (slug duplicado, etc.)    |
| 429    | `too_many_requests` | Rate limit excedido                             |
| 500    | `internal`          | Error del servidor                              |

## Generación de cliente

Puedes generar un cliente TypeScript automáticamente desde el esquema de Supabase:

```bash
npx openapi-typescript https://api.tu-dominio.mx/rest/v1/?apikey=ANON_KEY --output types/supabase.ts
```

Este archivo de tipos puede usarse con `supabase-js` para autocompletado de tablas y columnas.
