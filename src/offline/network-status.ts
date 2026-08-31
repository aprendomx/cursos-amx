import { ref, type Ref } from 'vue'

// Detección de red actualmente INERTE: `isOnline` es una foto del arranque
// (navigator.onLine al primer uso) y no se actualiza después; los callbacks de
// `onOnline` no se disparan nunca. El detector completo (listeners
// online/offline, ping periódico, initNetworkStatus) se quitó en 841e571
// porque nadie lo cableaba; el original nació en 5288569. Si una feature
// necesita saber que volvió la conexión, hay que reconstruir ese cableado
// (dos listeners de window bastan) — no confiar en este ref tal cual.
let isOnline: Ref<boolean> | null = null
const onlineCallbacks: Array<() => void> = []

export function getIsOnline(): Ref<boolean> {
  if (!isOnline) {
    isOnline = ref(navigator.onLine)
  }
  return isOnline
}

export function onOnline(callback: () => void): void {
  onlineCallbacks.push(callback)
}
