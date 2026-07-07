# Fase G: PWA y Offline — Design Spec

> **Fecha:** 2026-07-07
> **Versión target:** v0.9.0
> **Estado:** Aprobado

---

## Resumen

Implementar experiencia offline completa para Cursos AMX: cacheo de contenido (lecciones, videos HLS), cola de sincronización de acciones (evaluaciones, foros, entregas, progreso), y notificaciones push. Estrategia híbrida: VitePWA para precache de assets + módulos custom para IndexedDB y sync.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  VitePWA (sin tocar)                                        │
│  • Precache de assets build (JS/CSS/HTML/icons)             │
│  • Manifest PWA                                             │
│  • Auto-update del SW                                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Módulos Custom Offline (src/offline/)                      │
│  • offline-db.ts      → IndexedDB (lecciones, videos, cola) │
│  • sync-queue.ts      → Cola de acciones pendientes         │
│  • network-status.ts  → Detector online/offline             │
│  • video-cache.ts     → Cache de segmentos HLS              │
│  • push-notifications.ts → Suscripción y recepción          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Service Worker Custom (sw-offline.ts)                      │
│  • Intercepta fetches de API y contenido                    │
│  • Sirve desde IndexedDB cuando offline                     │
│  • Trigger de background sync                               │
│  • Se inyecta ADEMÁS del SW de VitePWA                      │
└─────────────────────────────────────────────────────────────┘
```

**Principio:** VitePWA maneja assets estáticos. Nuestros módulos manejan datos dinámicos (contenido de cursos, videos, acciones del usuario). No hay conflicto.

---

## Alcance

### Incluido

- Cacheo de lecciones (texto/contenido) en IndexedDB
- Cacheo de videos HLS (playlist + segmentos) con descarga proactiva y política LRU
- Cola de sincronización offline para: evaluaciones, foros, entregas, progreso
- Detector de estado de red con confirmación real (ping)
- Notificaciones push (Web Push API)
- Feature flags para todo el módulo
- Tests unitarios e integración

### Excluido

- SCORM/LTI (Fase A del roadmap antiguo)
- Cacheo de documentos PDF grandes (>50MB)
- Sincronización bidireccional de foros (solo escritura offline, lectura cacheada)
- Edición de contenido por instructores offline

---

## Módulos

### `offline-db.ts`

Capa de acceso a IndexedDB. Usa librería `idb` (~1KB gzip).

**Stores:**

| Store           | Key                           | Campos                                                              |
| --------------- | ----------------------------- | ------------------------------------------------------------------- |
| `content`       | `leccionId`                   | `data: JSON`, `cachedAt: Date`, `contentType: 'text' \| 'video'`    |
| `videos`        | `videoId`                     | `leccionId`, `playlistUrl`, `totalSize`, `cachedAt`, `lastPlayed`   |
| `videoSegments` | `segmentId` (videoId + index) | `videoId`, `index`, `blob: ArrayBuffer`, `size`                     |
| `syncQueue`     | `id` (auto-increment)         | `type`, `payload`, `status`, `retries`, `createdAt`, `errorMessage` |
| `settings`      | `key`                         | `value`                                                             |

**API pública:**

- `openDB()` — Inicializa/abre la base de datos, maneja migraciones de versión
- `saveContent(leccionId, data, contentType)` — Guarda contenido de lección
- `getContent(leccionId)` — Recupera contenido
- `deleteContent(leccionId)` — Elimina contenido
- `saveVideoMetadata(videoId, metadata)` — Guarda metadatos de video
- `getVideoMetadata(videoId)` — Recupera metadatos
- `saveSegment(videoId, index, blob)` — Guarda segmento .ts
- `getSegment(videoId, index)` — Recupera segmento
- `deleteVideo(videoId)` — Elimina video y todos sus segmentos
- `getUsedSpace()` — Suma totalSize de videos + tamaño de segments
- `saveSyncAction(action)` — Guarda acción en cola
- `getPendingActions()` — Lista acciones con status 'pending'
- `updateSyncAction(id, updates)` — Actualiza estado de acción
- `deleteSyncAction(id)` — Elimina acción (cuando está 'done')
- `getSetting(key)`, `setSetting(key, value)` — Configuración

### `video-cache.ts`

Gestiona descarga, almacenamiento y evicción de videos HLS.

**Política:**

- LRU (Least Recently Used) por campo `lastPlayed`
- Límite de espacio configurable (default 2GB = 2 _ 1024 _ 1024 \* 1024 bytes)
- Antes de descargar un video nuevo, verifica si hay espacio suficiente
- Si no hay espacio, elimina videos hasta liberar el 120% del espacio necesario (margen de seguridad)

**Flujo de descarga:**

1. Obtener URL del playlist `.m3u8` de la lección
2. Descargar playlist, parsear lista de segmentos
3. Descargar cada segmento `.ts` como ArrayBuffer
4. Guardar metadatos en `videos` y blobs en `videoSegments`
5. Actualizar barra de progreso UI

**Flujo de reproducción offline:**

1. hls.js solicita playlist URL
2. `video-cache` intercepta, devuelve playlist desde IndexedDB (o fetch si online)
3. hls.js solicita segmento N
4. `video-cache` devuelve blob desde IndexedDB (o fetch si online)

**API pública:**

- `downloadVideo(videoId, leccionId, onProgress)` — Descarga video completo
- `deleteVideo(videoId)` — Elimina video y libera espacio
- `isVideoAvailable(videoId)` — Verifica si está completamente cacheado
- `getPlaylist(videoId)` — Devuelve playlist para hls.js
- `getSegment(videoId, index)` — Devuelve blob de segmento
- `getCacheStats()` — Espacio usado, disponible, videos cacheados

### `sync-queue.ts`

Cola de acciones del usuario que requieren servidor.

**Tipos de acción:**

| Tipo                | Payload                                     | Endpoint                           |
| ------------------- | ------------------------------------------- | ---------------------------------- |
| `quiz_submit`       | `{ leccionId, respuestas, tiempoSegundos }` | `POST /evaluaciones/{id}/intentos` |
| `forum_post`        | `{ temaId, contenido, parentId? }`          | `POST /foros/comentarios`          |
| `assignment_submit` | `{ leccionId, archivoBlob?, notas? }`       | `POST /entregas`                   |
| `progress_update`   | `{ leccionId, completado, segundosVistos }` | `POST /progreso`                   |

**Estados:**

- `pending` — Creada, esperando sync
- `syncing` — Enviando al servidor
- `done` — Sincronizada exitosamente
- `error` — Falló después de max retries o error de validación

**Algoritmo de sync:**

1. Detectar evento `online` o background sync trigger
2. Obtener acciones `pending`, ordenadas por `createdAt` (FIFO)
3. Para cada acción:
   - Marcar como `syncing`
   - Enviar a API
   - Si éxito (2xx): marcar `done`, eliminar
   - Si error de red: incrementar `retries`, mantener `pending`, calcular próximo retry con backoff
   - Si error de validación (4xx): marcar `error`, no reintentar, notificar usuario
4. Backoff exponencial: `delay = min(2^retries * 1000ms, 30000ms)`
5. Max retries: 5

**API pública:**

- `enqueue(type, payload)` — Agrega acción a la cola
- `sync()` — Fuerza sincronización manual
- `getQueue()` — Lista todas las acciones
- `clearDone()` — Elimina acciones completadas
- `retryFailed()` — Reintenta acciones en `error` (solo errores de red, no validación)

### `network-status.ts`

Detector de conectividad.

**Lógica:**

- Inicial: `navigator.onLine`
- Confirmación: ping periódico a `GET /health` (endpoint ligero, ~200 bytes)
- Ping cada 30 segundos cuando online, cada 5 segundos cuando parece offline
- Considera offline real si 3 pings consecutivos fallan
- Expone `isOnline: Ref<boolean>` reactivo

**Eventos:**

- Emite `online` cuando pasa de offline → online
- Emite `offline` cuando pasa de online → offline
- Componentes Vue se suscriben al ref

**API pública:**

- `isOnline` — Ref reactivo
- `onOnline(callback)` — Listener para evento online
- `onOffline(callback)` — Listener para evento offline
- `checkNow()` — Fuerza ping inmediato

### `push-notifications.ts`

Notificaciones push vía Web Push API.

**Flujo de suscripción:**

1. Verificar permiso (`Notification.permission`)
2. Si no concedido, solicitar (`Notification.requestPermission()`)
3. Obtener subscription desde PushManager
4. Enviar subscription a Supabase (`push_subscriptions` table)
5. Guardar localmente para no re-suscribir

**Recepción:**

- Service Worker escucha evento `push`
- Muestra notificación con `self.registration.showNotification(title, options)`
- Al hacer click, navega a la URL correspondiente

**Tipos de notificación:**

- `task_reminder` — Tarea próxima a vencer
- `forum_reply` — Nueva respuesta en foro
- `course_unlocked` — Curso/módulo desbloqueado
- `sync_completed` — Cola de sync finalizada

**API pública:**

- `requestPermission()` — Solicita permiso de notificaciones
- `subscribe()` — Se suscribe a push
- `unsubscribe()` — Cancela suscripción
- `isSubscribed()` — Verifica estado

---

## Service Worker Custom

**Enfoque:** Un solo SW que extiende VitePWA. Creamos `src/sw.js` como service worker custom; VitePWA inyecta automáticamente el manifest de precache en él.

**Configuración en `vite.config.js`:**

```js
VitePWA({
  // ...config existente...
  srcDir: 'src',
  filename: 'sw.js',
  strategies: 'injectManifest',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  },
})
```

**`src/sw.js`:**

```js
import { precacheAndRoute } from 'workbox-precaching'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { registerRoute } from 'workbox-routing'

