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
  getUsedSpace,
  saveSyncAction,
  getPendingActions,
  updateSyncAction,
  clearDoneActions,
  getSetting,
  setSetting,
  getDB,
} from '../offline-db'

async function clearDB() {
  const db = await getDB()
  const tx = db.transaction(
    ['content', 'videos', 'videoSegments', 'syncQueue', 'settings'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('content').clear(),
    tx.objectStore('videos').clear(),
    tx.objectStore('videoSegments').clear(),
    tx.objectStore('syncQueue').clear(),
    tx.objectStore('settings').clear(),
  ])
  await tx.done
}

beforeEach(async () => {
  await clearDB()
})

describe('offline-db', () => {
  describe('content', () => {
    it('saveContent stores lesson content', async () => {
      const leccionId = 'lec-1'
      const data = { title: 'Test Lesson', body: 'Hello world' }

      await saveContent(leccionId, data, 'text')
      const result = await getContent(leccionId)

      expect(result).toBeDefined()
      expect(result!.leccionId).toBe(leccionId)
      expect(result!.data).toEqual(data)
      expect(result!.contentType).toBe('text')
      expect(result!.cachedAt).toBeGreaterThan(0)
    })

    it('deleteContent removes content from DB', async () => {
      const leccionId = 'lec-2'
      await saveContent(leccionId, { title: 'To Delete' }, 'text')

      await deleteContent(leccionId)
      const deleted = await getContent(leccionId)

      expect(deleted).toBeUndefined()
    })
  })

  describe('videos', () => {
    it('saveVideoMetadata stores and getVideoMetadata retrieves', async () => {
      const videoId = 'vid-1'
      const metadata = {
        videoId,
        leccionId: 'lec-1',
        playlistUrl: 'https://example.com/playlist.m3u8',
        totalSize: 1024,
        cachedAt: Date.now(),
        lastPlayed: Date.now(),
      }

      await saveVideoMetadata(metadata)
      const result = await getVideoMetadata(videoId)

      expect(result).toBeDefined()
      expect(result!.videoId).toBe(videoId)
      expect(result!.totalSize).toBe(1024)
      expect(result!.playlistUrl).toBe(metadata.playlistUrl)
    })

    it('deleteVideo removes video and its segments', async () => {
      const videoId = 'vid-2'
      await saveVideoMetadata({
        videoId,
        leccionId: 'lec-1',
        playlistUrl: 'https://example.com/playlist.m3u8',
        totalSize: 2048,
        cachedAt: Date.now(),
        lastPlayed: Date.now(),
      })
      await saveSegment(videoId, 0, new ArrayBuffer(100))
      await saveSegment(videoId, 1, new ArrayBuffer(200))

      await deleteVideo(videoId)

      const deletedMeta = await getVideoMetadata(videoId)
      expect(deletedMeta).toBeUndefined()

      const deletedSeg0 = await getSegment(videoId, 0)
      expect(deletedSeg0).toBeUndefined()

      const deletedSeg1 = await getSegment(videoId, 1)
      expect(deletedSeg1).toBeUndefined()
    })
  })

  describe('segments', () => {
    it('saveSegment and getSegment handle video chunks', async () => {
      const videoId = 'vid-3'
      const index = 0
      const blob = new ArrayBuffer(100)

      await saveSegment(videoId, index, blob)
      const result = await getSegment(videoId, index)

      expect(result).toBeDefined()
      expect(result!.videoId).toBe(videoId)
      expect(result!.index).toBe(index)
      expect(result!.size).toBe(100)

      const missing = await getSegment(videoId, 999)
      expect(missing).toBeUndefined()
    })
  })

  describe('space usage', () => {
    it('getUsedSpace sums video and segment sizes', async () => {
      await saveVideoMetadata({
        videoId: 'vid-space-1',
        leccionId: 'lec-1',
        playlistUrl: 'https://example.com/1.m3u8',
        totalSize: 1000,
        cachedAt: Date.now(),
        lastPlayed: Date.now(),
      })
      await saveVideoMetadata({
        videoId: 'vid-space-2',
        leccionId: 'lec-2',
        playlistUrl: 'https://example.com/2.m3u8',
        totalSize: 2000,
        cachedAt: Date.now(),
        lastPlayed: Date.now(),
      })

      await saveSegment('vid-space-1', 0, new ArrayBuffer(500))
      await saveSegment('vid-space-1', 1, new ArrayBuffer(300))
      await saveSegment('vid-space-2', 0, new ArrayBuffer(200))

      const used = await getUsedSpace()
      expect(used).toBe(1000 + 2000 + 500 + 300 + 200)
    })
  })

  describe('sync queue', () => {
    it('saveSyncAction returns an auto-incremented id', async () => {
      const id1 = await saveSyncAction({
        type: 'quiz_submit',
        payload: { answers: [1, 2, 3] },
        status: 'pending',
        retries: 0,
        createdAt: Date.now(),
      })
      const id2 = await saveSyncAction({
        type: 'progress_update',
        payload: { progress: 50 },
        status: 'pending',
        retries: 0,
        createdAt: Date.now(),
      })

      expect(typeof id1).toBe('number')
      expect(typeof id2).toBe('number')
      expect(id2).toBeGreaterThan(id1)
    })

    it('getPendingActions filters and sorts pending actions', async () => {
      const now = Date.now()
      const id1 = await saveSyncAction({
        type: 'quiz_submit',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: now + 10,
      })
      await saveSyncAction({
        type: 'forum_post',
        payload: {},
        status: 'done',
        retries: 0,
        createdAt: now + 20,
      })
      const id3 = await saveSyncAction({
        type: 'assignment_submit',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: now + 5,
      })

      const pending = await getPendingActions()
      expect(pending).toHaveLength(2)
      // Should be sorted by createdAt ascending
      expect(pending[0].id).toBe(id3)
      expect(pending[1].id).toBe(id1)
    })

    it('updateSyncAction modifies an existing action', async () => {
      const id = await saveSyncAction({
        type: 'quiz_submit',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: Date.now(),
      })

      await updateSyncAction(id, { status: 'done', retries: 1 })
      const pending = await getPendingActions()
      expect(pending).toHaveLength(0)
    })

    it('clearDoneActions removes only done actions', async () => {
      const idPending = await saveSyncAction({
        type: 'quiz_submit',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: Date.now(),
      })
      const idDone = await saveSyncAction({
        type: 'forum_post',
        payload: {},
        status: 'done',
        retries: 0,
        createdAt: Date.now(),
      })

      await clearDoneActions()

      const pending = await getPendingActions()
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(idPending)
    })
  })

  describe('settings', () => {
    it('getSetting and setSetting persist configuration values', async () => {
      await setSetting('maxStorageBytes', 500_000_000)
      const maxBytes = await getSetting<number>('maxStorageBytes')
      expect(maxBytes).toBe(500_000_000)

      const syncTime = Date.now()
      await setSetting('lastSyncAt', syncTime)
      const lastSync = await getSetting<number>('lastSyncAt')
      expect(lastSync).toBe(syncTime)
    })
  })
})
