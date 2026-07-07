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
