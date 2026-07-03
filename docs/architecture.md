# Arquitectura

Documentación técnica de alto nivel del frontend de CONASAMA.

## Stack

| Capa           | Tecnología                                |
| -------------- | ----------------------------------------- |
| Framework      | Vue 3 (Composition API, `<script setup>`) |
| Build tool     | Vite 6                                    |
| Routing        | Vue Router 4 (hash mode)                  |
| State          | Pinia 3                                   |
| Testing        | Vitest + Vue Test Utils + Playwright      |
| Lint/Format    | ESLint 9 + Prettier + husky               |
| PWA            | vite-plugin-pwa                           |
| Error tracking | Sentry (opcional)                         |

## Estructura de directorios

```
src/
  pages/           Vistas completas (rutas)
  components/      Componentes reutilizables
  composables/     Lógica reutilizable sin estado propio
  stores/          Stores Pinia (auth, ui)
  services/        Lógica de acceso a datos (Supabase)
  router/          Configuración de rutas + guards
  lib/             Clientes y helpers de bajo nivel
  assets/          CSS global, imágenes, fuentes
```

## Routing

Hash mode para compatibilidad con deploys estáticos. Lazy loading de páginas pesadas:

```js
// src/router/index.js
{
  path: '/admin',
  name: 'admin',
  component: () => import('@/pages/AdminPage.vue'),
}
```

Guards en `src/router/guards.js` verifican autenticación y roles antes de entrar a rutas protegidas.

## State management

Dos stores Pinia:

- **`useAuthStore`** (`src/stores/auth.js`): session de Supabase, perfil del usuario, helpers `isAdmin` / `isInstructor`. Persiste en `localStorage`.
- **`useUiStore`** (`src/stores/ui.js`): estado transitorio de UI (toasts, panels, modales).

No usar `provide/inject` para estado compartido; usar siempre Pinia.

## Data layer

### Servicios

Agrupados por dominio en `src/services/*.js`. Ejemplo: `cursos.js`, `progreso.js`, `evaluaciones.js`.

### Cache SWR

El composable `withCache` (`src/composables/cache.js`) envuelve funciones async para cachear resultados en memoria durante 60 segundos (default). Si el fetch falla, devuelve datos stale.

```js
export const fetchCursos = withCache(_fetchCursos, () => 'cursos:list')
```

Las funciones de mutación (crear, actualizar, borrar) invalidan el cache automáticamente:

```js
await crearCurso(data)
invalidateCache(/^cursos:/)
```

### Supabase client

`src/lib/supabase.js` exporta el cliente inicializado. `src/lib/sbRest.js` contiene helpers REST directos para casos donde `supabase-js` tiene problemas (ej. auth refresh en self-hosted).

## Video

Flujo HLS:

1. Admin sube `.mp4` → Supabase Storage (`video-ingest`)
2. Trigger Postgres inserta fila en `public.videos` con `status='pending'` y emite `NOTIFY video_jobs`
3. `video-worker` (sidecar Node + ffmpeg) escucha la notificación, transcodifica a HLS ABR (360p/720p/1080p) y sube a `video-hls`
4. Edge Function `hls-playlist-url` genera URLs firmadas para el master playlist
5. Edge Function `hls-playlist` reescribe el manifiesto con signed URLs frescas para cada segmento

El player usa `hls.js` en el frontend.

## Edge Functions

Todas las Edge Functions (Deno) usan rate limiting compartido (`supabase/functions/_shared/rateLimit.ts`) con headers `X-RateLimit-Remaining` y `Retry-After`.

## PWA

`vite-plugin-pwa` genera:

- `manifest.webmanifest` con iconos y tema
- Service Worker con precache de assets estáticos
- Runtime cache de fuentes Google (CacheFirst, 1 año)

## Seguridad

- RLS (Row Level Security) en todas las tablas de Postgres
- Edge Functions re-autorizan al usuario en cada request (no confían en el cliente)
- `video-worker` usa `SERVICE_ROLE_KEY` solo para operaciones internas (download/upload de Storage)
- Rate limiting en Edge Functions: 100 req/min por IP
