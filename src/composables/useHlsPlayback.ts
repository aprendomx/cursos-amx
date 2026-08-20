import { ref, watch, onBeforeUnmount, type ComputedRef, type Ref } from 'vue'
import { getPlayback } from '@/services/videos'
import { actualizarSegundosVistos, marcarLeccionCompletada } from '@/services/progreso.js'
import { useHlsPlayer } from '@/composables/useHlsPlayer.js'
import { supabase } from '@/lib/supabase.js'

export interface HlsPlaybackOptions {
  videoId: ComputedRef<string | null | undefined>
  leccionId: Ref<string>
  session: ComputedRef<{ access_token: string } | null>
}

export function useHlsPlayback({ videoId, leccionId }: HlsPlaybackOptions) {
  const videoEl = ref<HTMLVideoElement | null>(null)
  const hlsMasterUrl = ref<string | null>(null)
  const hlsPoster = ref<string | null>(null)
  const hlsDuration = ref(0)
  const currentTime = ref(0)
  const totalTime = ref(0)

  async function loadHlsForVideo(videoId: string) {
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
    videoId,
    (id) => {
      if (id) loadHlsForVideo(id)
      else {
        hlsMasterUrl.value = null
        hlsPoster.value = null
      }
    },
    { immediate: true }
  )

  function toggleHlsPlay() {
    const el = videoEl.value
    if (!el) return
    if (el.paused) {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err: unknown) => console.error('[player] video.play() rejected:', err))
      }
    } else {
      el.pause()
    }
  }

  useHlsPlayer(videoEl, hlsMasterUrl, (err: { type: string } | null) => {
    if (err?.type === 'unsupported') return
    if (videoId.value) loadHlsForVideo(videoId.value)
  })

  let saveTimer: ReturnType<typeof window.setTimeout> | null = null
  function scheduleSave(leccionId: string, segundos: number) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      actualizarSegundosVistos(leccionId, segundos).catch(() => {})
    }, 5000)
  }
  function flushSave(leccionId: string, segundos: number) {
    if (saveTimer) clearTimeout(saveTimer)
    actualizarSegundosVistos(leccionId, segundos).catch(() => {})
  }

  function onHlsTimeUpdate() {
    const el = videoEl.value
    if (!el) return
    currentTime.value = el.currentTime
    totalTime.value = el.duration || totalTime.value
    if (leccionId.value) scheduleSave(leccionId.value, el.currentTime)
  }

  async function onHlsLoadedMetadata() {
    const el = videoEl.value
    if (!el || !leccionId.value) return
    totalTime.value = el.duration
    const { data } = await supabase
      .from('progreso')
      .select('segundos_vistos, completado')
      .eq('leccion_id', leccionId.value)
      .maybeSingle()
    if (data && data.segundos_vistos > 5 && !data.completado) {
      el.currentTime = Math.max(0, data.segundos_vistos - 3)
    }
  }

  function onHlsEnded() {
    if (!leccionId.value) return
    flushSave(leccionId.value, totalTime.value)
    marcarLeccionCompletada(leccionId.value).catch(() => {})
  }

  watch(
    () => leccionId.value,
    (newId: string | undefined, oldId: string | undefined) => {
      if (oldId && videoEl.value) flushSave(oldId, videoEl.value.currentTime || 0)
    }
  )

  onBeforeUnmount(() => {
    if (leccionId.value && videoEl.value) {
      flushSave(leccionId.value, videoEl.value.currentTime || 0)
    }
  })

  return {
    videoEl,
    hlsMasterUrl,
    hlsPoster,
    hlsDuration,
    onHlsTimeUpdate,
    onHlsLoadedMetadata,
    onHlsEnded,
    toggleHlsPlay,
    flushSave,
  }
}
