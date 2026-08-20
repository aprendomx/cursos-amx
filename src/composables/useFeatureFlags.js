import { ref, readonly } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { featureEnabled, setRuntimeFlags } from '@/lib/featureFlags.js'

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
    // Publica los flags en la capa síncrona: es lo que hace que los ~90
    // sitios que llaman featureEnabled() vean el valor de la base y no el
    // de build-time.
    setRuntimeFlags(map)
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

// Se conserva por compatibilidad: delega en la única implementación.
export function isEnabled(key) {
  return featureEnabled(key)
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
