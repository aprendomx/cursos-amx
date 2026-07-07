import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useSyncStatus } from '../useSyncStatus'

vi.mock('@/lib/featureFlags', () => ({ featureEnabled: vi.fn(() => true) }))
vi.mock('@/offline/offline-db', () => ({
  getPendingActions: vi.fn().mockResolvedValue([]),
  getAllActions: vi.fn().mockResolvedValue([]),
  clearDoneActions: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/offline/sync-queue', () => ({
  sync: vi.fn().mockResolvedValue(undefined),
  retryFailed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/offline/network-status', () => ({
  onOnline: vi.fn(),
}))

describe('useSyncStatus', () => {
  it('pendingCount inicia en 0', async () => {
    const { pendingCount } = useSyncStatus()
    await flushPromises()
    expect(pendingCount.value).toBe(0)
  })
})
