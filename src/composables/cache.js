// Cache compartido para SWR (imperativo + reactivo)
const CACHE = new Map()
const DEFAULT_TTL = 60_000 // 1 minuto

export function getCacheEntry(key) {
  return CACHE.get(key)
}

export function setCacheEntry(key, data) {
  CACHE.set(key, { data, ts: Date.now() })
}

export function getCache() {
  return CACHE
}

export function invalidateCache(pattern) {
  for (const key of CACHE.keys()) {
    if (typeof pattern === 'string' ? key === pattern : pattern.test(key)) {
      CACHE.delete(key)
    }
  }
}

/** Helper imperativo para cachear funciones async (ideal para services). */
export function withCache(fn, keyFn, options = {}) {
  const { ttl = DEFAULT_TTL } = options
  return async (...args) => {
    const key = keyFn(...args)
    const now = Date.now()
    const cached = getCacheEntry(key)

    if (cached && now - cached.ts < ttl) {
      return cached.data
    }

    try {
      const result = await fn(...args)
      setCacheEntry(key, result)
      return result
    } catch (e) {
      if (cached) {
        return cached.data // stale fallback
      }
      throw e
    }
  }
}
