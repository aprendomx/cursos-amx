import { ref } from 'vue'
import { resumirLeccion } from '@/services/aiService.js'

export function useAiSummarizer() {
  const summary = ref('')
  const loading = ref(false)
  const error = ref('')
  const isCached = ref(false)

  async function resumir(content, contentType, leccionId) {
    loading.value = true
    error.value = ''
    try {
      const result = await resumirLeccion(content, contentType, leccionId)
      summary.value = result.summary
      isCached.value = result.cached
    } catch (e) {
      error.value = e?.message || 'Error al resumir'
      summary.value = ''
    } finally {
      loading.value = false
    }
  }

  function limpiar() {
    summary.value = ''
    error.value = ''
    isCached.value = false
  }

  return { summary, loading, error, isCached, resumir, limpiar }
}
