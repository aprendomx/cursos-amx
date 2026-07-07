import { ref, onMounted, onUnmounted } from 'vue'
import { getPendingActions, getAllActions, clearDoneActions } from '@/offline/offline-db'
import { sync, retryFailed } from '@/offline/sync-queue'
import { onOnline } from '@/offline/network-status'
import { featureEnabled } from '@/lib/featureFlags'

export function useSyncStatus() {
  const pendingCount = ref(0)
  const errorCount = ref(0)
  const syncing = ref(false)
  const timer = ref<ReturnType<typeof setInterval> | null>(null)

  async function refresh() {
    if (!featureEnabled('offline_sync')) return
    const pending = await getPendingActions()
    const all = await getAllActions()
    pendingCount.value = pending.length
    errorCount.value = all.filter((a) => a.status === 'error').length
  }

  async function doSync() {
    if (!featureEnabled('offline_sync') || syncing.value) return
    syncing.value = true
    await sync()
    await refresh()
    syncing.value = false
  }

  async function clearDone() {
    await clearDoneActions()
    await refresh()
  }

  async function retry() {
    await retryFailed()
    await refresh()
  }

  onMounted(() => {
    refresh()
    onOnline(() => doSync())
    timer.value = setInterval(refresh, 5000)
  })

  onUnmounted(() => {
    if (timer.value) clearInterval(timer.value)
  })

  return { pendingCount, errorCount, syncing, doSync, clearDone, retry, refresh }
}
