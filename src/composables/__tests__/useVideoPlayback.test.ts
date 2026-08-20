import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, nextTick } from 'vue'
import { useVideoPlayback } from '../useVideoPlayback'

vi.mock('@/services/progreso.js', () => ({
  marcarLeccionCompletada: vi.fn(() => Promise.resolve()),
}))
import { marcarLeccionCompletada } from '@/services/progreso.js'

describe('useVideoPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  function factory() {
    return useVideoPlayback({
      leccion: computed(() => ({ id: 'l1', duracion_seg: 60 }) as any),
      sourceKind: computed(() => 'youtube'),
      totalTime: computed(() => 60),
    })
  }

  it('simula playback por intervalo', async () => {
    vi.useFakeTimers()
    const pb = factory()
    pb.togglePlay()
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(pb.currentTime.value).toBe(2)
    vi.advanceTimersByTime(4000)
    expect(pb.currentTime.value).toBe(10)
    pb.stopPlayback()
    vi.useRealTimers()
  })

  it('marca completado al llegar al final', async () => {
    vi.useFakeTimers()
    const pb = useVideoPlayback({
      leccion: computed(() => ({ id: 'l1', duracion_seg: 10 }) as any),
      sourceKind: computed(() => 'youtube'),
      totalTime: computed(() => 10),
    })
    pb.togglePlay()
    await nextTick()
    vi.advanceTimersByTime(6000)
    expect(pb.completada.value).toBe(true)
    expect(pb.playing.value).toBe(false)
    vi.useRealTimers()
  })

  it('handleSeek salta a posición', () => {
    const pb = factory()
    pb.handleSeek(0.5)
    expect(pb.currentTime.value).toBe(30)
  })

  it('handleFinLectura marca como completado', () => {
    const pb = factory()
    pb.handleFinLectura()
    expect(pb.llegoAlFinal.value).toBe(true)
  })

  it('marcarLecturaCompletada llama al servicio', async () => {
    const pb = factory()
    await pb.marcarLecturaCompletada()
    expect(marcarLeccionCompletada).toHaveBeenCalledWith('l1')
    expect(pb.completada.value).toBe(true)
  })
})
