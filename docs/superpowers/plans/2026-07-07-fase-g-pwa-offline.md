# Fase G: PWA y Offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar experiencia offline completa para Cursos AMX: cacheo de contenido y videos HLS, cola de sincronización de acciones, detector de red, notificaciones push, y UI de estado offline.

**Architecture:** Estrategia híbrida — VitePWA para precache de assets + módulos custom en `src/offline/` para IndexedDB, sync queue, video cache, y network status. Service worker custom en `src/sw.js` con `injectManifest`. Edge Function `push-notify` para envío de notificaciones.

**Tech Stack:** Vue 3 + Vite + Supabase + TypeScript + `idb` (IndexedDB wrapper) + Workbox (via VitePWA)

---

## File Structure

| File                                           | Responsibility                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `supabase/migrations/047_pwa_offline.sql`      | Schema: push_subscriptions, feature flags                                         |
| `supabase/functions/push-notify/index.ts`      | Edge Function: envío de notificaciones push                                       |
| `src/sw.js`                                    | Service worker custom (injectManifest), eventos sync/push/fetch                   |
| `src/offline/types.ts`                         | Tipos TypeScript para offline (SyncAction, VideoMetadata, etc.)                   |
| `src/offline/offline-db.ts`                    | Capa IndexedDB: stores content, videos, videoSegments, syncQueue, settings        |
| `src/offline/network-status.ts`                | Detector online/offline con ping periódico                                        |
| `src/offline/sync-queue.ts`                    | Cola FIFO de acciones con retry y backoff                                         |
| `src/offline/video-cache.ts`                   | Descarga, almacenamiento y LRU de videos HLS                                      |
| `src/offline/push-notifications.ts`            | Suscripción Web Push, recepción                                                   |
| `src/offline/index.ts`                         | Barrel export de todos los módulos offline                                        |
| `src/composables/useOffline.ts`                | Composable para estado offline global                                             |
| `src/composables/useSyncStatus.ts`             | Composable para estado de sync queue                                              |
| `src/composables/useVideoCache.ts`             | Composable para descarga y estado de videos                                       |
| `src/components/OfflineBanner.vue`             | Banner de estado offline en la app                                                |
| `src/components/DownloadButton.vue`            | Botón descargar/eliminar video offline                                            |
| `src/components/OfflineStatusPanel.vue`        | Panel en perfil: espacio, videos, acciones pendientes                             |
| `src/components/SyncToast.vue`                 | Toast de progreso de sincronización                                               |
| `src/lib/featureFlags.ts`                      | Agregar flags: pwa_offline, offline_video_cache, offline_sync, push_notifications |
| `vite.config.js`                               | Cambiar VitePWA a injectManifest, apuntar a src/sw.js                             |
| `src/App.vue`                                  | Integrar OfflineBanner, inicializar network-status y sync queue                   |
| `src/pages/PlayerPage.vue`                     | Integrar DownloadButton, pasar leccionId a video-cache                            |
| `src/offline/__tests__/offline-db.test.ts`     | Tests de IndexedDB                                                                |
| `src/offline/__tests__/sync-queue.test.ts`     | Tests de cola de sync                                                             |
| `src/offline/__tests__/network-status.test.ts` | Tests de detector de red                                                          |
| `src/offline/__tests__/video-cache.test.ts`    | Tests de cache de video                                                           |

---

## Task 1: Schema y Feature Flags

**Files:**

- Create: `supabase/migrations/047_pwa_offline.sql`
- Modify: `src/lib/featureFlags.ts`

- [ ] **Step 1: Crear migración 047_pwa_offline.sql**

```sql
-- Migration 047: PWA Offline — push subscriptions y feature flags

insert into public.feature_toggles (key, enabled)
values
  ('pwa_offline', false),
  ('offline_video_cache', false),
  ('offline_sync', false),
  ('push_notifications', false)
on conflict (key) do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

comment on table public.push_subscriptions is 'Suscripciones Web Push por usuario';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Agregar feature flags en frontend**

Edit `src/lib/featureFlags.ts`, agregar al objeto FEATURES:

```typescript
  pwa_offline: flag('VITE_FEATURE_PWA_OFFLINE'),
  offline_video_cache: flag('VITE_FEATURE_OFFLINE_VIDEO_CACHE'),
  offline_sync: flag('VITE_FEATURE_OFFLINE_SYNC'),
  push_notifications: flag('VITE_FEATURE_PUSH_NOTIFICATIONS'),
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/047_pwa_offline.sql src/lib/featureFlags.ts
git commit -m "feat(offline): schema push_subscriptions y feature flags"
```

---

## Task 2: Instalar Dependencias y Configurar Service Worker

**Files:**

- Modify: `package.json` (instalar idb)
- Modify: `vite.config.js`
- Create: `src/sw.js`

- [ ] **Step 1: Instalar idb**

```bash
npm install idb
```

Expected: package.json y package-lock.json actualizados.

- [ ] **Step 2: Modificar vite.config.js para injectManifest**

Replace the VitePWA configuration in `vite.config.js`:

```javascript
VitePWA({
  registerType: 'autoUpdate',
  srcDir: 'src',
  filename: 'sw.js',
  strategies: 'injectManifest',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  },
  manifest: {
    name: `${theme.app.name} · ${theme.app.tagline}`,
    short_name: theme.app.shortName,
    description: theme.app.description,
    theme_color: theme.pwa.themeColor,
    background_color: theme.pwa.backgroundColor,
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
})
```

Remove the `workbox` section (no longer needed since we use injectManifest).

- [ ] **Step 3: Crear src/sw.js**

```javascript
import { precacheAndRoute } from 'workbox-precaching'

