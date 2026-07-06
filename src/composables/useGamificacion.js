import { ref, computed } from 'vue'
import {
  listarBadges,
  listarNiveles,
  obtenerPuntosUsuario,
  obtenerNivelUsuario,
  listarBadgesUsuario,
  listarLogPuntos,
} from '@/services/gamificacion.js'
import { evaluarBadges } from '@/services/badgeEngine.js'

export function useGamificacion(userId) {
  const badges = ref([])
  const niveles = ref([])
  const puntos = ref(0)
  const nivel = ref({ puntos_totales: 0, nivel_nombre: 'Novato', color: '#6b7280' })
  const badgesUsuario = ref([])
  const logPuntos = ref([])
  const loading = ref(false)
  const error = ref(null)
  const nuevosBadges = ref([])

  const badgesIdsUsuario = computed(() => {
    return new Set(badgesUsuario.value.map((b) => b.badge_id))
  })

  async function cargar() {
    if (!userId) return
    loading.value = true
    error.value = null
    try {
      const [b, n, p, nv, bu, lp] = await Promise.all([
        listarBadges(),
        listarNiveles(),
        obtenerPuntosUsuario(userId),
        obtenerNivelUsuario(userId),
        listarBadgesUsuario(userId),
        listarLogPuntos(userId),
      ])
      badges.value = b
      niveles.value = n
      puntos.value = p
      nivel.value = nv
      badgesUsuario.value = bu
      logPuntos.value = lp
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function verificarBadges() {
    if (!userId) return
    try {
      const nuevos = await evaluarBadges(userId)
      nuevosBadges.value = nuevos || []
      if (nuevosBadges.value.length > 0) {
        await cargar()
      }
    } catch (e) {
      error.value = e
    }
  }

  function clearNuevos() {
    nuevosBadges.value = []
  }

  return {
    badges,
    niveles,
    puntos,
    nivel,
    badgesUsuario,
    logPuntos,
    loading,
    error,
    nuevosBadges,
    badgesIdsUsuario,
    cargar,
    verificarBadges,
    clearNuevos,
  }
}
