import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { sbSelect, sbInsert } from '@/lib/sbRest'
import { fetchInstructoresDeCurso } from '@/services/instructores'
import { COMENTARIOS_FUENTE, USER } from '@/data.js'

export type ComentarioItem = {
  id: number
  user: string
  dep: string
  t: string
  texto: string
  own?: boolean
  esInstructor?: boolean
  destacado?: boolean
}

export interface LessonChatOptions {
  leccionId: Ref<string>
  session: ComputedRef<{ access_token: string; user: { id: string } } | null>
  appUser: ComputedRef<{ nombre: string; apellidos?: string } | null>
  cursoId?: string
}

export function useLessonChat({ leccionId, session, appUser, cursoId }: LessonChatOptions) {
  const comentarios = ref<ComentarioItem[]>([])
  const instructorIds = ref(new Set<string>())
  const draft = ref('')

  const userName = computed(() => {
    if (appUser?.value?.nombre)
      return `${appUser.value.nombre} ${(appUser.value.apellidos || '')[0] || ''}.`
    return `${USER.nombre} ${USER.apellidos.charAt(0)}.`
  })

  const sendComment = async () => {
    if (!draft.value.trim()) return
    const text = draft.value.trim()
    comentarios.value.push({
      id: Date.now(),
      user: userName.value,
      dep: '',
      t: 'ahora',
      texto: text,
      own: true,
    })
    draft.value = ''
    if (session.value?.access_token && /^[0-9a-f]{8}-/.test(leccionId.value)) {
      try {
        await sbInsert(
          'comentarios',
          {
            user_id: session.value.user.id,
            leccion_id: leccionId.value,
            contenido: text,
          },
          session.value.access_token,
          false
        )
      } catch (e) {
        console.error('Error saving comment:', e)
      }
    }
  }

  let pollComentarios: ReturnType<typeof setInterval> | null = null
  let comentariosAbort: AbortController | null = null

  async function loadComentarios(leccionIdStr: string, token?: string) {
    if (!leccionIdStr || !/^[0-9a-f]{8}-/.test(leccionIdStr)) return
    if (comentariosAbort) comentariosAbort.abort()
    comentariosAbort = new AbortController()
    try {
      const { data } = await sbSelect(
        `comentarios?select=*,perfiles(nombres,apellido_paterno,dependencias(siglas))&leccion_id=eq.${leccionIdStr}&order=creado_en.asc&limit=50`,
        token,
        { signal: comentariosAbort.signal }
      )
      comentarios.value = (data || []).map((c) => ({
        id: c.id,
        user: (c.perfiles?.nombres || '') + ' ' + (c.perfiles?.apellido_paterno?.[0] || '') + '.',
        dep: c.perfiles?.dependencias?.siglas || '',
        t: new Date(c.creado_en).toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        texto: c.contenido,
        esInstructor: instructorIds.value.has(c.user_id),
        destacado: c.destacado === true,
      }))
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      if (e instanceof TypeError && e.message === 'Failed to fetch') return
      console.warn('Error cargando comentarios:', e)
    }
  }

  onMounted(async () => {
    const token = session.value?.access_token
    const isRealCurso = cursoId ? /^[0-9a-f]{8}-/.test(cursoId) : false

    if (isRealCurso && session.value) {
      try {
        instructorIds.value = new Set(await fetchInstructoresDeCurso(cursoId))
      } catch (e) {
        console.warn('instructores:', e)
      }
    }

    await loadComentarios(leccionId.value, token)

    if (session.value?.access_token && /^[0-9a-f]{8}-/.test(leccionId.value)) {
      pollComentarios = setInterval(() => {
        loadComentarios(leccionId.value, session.value?.access_token)
      }, 8000)
    }
  })

  watch(leccionId, async (id: string) => {
    if (!id) return
    await loadComentarios(id, session.value?.access_token)
  })

  onUnmounted(() => {
    if (pollComentarios) clearInterval(pollComentarios)
    if (comentariosAbort) comentariosAbort.abort()
  })

  return {
    comentarios,
    instructorIds,
    draft,
    sendComment,
  }
}
