import { ref, computed } from 'vue'
import { getCache, setCacheEntry, invalidateCache, getCacheEntry } from './cache.js'

const DEFAULT_TTL = 60_000 // 1 minuto

export { invalidateCache }

export function useCachedFetch(fetcher, keyFn, options = {}) {
  const { ttl = DEFAULT_TTL } = options
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const cacheKey = computed(() => keyFn?.() || 'default')

  async function refresh(force = false) {
    const key = cacheKey.value
    const now = Date.now()
    const cached = getCacheEntry(key)

    if (!force && cached && now - cached.ts < ttl) {
      data.value = cached.data
      loading.value = false
      return data.value
    }

    loading.value = true
    error.value = null
    try {
      const result = await fetcher()
      setCacheEntry(key, result)
      data.value = result
      return result
    } catch (e) {
      error.value = e
      // Si hay cache aunque sea stale, la usamos como fallback
      if (cached) {
        data.value = cached.data
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    const key = cacheKey.value
    const cache = getCache()
    cache.delete(key)
  }

  return { data, loading, error, refresh, invalidate }
}
