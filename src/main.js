import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import { applyTheme } from './lib/theme.js'
import i18n from './lib/i18n.js'
import { loadFeatureFlags } from './composables/useFeatureFlags.js'
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

app.mount('#app')

// Carga feature flags en caliente (no bloquea el montado; tiene fallback build-time)
loadFeatureFlags()
