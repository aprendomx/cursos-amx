import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  safeEqual,
  isServiceRole,
  verifyZoomSignature,
  zoomUrlValidationResponse,
} from './serviceAuth.ts'

const SECRET = 'zoom-secret-de-prueba'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/hook', { method: 'POST', headers })
}

async function firmar(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`)
  )
  return `v0=${Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}

Deno.test('safeEqual compara correctamente', () => {
  assert(safeEqual('abc', 'abc'))
  assert(!safeEqual('abc', 'abd'))
  assert(!safeEqual('abc', 'abcd'))
  assert(!safeEqual('', 'a'))
  assert(safeEqual('', ''))
})

Deno.test('isServiceRole acepta la service_role key y rechaza el resto', () => {
  assert(isServiceRole(req({ authorization: 'Bearer llave-servicio' }), 'llave-servicio'))
  assert(!isServiceRole(req({ authorization: 'Bearer llave-anon' }), 'llave-servicio'))
  assert(!isServiceRole(req({}), 'llave-servicio'))
  // Sin secreto configurado nunca se autoriza: falla cerrado.
  assert(!isServiceRole(req({ authorization: 'Bearer lo-que-sea' }), undefined))
  assert(!isServiceRole(req({ authorization: 'Bearer ' }), 'llave-servicio'))
})

Deno.test('verifyZoomSignature acepta una firma válida', async () => {
  const body = JSON.stringify({ event: 'recording.completed' })
  const ts = String(Math.floor(Date.now() / 1000))
  const r = req({ 'x-zm-signature': await firmar(SECRET, ts, body), 'x-zm-request-timestamp': ts })
  assertEquals((await verifyZoomSignature(r, body, SECRET)).ok, true)
})

Deno.test('verifyZoomSignature rechaza firma inválida', async () => {
  const body = JSON.stringify({ event: 'recording.completed' })
  const ts = String(Math.floor(Date.now() / 1000))
  const r = req({
    'x-zm-signature': await firmar('otro-secreto', ts, body),
    'x-zm-request-timestamp': ts,
  })
  const res = await verifyZoomSignature(r, body, SECRET)
  assertEquals(res.ok, false)
  assertEquals(res.reason, 'firma no coincide')
})

Deno.test('verifyZoomSignature rechaza cuerpo manipulado', async () => {
  const original = JSON.stringify({ event: 'recording.completed', id: 1 })
  const manipulado = JSON.stringify({ event: 'recording.completed', id: 2 })
  const ts = String(Math.floor(Date.now() / 1000))
  const r = req({
    'x-zm-signature': await firmar(SECRET, ts, original),
    'x-zm-request-timestamp': ts,
  })
  assertEquals((await verifyZoomSignature(r, manipulado, SECRET)).ok, false)
})

Deno.test('verifyZoomSignature rechaza replay fuera de ventana', async () => {
  const body = '{}'
  const viejo = String(Math.floor(Date.now() / 1000) - 3600)
  const r = req({
    'x-zm-signature': await firmar(SECRET, viejo, body),
    'x-zm-request-timestamp': viejo,
  })
  const res = await verifyZoomSignature(r, body, SECRET)
  assertEquals(res.ok, false)
  assertEquals(res.reason, 'timestamp fuera de ventana')
})

Deno.test('verifyZoomSignature falla cerrado sin secreto y sin cabeceras', async () => {
  assertEquals((await verifyZoomSignature(req({}), '{}', undefined)).ok, false)
  assertEquals(
    (await verifyZoomSignature(req({}), '{}', SECRET)).reason,
    'faltan cabeceras de firma'
  )
})

Deno.test('zoomUrlValidationResponse devuelve el HMAC del plainToken', async () => {
  const res = await zoomUrlValidationResponse('abc123', SECRET)
  assertEquals(res.plainToken, 'abc123')
  assertEquals(res.encryptedToken.length, 64)
  const otra = await zoomUrlValidationResponse('abc123', SECRET)
  assertEquals(res.encryptedToken, otra.encryptedToken)
})
