import { ref, readonly } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { FEATURES } from '@/lib/featureFlags.js'

const runtimeFlags = ref(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref(null)

const CACHE_KEY = 'feature_toggles'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

let cache = null
let cacheTs = 0

export async function loadFeatureFlags() {
  if (loading.value) return
  const now = Date.now()
  if (cache && now - cacheTs < CACHE_TTL) {
    runtimeFlags.value = cache
    loaded.value = true
    return cache
  }

  loading.value = true
  error.value = null
  try {
    const { data, error: sbError } = await supabase.from('feature_toggles').select('key, enabled')

    if (sbError) throw sbError

    const map = {}
    for (const row of data || []) {
      map[row.key] = row.enabled === true
    }

    cache = map
    cacheTs = now
    runtimeFlags.value = map
    loaded.value = true
    return map
  } catch (e) {
    error.value = e
    // Fallback: deja runtimeFlags en null para que isEnabled use FEATURES
    console.warn(
      '[featureFlags] Error cargando flags en caliente, usando build-time fallback:',
      e.message
    )
  } finally {
    loading.value = false
  }
}

export function isEnabled(key) {
  // Prioridad: runtime > build-time
  if (runtimeFlags.value && key in runtimeFlags.value) {
    return runtimeFlags.value[key] === true
  }
  return FEATURES[key] === true
}

export function useFeatureFlags() {
  return {
    flags: readonly(runtimeFlags),
    loaded: readonly(loaded),
    loading: readonly(loading),
    error: readonly(error),
    isEnabled,
    load: loadFeatureFlags,
  }
}
