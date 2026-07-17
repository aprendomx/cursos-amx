import { ref, computed, watch, type ComputedRef } from 'vue'
import { marcarLeccionCompletada } from '@/services/progreso.js'

export interface VideoPlaybackOptions {
  leccion: ComputedRef<{ id: string; duracion_seg: number } | undefined>
  sourceKind: ComputedRef<string>
  totalTime: ComputedRef<number>
}

export function useVideoPlayback({ leccion, sourceKind, totalTime }: VideoPlaybackOptions) {
  const playing = ref(false)
  const currentTime = ref(0)
  const completada = ref(false)
  const llegoAlFinal = ref(false)

  const localTotalTime = ref(totalTime.value)
  watch(totalTime, (v) => { localTotalTime.value = v })

  /* ── Playback simulation ──────────────────────────── */
  let playInterval: ReturnType<typeof window.setInterval> | null = null

  function startPlayback() {
    stopPlayback()
    playInterval = setInterval(() => {
      if (currentTime.value >= localTotalTime.value) {
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
    if (completada.value) return
    playing.value = !playing.value
  }

  watch(playing, (v: boolean) => {
    if (v && !completada.value) startPlayback()
    else stopPlayback()
  })

  /* ── Completion handlers ──────────────────────────── */
  async function marcarLecturaCompletada() {
    if (!leccion.value?.id || completada.value) return
    try {
      await marcarLeccionCompletada(leccion.value.id)
      completada.value = true
    } catch (e) {
      console.error('marcar leida:', e)
    }
  }

  function handleEvaluacionAprobada() {
    completada.value = true
  }

  function handleFinLectura() {
    llegoAlFinal.value = true
  }

  /* ── Seek handler ─────────────────────────────────── */
  function handleSeek(ratio: number) {
    const targetTime = Math.floor(ratio * localTotalTime.value)
    currentTime.value = targetTime
    if (currentTime.value >= localTotalTime.value) {
      completada.value = true
      playing.value = false
    } else {
      completada.value = false
      if (!playing.value) playing.value = true
    }
  }

  /* ── Progress bar seek (non-HLS) ─────────────────── */
  function seekProgress(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement | null
    if (!target) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetTime = Math.floor(ratio * localTotalTime.value)
    currentTime.value = targetTime
    if (currentTime.value >= localTotalTime.value) {
      completada.value = true
      playing.value = false
    } else {
      completada.value = false
      if (!playing.value) {
        playing.value = true
      }
    }
  }

  const progress = computed(() => Math.min(currentTime.value / localTotalTime.value, 1))

  return {
    playing,
    currentTime,
    totalTime: localTotalTime,
    completada,
    llegoAlFinal,
    togglePlay,
    handleSeek,
    handleFinLectura,
    handleEvaluacionAprobada,
    marcarLecturaCompletada,
    stopPlayback,
    seekProgress,
    progress,
  }
}
