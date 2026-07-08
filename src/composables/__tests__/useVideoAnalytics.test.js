import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVideoAnalytics } from '@/composables/useVideoAnalytics.js'

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    session: { user: { id: 'user-1' } },
  }),
}))

describe('useVideoAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit when disabled', () => {
    const { emit } = useVideoAnalytics({ enabled: false })
    expect(() => emit('play', 10)).not.toThrow()
  })

  it('startTracking requires video element', () => {
    const { startTracking } = useVideoAnalytics({ enabled: true })
    expect(() => startTracking(null)).not.toThrow()
  })

  it('emits event with correct structure', () => {
    const { emit } = useVideoAnalytics({
      leccionId: 'l1',
      cursoId: 'c1',
      videoId: 'v1',
      enabled: true,
    })
    expect(() => emit('play', 15, { playback_rate: 1 })).not.toThrow()
  })
})
