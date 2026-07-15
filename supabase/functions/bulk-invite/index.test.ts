// supabase/functions/bulk-invite/index.test.ts
// Ejecutar: deno test --allow-all supabase/functions/bulk-invite/index.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createHandler } from './handler.ts'
import { makeMockClient, makeRequest } from '../_shared/testing.ts'

const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const BODY = {
  users: [{ email: 'nuevo@example.com', data: { nombres: 'Nuevo' } }],
}

Deno.test('bulk-invite rechaza 401 sin Authorization', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(BODY))
  assertEquals(res.status, 401)
})

Deno.test('bulk-invite rechaza 401 con token inválido', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(BODY, { jwt: 'bad' }))
  assertEquals(res.status, 401)
})

Deno.test('bulk-invite rechaza 403 a un usuario sin rol admin', async () => {
  const client = makeMockClient({
    user: { id: 'user-1' },
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 403)
})

Deno.test('bulk-invite rechaza 403 a un instructor (solo admin)', async () => {
  const client = makeMockClient({
    user: { id: 'inst-1' },
    perfil: { es_admin: false, es_instructor: true },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 403)
})

Deno.test('bulk-invite permite a un admin crear usuarios', async () => {
  const client = makeMockClient({ user: ADMIN, perfil: { es_admin: true } })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.results.length, 1)
  assertEquals(json.results[0].status, 'ok')
  // El perfil del nuevo usuario se insertó con service_role.
  assertEquals(client.inserts['perfiles'].length, 1)
  assertEquals(client.inserts['perfiles'][0].correo, 'nuevo@example.com')
})

Deno.test('bulk-invite responde 400 con users vacío (admin)', async () => {
  const client = makeMockClient({ user: ADMIN, perfil: { es_admin: true } })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ users: [] }, { jwt: 'jwt' }))
  assertEquals(res.status, 400)
})