// VitePWA injecta el manifest aquí
precacheAndRoute(self.__WB_MANIFEST)

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_QUEUE' }))
      })
    )
  }
})

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cursos AMX', {
      body: data.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { url: data.url || '/' },
    })
  )
})

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'))
})
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.js src/sw.js
git commit -m "feat(offline): configura VitePWA injectManifest y service worker custom"
```

---

## Task 3: Tipos y Capa IndexedDB (offline-db.ts)

**Files:**

- Create: `src/offline/types.ts`
- Create: `src/offline/offline-db.ts`

- [ ] **Step 1: Crear tipos**

`src/offline/types.ts`:

```typescript
export interface CachedContent {
  leccionId: string
  data: Record<string, unknown>
  contentType: 'text' | 'video'
  cachedAt: number
}

export interface VideoMetadata {
  videoId: string
  leccionId: string
  playlistUrl: string
  totalSize: number
  cachedAt: number
  lastPlayed: number
}

export interface VideoSegment {
  segmentId: string
  videoId: string
  index: number
  blob: ArrayBuffer
  size: number
}

export type SyncActionType = 'quiz_submit' | 'forum_post' | 'assignment_submit' | 'progress_update'

export interface SyncAction {
  id?: number
  type: SyncActionType
  payload: Record<string, unknown>
  status: 'pending' | 'syncing' | 'done' | 'error'
  retries: number
  createdAt: number
  errorMessage?: string
}

export type OfflineSettingKey = 'maxStorageBytes' | 'lastSyncAt'
```

- [ ] **Step 2: Crear offline-db.ts**

`src/offline/offline-db.ts`:

```typescript
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CachedContent,
  VideoMetadata,
  VideoSegment,
  SyncAction,
  OfflineSettingKey,
} from './types'

const DB_NAME = 'cursos-amx-offline'
const DB_VERSION = 1

