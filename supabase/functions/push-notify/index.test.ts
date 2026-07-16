// supabase/functions/push-notify/index.test.ts
// Ejecutar: deno test --allow-all supabase/functions/push-notify/index.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createHandler } from './handler.ts'
import { makeMockClient, makeRequest } from '../_shared/testing.ts'

// Claves con formato VAPID válido (65 / 32 bytes en base64url); solo para
// que setVapidDetails no falle — en estos tests no se envía ningún push.
Deno.env.set('VAPID_PUBLIC_KEY', 'B' + 'A'.repeat(86))
Deno.env.set('VAPID_PRIVATE_KEY', 'A'.repeat(43))

const USER = { id: 'user-1' }
const ADMIN = { id: 'admin-1' }

Deno.test('push-notify rechaza 401 sin Authorization', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ userId: 'user-1', title: 'Hola' }))
  assertEquals(res.status, 401)
})

Deno.test('push-notify rechaza 403 si un no-admin envía a otro usuario', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(
    makeRequest({ userId: 'otro-usuario', title: 'Hola' }, { jwt: 'jwt' })
  )
  assertEquals(res.status, 403)
})

Deno.test('push-notify responde 400 sin title', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({}, { jwt: 'jwt' }))
  assertEquals(res.status, 400)
})

Deno.test('push-notify permite enviarse a sí mismo (sin suscripciones → sent 0)', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
    tables: { push_subscriptions: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(
    makeRequest({ userId: 'user-1', title: 'Hola' }, { jwt: 'jwt' })
  )
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.sent, 0)
})

Deno.test('push-notify permite al admin enviar a otro usuario', async () => {
  const client = makeMockClient({
    user: ADMIN,
    perfil: { es_admin: true },
    tables: { push_subscriptions: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(
    makeRequest({ userId: 'otro-usuario', title: 'Hola' }, { jwt: 'jwt' })
  )
  assertEquals(res.status, 200)
  // La consulta de suscripciones usa el userId del body (permitido por admin).
  assertEquals(client.eqCalls['push_subscriptions'], [['user_id', 'otro-usuario']])
})

Deno.test('push-notify sin userId usa el usuario autenticado', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
    tables: { push_subscriptions: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ title: 'Hola' }, { jwt: 'jwt' }))
  assertEquals(res.status, 200)
  assertEquals(client.eqCalls['push_subscriptions'], [['user_id', 'user-1']])
})