// VitePWA inyecta el precache manifest aquí
precacheAndRoute(self.__WB_MANIFEST)

// Evento sync (background sync)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue())
  }
})

// Evento push
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192x192.png',
      data: data.url,
    })
  )
})

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data || '/'))
})

// Función syncQueue: se comunica con IndexedDB vía postMessage
// o usa un import dinámico del módulo de sync
async function syncQueue() {
  // Implementación en el plan
}
```

**Nota:** Los módulos `offline-db`, `video-cache` y `sync-queue` viven en el **thread principal** (no en el SW). El SW se comunica con ellos vía `postMessage` o usa import dinámico si el bundler lo soporta.

**Eventos:**

### `fetch` — Interceptación de requests

- Si offline y request es API de contenido (`/rest/v1/lecciones`, etc.):
  - Buscar en IndexedDB (`offline-db`)
  - Si existe: devolver Response con datos cacheados
  - Si no existe: devolver 503 con mensaje "No disponible offline"
- Si offline y request es video HLS:
  - `.m3u8`: buscar en `video-cache`, devolver como `text/plain`
  - `.ts`: buscar segmento en `videoSegments`, devolver como `video/mp2t`
- Si online: passthrough normal (no interceptamos)

### `sync` — Background Sync

- Escucha evento `sync` con tag `'sync-queue'`
- Envia `postMessage` al cliente principal para que `sync-queue.ts` procese la cola
- Fallback: si browser no soporta sync, `network-status.ts` usa polling cada 30s

### `push` — Notificaciones push

- Escucha evento `push`
- Parsea payload JSON
- Llama `self.registration.showNotification()`

### `notificationclick` — Click en notificación

- Escucha evento `notificationclick`
- Abre/focus ventana con URL del payload
- Cierra notificación

---

## UI / UX

### Indicador de estado de red

- Banner fino en la parte superior de la app cuando está offline
- Color: naranja (`--warning`), texto: "Modo offline — Tus acciones se guardarán y sincronizarán al reconectar"
- Se oculta automáticamente al volver online

### Botón "Descargar para offline"

- Ubicación: en cada lección del player (icono de descarga)
- Estados: `idle` → `downloading` (con progreso %) → `cached` (check verde) → `error`
- Click en `cached`: opción "Eliminar de offline" para liberar espacio

### Panel de estado offline

- Ubicación: Perfil del usuario → "Estado offline"
- Muestra: espacio usado/disponible, lista de videos cacheados, acciones pendientes de sync
- Botón "Sincronizar ahora" (solo cuando online)

### Toast de sync

- Cuando se guarda una acción offline: "Guardado localmente. Se sincronizará al reconectar."
- Cuando completa sync: "Sincronización completada: X acciones enviadas"
- Cuando hay errores: "X acciones no pudieron sincronizarse. Revisa en Perfil > Estado offline"

---

## Schema de Supabase

### `push_subscriptions`

```sql
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
```

### Migración `047_pwa_offline.sql`

```sql
-- Feature flags
insert into public.feature_toggles (key, enabled)
values
  ('pwa_offline', false),
  ('offline_video_cache', false),
  ('offline_sync', false),
  ('push_notifications', false)
