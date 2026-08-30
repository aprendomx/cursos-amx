import * as Sentry from '@sentry/vue'

export function reportError(err, extra = {}) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(err, { extra })
  } else {
    console.error('[reportError]', err, extra)
  }
}