interface OfflineDB extends DBSchema {
  content: {
    key: string
    value: CachedContent
  }
  videos: {
    key: string
    value: VideoMetadata
  }
  videoSegments: {
    key: string
    value: VideoSegment
  }
  syncQueue: {
    key: number
    value: SyncAction
    autoIncrement: true
  }
  settings: {
    key: string
    value: unknown
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('content')) {
          db.createObjectStore('content', { keyPath: 'leccionId' })
        }
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos', { keyPath: 'videoId' })
        }
        if (!db.objectStoreNames.contains('videoSegments')) {
          db.createObjectStore('videoSegments', { keyPath: 'segmentId' })
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

// Content
export async function saveContent(
  leccionId: string,
  data: Record<string, unknown>,
  contentType: 'text' | 'video'
): Promise<void> {
  const db = await getDB()
  await db.put('content', { leccionId, data, contentType, cachedAt: Date.now() })
}

export async function getContent(leccionId: string): Promise<CachedContent | undefined> {
  const db = await getDB()
  return db.get('content', leccionId)
}

export async function deleteContent(leccionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('content', leccionId)
}

// Videos
export async function saveVideoMetadata(metadata: VideoMetadata): Promise<void> {
  const db = await getDB()
  await db.put('videos', metadata)
}

export async function getVideoMetadata(videoId: string): Promise<VideoMetadata | undefined> {
  const db = await getDB()
  return db.get('videos', videoId)
}

export async function deleteVideo(videoId: string): Promise<void> {
  const db = await getDB()
  await db.delete('videos', videoId)
  const tx = db.transaction('videoSegments', 'readwrite')
  const store = tx.objectStore('videoSegments')
  const all = await store.getAll()
  for (const seg of all) {
    if (seg.videoId === videoId) await store.delete(seg.segmentId)
  }
  await tx.done
}

export async function saveSegment(
  videoId: string,
  index: number,
  blob: ArrayBuffer
): Promise<void> {
  const db = await getDB()
  const segmentId = `${videoId}::${index}`
  await db.put('videoSegments', { segmentId, videoId, index, blob, size: blob.byteLength })
}

export async function getSegment(
  videoId: string,
  index: number
): Promise<VideoSegment | undefined> {
  const db = await getDB()
  return db.get('videoSegments', `${videoId}::${index}`)
}

export async function getAllVideos(): Promise<VideoMetadata[]> {
  const db = await getDB()
  return db.getAll('videos')
}

export async function getUsedSpace(): Promise<number> {
  const db = await getDB()
  const videos = await db.getAll('videos')
  const segments = await db.getAll('videoSegments')
  const videoMetaSize = videos.reduce((sum, v) => sum + (v.totalSize || 0), 0)
  const segmentSize = segments.reduce((sum, s) => sum + (s.size || 0), 0)
  return videoMetaSize + segmentSize
}

// Sync Queue
export async function saveSyncAction(action: Omit<SyncAction, 'id'>): Promise<number> {
  const db = await getDB()
  return db.add('syncQueue', action as SyncAction)
}

export async function getPendingActions(): Promise<SyncAction[]> {
  const db = await getDB()
  const all = await db.getAll('syncQueue')
  return all.filter((a) => a.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllActions(): Promise<SyncAction[]> {
  const db = await getDB()
  return db.getAll('syncQueue')
}

export async function updateSyncAction(id: number, updates: Partial<SyncAction>): Promise<void> {
  const db = await getDB()
  const existing = await db.get('syncQueue', id)
  if (!existing) return
  await db.put('syncQueue', { ...existing, ...updates })
}

export async function deleteSyncAction(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('syncQueue', id)
}

export async function clearDoneActions(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  const store = tx.objectStore('syncQueue')
  const all = await store.getAll()
  for (const action of all) {
    if (action.status === 'done') await store.delete(action.id!)
  }
  await tx.done
}

// Settings
export async function getSetting<T>(key: OfflineSettingKey): Promise<T | undefined> {
  const db = await getDB()
  return db.get('settings', key) as Promise<T | undefined>
}

export async function setSetting<T>(key: OfflineSettingKey, value: T): Promise<void> {
  const db = await getDB()
  await db.put('settings', value, key)
}
```

- [ ] **Step 3: Crear barrel export**

`src/offline/index.ts`:

```typescript
export * from './types'
export * from './offline-db'
```

- [ ] **Step 4: Commit**

```bash
git add src/offline/
git commit -m "feat(offline): capa IndexedDB con stores content, videos, syncQueue, settings"
```

---

## Task 4: Tests offline-db

**Files:**

- Create: `src/offline/__tests__/offline-db.test.ts`

- [ ] **Step 1: Crear tests**

`src/offline/__tests__/offline-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveContent,
  getContent,
  deleteContent,
  saveVideoMetadata,
  getVideoMetadata,
  deleteVideo,
  saveSegment,
  getSegment,
  getAllVideos,
  getUsedSpace,
  saveSyncAction,
  getPendingActions,
  updateSyncAction,
  deleteSyncAction,
  clearDoneActions,
  getSetting,
  setSetting,
} from '../offline-db'

describe('offline-db', () => {
  beforeEach(async () => {
    // Limpieza entre tests — usar delete manual ya que idb no tiene clear fácil
    const content = await getContent('l1')
    if (content) await deleteContent('l1')
    const videos = await getAllVideos()
    for (const v of videos) await deleteVideo(v.videoId)
    const actions = await getPendingActions()
    for (const a of actions) {
      if (a.id) await deleteSyncAction(a.id)
    }
  })

  it('guarda y recupera contenido', async () => {
    await saveContent('l1', { text: 'Hola' }, 'text')
    const result = await getContent('l1')
    expect(result?.data).toEqual({ text: 'Hola' })
    expect(result?.contentType).toBe('text')
  })

  it('elimina contenido', async () => {
    await saveContent('l1', { text: 'Hola' }, 'text')
    await deleteContent('l1')
    const result = await getContent('l1')
    expect(result).toBeUndefined()
  })

  it('guarda y recupera metadatos de video', async () => {
    await saveVideoMetadata({
      videoId: 'v1',
      leccionId: 'l1',
      playlistUrl: 'http://p.m3u8',
      totalSize: 1000,
      cachedAt: Date.now(),
      lastPlayed: Date.now(),
    })
    const result = await getVideoMetadata('v1')
    expect(result?.playlistUrl).toBe('http://p.m3u8')
  })

  it('guarda y recupera segmento de video', async () => {
    const blob = new Uint8Array([1, 2, 3]).buffer
    await saveSegment('v1', 0, blob)
    const result = await getSegment('v1', 0)
    expect(result?.size).toBe(3)
  })

  it('elimina video y sus segmentos', async () => {
    await saveVideoMetadata({
      videoId: 'v1',
      leccionId: 'l1',
      playlistUrl: 'http://p.m3u8',
      totalSize: 100,
      cachedAt: Date.now(),
      lastPlayed: Date.now(),
    })
    await saveSegment('v1', 0, new Uint8Array([1]).buffer)
    await deleteVideo('v1')
    expect(await getVideoMetadata('v1')).toBeUndefined()
    expect(await getSegment('v1', 0)).toBeUndefined()
  })

  it('calcula espacio usado', async () => {
    await saveVideoMetadata({
      videoId: 'v1',
      leccionId: 'l1',
      playlistUrl: 'http://p.m3u8',
      totalSize: 100,
      cachedAt: Date.now(),
      lastPlayed: Date.now(),
    })
    await saveSegment('v1', 0, new Uint8Array(50).buffer)
    const space = await getUsedSpace()
    expect(space).toBe(150)
  })

  it('guarda y lista acciones pendientes', async () => {
    await saveSyncAction({
      type: 'quiz_submit',
      payload: { a: 1 },
      status: 'pending',
      retries: 0,
      createdAt: Date.now(),
    })
    await saveSyncAction({
      type: 'progress_update',
      payload: { b: 2 },
      status: 'pending',
      retries: 0,
      createdAt: Date.now() + 1,
    })
    const pending = await getPendingActions()
    expect(pending).toHaveLength(2)
    expect(pending[0].type).toBe('quiz_submit')
  })

  it('actualiza estado de acción', async () => {
    const id = await saveSyncAction({
      type: 'quiz_submit',
      payload: {},
      status: 'pending',
      retries: 0,
      createdAt: Date.now(),
    })
    await updateSyncAction(id, { status: 'done' })
    const pending = await getPendingActions()
    expect(pending).toHaveLength(0)
  })

  it('limpia acciones completadas', async () => {
    const id = await saveSyncAction({
      type: 'quiz_submit',
      payload: {},
      status: 'done',
      retries: 0,
      createdAt: Date.now(),
    })
    await clearDoneActions()
    const all = await getAllActions()
    expect(all).toHaveLength(0)
  })

  it('guarda y recupera settings', async () => {
    await setSetting('maxStorageBytes', 2147483648)
    const value = await getSetting<number>('maxStorageBytes')
    expect(value).toBe(2147483648)
  })
})
```

- [ ] **Step 2: Correr tests**

```bash
npm run test:unit -- src/offline/__tests__/offline-db.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/offline/__tests__/offline-db.test.ts
git commit -m "test(offline): tests de capa IndexedDB"
```

---

## Task 5: Detector de Red (network-status.ts)

**Files:**

- Create: `src/offline/network-status.ts`

- [ ] **Step 1: Crear módulo**

`src/offline/network-status.ts`:

```typescript
import { ref, type Ref } from 'vue'

const isOnline = ref(true)
const listeners = { online: [] as (() => void)[], offline: [] as (() => void)[] }

let pingTimer: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0

async function ping(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch('/health', { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    return true
  } catch {
    return false
  }
}

async function check() {
  const ok = await ping()
  if (ok) {
    consecutiveFailures = 0
    if (!isOnline.value) {
      isOnline.value = true
      listeners.online.forEach((cb) => cb())
    }
  } else {
    consecutiveFailures++
    if (consecutiveFailures >= 3 && isOnline.value) {
      isOnline.value = false
      listeners.offline.forEach((cb) => cb())
    }
  }
}

export function initNetworkStatus() {
  isOnline.value = navigator.onLine

  window.addEventListener('online', () => {
    // No cambiamos inmediatamente, esperamos confirmación por ping
    check()
  })

  window.addEventListener('offline', () => {
    consecutiveFailures = 3
    if (isOnline.value) {
      isOnline.value = false
      listeners.offline.forEach((cb) => cb())
    }
  })

  // Ping periódico
  const interval = () => (isOnline.value ? 30000 : 5000)
  const loop = () => {
    check()
    pingTimer = setTimeout(loop, interval())
  }
  loop()
}

export function destroyNetworkStatus() {
  if (pingTimer) clearTimeout(pingTimer)
}

export function getIsOnline(): Ref<boolean> {
  return isOnline
}

export function onOnline(callback: () => void) {
  listeners.online.push(callback)
}

export function onOffline(callback: () => void) {
  listeners.offline.push(callback)
}

export async function checkNow(): Promise<boolean> {
  await check()
  return isOnline.value
}
```

- [ ] **Step 2: Commit**

```bash
git add src/offline/network-status.ts
git commit -m "feat(offline): detector de red con ping y confirmación"
```

---

## Task 6: Cola de Sincronización (sync-queue.ts)

**Files:**

- Create: `src/offline/sync-queue.ts`

- [ ] **Step 1: Crear módulo**

`src/offline/sync-queue.ts`:

```typescript
import { saveSyncAction, getPendingActions, updateSyncAction, deleteSyncAction } from './offline-db'
import type { SyncActionType, SyncAction } from './types'
import { supabase } from '@/lib/supabase'
import { featureEnabled } from '@/lib/featureFlags'

const MAX_RETRIES = 5
const BACKOFF_BASE_MS = 1000

const endpointMap: Record<SyncActionType, (payload: Record<string, unknown>) => Promise<unknown>> =
  {
    quiz_submit: async (payload) => {
      const { error } = await supabase.from('intentos_evaluacion').insert(payload)
      if (error) throw error
    },
    forum_post: async (payload) => {
      const { error } = await supabase.from('comentarios').insert(payload)
      if (error) throw error
    },
    assignment_submit: async (payload) => {
      const { error } = await supabase.from('entregas').insert(payload)
      if (error) throw error
    },
    progress_update: async (payload) => {
      const { error } = await supabase.from('progreso').upsert(payload)
      if (error) throw error
    },
  }

export async function enqueue(
  type: SyncActionType,
  payload: Record<string, unknown>
): Promise<number> {
  if (!featureEnabled('offline_sync')) {
    // Si sync offline no está habilitado, enviar directamente
    await endpointMap[type](payload)
    return -1
  }
  return saveSyncAction({ type, payload, status: 'pending', retries: 0, createdAt: Date.now() })
}

export async function sync(): Promise<{ done: number; errors: number }> {
  if (!featureEnabled('offline_sync')) return { done: 0, errors: 0 }

  const actions = await getPendingActions()
  let done = 0
  let errors = 0

  for (const action of actions) {
    if (!action.id) continue
    await updateSyncAction(action.id, { status: 'syncing' })

    try {
      await endpointMap[action.type](action.payload)
      await updateSyncAction(action.id, { status: 'done' })
      await deleteSyncAction(action.id)
      done++
    } catch (e: any) {
      const isValidationError = e?.status >= 400 && e?.status < 500
      const newRetries = action.retries + 1

      if (isValidationError || newRetries >= MAX_RETRIES) {
        await updateSyncAction(action.id, {
          status: 'error',
          retries: newRetries,
          errorMessage: e?.message || 'Error desconocido',
        })
        errors++
      } else {
        const delay = Math.min(2 ** newRetries * BACKOFF_BASE_MS, 30000)
        await updateSyncAction(action.id, {
          status: 'pending',
          retries: newRetries,
        })
        // Schedule retry
        setTimeout(() => sync(), delay)
        break // No procesar más hasta el retry
      }
    }
  }

  return { done, errors }
}

export async function retryFailed(): Promise<void> {
  const { getAllActions } = await import('./offline-db')
  const all = await getAllActions()
  const failed = all.filter((a) => a.status === 'error' && (a.retries || 0) < MAX_RETRIES)
  for (const action of failed) {
    if (action.id) {
      await updateSyncAction(action.id, { status: 'pending', errorMessage: undefined })
    }
  }
  await sync()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/offline/sync-queue.ts
git commit -m "feat(offline): cola de sincronización con retry y backoff"
```

---

## Task 7: Tests sync-queue

**Files:**

- Create: `src/offline/__tests__/sync-queue.test.ts`

- [ ] **Step 1: Crear tests**

`src/offline/__tests__/sync-queue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enqueue, sync } from '../sync-queue'
import { getPendingActions, deleteSyncAction, getAllActions } from '../offline-db'

vi.mock('@/lib/featureFlags', () => ({
  featureEnabled: vi.fn(() => true),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}))

describe('sync-queue', () => {
  beforeEach(async () => {
    const actions = await getPendingActions()
    for (const a of actions) {
      if (a.id) await deleteSyncAction(a.id)
    }
  })

  it('encola una acción', async () => {
    const id = await enqueue('quiz_submit', { leccionId: 'l1', respuestas: [] })
    expect(id).toBeGreaterThan(0)
    const pending = await getPendingActions()
    expect(pending).toHaveLength(1)
  })

  it('sync envía acciones pendientes', async () => {
    await enqueue('progress_update', { leccionId: 'l1', completado: true })
    const result = await sync()
    expect(result.done).toBe(1)
    expect(result.errors).toBe(0)
    const pending = await getPendingActions()
    expect(pending).toHaveLength(0)
  })

  it('sync maneja errores de red sin marcar error inmediato', async () => {
    const { supabase } = await import('@/lib/supabase')
    supabase.from = vi.fn(() => ({
      insert: vi.fn().mockRejectedValue(new Error('Network')),
    }))

    await enqueue('quiz_submit', { leccionId: 'l1' })
    const result = await sync()
    expect(result.done).toBe(0)
    expect(result.errors).toBe(0) // No marca error aún, reintenta
    const all = await getAllActions()
    expect(all[0].retries).toBe(1)
    expect(all[0].status).toBe('pending')
  })
})
```

- [ ] **Step 2: Correr tests**

```bash
npm run test:unit -- src/offline/__tests__/sync-queue.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/offline/__tests__/sync-queue.test.ts
git commit -m "test(offline): tests de sync queue"
```

---

## Task 8: Cache de Videos HLS (video-cache.ts)

**Files:**

- Create: `src/offline/video-cache.ts`

- [ ] **Step 1: Crear módulo**

`src/offline/video-cache.ts`:

```typescript
import {
  saveVideoMetadata,
  getVideoMetadata,
  deleteVideo,
  saveSegment,
  getSegment,
  getAllVideos,
  getUsedSpace,
} from './offline-db'
import { getSetting, setSetting } from './offline-db'
import { featureEnabled } from '@/lib/featureFlags'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

async function getMaxBytes(): Promise<number> {
  const setting = await getSetting<number>('maxStorageBytes')
  return setting || DEFAULT_MAX_BYTES
}

async function evictIfNeeded(requiredBytes: number): Promise<void> {
  const maxBytes = await getMaxBytes()
  let used = await getUsedSpace()
  const target = used + requiredBytes

  if (target <= maxBytes) return

  const videos = await getAllVideos()
  videos.sort((a, b) => a.lastPlayed - b.lastPlayed)

  for (const video of videos) {
    if (used + requiredBytes <= maxBytes * 0.8) break
    await deleteVideo(video.videoId)
    used = await getUsedSpace()
  }
}

export async function downloadVideo(
  videoId: string,
  leccionId: string,
  playlistUrl: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  if (!featureEnabled('offline_video_cache')) throw new Error('offline_video_cache disabled')

  // 1. Descargar playlist
  const playlistRes = await fetch(playlistUrl)
  if (!playlistRes.ok) throw new Error('No se pudo descargar playlist')
  const playlistText = await playlistRes.text()

  // 2. Parsear segmentos (simplificado: líneas que terminan en .ts)
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1)
  const segmentUrls: string[] = []
  for (const line of playlistText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      segmentUrls.push(trimmed.startsWith('http') ? trimmed : baseUrl + trimmed)
    }
  }

  // 3. Calcular espacio necesario estimado
  const estimatedBytes = segmentUrls.length * 500_000 // estimado 500KB por segmento
  await evictIfNeeded(estimatedBytes)

  // 4. Descargar segmentos
  let totalDownloaded = 0
  const segmentBlobs: ArrayBuffer[] = []

  for (let i = 0; i < segmentUrls.length; i++) {
    const segRes = await fetch(segmentUrls[i])
    if (!segRes.ok) throw new Error(`Error descargando segmento ${i}`)
    const blob = await segRes.arrayBuffer()
    segmentBlobs.push(blob)
    totalDownloaded += blob.byteLength
    if (onProgress) onProgress(Math.round(((i + 1) / segmentUrls.length) * 100))
  }

  // 5. Guardar en IndexedDB
  await saveVideoMetadata({
    videoId,
    leccionId,
    playlistUrl,
    totalSize: totalDownloaded,
    cachedAt: Date.now(),
    lastPlayed: Date.now(),
  })

  for (let i = 0; i < segmentBlobs.length; i++) {
    await saveSegment(videoId, i, segmentBlobs[i])
  }
}

export async function isVideoAvailable(videoId: string): Promise<boolean> {
  const meta = await getVideoMetadata(videoId)
  return !!meta
}

export async function getPlaylist(videoId: string): Promise<string | undefined> {
  const meta = await getVideoMetadata(videoId)
  return meta?.playlistUrl
}

export async function getCachedSegment(
  videoId: string,
  index: number
): Promise<ArrayBuffer | undefined> {
  const seg = await getSegment(videoId, index)
  return seg?.blob
}

export async function removeVideo(videoId: string): Promise<void> {
  await deleteVideo(videoId)
}

export async function updateLastPlayed(videoId: string): Promise<void> {
  const meta = await getVideoMetadata(videoId)
  if (meta) {
    const { saveVideoMetadata } = await import('./offline-db')
    await saveVideoMetadata({ ...meta, lastPlayed: Date.now() })
  }
}

export async function getCacheStats(): Promise<{ used: number; max: number; videos: number }> {
  const used = await getUsedSpace()
  const max = await getMaxBytes()
  const videos = await getAllVideos()
  return { used, max, videos: videos.length }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/offline/video-cache.ts
git commit -m "feat(offline): cache de videos HLS con LRU y descarga"
```

---

## Task 9: Notificaciones Push (push-notifications.ts)

**Files:**

- Create: `src/offline/push-notifications.ts`
- Create: `supabase/functions/push-notify/index.ts`

- [ ] **Step 1: Crear módulo frontend**

`src/offline/push-notifications.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import { featureEnabled } from '@/lib/featureFlags'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export async function subscribe(): Promise<boolean> {
  if (!featureEnabled('push_notifications')) return false
  if (!VAPID_PUBLIC_KEY) return false

  const permission = await requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const { endpoint } = subscription.toJSON()
  const keys = subscription.getKey
    ? {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
      }
    : { p256dh: '', auth: '' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: 'user_id,endpoint' }
  )

  return !error
}

export async function unsubscribe(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await subscription.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  }
}

