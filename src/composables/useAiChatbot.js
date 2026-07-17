import { ref } from 'vue'
import { chatAsistente } from '@/services/aiService'

export function useAiChatbot() {
  const messages = ref([])
  const loading = ref(false)
  const error = ref('')

  async function enviarMensaje(texto, contexto) {
    if (!texto.trim()) return
    loading.value = true
    error.value = ''

    messages.value.push({ role: 'user', content: texto })

    try {
      const history = messages.value.slice(0, -1) // todo excepto el último
      const respuesta = await chatAsistente(texto, contexto, history)
      messages.value.push({ role: 'assistant', content: respuesta })
    } catch (e) {
      error.value = e?.message || 'Error al obtener respuesta'
      messages.value.pop() // quitar el mensaje del usuario si falló
    } finally {
      loading.value = false
    }
  }

  function limpiar() {
    messages.value = []
    error.value = ''
  }

  return { messages, loading, error, enviarMensaje, limpiar }
}