on conflict (key) do nothing;

-- Tabla de suscripciones push
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- RLS
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

---

## Feature Flags

| Flag                  | Descripción                          | Default |
| --------------------- | ------------------------------------ | ------- |
| `pwa_offline`         | Activa toda la funcionalidad offline | `false` |
| `offline_video_cache` | Cacheo de videos HLS                 | `false` |
| `offline_sync`        | Cola de sincronización de acciones   | `false` |
| `push_notifications`  | Notificaciones push                  | `false` |

---

## Dependencias

- `idb` (^8.0.0) — Wrapper de IndexedDB
- `vite-plugin-pwa` (ya existe) — Sin cambios
- `hls.js` (ya existe) — Sin cambios

---

## Testing

### Unit tests

- `offline-db.test.ts` — CRUD en IndexedDB, migraciones, espacio
- `video-cache.test.ts` — Descarga, LRU, evicción, reproducción
- `sync-queue.test.ts` — FIFO, retry, backoff, manejo de errores
- `network-status.test.ts` — Detección de online/offline

### Integration tests

- Simular `navigator.onLine = false`
- Verificar que sync queue guarda acciones sin enviar
- Reconectar y verificar sync automático

### E2E tests

- Playwright: desconectar red, navegar curso cacheado, responder quiz, reconectar, verificar sync