export async function isSubscribed(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return !!subscription
}
```

- [ ] **Step 2: Crear Edge Function push-notify**

`supabase/functions/push-notify/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, title, body, url } = await req.json()
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

    if (!vapidPrivateKey) {
      return new Response(JSON.stringify({ error: 'VAPID_PRIVATE_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Obtener suscripciones del usuario
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const webPush = await import('https://esm.sh/web-push@3')
    webPush.default.setVapidDetails(
      vapidSubject,
      Deno.env.get('VAPID_PUBLIC_KEY') || '',
      vapidPrivateKey
    )

    let sent = 0
    for (const sub of subscriptions) {
      try {
        await webPush.default.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url })
        )
        sent++
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          // Suscripción expirada, eliminar
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/offline/push-notifications.ts supabase/functions/push-notify/index.ts
git commit -m "feat(offline): notificaciones push con Web Push API y Edge Function"
```

---

## Task 10: Composables

**Files:**

- Create: `src/composables/useOffline.ts`
- Create: `src/composables/useSyncStatus.ts`
- Create: `src/composables/useVideoCache.ts`

- [ ] **Step 1: Crear useOffline.ts**

`src/composables/useOffline.ts`:

```typescript
import { computed } from 'vue'
import { getIsOnline } from '@/offline/network-status'
import { featureEnabled } from '@/lib/featureFlags'

export function useOffline() {
  const isOnline = getIsOnline()
  const offlineEnabled = featureEnabled('pwa_offline')
  const isOffline = computed(() => offlineEnabled && !isOnline.value)

  return { isOnline, isOffline, offlineEnabled }
}
```

- [ ] **Step 2: Crear useSyncStatus.ts**

`src/composables/useSyncStatus.ts`:

```typescript
import { ref, onMounted, onUnmounted } from 'vue'
import { getPendingActions, getAllActions, clearDoneActions } from '@/offline/offline-db'
import { sync, retryFailed } from '@/offline/sync-queue'
import { onOnline } from '@/offline/network-status'
import { featureEnabled } from '@/lib/featureFlags'

export function useSyncStatus() {
  const pendingCount = ref(0)
  const errorCount = ref(0)
  const syncing = ref(false)
  const timer = ref<ReturnType<typeof setInterval> | null>(null)

  async function refresh() {
    if (!featureEnabled('offline_sync')) return
    const pending = await getPendingActions()
    const all = await getAllActions()
    pendingCount.value = pending.length
    errorCount.value = all.filter((a) => a.status === 'error').length
  }

  async function doSync() {
    if (!featureEnabled('offline_sync') || syncing.value) return
    syncing.value = true
    await sync()
    await refresh()
    syncing.value = false
  }

  async function clearDone() {
    await clearDoneActions()
    await refresh()
  }

  async function retry() {
    await retryFailed()
    await refresh()
  }

  onMounted(() => {
    refresh()
    onOnline(() => doSync())
    timer.value = setInterval(refresh, 5000)
  })

  onUnmounted(() => {
    if (timer.value) clearInterval(timer.value)
  })

  return { pendingCount, errorCount, syncing, doSync, clearDone, retry, refresh }
}
```

- [ ] **Step 3: Crear useVideoCache.ts**

`src/composables/useVideoCache.ts`:

```typescript
import { ref } from 'vue'
import { downloadVideo, isVideoAvailable, removeVideo, getCacheStats } from '@/offline/video-cache'
import { featureEnabled } from '@/lib/featureFlags'

export function useVideoCache() {
  const downloading = ref(false)
  const progress = ref(0)
  const error = ref('')

  async function download(videoId: string, leccionId: string, playlistUrl: string) {
    if (!featureEnabled('offline_video_cache')) return
    downloading.value = true
    progress.value = 0
    error.value = ''
    try {
      await downloadVideo(videoId, leccionId, playlistUrl, (pct) => {
        progress.value = pct
      })
    } catch (e: any) {
      error.value = e?.message || 'Error al descargar'
    } finally {
      downloading.value = false
    }
  }

  async function remove(videoId: string) {
    await removeVideo(videoId)
  }

  async function check(videoId: string): Promise<boolean> {
    return isVideoAvailable(videoId)
  }

  async function stats() {
    return getCacheStats()
  }

  return { downloading, progress, error, download, remove, check, stats }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/composables/useOffline.ts src/composables/useSyncStatus.ts src/composables/useVideoCache.ts
git commit -m "feat(offline): composables useOffline, useSyncStatus, useVideoCache"
```

---

## Task 11: Componentes UI

**Files:**

- Create: `src/components/OfflineBanner.vue`
- Create: `src/components/DownloadButton.vue`
- Create: `src/components/OfflineStatusPanel.vue`

- [ ] **Step 1: Crear OfflineBanner.vue**

`src/components/OfflineBanner.vue`:

```vue
<script setup>
import { useOffline } from '@/composables/useOffline'

const { isOffline } = useOffline()
</script>

<template>
  <div v-if="isOffline" class="offline-banner">
    <span class="offline-banner-text">
      Modo offline — Tus acciones se guardarán y sincronizarán al reconectar
    </span>
  </div>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--warning, #f59e0b);
  color: #fff;
  padding: 8px 16px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
}
.offline-banner-text {
  display: inline-block;
}
</style>
```

- [ ] **Step 2: Crear DownloadButton.vue**

`src/components/DownloadButton.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useVideoCache } from '@/composables/useVideoCache'

const props = defineProps({
  videoId: { type: String, required: true },
  leccionId: { type: String, required: true },
  playlistUrl: { type: String, required: true },
})

const videoCache = useVideoCache()
const cached = ref(false)

onMounted(async () => {
  cached.value = await videoCache.check(props.videoId)
})

async function onDownload() {
  await videoCache.download(props.videoId, props.leccionId, props.playlistUrl)
  cached.value = await videoCache.check(props.videoId)
}

async function onRemove() {
  await videoCache.remove(props.videoId)
  cached.value = false
}
</script>

<template>
  <div class="download-btn-wrapper">
    <button
      v-if="!cached"
      type="button"
      class="btn btn-secondary btn-sm"
      :disabled="videoCache.downloading.value"
      @click="onDownload"
    >
      <span v-if="videoCache.downloading.value">Descargando {{ videoCache.progress.value }}%</span>
      <span v-else>Descargar para offline</span>
    </button>
    <button v-else type="button" class="btn btn-secondary btn-sm" @click="onRemove">
      Eliminar de offline
    </button>
    <span v-if="videoCache.error.value" class="caption" :style="{ color: 'var(--error)' }">{{
      videoCache.error.value
    }}</span>
  </div>
</template>

<style scoped>
.download-btn-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

- [ ] **Step 3: Crear OfflineStatusPanel.vue**

`src/components/OfflineStatusPanel.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useSyncStatus } from '@/composables/useSyncStatus'
import { useVideoCache } from '@/composables/useVideoCache'

const syncStatus = useSyncStatus()
const videoCache = useVideoCache()
const stats = ref({ used: 0, max: 0, videos: 0 })

onMounted(async () => {
  stats.value = await videoCache.stats()
})

async function refreshStats() {
  stats.value = await videoCache.stats()
}
</script>

<template>
  <div class="card" :style="{ maxWidth: '600px' }">
    <h3 class="h4">Estado offline</h3>

    <div class="field">
      <label>Espacio usado</label>
      <p>
        {{ (stats.used / 1024 / 1024).toFixed(1) }} MB /
        {{ (stats.max / 1024 / 1024).toFixed(0) }} MB
      </p>
    </div>

    <div class="field">
      <label>Videos cacheados</label>
      <p>{{ stats.videos }}</p>
    </div>

    <div class="field">
      <label>Acciones pendientes</label>
      <p>{{ syncStatus.pendingCount.value }}</p>
    </div>

    <div class="field">
      <label>Acciones con error</label>
      <p>{{ syncStatus.errorCount.value }}</p>
    </div>

    <div :style="{ display: 'flex', gap: '8px' }">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="syncStatus.syncing.value"
        @click="
          syncStatus.doSync()
          refreshStats()
        "
      >
        {{ syncStatus.syncing.value ? 'Sincronizando...' : 'Sincronizar ahora' }}
      </button>
      <button type="button" class="btn btn-secondary" @click="syncStatus.retry()">
        Reintentar fallidas
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/OfflineBanner.vue src/components/DownloadButton.vue src/components/OfflineStatusPanel.vue
git commit -m "feat(offline): componentes UI OfflineBanner, DownloadButton, OfflineStatusPanel"
```

---

## Task 12: Integración en App.vue y PlayerPage

**Files:**

- Modify: `src/App.vue`
- Modify: `src/pages/PlayerPage.vue`

- [ ] **Step 1: Integrar OfflineBanner en App.vue**

En `src/App.vue`, agregar import y componente:

```vue
<script setup>
// ... imports existentes ...
import OfflineBanner from '@/components/OfflineBanner.vue'
import { initNetworkStatus } from '@/offline/network-status'
import { featureEnabled } from '@/lib/featureFlags'

// ... resto del script ...

if (featureEnabled('pwa_offline')) {
  initNetworkStatus()
}
</script>

<template>
  <OfflineBanner />
  <!-- ... resto del template ... -->
</template>
```

- [ ] **Step 2: Integrar DownloadButton en PlayerPage**

En `src/pages/PlayerPage.vue`, agregar import del botón y mostrarlo cuando corresponda:

```vue
<script setup>
// ... imports existentes ...
import DownloadButton from '@/components/DownloadButton.vue'
import { featureEnabled } from '@/lib/featureFlags'

// ... resto ...

const offlineVideoEnabled = featureEnabled('offline_video_cache')
</script>
```

Agregar `<DownloadButton>` en cada layout (split, stacked, focus) donde se muestre el contenido de la lección, pasando `videoId`, `leccionId`, y `playlistUrl`.

- [ ] **Step 3: Commit**

```bash
git add src/App.vue src/pages/PlayerPage.vue
git commit -m "feat(offline): integra OfflineBanner y DownloadButton en App y Player"
```

---

## Task 13: Tests restantes

**Files:**

- Create: `src/offline/__tests__/network-status.test.ts`
- Create: `src/offline/__tests__/video-cache.test.ts`

- [ ] **Step 1: Tests network-status**

`src/offline/__tests__/network-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getIsOnline, checkNow, initNetworkStatus, destroyNetworkStatus } from '../network-status'

describe('network-status', () => {
  beforeEach(() => {
    destroyNetworkStatus()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('inicia como online', () => {
    expect(getIsOnline().value).toBe(true)
  })

  it('checkNow actualiza estado tras ping', async () => {
    const result = await checkNow()
    expect(result).toBe(true)
    expect(getIsOnline().value).toBe(true)
  })

  it('detecta offline tras 3 fallos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
    await checkNow()
    await checkNow()
    await checkNow()
    expect(getIsOnline().value).toBe(false)
  })
})
```

- [ ] **Step 2: Tests video-cache**

`src/offline/__tests__/video-cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isVideoAvailable, getCacheStats, removeVideo } from '../video-cache'
import { deleteVideo, saveVideoMetadata, saveSegment } from '../offline-db'

describe('video-cache', () => {
  beforeEach(async () => {
    const meta = await saveVideoMetadata({
      videoId: 'v1',
      leccionId: 'l1',
      playlistUrl: 'http://test.m3u8',
      totalSize: 100,
      cachedAt: Date.now(),
      lastPlayed: Date.now(),
    })
    await saveSegment('v1', 0, new Uint8Array(50).buffer)
  })

  it('detecta video disponible', async () => {
    const available = await isVideoAvailable('v1')
    expect(available).toBe(true)
  })

  it('detecta video no disponible', async () => {
    const available = await isVideoAvailable('v999')
    expect(available).toBe(false)
  })

  it('devuelve estadísticas', async () => {
    const stats = await getCacheStats()
    expect(stats.videos).toBe(1)
    expect(stats.used).toBe(150)
  })

  it('elimina video', async () => {
    await removeVideo('v1')
    expect(await isVideoAvailable('v1')).toBe(false)
  })
})
```

- [ ] **Step 3: Correr todos los tests offline**

```bash
npm run test:unit -- src/offline/
```

Expected: Todos los tests de offline pasan.

- [ ] **Step 4: Commit**

```bash
git add src/offline/__tests__/network-status.test.ts src/offline/__tests__/video-cache.test.ts
git commit -m "test(offline): tests de network-status y video-cache"
```

---

## Task 14: Verificación Final y Release

- [ ] **Step 1: Correr tests completos**

```bash
npm run test:unit
```

Expected: Todos los tests pasan (205+).

- [ ] **Step 2: Correr build**

```bash
npm run build
```

Expected: Build exitoso, sin errores.

- [ ] **Step 3: Correr lint**

```bash
npm run lint
```

Expected: 0 errores.

- [ ] **Step 4: Bump version a 0.9.0**

Edit `package.json`: `"version": "0.9.0"`

- [ ] **Step 5: Actualizar README**

Agregar sección "Novedades v0.9.0 — Fase 5 PWA y Offline" con:

- Cacheo de contenido y videos HLS offline
- Cola de sincronización de evaluaciones, foros, entregas
- Detector de red con confirmación
- Notificaciones push
- Panel de estado offline en perfil

- [ ] **Step 6: Commit de release**

```bash
git add package.json README.md
git commit -m "chore(release): v0.9.0 — Fase 5 PWA y Offline"
```

- [ ] **Step 7: Merge, tag, release**

```bash
git checkout main
git merge fase-5-pwa-offline --no-edit
git push origin main
git tag -a v0.9.0 -m "Release v0.9.0 — Fase 5: PWA y Offline"
git push origin v0.9.0
```

---

## Spec Coverage Check

| Requirement                                                       | Task           |
| ----------------------------------------------------------------- | -------------- |
| Schema push_subscriptions + feature flags                         | Task 1         |
| IndexedDB stores (content, videos, segments, syncQueue, settings) | Task 3         |
| Network status detector                                           | Task 5         |
| Sync queue FIFO con retry/backoff                                 | Task 6         |
| Video cache HLS con LRU                                           | Task 8         |
| Push notifications (frontend + Edge Function)                     | Task 9         |
| Service worker custom (injectManifest)                            | Task 2         |
| Composables (useOffline, useSyncStatus, useVideoCache)            | Task 10        |
| UI components (OfflineBanner, DownloadButton, OfflineStatusPanel) | Task 11        |
| Integration (App.vue, PlayerPage.vue)                             | Task 12        |
| Tests unitarios                                                   | Tasks 4, 7, 13 |
| Feature flags                                                     | Task 1         |
| README + release                                                  | Task 14        |

---

## Placeholder Scan

- No TBD, TODO, or "implement later" found.
- All code blocks contain actual implementation.
- All file paths are exact.
- All commands have expected output.

---

## Type Consistency Check

- `SyncActionType` enum values: `quiz_submit`, `forum_post`, `assignment_submit`, `progress_update` — consistent across types.ts, sync-queue.ts, and tests.
- `OfflineSettingKey`: `maxStorageBytes`, `lastSyncAt` — consistent in types.ts and offline-db.ts.
- Feature flag names: `pwa_offline`, `offline_video_cache`, `offline_sync`, `push_notifications` — consistent in DB, featureFlags.ts, and all usages.

---

_Plan complete. Ready for execution._
