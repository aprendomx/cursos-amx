import { ref, computed } from 'vue'
import { listarEntregasPorTarea, calificarEntrega, devolverEntrega } from '@/services/entregas.js'

export function useEntregasInstructor(tareaId) {
  const entregas = ref([])
  const loading = ref(false)
  const error = ref(null)

  const pendientes = computed(() => entregas.value.filter((e) => e.estado === 'entregada'))
  const calificadas = computed(() => entregas.value.filter((e) => e.estado === 'calificada'))
  const estadisticas = computed(() => ({
    total: entregas.value.length,
    pendientes: pendientes.value.length,
    calificadas: calificadas.value.length,
    promedio: calificadas.value.length
      ? calificadas.value.reduce((s, e) => s + (e.puntaje_final || 0), 0) / calificadas.value.length
      : 0,
  }))

  async function cargar() {
    loading.value = true
    error.value = null
    try {
      entregas.value = await listarEntregasPorTarea(tareaId)
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function calificar(entregaId, payload) {
    loading.value = true
    error.value = null
    try {
      await calificarEntrega(entregaId, payload)
      await cargar()
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  async function devolver(entregaId, comentario) {
    loading.value = true
    error.value = null
    try {
      await devolverEntrega(entregaId, comentario)
      await cargar()
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    entregas,
    loading,
    error,
    pendientes,
    calificadas,
    estadisticas,
    cargar,
    calificar,
    devolver,
  }
}
