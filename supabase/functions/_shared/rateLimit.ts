// supabase/functions/_shared/rateLimit.ts
// Límite de tasa compartido entre isolates.
//
// La versión anterior era un Map en memoria del isolate. En la práctica no
// limitaba nada:
//   * se reiniciaba en cada cold start, que en este runtime son frecuentes;
//   * no compartía estado, así que N isolates admitían N × MAX peticiones;
//   * sin x-forwarded-for metía a TODOS los clientes en un cubo llamado
//     'unknown', de modo que un cliente podía agotar el cupo de los demás.
//
// Ahora el conteo autoritativo vive en Postgres (migración 068). Se conserva
// un prefiltro en memoria porque es gratis y evita ir a la base cuando este
// isolate ya sabe que el cliente se pasó.

const VENTANA_MS = 60_000
const MAX_POR_DEFECTO = 100

interface EntradaLocal {
  count: number
  resetAt: number
}

const local = new Map<string, EntradaLocal>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
  /** true si el contador compartido no respondió y se aplicó la política de fallo. */
  degradado?: boolean
}

export interface RateLimitOptions {
  /** Identifica el endpoint. Cubos distintos por función. */
  scope: string
  /** Peticiones permitidas por ventana. */
  max?: number
  /** Ventana en segundos. */
  ventanaSeg?: number
  /**
   * Qué hacer si el contador compartido no responde.
   * false (por defecto) = dejar pasar: no se tira el servicio porque el
   * limitador esté caído. true = rechazar; úsalo donde una petición de más
   * cuesta dinero (ai-proxy, transcripción).
   */
  failClosed?: boolean
  /**
   * Cliente con service_role. Inyectable en pruebas.
   * El tipo es laxo a propósito: supabase-js devuelve un builder «thenable»,
   * no una Promise, y aquí solo se necesita poder await-earlo.
   */
  // deno-lint-ignore no-explicit-any
  client?: { rpc: (fn: string, args: any) => PromiseLike<{ data: any; error: any }> }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const primera = fwd.split(',')[0].trim()
    if (primera) return primera
  }
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'desconocido'
}

/** Prefiltro local. No es la autoridad: solo evita ir a la base de balde. */
function chequeoLocal(clave: string, max: number, ventanaMs: number): RateLimitResult | null {
  const ahora = Date.now()
  const e = local.get(clave)

  if (!e || ahora > e.resetAt) {
    local.set(clave, { count: 1, resetAt: ahora + ventanaMs })
    return null
  }
  e.count++
  if (e.count > max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: e.resetAt,
      retryAfter: Math.max(Math.ceil((e.resetAt - ahora) / 1000), 1),
    }
  }
  return null
}

export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const {
    scope,
    max = MAX_POR_DEFECTO,
    ventanaSeg = VENTANA_MS / 1000,
    failClosed = false,
    client,
  } = options

  const bucket = clientIp(req)
  const clave = `${scope}:${bucket}`

  const localFail = chequeoLocal(clave, max, ventanaSeg * 1000)
  if (localFail) return localFail

  if (!client) {
    // Sin cliente no hay contador compartido: se aplica la política de fallo.
    return failClosed
      ? {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + ventanaSeg * 1000,
          retryAfter: ventanaSeg,
          degradado: true,
        }
      : { allowed: true, remaining: max, resetAt: Date.now() + ventanaSeg * 1000, degradado: true }
  }

  try {
    const { data, error } = await client.rpc('rate_limit_check', {
      p_scope: scope,
      p_bucket: bucket,
      p_max: max,
      p_ventana_seg: ventanaSeg,
    })
    if (error || !data) throw error ?? new Error('sin respuesta')

    return {
      allowed: data.allowed === true,
      remaining: Number(data.remaining ?? 0),
      resetAt: data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + ventanaSeg * 1000,
      retryAfter: Number(data.retry_after ?? ventanaSeg),
    }
  } catch (err) {
    console.warn(`[rateLimit] contador compartido no disponible (${scope}):`, String(err))
    return failClosed
      ? {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + ventanaSeg * 1000,
          retryAfter: ventanaSeg,
          degradado: true,
        }
      : { allowed: true, remaining: max, resetAt: Date.now() + ventanaSeg * 1000, degradado: true }
  }
}

/** Respuesta 429 con las cabeceras estándar. */
export function rateLimitResponse(
  rl: RateLimitResult,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ error: 'too many requests' }), {
    status: 429,
    headers: {
      ...extraHeaders,
      'content-type': 'application/json',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.ceil(rl.resetAt / 1000)),
      'retry-after': String(rl.retryAfter ?? 60),
    },
  })
}

/** Solo para pruebas: limpia el prefiltro en memoria. */
export function _resetLocal(): void {
  local.clear()
}
