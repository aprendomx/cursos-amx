import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { issuePlayToken, verifyPlayToken } from './playToken.ts'

const SECRET = 'secreto-de-firma-de-prueba'
const VIDEO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRO_VIDEO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER = 'user-123'
const AHORA = 1_800_000_000

Deno.test('un token recién emitido verifica', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  const res = await verifyPlayToken(t, VIDEO, SECRET, AHORA + 10)
  assertEquals(res.ok, true)
  assertEquals(res.userId, USER)
})

Deno.test('el token NO sirve para otro video', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  const res = await verifyPlayToken(t, OTRO_VIDEO, SECRET, AHORA + 10)
  assertEquals(res.ok, false)
  assertEquals(res.reason, 'firma no coincide')
})

Deno.test('el token caduca', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  const res = await verifyPlayToken(t, VIDEO, SECRET, AHORA + 601)
  assertEquals(res.ok, false)
  assertEquals(res.reason, 'token caducado')
})

Deno.test('no se puede extender la caducidad sin la firma', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  const [v, exp, u, sig] = t.split('.')
  const manipulado = [v, String(Number(exp) + 100000), u, sig].join('.')
  const res = await verifyPlayToken(manipulado, VIDEO, SECRET, AHORA + 10)
  assertEquals(res.ok, false)
  assertEquals(res.reason, 'firma no coincide')
})

Deno.test('no se puede suplantar a otro usuario', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  const [v, exp, , sig] = t.split('.')
  const res = await verifyPlayToken([v, exp, 'otro-user', sig].join('.'), VIDEO, SECRET, AHORA + 10)
  assertEquals(res.ok, false)
})

Deno.test('otro secreto no valida', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  assertEquals((await verifyPlayToken(t, VIDEO, 'otro-secreto', AHORA + 10)).ok, false)
})

Deno.test('falla cerrado sin secreto y con formatos raros', async () => {
  const t = await issuePlayToken(VIDEO, USER, SECRET, AHORA, 600)
  assertEquals((await verifyPlayToken(t, VIDEO, undefined, AHORA)).ok, false)
  assertEquals((await verifyPlayToken('', VIDEO, SECRET, AHORA)).ok, false)
  assertEquals((await verifyPlayToken('a.b.c', VIDEO, SECRET, AHORA)).ok, false)
  assertEquals(
    (await verifyPlayToken('v9.1.2.3', VIDEO, SECRET, AHORA)).reason,
    'versión no soportada'
  )
  assertEquals(
    (await verifyPlayToken('v1.abc.u.s', VIDEO, SECRET, AHORA)).reason,
    'caducidad inválida'
  )
})

Deno.test('un JWT de sesión no pasa por token de reproducción', async () => {
  const jwtFalso = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.firma'
  assertEquals((await verifyPlayToken(jwtFalso, VIDEO, SECRET, AHORA)).ok, false)
})
