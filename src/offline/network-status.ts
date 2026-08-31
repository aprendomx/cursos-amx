import { ref, type Ref } from 'vue'

// Detección de red con navigator.onLine + los eventos nativos 'online' y
// 'offline' de window. Los listeners se cablean perezosamente en el primer
// getIsOnline() u onOnline() — no hace falta un initNetworkStatus() que nadie
// llame (esa fue la falla del diseño original, quitado en 841e571). Sin ping
// periódico: si el navegador miente sobre la conectividad, el catch de
// esFalloDeRed en sync-queue absorbe el fallo y encola igual.
let isOnline: Ref<boolean> | null = null
const onlineCallbacks: Array<() => void> = []

function wireListeners(): void {
  window.addEventListener('online', () => {
    if (isOnline) isOnline.value = true
    for (const cb of onlineCallbacks) cb()
  })
  window.addEventListener('offline', () => {
    if (isOnline) isOnline.value = false
  })
}

// Cablear desde cualquiera de los dos puntos de entrada: un consumidor que solo
// registre un onOnline no debe perderse eventos por no haber llamado getIsOnline.
function ensureWired(): void {
  if (isOnline) return
  isOnline = ref(navigator.onLine)
  wireListeners()
}

export function getIsOnline(): Ref<boolean> {
  ensureWired()
  return isOnline!
}

export function onOnline(callback: () => void): void {
  onlineCallbacks.push(callback)
  ensureWired()
}
