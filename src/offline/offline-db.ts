import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CachedContent,
  OfflineSettingKey,
  SyncAction,
  VideoMetadata,
  VideoSegment,
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
  }
  settings: {
    key: OfflineSettingKey
    value: { key: OfflineSettingKey; value: unknown }
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

// ─── Content ───────────────────────────────────────────────────────────

export async function saveContent(
  leccionId: string,
  data: Record<string, unknown>,
  contentType: 'text' | 'video',
): Promise<void> {
  const db = await getDB()
  const record: CachedContent = { leccionId, data, contentType, cachedAt: Date.now() }
  await db.put('content', record)
}

export async function getContent(leccionId: string): Promise<CachedContent | undefined> {
  const db = await getDB()
  return db.get('content', leccionId)
}

export async function deleteContent(leccionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('content', leccionId)
}

// ─── Videos ────────────────────────────────────────────────────────────

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
  const tx = db.transaction(['videos', 'videoSegments'], 'readwrite')
  const videoStore = tx.objectStore('videos')
  const segmentStore = tx.objectStore('videoSegments')

  await videoStore.delete(videoId)

  let cursor = await segmentStore.openCursor()
  while (cursor) {
    if (cursor.value.videoId === videoId) {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }

  await tx.done
}

export async function getAllVideos(): Promise<VideoMetadata[]> {
  const db = await getDB()
  return db.getAll('videos')
}

export async function getUsedSpace(): Promise<number> {
  const db = await getDB()
  const [videos, segments] = await Promise.all([
    db.getAll('videos'),
    db.getAll('videoSegments'),
  ])
  const videoSpace = videos.reduce((sum, v) => sum + (v.totalSize || 0), 0)
  const segmentSpace = segments.reduce((sum, s) => sum + (s.size || 0), 0)
  return videoSpace + segmentSpace
}

// ─── Segments ──────────────────────────────────────────────────────────

export async function saveSegment(
  videoId: string,
  index: number,
  blob: ArrayBuffer,
): Promise<void> {
  const db = await getDB()
  const segmentId = `${videoId}__${index}`
  const record: VideoSegment = { segmentId, videoId, index, blob, size: blob.byteLength }
  await db.put('videoSegments', record)
}

export async function getSegment(
  videoId: string,
  index: number,
): Promise<VideoSegment | undefined> {
  const db = await getDB()
  const segmentId = `${videoId}__${index}`
  return db.get('videoSegments', segmentId)
}

// ─── Sync Queue ──────────────────────────────────────────────────────────

export async function saveSyncAction(action: Omit<SyncAction, 'id'>): Promise<number> {
  const db = await getDB()
  return db.add('syncQueue', action as SyncAction)
}

export async function getPendingActions(): Promise<SyncAction[]> {
  const db = await getDB()
  const all = await db.getAll('syncQueue')
  return all
    .filter((a) => a.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllActions(): Promise<SyncAction[]> {
  const db = await getDB()
  return db.getAll('syncQueue')
}

export async function updateSyncAction(
  id: number,
  updates: Partial<SyncAction>,
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('syncQueue', id)
  if (!existing) return
  const merged = { ...existing, ...updates }
  await db.put('syncQueue', merged)
}

export async function deleteSyncAction(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('syncQueue', id)
}

export async function clearDoneActions(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  const store = tx.objectStore('syncQueue')

  let cursor = await store.openCursor()
  while (cursor) {
    if (cursor.value.status === 'done') {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }

  await tx.done
}

// ─── Settings ────────────────────────────────────────────────────────────

export async function getSetting<T = unknown>(key: OfflineSettingKey): Promise<T | undefined> {
  const db = await getDB()
  const record = await db.get('settings', key)
  return record?.value as T | undefined
}

export async function setSetting<T = unknown>(key: OfflineSettingKey, value: T): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key, value })
}
