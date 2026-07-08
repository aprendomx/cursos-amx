import { ref, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const TICK_INTERVAL = 10000 // 10s
const BATCH_INTERVAL = 30000 // 30s
const MAX_BATCH_SIZE = 100

export function useVideoAnalytics({ leccionId, cursoId, videoId, enabled = true }) {
  const events = ref([])
  let tickTimer = null
  let batchTimer = null
  let lastTime = 0
  let isTracking = false
  const auth = useAuthStore()

  function emit(evento, tiempo_video, datos = {}) {
    if (!enabled) return
    events.value.push({
      user_id: auth.session?.user?.id,
      leccion_id: leccionId,
      curso_id: cursoId,
      video_id: videoId,
      evento,
      tiempo_video: Math.floor(tiempo_video),
      datos,
    })

    if (events.value.length >= MAX_BATCH_SIZE) {
      sendBatch()
    }
  }

  function startTracking(videoEl) {
    if (!enabled || !videoEl || isTracking) return
    isTracking = true

    videoEl.addEventListener('play', () => {
      emit('play', videoEl.currentTime)
    })

    videoEl.addEventListener('pause', () => {
      emit('pause', videoEl.currentTime)
    })

    videoEl.addEventListener('seeked', () => {
      emit('seek', videoEl.currentTime, { old_time: lastTime, new_time: videoEl.currentTime })
      lastTime = videoEl.currentTime
    })

    videoEl.addEventListener('ended', () => {
      emit('complete', videoEl.currentTime, { total_duration: videoEl.duration })
    })

    videoEl.addEventListener('ratechange', () => {
      emit('ratechange', videoEl.currentTime, { new_rate: videoEl.playbackRate })
    })

    videoEl.addEventListener('timeupdate', () => {
      lastTime = videoEl.currentTime
    })

    tickTimer = setInterval(() => {
      if (!videoEl.paused && !videoEl.ended) {
        emit('tick', videoEl.currentTime, { playback_rate: videoEl.playbackRate })
      }
    }, TICK_INTERVAL)

    batchTimer = setInterval(sendBatch, BATCH_INTERVAL)

    window.addEventListener('beforeunload', flush)
  }

  async function sendBatch() {
    if (events.value.length === 0) return
    const batch = events.value.splice(0, events.value.length)
    try {
      await supabase.functions.invoke('video-analytics', { body: { events: batch } })
    } catch (err) {
      console.error('[video-analytics] error sending batch:', err)
    }
  }

  function flush() {
    if (events.value.length > 0) {
      const blob = new Blob([JSON.stringify({ events: events.value })], {
        type: 'application/json',
      })
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-analytics`,
        blob
      )
    }
  }

  function stopTracking() {
    isTracking = false
    clearInterval(tickTimer)
    clearInterval(batchTimer)
    window.removeEventListener('beforeunload', flush)
    sendBatch()
  }

  onBeforeUnmount(stopTracking)

  return { startTracking, stopTracking, emit }
}
