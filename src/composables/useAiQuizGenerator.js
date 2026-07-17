import { ref } from 'vue'
import { generarQuizIA } from '@/services/aiService'

export function useAiQuizGenerator() {
  const preguntas = ref([])
  const loading = ref(false)
  const error = ref('')

  async function generar(tema, nivel, cantidad) {
    loading.value = true
    error.value = ''
    try {
      preguntas.value = await generarQuizIA(tema, nivel, cantidad)
    } catch (e) {
      error.value = e?.message || 'Error al generar quiz'
      preguntas.value = []
    } finally {
      loading.value = false
    }
  }

  function limpiar() {
    preguntas.value = []
    error.value = ''
  }

  return { preguntas, loading, error, generar, limpiar }
}
