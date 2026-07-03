import * as Sentry from '@sentry/vue'

export function reportError(err, extra = {}) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(err, { extra })
  } else {
    console.error('[reportError]', err, extra)
  }
}

export function reportMessage(message, level = 'info') {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureMessage(message, level)
  } else {
    console.log(`[${level}]`, message)
  }
}
