import { computed } from 'vue'
import { getIsOnline } from '@/offline/network-status'
import { featureEnabled } from '@/lib/featureFlags'

export function useOffline() {
  const isOnline = getIsOnline()
  const offlineEnabled = featureEnabled('pwa_offline')
  const isOffline = computed(() => offlineEnabled && !isOnline.value)

  return { isOnline, isOffline, offlineEnabled }
}
