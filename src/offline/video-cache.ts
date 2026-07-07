import { featureEnabled } from '@/lib/featureFlags'
import {
  deleteVideo,
  getAllVideos,
  getSegment,
  getSetting,
  getUsedSpace,
  getVideoMetadata,
  saveSegment,
  saveVideoMetadata,
  setSetting,
} from './offline-db'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
const SEGMENT_ESTIMATE_BYTES = 500 * 1024

function checkEnabled(): boolean {
  return featureEnabled('offline_video_cache')
}

async function evictIfNeeded(requiredBytes: number): Promise<void> {
  let used = await getUsedSpace()
  const max =
    (await getSetting<number>('maxStorageBytes')) || DEFAULT_MAX_BYTES
  const threshold = max * 0.8

  if (used + requiredBytes <= threshold) {
    return
  }

  const videos = (await getAllVideos()).sort(
    (a, b) => a.lastPlayed - b.lastPlayed,
  )

  for (const video of videos) {
    if (used + requiredBytes <= threshold) {
      break
    }
    await deleteVideo(video.videoId)
    used = await getUsedSpace()
  }
}

export async function downloadVideo(
  videoId: string,
  leccionId: string,
  playlistUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (!checkEnabled()) {
    throw new Error('offline_video_cache no está habilitado')
  }

  const response = await fetch(playlistUrl)
  if (!response.ok) {
    throw new Error(`Error al descargar playlist: ${response.status}`)
  }

  const playlistText = await response.text()
  const lines = playlistText.split('\n')
  const segmentUrls: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    segmentUrls.push(new URL(line, playlistUrl).href)
  }

  const estimatedSize = segmentUrls.length * SEGMENT_ESTIMATE_BYTES
  await evictIfNeeded(estimatedSize)

  let totalSize = 0
  for (let i = 0; i < segmentUrls.length; i++) {
    const segResponse = await fetch(segmentUrls[i])
    if (!segResponse.ok) {
      throw new Error(
        `Error al descargar segmento ${i}: ${segResponse.status}`,
      )
    }
    const buffer = await segResponse.arrayBuffer()
    totalSize += buffer.byteLength
    await saveSegment(videoId, i, buffer)
    if (onProgress) {
      onProgress(((i + 1) / segmentUrls.length) * 100)
    }
  }

  await saveVideoMetadata({
    videoId,
    leccionId,
    playlistUrl,
    totalSize,
    cachedAt: Date.now(),
    lastPlayed: Date.now(),
  })
}

export async function isVideoAvailable(videoId: string): Promise<boolean> {
  if (!checkEnabled()) return false
  const meta = await getVideoMetadata(videoId)
  return meta != null
}

export async function getPlaylist(videoId: string): Promise<string | undefined> {
  if (!checkEnabled()) return undefined
  const meta = await getVideoMetadata(videoId)
  return meta?.playlistUrl
}

export async function getCachedSegment(
  videoId: string,
  index: number,
): Promise<ArrayBuffer | undefined> {
  if (!checkEnabled()) return undefined
  const segment = await getSegment(videoId, index)
  return segment?.blob
}

export async function removeVideo(videoId: string): Promise<void> {
  if (!checkEnabled()) return
  await deleteVideo(videoId)
}

export async function updateLastPlayed(videoId: string): Promise<void> {
  if (!checkEnabled()) return
  const meta = await getVideoMetadata(videoId)
  if (!meta) return
  meta.lastPlayed = Date.now()
  await saveVideoMetadata(meta)
}

export async function getCacheStats(): Promise<{
  used: number
  max: number
  videos: number
}> {
  if (!checkEnabled()) {
    return { used: 0, max: 0, videos: 0 }
  }
  const used = await getUsedSpace()
  const max =
    (await getSetting<number>('maxStorageBytes')) || DEFAULT_MAX_BYTES
  const allVideos = await getAllVideos()
  return { used, max, videos: allVideos.length }
}