---

## Métricas de éxito

1. Lighthouse PWA score >90 en móvil
2. Video de 10 min reproducible offline después de descargarlo
3. Evaluación respondida offline se sincroniza en <5s al reconectar
4. 50MB de contenido cacheado ocupa <60MB en IndexedDB (overhead aceptable)
5. Notificación push recibida en <10s desde el trigger del servidor

---

## Riesgos y mitigaciones

| Riesgo                                            | Mitigación                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| IndexedDB no disponible en modo privado de Safari | Fallback a localStorage para sync queue (muy limitado). Mostrar warning.          |
| Espacio insuficiente en dispositivo del usuario   | LRU agresivo, límite configurable, UI de gestión de espacio                       |
| Sync de acciones en orden incorrecto              | FIFO estricto, cada acción tiene timestamp. Si una falla, las siguientes esperan. |
| Conflicto entre dos SW (VitePWA + custom)         | Un solo SW: extender el de VitePWA con event listeners adicionales                |
| Videos HLS consumen demasiado espacio             | Límite de 2GB default, compresión de segmentos no aplicable (son ya comprimidos)  |
| Background sync no soportado en iOS               | Fallback a polling cada 30s cuando la app está activa                             |

---

## Archivos nuevos

```
src/
  offline/
    offline-db.ts
    video-cache.ts
    sync-queue.ts
    network-status.ts
    push-notifications.ts
    types.ts
  composables/
    useOffline.ts
    useSyncStatus.ts
    useVideoCache.ts
  components/
    OfflineBanner.vue
    OfflineStatusPanel.vue
    DownloadButton.vue
    SyncToast.vue
  services/
    __tests__/
      offline-db.test.ts
      video-cache.test.ts
      sync-queue.test.ts
      network-status.test.ts
  lib/
    featureFlags.ts  (modificar)

supabase/
  migrations/
    047_pwa_offline.sql
  functions/
    push-notify/
      index.ts

src/
  sw.js  (service worker custom, VitePWA inyecta precache manifest)
```

---

_Spec aprobado. Listo para implementation plan._
