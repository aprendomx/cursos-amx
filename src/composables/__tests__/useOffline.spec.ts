import { describe, it, expect, vi } from 'vitest'
import { useOffline } from '../useOffline'

vi.mock('@/lib/featureFlags', () => ({ featureEnabled: vi.fn(() => true) }))

vi.mock('@/offline/network-status', () => ({
  getIsOnline: vi.fn(() => ({ value: true })),
}))

describe('useOffline', () => {
  it('isOffline es false cuando está online', () => {
    const { isOffline } = useOffline()
    expect(isOffline.value).toBe(false)
  })
})
