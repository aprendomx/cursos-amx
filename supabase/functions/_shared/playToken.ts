// supabase/functions/_shared/playToken.ts
// Token efímero de reproducción para las playlists HLS.
//
// Por qué existe: hls-playlist-url metía el JWT DE SESIÓN del usuario en la
// query string del manifest (`?video=...&path=...&t=<jwt>`), y hls-playlist lo
// reinyectaba en cada sub-playlist. Una URL de manifest era, por tanto, una
// credencial portadora completa: quien la obtuviera podía llamar a CUALQUIER
// endpoint de la API como ese usuario hasta que el JWT expirara. Y esas URLs
// terminan en el historial del navegador, en cabeceras Referer y en los logs
// de Kong, de la Edge Function y de cualquier proxy intermedio.
//
// El token de aquí solo sirve para pedir las playlists de UN video, dura
// minutos y no autentica nada más.

const VERSION = 'v1'

/**
 * Segundos de vida del token. El default iguala al TTL de las URLs firmadas de
 * segmento (SEGMENT_TTL_SECONDS, 4 h) a propósito:
 *
 *  - hls.js pide la sub-playlist de una calidad la primera vez que la usa, así
 *    que un cambio de calidad a mitad de un video largo ocurre mucho después
 *    del inicio. Un TTL corto haría fallar la reproducción ahí.
 *  - La mejora de seguridad real no es la duración, sino el ALCANCE: este
 *    token sirve para pedir las playlists de un solo video y para nada más,
 *    mientras que el JWT de sesión que viajaba antes en la URL daba acceso a
 *    toda la API como ese usuario.
 *
 * Bajarlo es seguro si los videos son cortos: PLAY_TOKEN_TTL_SECONDS.
 */
export const PLAY_TOKEN_TTL_SECONDS = Number(Deno.env.get('PLAY_TOKEN_TTL_SECONDS') || 4 * 3600)

/**
 * Secreto de firma. Si no se define HLS_TOKEN_SECRET se cae a la service_role
 * key, que ya está presente en ambas funciones: así una instalación existente
 * no queda rota por falta de configuración. Nunca se emite sin secreto.
 */
export function playTokenSecret(): string | undefined {
  return Deno.env.get('HLS_TOKEN_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined
}

async function sign(secret: string, message: string): Promise<string> {
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

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  const len = Math.max(ea.length, eb.length)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

/**
 * Emite un token con alcance (videoId, userId) y caducidad.
 * Formato: v1.<exp>.<userId>.<hmac>
 */
export async function issuePlayToken(
  videoId: string,
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttl = PLAY_TOKEN_TTL_SECONDS
): Promise<string> {
  const exp = nowSeconds + ttl
  const sig = await sign(secret, `${VERSION}:${videoId}:${userId}:${exp}`)
  return `${VERSION}.${exp}.${userId}.${sig}`
}

export interface PlayTokenResult {
  ok: boolean
  userId?: string
  reason?: string
}

/**
 * Verifica un token contra el videoId que se está pidiendo. El videoId entra
 * en el HMAC pero NO viaja en el token: así un token de un video no sirve para
 * otro, aunque alguien reescriba el parámetro `video` de la URL.
 */
export async function verifyPlayToken(
  token: string,
  videoId: string,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<PlayTokenResult> {
  if (!secret) return { ok: false, reason: 'secreto de firma no configurado' }
  const parts = token.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'formato inválido' }

  const [version, expRaw, userId, sig] = parts
  if (version !== VERSION) return { ok: false, reason: 'versión no soportada' }

  const exp = Number(expRaw)
  if (!Number.isFinite(exp)) return { ok: false, reason: 'caducidad inválida' }
  if (exp < nowSeconds) return { ok: false, reason: 'token caducado' }

  const esperado = await sign(secret, `${VERSION}:${videoId}:${userId}:${exp}`)
  if (!constantTimeEqual(sig, esperado)) return { ok: false, reason: 'firma no coincide' }

  return { ok: true, userId }
}
