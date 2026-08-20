import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, setDefaultHandler } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { esNoCacheable, esCatalogo, esDatosUsuario } from '@/lib/swRoutes.js'

// Service worker.
//
// Antes solo hacía precacheAndRoute del shell: cero registerRoute, cero cache
// de respuestas. La promesa de "continuar cursos sin conexión estable" no se
// sostenía — sin red se obtenía la aplicación y ninguna dato.
//
// Reglas de fondo:
//   * NUNCA se cachea nada de /auth ni de /rest/v1 con escritura. Servir una
//     respuesta vieja de autenticación o de progreso es peor que fallar.
//   * El catálogo y el contenido de lección se sirven con NetworkFirst: si hay
//     red mandan los datos frescos; si no, los últimos vistos.
//   * Los segmentos de video NO se cachean aquí: van con URL firmada y
//     caducan. La descarga para ver sin conexión es otra cosa y vive en
//     src/offline/video-cache.ts, detrás de su propio feature flag.

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const soloOk = new CacheableResponsePlugin({ statuses: [200] })

// ── Nunca cachear: autenticación, funciones y escrituras ──
// Se registran primero: en workbox gana la primera ruta que coincide.
registerRoute(({ url, request }) => esNoCacheable(url, request.method), new NetworkOnly())

// ── Catálogo: cursos, módulos, lecciones ──
// Cambian poco y son lo primero que se quiere ver sin conexión.
registerRoute(
  ({ url, request }) => esCatalogo(url, request.method),
  new NetworkFirst({
    cacheName: 'catalogo',
    networkTimeoutSeconds: 4,
    plugins: [soloOk, new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })],
  })
)

// ── Datos propios del alumno ──
// Se cachean para poder abrir la aplicación sin red, pero con caducidad corta:
// un progreso de hace una semana confundiría más de lo que ayuda.
registerRoute(
  ({ url, request }) => esDatosUsuario(url, request.method),
  new NetworkFirst({
    cacheName: 'datos-usuario',
    networkTimeoutSeconds: 4,
    plugins: [soloOk, new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 3600 })],
  })
)

// ── Imágenes (portadas, logotipos, pósters) ──
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'imagenes',
    plugins: [soloOk, new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 })],
  })
)

// ── Tipografías ──
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fuentes',
    plugins: [soloOk, new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 })],
  })
)

// ── Hojas de estilo y scripts fuera del precache ──
registerRoute(
  ({ request }) => request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({ cacheName: 'assets', plugins: [soloOk] })
)

// Todo lo demás va a la red sin cachear: es más seguro no adivinar.
setDefaultHandler(new NetworkOnly())

// ── Sincronización diferida ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_QUEUE' }))
      })
    )
  }
})

// ── Notificaciones push ──
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cursos AMX', {
      body: data.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'))
})
