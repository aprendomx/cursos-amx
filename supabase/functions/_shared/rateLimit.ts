// Rate limiter in-memory para Edge Functions (Deno/Supabase)
// Nota: en entornos serverless el store se reinicia en cold starts.

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000 // 1 minuto
const MAX_REQUESTS = 100 // requests por ventana

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  // Deno no expone connInfo directamente en el handler estándar de serve,
  // así que usamos un fallback.
  return 'unknown'
}

export function checkRateLimit(req: Request): {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
} {
  const ip = getClientIp(req)
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + WINDOW_MS
    store.set(ip, { count: 1, resetAt })
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt }
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfter }
  }

  entry.count++
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetAt: entry.resetAt }
}
