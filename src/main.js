import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import { applyTheme } from './lib/theme.js'
import i18n from './lib/i18n.js'
import { loadFeatureFlags, hidratarFlagsGuardados } from './composables/useFeatureFlags.js'
import './assets/main.css'
import './assets/admin-shared.css'
import './assets/player-layouts.css'

const app = createApp(App)

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    app,
    dsn: sentryDsn,
    integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })

  app.config.errorHandler = (err, vm, info) => {
    Sentry.captureException(err, { extra: { info, component: vm?.$options?.name } })
    console.error(err)
  }
}

app.use(createPinia())
app.use(router)
app.use(i18n)

applyTheme()

// Los flags tienen que estar puestos ANTES del primer render: featureEnabled()
// es síncrona y la usan ~90 sitios, así que montar sin ellos puede pintar un
// módulo que la base tiene apagado — cuyas tablas, desde la migración 063,
// devuelven 403.
//
// Antes esto se resolvía esperando SIEMPRE a la red, y ahí estaba el problema:
// `.finally()` monta pase lo que pase, pero solo cuando la promesa se asienta,
// y con la API inalcanzable eso tardaba 7.3 s. Siete segundos de página en
// blanco, medidos. La API caída no es un caso raro: es justo cuando conviene
// que la aplicación al menos aparezca y lo diga.
//
// Ahora se usan los flags que dejó la visita anterior, que son síncronos y
// están en disco. La red solo bloquea a quien llega por primera vez —y aun a
// ese, con un límite.
const ESPERA_MAXIMA_FLAGS = 1500

if (hidratarFlagsGuardados()) {
  // Visita conocida: monta ya, con los flags de la última vez, y los refresca
  // en segundo plano para la próxima. Pueden estar rancios como mucho una
  // sesión; a cambio, el arranque no depende de la red.
  app.mount('#app')
  loadFeatureFlags()
} else {
  // Primera visita: no hay nada que usar, así que sí se espera —pero acotado,
  // para no repetir los 7.3 s en blanco si la API no responde.
  Promise.race([
    loadFeatureFlags(),
    new Promise((resolver) => setTimeout(resolver, ESPERA_MAXIMA_FLAGS)),
  ]).finally(() => {
    app.mount('#app')
  })
}
