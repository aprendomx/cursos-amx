import { ref, computed } from 'vue'
import { obtenerSegmentoActual } from '@/services/grabaciones.js'

export function useReproductor(sesionId) {
  const tiempoActual = ref(0)
  const transcripcion = ref(null)
  const loading = ref(false)

  const segmentoActual = computed(() => {
    if (!transcripcion.value?.segmentos) return null
    const segmentos = Array.isArray(transcripcion.value.segmentos)
      ? transcripcion.value.segmentos
      : []
    return (
      segmentos.find((s) => s.start <= tiempoActual.value && s.end >= tiempoActual.value) || null
    )
  })

  const textoCercano = computed(() => {
    if (!transcripcion.value?.segmentos) return ''
    const segmentos = Array.isArray(transcripcion.value.segmentos)
      ? transcripcion.value.segmentos
      : []
    const idx = segmentos.findIndex(
      (s) => s.start <= tiempoActual.value && s.end >= tiempoActual.value
    )
    if (idx === -1) return ''
    // Devolver texto del segmento actual + contexto de 1 antes y 1 después
    const contexto = segmentos.slice(Math.max(0, idx - 1), idx + 2)
    return contexto.map((s) => s.text).join(' ')
  })

  async function cargarTranscripcion() {
    loading.value = true
    try {
      const { obtenerTranscripcion } = await import('@/services/grabaciones.js')
      transcripcion.value = await obtenerTranscripcion(sesionId)
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  function saltarATiempo(segundos) {
    tiempoActual.value = segundos
  }

  function actualizarTiempo(segundos) {
    tiempoActual.value = segundos
  }

  return {
    tiempoActual,
    transcripcion,
    segmentoActual,
    textoCercano,
    loading,
    cargarTranscripcion,
    saltarATiempo,
    actualizarTiempo,
  }
}
