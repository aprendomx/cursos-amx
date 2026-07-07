import { ref, type Ref } from 'vue'

let isOnline: Ref<boolean> | null = null
let onlineCallbacks: Array<() => void> = []
let offlineCallbacks: Array<() => void> = []
let consecutiveFailures = 0
let timer: ReturnType<typeof setInterval> | null = null
let abortController: AbortController | null = null
let checking = false

const PING_URL = '/health'
const TIMEOUT_MS = 5000
const INTERVAL_ONLINE = 30000
const INTERVAL_OFFLINE = 5000
const FAILURES_TO_OFFLINE = 3

function getInterval(): number {
  return isOnline?.value === false ? INTERVAL_OFFLINE : INTERVAL_ONLINE
}

async function doPing(): Promise<boolean> {
  abortController?.abort()
  abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController?.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(PING_URL, {
      method: 'HEAD',
      signal: abortController.signal,
      cache: 'no-store',
    })
    clearTimeout(timeoutId)
    return response.ok
  } catch {
    clearTimeout(timeoutId)
    return false
  }
}

async function check(): Promise<void> {
  if (checking) return
  checking = true
  try {
    const success = await doPing()
    if (success) {
      if (consecutiveFailures > 0 || isOnline?.value === false) {
        consecutiveFailures = 0
        if (isOnline) {
          isOnline.value = true
        }
        onlineCallbacks.forEach((cb) => cb())
      }
    } else {
      consecutiveFailures++
      if (consecutiveFailures >= FAILURES_TO_OFFLINE) {
        if (isOnline?.value !== false) {
          if (isOnline) {
            isOnline.value = false
          }
          offlineCallbacks.forEach((cb) => cb())
        }
      }
    }
  } finally {
    checking = false
  }
}

function startInterval(): void {
  if (timer) {
    clearInterval(timer)
  }
  timer = setInterval(() => {
    check().catch(() => {})
  }, getInterval())
}

function handleBrowserOnline(): void {
  check().catch(() => {})
  startInterval()
}

function handleBrowserOffline(): void {
  consecutiveFailures = FAILURES_TO_OFFLINE
  if (isOnline?.value !== false) {
    if (isOnline) {
      isOnline.value = false
    }
    offlineCallbacks.forEach((cb) => cb())
  }
  startInterval()
}

export function getIsOnline(): Ref<boolean> {
  if (!isOnline) {
    isOnline = ref(navigator.onLine)
  }
  return isOnline
}

export function onOnline(callback: () => void): void {
  onlineCallbacks.push(callback)
}

export function onOffline(callback: () => void): void {
  offlineCallbacks.push(callback)
}

export async function checkNow(): Promise<void> {
  await check()
}

export function initNetworkStatus(): void {
  if (!isOnline) {
    isOnline = ref(navigator.onLine)
  }
  window.addEventListener('online', handleBrowserOnline)
  window.addEventListener('offline', handleBrowserOffline)
  startInterval()
  check().catch(() => {})
}

export function destroyNetworkStatus(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  window.removeEventListener('online', handleBrowserOnline)
  window.removeEventListener('offline', handleBrowserOffline)
  abortController?.abort()
  abortController = null
  onlineCallbacks = []
  offlineCallbacks = []
  consecutiveFailures = 0
  checking = false
  isOnline = null
}
