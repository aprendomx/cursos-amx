import { ref, computed } from 'vue'
import { listarGrabacionesPorCurso, buscarTranscripciones } from '@/services/grabaciones.js'

export function useGrabaciones(cursoId) {
  const grabaciones = ref([])
  const resultadosBusqueda = ref([])
  const loading = ref(false)
  const error = ref('')

  const grabacionesPorEstado = computed(() => {
    const map = new Map()
    for (const g of grabaciones.value) {
      const estado = g.estado || 'otro'
      if (!map.has(estado)) map.set(estado, [])
      map.get(estado).push(g)
    }
    return map
  })

  async function cargar() {
    loading.value = true
    error.value = ''
    try {
      grabaciones.value = await listarGrabacionesPorCurso(cursoId)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function buscar(query) {
    if (!query.trim()) {
      resultadosBusqueda.value = []
      return
    }
    loading.value = true
    error.value = ''
    try {
      resultadosBusqueda.value = await buscarTranscripciones(query)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  return { grabaciones, resultadosBusqueda, grabacionesPorEstado, loading, error, cargar, buscar }
}
