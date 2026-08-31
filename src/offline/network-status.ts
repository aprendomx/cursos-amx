import { ref, type Ref } from 'vue'

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
