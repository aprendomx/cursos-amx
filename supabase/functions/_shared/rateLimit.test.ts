import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkRateLimit, clientIp, _resetLocal } from './rateLimit.ts'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/f', { method: 'POST', headers })
}

function clienteFalso(respuesta: unknown, error: unknown = null) {
  const llamadas: Array<Record<string, unknown>> = []
  return {
    llamadas,
    rpc: (_fn: string, args: Record<string, unknown>) => {
      llamadas.push(args)
      return Promise.resolve({ data: respuesta, error })
    },
  }
}

const PERMITE = { allowed: true, remaining: 9, reset_at: null, retry_after: 60 }
const RECHAZA = { allowed: false, remaining: 0, reset_at: null, retry_after: 42 }

Deno.test('clientIp toma la primera IP de x-forwarded-for', () => {
  assertEquals(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })), '1.2.3.4')
  assertEquals(clientIp(req({ 'x-real-ip': '9.9.9.9' })), '9.9.9.9')
})

// El fallback anterior era la cadena 'unknown' para todos, así que un solo
// cliente podía agotar el cupo de los demás.
Deno.test('clientIp cae a un valor explícito cuando no hay cabecera', () => {
  assertEquals(clientIp(req()), 'desconocido')
})

Deno.test('delega el conteo en el contador compartido', async () => {
  _resetLocal()
  const c = clienteFalso(PERMITE)
  const r = await checkRateLimit(req({ 'x-forwarded-for': '1.1.1.1' }), {
    scope: 'mi-funcion',
    max: 10,
    ventanaSeg: 60,
    client: c,
  })
  assertEquals(r.allowed, true)
  assertEquals(c.llamadas.length, 1)
  assertEquals(c.llamadas[0].p_scope, 'mi-funcion')
  assertEquals(c.llamadas[0].p_bucket, '1.1.1.1')
})

Deno.test('rechaza cuando el contador compartido lo dice', async () => {
  _resetLocal()
  const r = await checkRateLimit(req({ 'x-forwarded-for': '2.2.2.2' }), {
    scope: 'f',
    client: clienteFalso(RECHAZA),
  })
  assertEquals(r.allowed, false)
  assertEquals(r.retryAfter, 42)
})

// Cada endpoint tiene su cubo: agotar uno no debe cerrar los demás.
Deno.test('los scopes no se pisan entre sí', async () => {
  _resetLocal()
  const c = clienteFalso(PERMITE)
  await checkRateLimit(req({ 'x-forwarded-for': '3.3.3.3' }), { scope: 'a', client: c })
  await checkRateLimit(req({ 'x-forwarded-for': '3.3.3.3' }), { scope: 'b', client: c })
  assertEquals(c.llamadas[0].p_scope, 'a')
  assertEquals(c.llamadas[1].p_scope, 'b')
})

Deno.test('el prefiltro local corta sin ir a la base', async () => {
  _resetLocal()
  const c = clienteFalso(PERMITE)
  const opts = { scope: 'pref', max: 2, ventanaSeg: 60, client: c }
  const ip = { 'x-forwarded-for': '4.4.4.4' }

  assertEquals((await checkRateLimit(req(ip), opts)).allowed, true)
  assertEquals((await checkRateLimit(req(ip), opts)).allowed, true)
  const tercera = await checkRateLimit(req(ip), opts)
  assertEquals(tercera.allowed, false)
  // La tercera ni siquiera consultó el contador compartido.
  assertEquals(c.llamadas.length, 2)
})

// Si el limitador está caído, no se tira el servicio con él…
Deno.test('falla abierto por defecto si el contador no responde', async () => {
  _resetLocal()
  const r = await checkRateLimit(req({ 'x-forwarded-for': '5.5.5.5' }), {
    scope: 'f',
    client: clienteFalso(null, new Error('db caída')),
  })
  assertEquals(r.allowed, true)
  assertEquals(r.degradado, true)
})

// …salvo donde cada petición de más cuesta dinero.
Deno.test('falla cerrado cuando se pide explícitamente', async () => {
  _resetLocal()
  const r = await checkRateLimit(req({ 'x-forwarded-for': '6.6.6.6' }), {
    scope: 'ai-proxy',
    failClosed: true,
    client: clienteFalso(null, new Error('db caída')),
  })
  assertEquals(r.allowed, false)
  assertEquals(r.degradado, true)
})

Deno.test('sin cliente aplica la misma política de fallo', async () => {
  _resetLocal()
  assert((await checkRateLimit(req(), { scope: 'x' })).allowed)
  _resetLocal()
  assert(!(await checkRateLimit(req(), { scope: 'x', failClosed: true })).allowed)
})
