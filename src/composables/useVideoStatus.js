import { ref, watch, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { fetchVideo } from '@/services/videos.js'

// Terminal statuses don't need updates.
const ACTIVE = new Set(['uploading', 'pending', 'processing'])

export function useVideoStatus(videoIdRef) {
  const video = ref(null)
  let channel = null
  let pollTimer = null

  async function load(id) {
    if (!id) {
      video.value = null
      return
    }
    try {
      video.value = await fetchVideo(id)
    } catch {
      // network blip — keep previous value so UI doesn't blank
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startPoll(id) {
    stopPoll()
    // Fallback that keeps the UI responsive if the WebSocket is degraded.
    // 5s polling is cheap and stops as soon as the row reaches a terminal state.
    pollTimer = setInterval(async () => {
      if (!ACTIVE.has(video.value?.status)) return stopPoll()
      await load(id)
    }, 5000)
  }

  function subscribe(id) {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    if (!id) return
    try {
      channel = supabase
        .channel(`videos:${id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'videos',
            filter: `id=eq.${id}`,
          },
          (payload) => {
            video.value = payload.new
          }
        )
        .subscribe()
    } catch {
      // Realtime unavailable — polling takes over.
      channel = null
    }
  }

  watch(
    videoIdRef,
    async (id) => {
      stopPoll()
      await load(id)
      subscribe(id)
      if (id && ACTIVE.has(video.value?.status)) startPoll(id)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopPoll()
    if (channel) supabase.removeChannel(channel)
  })

  return { video }
}
