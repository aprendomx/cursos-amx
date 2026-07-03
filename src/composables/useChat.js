import { ref, computed } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import {
  fetchMensajes,
  enviarMensaje,
  eliminarMensajeChat,
  fetchParticipantesCurso,
  useChatRealtime,
} from '@/services/chat.js'
import { fetchInstructoresDeCurso } from '@/services/instructores.js'

/**
 * Chat en tiempo real de un curso (sesionId=null) o de un aula
 * virtual (sesionId con valor). Mensajes persistidos + realtime,
 * badge de instructor, eliminación por instructor y soporte de
 * @menciones con autocompletado.
 */
export function useChat(cursoId, { sesionId = null, userId = null, esAdmin = false } = {}) {
  const habilitado = featureEnabled('chat')

  const mensajes = ref([])
  const participantes = ref([])
  const instructorIds = ref(new Set())
  const loading = ref(false)
  const enviando = ref(false)
  const error = ref('')

  const esInstructorCurso = computed(() => esAdmin || (userId && instructorIds.value.has(userId)))

  async function init() {
    if (!habilitado) return
    loading.value = true
    error.value = ''
    try {
      const [m, p, ids] = await Promise.all([
        fetchMensajes(cursoId, { sesionId }),
        fetchParticipantesCurso(cursoId),
        fetchInstructoresDeCurso(cursoId),
      ])
      mensajes.value = m
      participantes.value = p
      instructorIds.value = new Set(ids)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }

    useChatRealtime(cursoId, sesionId, {
      onInsert: (msg) => {
        if (!mensajes.value.some((m) => m.id === msg.id)) mensajes.value.push(msg)
      },
      onDelete: (id) => {
        mensajes.value = mensajes.value.filter((m) => m.id !== id)
      },
    })
  }

  async function enviar(contenido) {
    const texto = contenido.trim()
    if (!texto) return null
    enviando.value = true
    error.value = ''
    try {
      const msg = await enviarMensaje({ cursoId, sesionId, contenido: texto })
      if (!mensajes.value.some((m) => m.id === msg.id)) mensajes.value.push(msg)
      return msg
    } catch (e) {
      error.value = e?.message || String(e)
      return null
    } finally {
      enviando.value = false
    }
  }

  async function eliminar(mensajeId) {
    error.value = ''
    try {
      await eliminarMensajeChat(mensajeId)
      mensajes.value = mensajes.value.filter((m) => m.id !== mensajeId)
    } catch (e) {
      error.value = e?.message || String(e)
    }
  }

  const esDeInstructor = (msg) => instructorIds.value.has(msg?.user_id)

  /* ── @menciones ── */
  // Identificador de mención: nombre con guiones bajos (@Maria_Lopez)
  const slugMencion = (nombre) =>
    '@' +
    String(nombre || '')
      .trim()
      .replace(/\s+/g, '_')

  function sugerencias(query) {
    const q = String(query || '').toLowerCase()
    if (!q) return participantes.value.slice(0, 6)
    return participantes.value.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 6)
  }

  // Divide el contenido en segmentos texto/mención para renderizar
  // las menciones resaltadas sin usar v-html.
  function segmentos(contenido) {
    const out = []
    const re = /@[\p{L}\p{N}_]+/gu
    let last = 0
    for (const m of String(contenido).matchAll(re)) {
      if (m.index > last) out.push({ tipo: 'texto', valor: contenido.slice(last, m.index) })
      out.push({ tipo: 'mencion', valor: m[0] })
      last = m.index + m[0].length
    }
    if (last < contenido.length) out.push({ tipo: 'texto', valor: contenido.slice(last) })
    return out
  }

  return {
    habilitado,
    mensajes,
    participantes,
    loading,
    enviando,
    error,
    esInstructorCurso,
    esDeInstructor,
    init,
    enviar,
    eliminar,
    slugMencion,
    sugerencias,
    segmentos,
  }
}
