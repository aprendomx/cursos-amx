import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { COMENTARIOS_FUENTE, USER } from '@/data.js'
import { sbSelect, sbInsert, sbRpc } from '@/lib/sbRest.js'
import { supabase } from '@/lib/supabase.js'
import { useHlsPlayer } from '@/composables/useHlsPlayer.js'
import { useTiempoActividad } from '@/composables/useTiempoActividad.js'
import { getPlayback } from '@/services/videos.js'
import { actualizarSegundosVistos, marcarLeccionCompletada } from '@/services/progreso.js'
import { fetchInstructoresDeCurso } from '@/services/instructores.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import type { Leccion } from '@/types/database.ts'

export interface PlayerPageProps {
  cursoId: string
  leccionId?: string
}

export interface PlayerLesson extends Leccion {
  duracion: string
  duracion_seg: number
  youtube_url: string
  video_id: string | null
  documento_path: string | null
  documento_tipo: string | null
  contenido: Record<string, unknown> | null
  tipo: string
  completado: boolean
  modulo_titulo: string
  modulo_orden: number
  requiere_entrega: boolean
  entrega_tipos: string[] | null
  entrega_max_mb: number
}

export function usePlayerPage(props: PlayerPageProps) {
  const router = useRouter()
  const auth = useAuthStore()
  const ui = useUiStore()

  const appUser = computed(() => auth.user)
  const session = computed(() => auth.session)
  const tweaks = computed(() => ui.tweaks)

  useTiempoActividad({
    cursoId: () => (/^[0-9a-f]{8}-/.test(props.cursoId) ? props.cursoId : null),
    enabled: () => !!session.value?.access_token,
  })

  /* ── State ────────────────────────────────────────── */
  const currentLeccion = ref(props.leccionId || '')
  const playing = ref(false)
  const currentTime = ref(0)
  const totalTime = ref(735)
  const comentarios = ref([])
  const instructorIds = ref(new Set())
  const draft = ref('')
  const completada = ref(false)
  const llegoAlFinal = ref(false)

  function handleFinLectura() {
    llegoAlFinal.value = true
  }

  const videoEl = ref(null)
  const hlsMasterUrl = ref(null)
  const hlsPoster = ref(null)
  const hlsDuration = ref(0)

  const lecciones: Ref<PlayerLesson[]> = ref([])
  const cursoTitulo = ref('')
  const moduloTitulo = ref('')
  const loadingLecciones = ref(true)

  /* ── Derived ──────────────────────────────────────── */
  const curso = computed(() => ({ titulo: cursoTitulo.value }))
  // Placeholder mientras cargan las lecciones; solo se leen estos campos.
  const LECCION_CARGANDO = {
    id: '',
    titulo: 'Cargando...',
    orden: 1,
    duracion_seg: 735,
    tipo: 'video',
  } as PlayerLesson

  const leccion = computed(
    () =>
      lecciones.value.find((l) => l.id === currentLeccion.value) ||
      lecciones.value[0] ||
      LECCION_CARGANDO
  )

  async function marcarLecturaCompletada() {
    if (!leccion.value?.id || completada.value) return
    try {
      await marcarLeccionCompletada(leccion.value.id)
      completada.value = true
      const lec = lecciones.value.find((l) => l.id === leccion.value.id)
      if (lec) lec.completado = true
    } catch (e) {
      console.error('marcar leida:', e)
    }
  }

  function handleEvaluacionAprobada() {
    completada.value = true
    const lec = lecciones.value.find((l) => l.id === leccion.value.id)
    if (lec) lec.completado = true
  }

  function goToNextLesson() {
    const idx = lecciones.value.findIndex((l) => l.id === currentLeccion.value)
    const next = lecciones.value[idx + 1]
    if (next) {
      router.push({ name: 'player', params: { cursoId: props.cursoId, leccionId: next.id } })
    } else {
      router.push({ name: 'curso', params: { id: props.cursoId } })
    }
  }

  watch(
    () => leccion.value?.id,
    () => {
      llegoAlFinal.value = false
    }
  )

  const variant = computed(() => tweaks.value.playerLayout || 'split')
  const progress = computed(() => Math.min(currentTime.value / totalTime.value, 1))

  function fmtTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function extractYoutubeId(url) {
    if (!url) return ''
    const m = String(url).match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
    )
    return m?.[1] || ''
  }
  const youtubeId = computed(() => extractYoutubeId(leccion.value?.youtube_url))
  const youtubeEmbed = computed(() =>
    youtubeId.value ? `https://www.youtube.com/embed/${youtubeId.value}?rel=0&modestbranding=1` : ''
  )

  const source = computed(() => {
    if (leccion.value?.tipo === 'examen') return { kind: 'examen', leccionId: leccion.value.id }
    if (leccion.value?.documento_path) return { kind: 'documento', leccionId: leccion.value.id }
    if (leccion.value?.video_id) return { kind: 'hls', videoId: leccion.value.video_id }
    if (leccion.value?.contenido) return { kind: 'texto', leccionId: leccion.value.id }
    if (youtubeId.value) return { kind: 'youtube', id: youtubeId.value }
    return { kind: 'none' }
  })

  const completedCount = computed(() => lecciones.value.filter((l) => l.completado).length)
  const progressFraction = computed(() => `${completedCount.value}/${lecciones.value.length}`)
  const progressPct = computed(() =>
    lecciones.value.length ? Math.round((completedCount.value / lecciones.value.length) * 100) : 0
  )

  /* ── Tweaks helpers ───────────────────────────────── */
  function setVariant(v) {
    ui.updateTweaks({ ...tweaks.value, playerLayout: v })
  }

  /* ── Playback simulation ──────────────────────────── */
  let playInterval = null

  function startPlayback() {
    stopPlayback()
    playInterval = setInterval(() => {
      if (currentTime.value >= totalTime.value) {
        completada.value = true
        playing.value = false
        stopPlayback()
        return
      }
      currentTime.value += 2
    }, 1000)
  }

  function stopPlayback() {
    if (playInterval) {
      clearInterval(playInterval)
      playInterval = null
    }
  }

  function togglePlay() {
    if (source.value.kind === 'hls') {
      const el = videoEl.value
      if (!el) return
      if (el.paused) {
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch((err) => console.error('[player] video.play() rejected:', err))
        }
      } else {
        el.pause()
      }
      return
    }
    if (completada.value) return
    playing.value = !playing.value
  }

  watch(playing, (v) => {
    if (source.value.kind === 'hls') return
    if (v && !completada.value) startPlayback()
    else stopPlayback()
  })

  /* ── HLS playback ─────────────────────────────────── */
  async function loadHlsForVideo(videoId) {
    try {
      const data = await getPlayback(videoId)
      hlsMasterUrl.value = data.master_url
      hlsPoster.value = data.poster_url
      hlsDuration.value = data.duracion_seg || 0
      if (hlsDuration.value) totalTime.value = hlsDuration.value
    } catch (e) {
      console.warn('hls playback:', e)
      hlsMasterUrl.value = null
    }
  }

  watch(
    source,
    (s) => {
      if (s.kind === 'hls') loadHlsForVideo(s.videoId)
      else {
        hlsMasterUrl.value = null
        hlsPoster.value = null
      }
    },
    { immediate: true }
  )

  useHlsPlayer(videoEl, hlsMasterUrl, (err) => {
    if (err?.type === 'unsupported') return
    if (source.value.kind === 'hls') loadHlsForVideo(source.value.videoId)
  })

  let saveTimer = null
  function scheduleSave(leccionId, segundos) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      actualizarSegundosVistos(leccionId, segundos).catch(() => {})
    }, 5000)
  }
  function flushSave(leccionId, segundos) {
    clearTimeout(saveTimer)
    actualizarSegundosVistos(leccionId, segundos).catch(() => {})
  }

  function onHlsTimeUpdate() {
    const el = videoEl.value
    if (!el) return
    currentTime.value = el.currentTime
    totalTime.value = el.duration || totalTime.value
    if (leccion.value?.id) scheduleSave(leccion.value.id, el.currentTime)
    if (totalTime.value && el.currentTime / totalTime.value >= 0.9 && !completada.value) {
      marcarLeccionCompletada(leccion.value.id)
        .then(() => {
          completada.value = true
        })
        .catch(() => {})
    }
  }

  async function onHlsLoadedMetadata() {
    const el = videoEl.value
    if (!el || !leccion.value?.id) return
    totalTime.value = el.duration
    const { data } = await supabase
      .from('progreso')
      .select('segundos_vistos, completado')
      .eq('leccion_id', leccion.value.id)
      .maybeSingle()
    if (data && data.segundos_vistos > 5 && !data.completado) {
      el.currentTime = Math.max(0, data.segundos_vistos - 3)
    }
  }

  function onHlsEnded() {
    if (!leccion.value?.id) return
    flushSave(leccion.value.id, totalTime.value)
    marcarLeccionCompletada(leccion.value.id)
      .then(() => {
        completada.value = true
      })
      .catch(() => {})
  }

  watch(
    () => leccion.value?.id,
    (newId, oldId) => {
      if (oldId && videoEl.value) flushSave(oldId, videoEl.value.currentTime || 0)
    }
  )

  onBeforeUnmount(() => {
    if (leccion.value?.id && videoEl.value) {
      flushSave(leccion.value.id, videoEl.value.currentTime || 0)
    }
  })

  /* ── Mark lesson complete in Supabase ────────────── */
  watch(completada, async (val) => {
    if (!val || !session.value?.access_token) return
    const id = currentLeccion.value
    if (!/^[0-9a-f]{8}-/.test(id)) return
    const lec = lecciones.value.find((l) => l.id === id)
    if (lec) lec.completado = true
    if (source.value.kind === 'hls' || source.value.kind === 'documento') return
    try {
      await sbRpc('marcar_leccion_completada', { p_leccion_id: id }, session.value.access_token)
    } catch (e) {
      console.error('Error marking lesson complete:', e)
    }
  })

  /* ── Send comment ─────────────────────────────────── */
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
    if (session.value?.access_token && /^[0-9a-f]{8}-/.test(currentLeccion.value)) {
      try {
        await sbInsert(
          'comentarios',
          {
            user_id: session.value.user.id,
            leccion_id: currentLeccion.value,
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

  /* ── Seek handler delegated from PlayerVideoSurface ─ */
  function handleSeek(ratio) {
    const targetTime = Math.floor(ratio * totalTime.value)
    if (source.value.kind === 'hls') {
      const el = videoEl.value
      if (el) el.currentTime = targetTime
      currentTime.value = targetTime
      return
    }
    currentTime.value = targetTime
    if (currentTime.value >= totalTime.value) {
      completada.value = true
      playing.value = false
    } else {
      completada.value = false
      if (!playing.value) playing.value = true
    }
  }

  /* ── Select lesson ────────────────────────────────── */
  function selectLesson(id) {
    currentLeccion.value = id
    const l = lecciones.value.find((x) => x.id === id)
    if (l) {
      totalTime.value = l.duracion_seg || 735
      currentTime.value = 0
      completada.value = false
      playing.value = true
      moduloTitulo.value = l.modulo_titulo || moduloTitulo.value
    }
  }

  /* ── Progress bar seek ────────────────────────────── */
  function seekProgress(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetTime = Math.floor(ratio * totalTime.value)
    if (source.value.kind === 'hls') {
      const el = videoEl.value
      if (el) el.currentTime = targetTime
      currentTime.value = targetTime
      return
    }
    currentTime.value = targetTime
    if (currentTime.value >= totalTime.value) {
      completada.value = true
      playing.value = false
    } else {
      completada.value = false
      if (!playing.value) {
        playing.value = true
      }
    }
  }

  /* ── Lifecycle ────────────────────────────────────── */
  let pollComentarios = null
  let comentariosAbort = null

  async function loadComentarios(leccionId, token) {
    if (!leccionId || !/^[0-9a-f]{8}-/.test(leccionId)) return
    if (comentariosAbort) comentariosAbort.abort()
    comentariosAbort = new AbortController()
    try {
      const { data } = await sbSelect(
        `comentarios?select=*,perfiles(nombres,apellido_paterno,dependencias(siglas))&leccion_id=eq.${leccionId}&order=creado_en.asc&limit=50`,
        token,
        { signal: comentariosAbort.signal }
      )
      comentarios.value = (data || []).map((c) => ({
        id: c.id,
        user: (c.perfiles?.nombres || '') + ' ' + (c.perfiles?.apellido_paterno?.[0] || '') + '.',
        dep: c.perfiles?.dependencias?.siglas || '',
        t: new Date(c.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        texto: c.contenido,
        esInstructor: instructorIds.value.has(c.user_id),
        destacado: c.destacado === true,
      }))
    } catch (e) {
      if (e?.name === 'AbortError') return
      if (e instanceof TypeError && e.message === 'Failed to fetch') return
      console.warn('Error cargando comentarios:', e)
    }
  }

  onMounted(async () => {
    const token = session.value?.access_token
    const isRealCurso = /^[0-9a-f]{8}-/.test(props.cursoId)

    if (isRealCurso) {
      try {
        const { data: cursoRows } = await sbSelect(
          `cursos?select=titulo&id=eq.${props.cursoId}`,
          token
        )
        cursoTitulo.value = cursoRows?.[0]?.titulo || ''

        const { data: lecRows } = await sbSelect(
          `lecciones?select=*,modulos!inner(curso_id,orden,titulo)&modulos.curso_id=eq.${props.cursoId}&order=orden.asc&limit=1000`,
          token
        )

        if (lecRows?.length) {
          lecRows.sort((a, b) => a.modulos.orden - b.modulos.orden || a.orden - b.orden)

          let completedIds = new Set()
          if (session.value?.user?.id) {
            try {
              const { data: prog } = await sbSelect(
                `progreso?select=leccion_id&user_id=eq.${session.value.user.id}&completado=eq.true&limit=10000`,
                token
              )
              completedIds = new Set((prog || []).map((p) => p.leccion_id))
            } catch (e) {
              console.warn('progreso:', e)
            }
          }

          lecciones.value = lecRows.map((l) => ({
            id: l.id,
            orden: l.orden,
            titulo: l.titulo,
            duracion: l.duracion_seg
              ? `${Math.floor(l.duracion_seg / 60)}:${String(l.duracion_seg % 60).padStart(2, '0')}`
              : '\u2014',
            duracion_seg: l.duracion_seg || 600,
            youtube_url: l.url_youtube || '',
            video_id: l.video_id || null,
            documento_path: l.documento_path || null,
            documento_tipo: l.documento_tipo || null,
            contenido: l.contenido ?? null,
            tipo: l.tipo_material || 'video',
            completado: completedIds.has(l.id),
            modulo_titulo: l.modulos.titulo,
            modulo_orden: l.modulos.orden,
            requiere_entrega: l.requiere_entrega === true,
            entrega_tipos: l.entrega_tipos || null,
            entrega_max_mb: l.entrega_max_mb || 10,
          }))

          moduloTitulo.value = lecciones.value[0]?.modulo_titulo || ''

          if (props.leccionId && lecciones.value.find((l) => l.id === props.leccionId)) {
            currentLeccion.value = props.leccionId
          } else {
            const firstIncomplete = lecciones.value.find((l) => !l.completado)
            currentLeccion.value = firstIncomplete?.id || lecciones.value[0]?.id || ''
          }

          const cur = lecciones.value.find((l) => l.id === currentLeccion.value)
          totalTime.value = cur?.duracion_seg || 735
        }
      } catch (e) {
        console.error('Error cargando lecciones:', e)
      }
    }

    loadingLecciones.value = false

    if (lecciones.value.length) {
      playing.value = true
      if (playing.value && source.value.kind !== 'hls') startPlayback()
    }

    if (isRealCurso && session.value) {
      try {
        instructorIds.value = new Set(await fetchInstructoresDeCurso(props.cursoId))
      } catch (e) {
        console.warn('instructores:', e)
      }
    }

    await loadComentarios(currentLeccion.value, token)

    if (session.value?.access_token && /^[0-9a-f]{8}-/.test(currentLeccion.value)) {
      pollComentarios = setInterval(() => {
        loadComentarios(currentLeccion.value, session.value.access_token)
      }, 8000)
    }
  })

  watch(currentLeccion, async (id) => {
    if (!id) return
    await loadComentarios(id, session.value?.access_token)
  })

  onUnmounted(() => {
    stopPlayback()
    if (pollComentarios) clearInterval(pollComentarios)
    if (comentariosAbort) comentariosAbort.abort()
  })

  return {
    router,
    auth,
    ui,
    appUser,
    session,
    tweaks,
    currentLeccion,
    playing,
    currentTime,
    totalTime,
    comentarios,
    instructorIds,
    draft,
    completada,
    llegoAlFinal,
    handleFinLectura,
    videoEl,
    hlsMasterUrl,
    hlsPoster,
    hlsDuration,
    lecciones,
    cursoTitulo,
    moduloTitulo,
    loadingLecciones,
    curso,
    leccion,
    marcarLecturaCompletada,
    handleEvaluacionAprobada,
    goToNextLesson,
    variant,
    progress,
    fmtTime,
    youtubeId,
    youtubeEmbed,
    source,
    completedCount,
    progressFraction,
    progressPct,
    setVariant,
    togglePlay,
    handleSeek,
    onHlsTimeUpdate,
    onHlsLoadedMetadata,
    onHlsEnded,
    selectLesson,
    seekProgress,
    sendComment,
    featureEnabled,
  }
}
