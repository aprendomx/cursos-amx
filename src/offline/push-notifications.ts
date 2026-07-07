import { featureEnabled } from '@/lib/featureFlags'
import { supabase } from '@/lib/supabase.js'

const VAPID_PUBLIC_KEY = (import.meta as any).env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied'
  }
  if (Notification.permission === 'default') {
    return Notification.requestPermission()
  }
  return Notification.permission
}

export async function subscribe(): Promise<PushSubscription | null> {
  if (!featureEnabled('push_notifications')) {
    console.warn('[push] push_notifications deshabilitado')
    return null
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY no configurada')
    return null
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] Push API no soportada')
    return null
  }

  const permission = await requestPermission()
  if (permission !== 'granted') {
    return null
  }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await storeSubscription(existing)
    return existing
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })

  await storeSubscription(subscription)
  return subscription
}

export async function unsubscribe(): Promise<boolean> {
  if (!featureEnabled('push_notifications')) return false
  if (!('serviceWorker' in navigator)) return false

  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) return false

  await subscription.unsubscribe()

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)

  if (error) {
    console.error('[push] error al eliminar suscripción:', error)
  }

  return true
}

export async function isSubscribed(): Promise<boolean> {
  if (!featureEnabled('push_notifications')) return false
  if (!('serviceWorker' in navigator)) return false

  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  return subscription !== null
}

async function storeSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  const keys = json.keys as { p256dh: string; auth: string }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: 'user_id,endpoint' },
  )

  if (error) {
    console.error('[push] error al guardar suscripción:', error)
  }
}
