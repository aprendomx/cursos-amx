import { ref, computed } from 'vue'
import {
  fetchSesionesCurso,
  confirmarRSVP,
  cancelarRSVP,
  listarRSVP,
} from '@/services/sesionesVirtuales.js'

export function useSesiones(cursoId, userId) {
  const sesiones = ref([])
  const rsvps = ref([])
  const loading = ref(false)
  const error = ref('')

  const miRSVP = computed(() => {
    const map = new Map()
    for (const r of rsvps.value) map.set(r.sesion_id, r.estado)
    return map
  })

  const confirmadosCount = computed(() => {
    const map = new Map()
    for (const r of rsvps.value) {
      if (r.estado === 'confirmado' || r.estado === 'asistio') {
        const count = map.get(r.sesion_id) || 0
        map.set(r.sesion_id, count + 1)
      }
    }
    return map
  })

  function puedeUnirse(sesion) {
    const ahora = new Date()
    const inicio = new Date(sesion.programada_en || sesion.inicio)
    const fin = sesion.fin ? new Date(sesion.fin) : new Date(inicio.getTime() + 3600000)
    return ahora >= inicio && ahora <= fin
  }

  function estaEnVivo(sesion) {
    return sesion.estado === 'en_vivo'
  }

  async function cargar() {
    loading.value = true
    error.value = ''
    try {
      sesiones.value = await fetchSesionesCurso(cursoId)

      // Load RSVPs for all sessions
      const allRsvps = []
      for (const s of sesiones.value) {
        const r = await listarRSVP(s.id)
        allRsvps.push(...r)
      }
      rsvps.value = allRsvps
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function confirmar(sesionId) {
    try {
      await confirmarRSVP(sesionId, userId)
      await cargar()
    } catch (e) {
      error.value = e?.message || String(e)
    }
  }

  async function cancelar(sesionId) {
    try {
      await cancelarRSVP(sesionId, userId)
      await cargar()
    } catch (e) {
      error.value = e?.message || String(e)
    }
  }

  return {
    sesiones,
    rsvps,
    loading,
    error,
    miRSVP,
    confirmadosCount,
    puedeUnirse,
    estaEnVivo,
    cargar,
    confirmar,
    cancelar,
  }
}
