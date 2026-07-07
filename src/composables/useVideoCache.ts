import { ref } from 'vue'
import { downloadVideo, isVideoAvailable, removeVideo, getCacheStats } from '@/offline/video-cache'
import { featureEnabled } from '@/lib/featureFlags'

export function useVideoCache() {
  const downloading = ref(false)
  const progress = ref(0)
  const error = ref('')

  async function download(videoId: string, leccionId: string, playlistUrl: string) {
    if (!featureEnabled('offline_video_cache')) return
    downloading.value = true
    progress.value = 0
    error.value = ''
    try {
      await downloadVideo(videoId, leccionId, playlistUrl, (pct) => {
        progress.value = pct
      })
    } catch (e: any) {
      error.value = e?.message || 'Error al descargar'
    } finally {
      downloading.value = false
    }
  }

  async function remove(videoId: string) {
    await removeVideo(videoId)
  }

  async function check(videoId: string): Promise<boolean> {
    return isVideoAvailable(videoId)
  }

  async function stats() {
    return getCacheStats()
  }

  return { downloading, progress, error, download, remove, check, stats }
}
