import { ref } from 'vue'
import { obtenerFunnel, obtenerRetencion, obtenerComparativa } from '@/services/reportes.js'

export function useReportes() {
  const funnel = ref(null)
  const retencion = ref([])
  const comparativa = ref([])
  const loading = ref({ funnel: false, retencion: false, comparativa: false })
  const error = ref({ funnel: null, retencion: null, comparativa: null })

  async function cargarFunnel(cursoId, desde, hasta) {
    loading.value.funnel = true
    error.value.funnel = null
    try {
      funnel.value = await obtenerFunnel(cursoId, desde, hasta)
    } catch (e) {
      error.value.funnel = e?.message || 'Error al cargar funnel'
    } finally {
      loading.value.funnel = false
    }
  }

  async function cargarRetencion(cursoId) {
    loading.value.retencion = true
    error.value.retencion = null
    try {
      retencion.value = await obtenerRetencion(cursoId)
    } catch (e) {
      error.value.retencion = e?.message || 'Error al cargar retención'
    } finally {
      loading.value.retencion = false
    }
  }

  async function cargarComparativa(desde, hasta) {
    loading.value.comparativa = true
    error.value.comparativa = null
    try {
      comparativa.value = await obtenerComparativa(desde, hasta)
    } catch (e) {
      error.value.comparativa = e?.message || 'Error al cargar comparativa'
    } finally {
      loading.value.comparativa = false
    }
  }

  async function cargarTodo(cursoId, desde, hasta) {
    await Promise.all([
      cargarFunnel(cursoId, desde, hasta),
      cargarRetencion(cursoId),
      cargarComparativa(desde, hasta),
    ])
  }

  return {
    funnel,
    retencion,
    comparativa,
    loading,
    error,
    cargarFunnel,
    cargarRetencion,
    cargarComparativa,
    cargarTodo,
  }
}
