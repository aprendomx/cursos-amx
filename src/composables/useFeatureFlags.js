import { ref, readonly } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { featureEnabled, setRuntimeFlags } from '@/lib/featureFlags.js'
import { theme } from '@/lib/theme.js'

const runtimeFlags = ref(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref(null)

const CACHE_KEY = `${theme.app.storagePrefix}-feature-toggles`
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

// Cuánto se aceptan los flags guardados en disco. Se refrescan en cada carga,
// así que en la práctica nunca pasan de una sesión de antigüedad; el límite es
// para la instalación que estuvo meses sin abrirse.
const CACHE_DISCO_TTL = 24 * 60 * 60 * 1000

let cache = null
let cacheTs = 0

/**
 * Lee los flags que dejó la última visita. SÍNCRONA a propósito: su razón de
 * ser es poder montar la aplicación sin esperar a la red.
 *
 * @returns {Record<string, boolean>|null} los flags, o null si no hay o caducaron
 */
export function leerFlagsGuardados() {
  try {
    const crudo = localStorage.getItem(CACHE_KEY)
    if (!crudo) return null
    const { flags, ts } = JSON.parse(crudo)
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null
    if (!Number.isFinite(ts) || Date.now() - ts > CACHE_DISCO_TTL) return null
    return flags
  } catch {
    // localStorage puede estar bloqueado (modo privado, políticas del sitio) y
    // el JSON puede estar corrupto. Ninguna de las dos cosas debe impedir que
    // la aplicación arranque.
    return null
  }
}

function guardarFlags(flags) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ flags, ts: Date.now() }))
  } catch {
    // Sin espacio o sin permiso: se pierde la ventaja del arranque instantáneo
    // en la próxima visita, nada más.
  }
}

/**
 * Publica en la capa síncrona los flags de la última visita, para que el
 * primer render los use sin haber tocado la red.
 *
 * @returns {boolean} si había algo guardado que usar
 */
export function hidratarFlagsGuardados() {
  const flags = leerFlagsGuardados()
  if (!flags) return false
  cache = flags
  cacheTs = Date.now()
  runtimeFlags.value = flags
  setRuntimeFlags(flags)
  return true
}

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
    // Se guardan en disco para que la PRÓXIMA carga no tenga que esperar a la
    // red antes de montar. Ver hidratarFlagsGuardados() y src/main.js.
    guardarFlags(map)
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
