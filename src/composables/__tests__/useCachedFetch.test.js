import { describe, it, expect, vi } from 'vitest'
import { useCachedFetch, invalidateCache } from '../useCachedFetch.js'

describe('useCachedFetch', () => {
  it('fetches and caches data (second call uses cache, no extra fetch)', async () => {
    let callCount = 0
    const fetcher = vi.fn(async () => {
      callCount++
      return { items: [1, 2, 3] }
    })

    const { refresh, data } = useCachedFetch(fetcher, () => 'key1')

    const result1 = await refresh()
    expect(callCount).toBe(1)
    expect(result1.items).toEqual([1, 2, 3])
    expect(data.value.items).toEqual([1, 2, 3])

    const result2 = await refresh()
    expect(callCount).toBe(1) // cache hit
    expect(result2.items).toEqual([1, 2, 3])
  })

  it('force refetch when force=true', async () => {
    let callCount = 0
    const fetcher = vi.fn(async () => {
      callCount++
      return { count: callCount }
    })

    const { refresh } = useCachedFetch(fetcher, () => 'key2')

    await refresh()
    expect(callCount).toBe(1)

    await refresh(true)
    expect(callCount).toBe(2)

    const result = await refresh()
    expect(callCount).toBe(2) // cache hit
    expect(result.count).toBe(2)
  })

  it('stale cache fallback on error', async () => {
    let shouldFail = false
    const fetcher = vi.fn(async () => {
      if (shouldFail) throw new Error('Network error')
      return { ok: true }
    })

    const { refresh, data, error } = useCachedFetch(fetcher, () => 'key3')

    // Primera llamada exitosa
    await refresh()
    expect(data.value.ok).toBe(true)

    // Segunda llamada falla
    shouldFail = true
    try {
      await refresh(true)
    } catch (e) {
      // Error esperado
    }

    expect(error.value).toBeInstanceOf(Error)
    expect(data.value.ok).toBe(true) // fallback a stale cache
  })

  it('invalidate clears cache for current key', async () => {
    let callCount = 0
    const fetcher = vi.fn(async () => {
      callCount++
      return { v: callCount }
    })

    const { refresh, invalidate } = useCachedFetch(fetcher, () => 'key4')

    await refresh()
    expect(callCount).toBe(1)

    invalidate()

    await refresh()
    expect(callCount).toBe(2)
  })

  it('invalidateCache pattern invalidates multiple keys', async () => {
    let callCount = 0
    const fetcher = vi.fn(async () => {
      callCount++
      return { v: callCount }
    })

    const c1 = useCachedFetch(fetcher, () => 'prefix-a')
    const c2 = useCachedFetch(fetcher, () => 'prefix-b')
    const c3 = useCachedFetch(fetcher, () => 'other')

    await c1.refresh()
    await c2.refresh()
    await c3.refresh()
    expect(callCount).toBe(3)

    invalidateCache(/^prefix-/)

    await c1.refresh()
    await c2.refresh()
    await c3.refresh()
    expect(callCount).toBe(5) // c1 y c2 se invalidaron, c3 sigue en cache
  })
})
