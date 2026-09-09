import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { useTiempoActividad } from '@/composables/useTiempoActividad.js'
import { useHlsPlayback } from '@/composables/useHlsPlayback'
import { useVideoPlayback } from '@/composables/useVideoPlayback'
import { useLessonChat } from '@/composables/useLessonChat'
import { useLessonNavigation } from '@/composables/useLessonNavigation'
import { featureEnabled } from '@/lib/featureFlags.js'
import { registrarEventoPortada } from '@/composables/useEventosPortada.js'

import { type PlayerPageProps, type PlayerLesson } from './useLessonNavigation'
export { type PlayerPageProps, type PlayerLesson }

export function usePlayerPage(props: PlayerPageProps) {
  const router = useRouter()
  const auth = useAuthStore()
  const ui = useUiStore()

  const appUser = computed(() => auth.user)
  const session = computed(() => auth.session)
  const tweaks = computed(() => ui.tweaks)

  /* ── Modo invitado ──────────────────────────────── */
  // Sin sesión solo se llega aquí por la primera lección abierta (el guard ya
  // filtró y las funciones de URLs firmadas verifican por su cuenta). El
  // reproductor funciona sin progreso, sin notas y sin chat; cualquier
  // intento de avanzar, guardar o evaluar invita a registrarse SIN navegar:
  // el punto en el que estaba no se pierde hasta que la persona decide.
  const invitado = computed(() => !session.value)
  const invitacionRegistro = ref<{ destino: string } | null>(null)

  function invitarRegistro(leccionDestinoId?: string) {
    const destino =
      `/player/${props.cursoId}` + (leccionDestinoId ? `/${leccionDestinoId}` : '')
    invitacionRegistro.value = { destino }
  }
  function cerrarInvitacion() {
    invitacionRegistro.value = null
  }
  function irARegistroDesdeLeccion() {
    registrarEventoPortada('registro_desde_leccion', { seccion: 'player' })
    router.push({
      name: 'registro',
      query: { redirect: invitacionRegistro.value?.destino || `/player/${props.cursoId}` },
    })
  }

  useTiempoActividad({
    cursoId: () => (/^[0-9a-f]{8}-/.test(props.cursoId) ? props.cursoId : null),
    enabled: () => !!session.value?.access_token,
  })

  /* ── 1. Navegación ──────────────────────────────── */
  const nav = useLessonNavigation({
    props,
    session,
    tweaks,
    router,
    updateTweaks: (t) => ui.updateTweaks(t),
  })

  /* ── 2. Playback genérico ───────────────────────── */
  const playback = useVideoPlayback({
    leccion: nav.leccion,
    sourceKind: computed(() => nav.source.value.kind),
    totalTime: computed(() => nav.leccion.value?.duracion_seg || 735),
  })

  /* ── 3. HLS ─────────────────────────────────────── */
  const hls = useHlsPlayback({
    videoId: computed(() => (nav.source.value.kind === 'hls' ? nav.source.value.videoId : null)),
    leccionId: nav.currentLeccion,
    session,
  })

  /* ── 4. Chat ────────────────────────────────────── */
  const chat = useLessonChat({
    leccionId: nav.currentLeccion,
    session,
    appUser,
    cursoId: props.cursoId,
  })

  // Evento de embudo: un invitado llegó a probar la lección (una vez por
  // visita al reproductor, cuando la lección real ya cargó).
  const probadaEmitida = ref(false)
  watch(
    () => nav.leccion.value?.id,
    (id) => {
      if (id && invitado.value && !probadaEmitida.value) {
        probadaEmitida.value = true
        registrarEventoPortada('leccion_probada', { seccion: 'player' })
      }
    },
    { immediate: true }
  )

  /* ── Sincronización ─────────────────────────────── */
  watch(nav.currentLeccion, (newId, oldId) => {
    if (oldId && hls.videoEl.value) {
      hls.flushSave(oldId, hls.videoEl.value.currentTime || 0)
    }
    playback.stopPlayback()
    playback.currentTime.value = 0
    playback.completada.value = false
    if (newId) {
      const l = nav.lecciones.value.find((x) => x.id === newId)
      if (l) {
        playback.totalTime.value = l.duracion_seg || 735
      }
    }
  })

  /* ── Aviso de avance guardado ───────────────────── */
  // Confirmación visible al guardar el avance: sin ella el alumno no sabía si
  // su progreso quedó registrado y recargaba la página "por si acaso".
  const avisoAvance = ref<{ tipo: 'ok' | 'offline' | 'error'; texto: string } | null>(null)
  let avisoTimer: ReturnType<typeof window.setTimeout> | null = null
  function mostrarAviso(tipo: 'ok' | 'offline' | 'error', texto: string) {
    avisoAvance.value = { tipo, texto }
    if (avisoTimer) clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => {
      avisoAvance.value = null
    }, 5000)
  }
  onBeforeUnmount(() => {
    if (avisoTimer) clearTimeout(avisoTimer)
  })

  function marcarLeccionEnLista(leccionId: string | undefined) {
    const lec = nav.lecciones.value.find((l) => l.id === leccionId)
    if (lec) lec.completado = true
  }

  function confirmarAvance(diferido: boolean | undefined) {
    if (diferido) {
      mostrarAviso('offline', 'Avance guardado; se sincronizará al recuperar la conexión.')
    } else {
      mostrarAviso('ok', 'Avance guardado.')
    }
  }

  /* ── Delegación ─────────────────────────────────── */
  // Avanzar o cambiar de lección siendo invitado: se invita a registrarse con
  // el destino intentado como redirect, sin mover la vista actual.
  function goToNextLesson() {
    if (invitado.value) {
      const idx = nav.lecciones.value.findIndex((l) => l.id === nav.currentLeccion.value)
      invitarRegistro(nav.lecciones.value[idx + 1]?.id)
      return
    }
    nav.goToNextLesson()
  }

  function selectLesson(id: string) {
    if (invitado.value && id !== nav.currentLeccion.value) {
      invitarRegistro(id)
      return
    }
    nav.selectLesson(id)
  }

  function togglePlay() {
    if (nav.source.value.kind === 'hls') {
      hls.toggleHlsPlay()
    } else {
      playback.togglePlay()
    }
  }

  function handleSeek(ratio: number) {
    const targetTime = Math.floor(ratio * playback.totalTime.value)
    if (nav.source.value.kind === 'hls') {
      const el = hls.videoEl.value
      if (el) el.currentTime = targetTime
    }
    playback.handleSeek(ratio)
  }

  function seekProgress(e: MouseEvent) {
    const ratio = nav.seekProgress(e)
    if (ratio !== undefined) {
      handleSeek(ratio)
    }
  }

  function handleFinLectura() {
    playback.handleFinLectura()
  }

  // Al terminar un video HLS el guardado ocurría solo en el servidor: la vista
  // no se enteraba y el alumno tenía que recargar con F5 para poder continuar.
  async function onHlsEnded() {
    if (invitado.value) {
      // Terminó la lección de prueba: se marca localmente (para que la vista
      // lo refleje) y se invita; no hay nada que guardar en el servidor.
      playback.completada.value = true
      invitarRegistro()
      return
    }
    const leccionId = nav.leccion.value?.id
    try {
      const resultado = await hls.onHlsEnded()
      playback.completada.value = true
      marcarLeccionEnLista(leccionId)
      confirmarAvance(resultado?.diferido)
      await nav.refrescarProgreso()
    } catch (e) {
      console.error('guardar avance:', e)
      mostrarAviso('error', 'No se pudo guardar tu avance. Revisa tu conexión e intenta de nuevo.')
    }
  }

  function handleEvaluacionAprobada() {
    if (invitado.value) {
      invitarRegistro()
      return
    }
    playback.handleEvaluacionAprobada()
    marcarLeccionEnLista(nav.leccion.value?.id)
    confirmarAvance(false)
    nav.refrescarProgreso().catch(() => {})
  }

  async function marcarLecturaCompletada() {
    if (invitado.value) {
      playback.completada.value = true
      invitarRegistro()
      return
    }
    try {
      const resultado = await playback.marcarLecturaCompletada()
      if (!resultado) return
      marcarLeccionEnLista(nav.leccion.value?.id)
      confirmarAvance(resultado.diferido)
      await nav.refrescarProgreso()
    } catch (e) {
      console.error('guardar avance:', e)
      mostrarAviso('error', 'No se pudo guardar tu avance. Revisa tu conexión e intenta de nuevo.')
    }
  }

  /* ── Retorno (interfaz exacta de antes) ─────────── */
  return {
    router,
    auth,
    ui,
    appUser,
    session,
    tweaks,
    currentLeccion: nav.currentLeccion,
    playing: playback.playing,
    currentTime: playback.currentTime,
    totalTime: playback.totalTime,
    comentarios: chat.comentarios,
    instructorIds: chat.instructorIds,
    draft: chat.draft,
    completada: playback.completada,
    llegoAlFinal: playback.llegoAlFinal,
    handleFinLectura,
    videoEl: hls.videoEl,
    hlsMasterUrl: hls.hlsMasterUrl,
    hlsPoster: hls.hlsPoster,
    hlsDuration: hls.hlsDuration,
    lecciones: nav.lecciones,
    cursoTitulo: nav.cursoTitulo,
    moduloTitulo: nav.moduloTitulo,
    moduloProgreso: nav.moduloActual,
    progresoModulos: nav.progresoModulos,
    loadingLecciones: nav.loadingLecciones,
    curso: nav.curso,
    leccion: nav.leccion,
    marcarLecturaCompletada,
    handleEvaluacionAprobada,
    goToNextLesson,
    variant: nav.variant,
    progress: playback.progress,
    fmtTime: nav.fmtTime,
    youtubeId: nav.youtubeId,
    youtubeEmbed: nav.youtubeEmbed,
    source: nav.source,
    completedCount: nav.completedCount,
    progressFraction: nav.progressFraction,
    progressPct: nav.progressPct,
    setVariant: nav.setVariant,
    togglePlay,
    handleSeek,
    onHlsTimeUpdate: hls.onHlsTimeUpdate,
    onHlsLoadedMetadata: hls.onHlsLoadedMetadata,
    onHlsEnded,
    avisoAvance,
    selectLesson,
    seekProgress,
    sendComment: chat.sendComment,
    featureEnabled,
    invitado,
    invitacionRegistro,
    cerrarInvitacion,
    irARegistroDesdeLeccion,
  }
}
