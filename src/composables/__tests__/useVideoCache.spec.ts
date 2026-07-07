import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useVideoCache } from '../useVideoCache'

vi.mock('@/lib/featureFlags', () => ({ featureEnabled: vi.fn(() => true) }))
vi.mock('@/offline/video-cache', () => ({
  downloadVideo: vi.fn().mockResolvedValue(undefined),
  isVideoAvailable: vi.fn().mockResolvedValue(false),
  removeVideo: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn().mockResolvedValue({ count: 0, totalSize: 0 }),
}))

describe('useVideoCache', () => {
  it('inicia en estado correcto', async () => {
    const { downloading, progress } = useVideoCache()
    await flushPromises()
    expect(downloading.value).toBe(false)
    expect(progress.value).toBe(0)
  })
})
