import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { useTiempoActividad } from '@/composables/useTiempoActividad.js'
import { useHlsPlayback } from '@/composables/useHlsPlayback'
import { useVideoPlayback } from '@/composables/useVideoPlayback'
import { useLessonChat } from '@/composables/useLessonChat'
import { useLessonNavigation } from '@/composables/useLessonNavigation'
import { featureEnabled } from '@/lib/featureFlags.js'

import { type PlayerPageProps, type PlayerLesson } from './useLessonNavigation'
export { type PlayerPageProps, type PlayerLesson }

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

  /* ── Delegación ─────────────────────────────────── */
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

  function handleEvaluacionAprobada() {
    playback.handleEvaluacionAprobada()
    const lec = nav.lecciones.value.find((l) => l.id === nav.leccion.value?.id)
    if (lec) lec.completado = true
  }

  async function marcarLecturaCompletada() {
    await playback.marcarLecturaCompletada()
    const lec = nav.lecciones.value.find((l) => l.id === nav.leccion.value?.id)
    if (lec) lec.completado = true
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
    goToNextLesson: nav.goToNextLesson,
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
    onHlsEnded: hls.onHlsEnded,
    selectLesson: nav.selectLesson,
    seekProgress,
    sendComment: chat.sendComment,
    featureEnabled,
  }
}
