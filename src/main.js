import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import { applyTheme } from './lib/theme.js'
import './assets/main.css'

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

applyTheme()

app.mount('#app')
