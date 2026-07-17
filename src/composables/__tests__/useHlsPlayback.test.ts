import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useHlsPlayback } from '../useHlsPlayback'

vi.mock('@/services/videos', () => ({ getPlayback: vi.fn() }))
vi.mock('@/services/progreso.js', () => ({
  actualizarSegundosVistos: vi.fn(() => Promise.resolve()),
  marcarLeccionCompletada: vi.fn(() => Promise.resolve())
}))
vi.mock('@/composables/useHlsPlayer.js', () => ({ useHlsPlayer: vi.fn() }))

import { getPlayback } from '@/services/videos'
import { actualizarSegundosVistos, marcarLeccionCompletada } from '@/services/progreso.js'
import { useHlsPlayer } from '@/composables/useHlsPlayer.js'

describe('useHlsPlayback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads signed URLs when videoId changes', async () => {
    getPlayback.mockResolvedValue({ master_url: 'https://hls.test/master.m3u8', poster_url: 'https://poster.test/poster.jpg', duracion_seg: 120 })
    const hls = useHlsPlayback({
      videoId: computed(() => 'vid-123'),
      leccionId: ref('lec-123'),
      session: computed(() => ({ access_token: 'tok' }))
    })
    await nextTick()
    await new Promise(r => setTimeout(r, 10))
    expect(getPlayback).toHaveBeenCalledWith('vid-123')
    expect(hls.hlsMasterUrl.value).toBe('https://hls.test/master.m3u8')
  })

  it('onHlsTimeUpdate schedules save', () => {
    vi.useFakeTimers()
    const hls = useHlsPlayback({
      videoId: computed(() => 'vid-123'),
      leccionId: ref('lec-123'),
      session: computed(() => ({ access_token: 'tok' }))
    })
    hls.videoEl.value = { currentTime: 10, duration: 100 } as HTMLVideoElement
    hls.onHlsTimeUpdate()
    vi.advanceTimersByTime(5000)
    expect(actualizarSegundosVistos).toHaveBeenCalledWith('lec-123', 10)
    vi.useRealTimers()
  })

  it('onHlsEnded marks lesson complete', async () => {
    marcarLeccionCompletada.mockResolvedValue({})
    const hls = useHlsPlayback({
      videoId: computed(() => 'vid-123'),
      leccionId: ref('lec-123'),
      session: computed(() => ({ access_token: 'tok' }))
    })
    hls.onHlsEnded()
    await nextTick()
    expect(marcarLeccionCompletada).toHaveBeenCalledWith('lec-123')
  })

  it('toggleHlsPlay calls video.play()', () => {
    const hls = useHlsPlayback({
      videoId: computed(() => 'vid-123'),
      leccionId: ref('lec-123'),
      session: computed(() => ({ access_token: 'tok' }))
    })
    const playMock = vi.fn(() => Promise.resolve())
    hls.videoEl.value = { paused: true, play: playMock } as unknown as HTMLVideoElement
    hls.toggleHlsPlay()
    expect(playMock).toHaveBeenCalled()
  })
})
