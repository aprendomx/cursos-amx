// supabase/functions/_shared/serviceAuth.ts
// Autenticación para funciones que NO las invoca un usuario: cron de Postgres,
// webhooks de terceros y llamadas función-a-función.
//
// Contexto: el runtime self-hosted corre con FUNCTIONS_VERIFY_JWT=false
// (docker/.env.example), que es global y no se puede fijar por función. Sin
// esto, TODA función es invocable por cualquiera desde internet.

import { extractBearer } from './auth.ts'

/** Comparación en tiempo constante: evita filtrar el secreto por temporización. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  // Longitudes distintas se rechazan, pero igual se recorre para no dar señal.
  const len = Math.max(ea.length, eb.length)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  }
  return diff === 0
}

/**
 * ¿La petición trae la service_role key? Es lo que usan el cron de Postgres y
 * las llamadas función-a-función. NO la tiene el navegador.
 */
export function isServiceRole(req: Request, serviceRoleKey: string | undefined): boolean {
  if (!serviceRoleKey) return false
  const token = extractBearer(req.headers.get('authorization'))
  if (!token) return false
  return safeEqual(token, serviceRoleKey)
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface ZoomVerification {
  ok: boolean
  reason?: string
}

/**
 * Verifica la firma de un webhook de Zoom.
 * Zoom firma `v0:{timestamp}:{cuerpo crudo}` con el Webhook Secret Token y
 * manda el resultado en `x-zm-signature` como `v0=<hex>`.
 *
 * `rawBody` debe ser el cuerpo TAL CUAL llegó: si se parsea y se vuelve a
 * serializar, el hash no coincide.
 */
export async function verifyZoomSignature(
  req: Request,
  rawBody: string,
  secretToken: string | undefined,
  maxSkewSeconds = 300
): Promise<ZoomVerification> {
  if (!secretToken) {
    return { ok: false, reason: 'ZOOM_WEBHOOK_SECRET_TOKEN no configurado' }
  }
  const signature = req.headers.get('x-zm-signature')
  const timestamp = req.headers.get('x-zm-request-timestamp')
  if (!signature || !timestamp) {
    return { ok: false, reason: 'faltan cabeceras de firma' }
  }

  // Ventana anti-replay.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'timestamp inválido' }
  const skew = Math.abs(Date.now() / 1000 - ts)
  if (skew > maxSkewSeconds) return { ok: false, reason: 'timestamp fuera de ventana' }

  const expected = `v0=${await hmacSha256Hex(secretToken, `v0:${timestamp}:${rawBody}`)}`
  if (!safeEqual(signature, expected)) return { ok: false, reason: 'firma no coincide' }
  return { ok: true }
}

/**
 * Reto de validación de URL de Zoom: al registrar el endpoint, Zoom manda
 * `endpoint.url_validation` con un plainToken y espera su HMAC de vuelta.
 */
export async function zoomUrlValidationResponse(
  plainToken: string,
  secretToken: string
): Promise<{ plainToken: string; encryptedToken: string }> {
  return {
    plainToken,
    encryptedToken: await hmacSha256Hex(secretToken, plainToken),
  }
}
