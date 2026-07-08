import { ref, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase.js'

const TICK_INTERVAL = 10000
const BATCH_INTERVAL = 30000
const MAX_BATCH_SIZE = 100

export function useVideoAnalytics({ leccionId, cursoId, videoId, enabled = true }) {
  const events = ref([])
  let videoEl = null
  let tickTimer = null
  let batchTimer = null
  let lastTime = 0
  let isTracking = false

  function emit(evento, tiempo_video, datos = null) {
    if (!enabled) return
    events.value.push({
      evento,
      tiempo_video,
      datos,
      leccion_id: leccionId,
      curso_id: cursoId,
      video_id: videoId,
      timestamp: new Date().toISOString(),
    })
    if (events.value.length >= MAX_BATCH_SIZE) {
      sendBatch()
    }
  }

  async function sendBatch() {
    if (events.value.length === 0) return
    const payload = [...events.value]
    events.value = []
    try {
      await supabase.functions.invoke('video-analytics', {
        body: { events: payload },
      })
    } catch (e) {
      // Silently drop failed events to avoid memory leaks
    }
  }

  function handleBeforeUnload() {
    if (events.value.length === 0) return
    const payload = [...events.value]
    events.value = []
    const url =
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-analytics`
        : '/functions/v1/video-analytics'
    const blob = new Blob([JSON.stringify({ events: payload })], {
      type: 'application/json',
    })
    navigator.sendBeacon(url, blob)
  }

  function startTracking(el) {
    if (!el || !(el instanceof HTMLVideoElement)) {
      throw new Error('Se requiere un elemento video válido (video element)')
    }
    if (isTracking) return
    videoEl = el
    isTracking = true
    lastTime = el.currentTime

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('seeked', onSeeked)
    el.addEventListener('ended', onEnded)
    el.addEventListener('ratechange', onRatechange)

    batchTimer = setInterval(sendBatch, BATCH_INTERVAL)
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  function onPlay() {
    if (!videoEl) return
    emit('play', videoEl.currentTime)
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    tickTimer = setInterval(() => {
      if (videoEl && !videoEl.paused) {
        emit('tick', videoEl.currentTime, { playback_rate: videoEl.playbackRate })
      }
    }, TICK_INTERVAL)
  }

  function onPause() {
    if (!videoEl) return
    emit('pause', videoEl.currentTime)
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function onSeeked() {
    if (!videoEl) return
    const newTime = videoEl.currentTime
    emit('seek', newTime, { old_time: lastTime, new_time: newTime })
    lastTime = newTime
  }

  function onEnded() {
    if (!videoEl) return
    emit('complete', videoEl.currentTime, { total_duration: videoEl.duration })
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function onRatechange() {
    if (!videoEl) return
    emit('ratechange', videoEl.currentTime, { new_rate: videoEl.playbackRate })
  }

  function stopTracking() {
    if (videoEl) {
      videoEl.removeEventListener('play', onPlay)
      videoEl.removeEventListener('pause', onPause)
      videoEl.removeEventListener('seeked', onSeeked)
      videoEl.removeEventListener('ended', onEnded)
      videoEl.removeEventListener('ratechange', onRatechange)
      videoEl = null
    }
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    if (batchTimer) {
      clearInterval(batchTimer)
      batchTimer = null
    }
    window.removeEventListener('beforeunload', handleBeforeUnload)
    sendBatch()
    isTracking = false
  }

  onBeforeUnmount(() => {
    stopTracking()
  })

  return {
    emit,
    startTracking,
    sendBatch,
    stopTracking,
    events,
  }
}
