// supabase/functions/analytics/index.test.ts
// Ejecutar: deno test --allow-all supabase/functions/analytics/index.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createHandler, INSTRUCTOR_ACTIONS } from './handler.ts'
import { makeMockClient, makeRequest } from '../_shared/testing.ts'

const ADMIN = { id: 'admin-1' }
const INSTRUCTOR = { id: 'inst-1' }

Deno.test('analytics rechaza 401 sin Authorization', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ action: 'comparativa' }))
  assertEquals(res.status, 401)
})

Deno.test('analytics rechaza 403 a un usuario sin rol', async () => {
  const client = makeMockClient({
    user: { id: 'user-1' },
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ action: 'comparativa' }, { jwt: 'jwt' }))
  assertEquals(res.status, 403)
})

Deno.test('analytics rechaza 403 a un instructor en acciones de admin', async () => {
  const client = makeMockClient({
    user: INSTRUCTOR,
    perfil: { es_admin: false, es_instructor: true },
    tables: { v_comparativa_cursos: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ action: 'comparativa' }, { jwt: 'jwt' }))
  assertEquals(res.status, 403)
})

Deno.test('analytics permite a un instructor sus acciones y deriva instructor_id del token', async () => {
  const client = makeMockClient({
    user: INSTRUCTOR,
    perfil: { es_admin: false, es_instructor: true },
    tables: { v_instructor_cursos: [] },
  })
  const handler = createHandler(() => client)
  // Intenta suplantar a otro instructor vía body: debe ignorarse.
  const res = await handler(
    makeRequest(
      { action: 'instructor_dashboard', instructor_id: 'otro-instructor' },
      { jwt: 'jwt' }
    )
  )
  assertEquals(res.status, 200)
  const eqCalls = client.eqCalls['v_instructor_cursos']
  assertEquals(eqCalls, [['instructor_id', 'inst-1']])
})

Deno.test('analytics permite al admin consultar el dashboard de otro instructor', async () => {
  const client = makeMockClient({
    user: ADMIN,
    perfil: { es_admin: true },
    tables: { v_instructor_cursos: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(
    makeRequest(
      { action: 'instructor_dashboard', instructor_id: 'otro-instructor' },
      { jwt: 'jwt' }
    )
  )
  assertEquals(res.status, 200)
  assertEquals(client.eqCalls['v_instructor_cursos'], [
    ['instructor_id', 'otro-instructor'],
  ])
})

Deno.test('analytics permite acciones admin a un admin', async () => {
  const client = makeMockClient({
    user: ADMIN,
    perfil: { es_admin: true },
    tables: { v_comparativa_cursos: [] },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ action: 'comparativa' }, { jwt: 'jwt' }))
  assertEquals(res.status, 200)
})

Deno.test('analytics responde 400 en acción desconocida (admin)', async () => {
  const client = makeMockClient({ user: ADMIN, perfil: { es_admin: true } })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest({ action: 'nope' }, { jwt: 'jwt' }))
  assertEquals(res.status, 400)
})

Deno.test('INSTRUCTOR_ACTIONS solo contiene acciones de alcance instructor', () => {
  assertEquals(
    [...INSTRUCTOR_ACTIONS],
    ['instructor_dashboard', 'instructor_alumnos', 'leccion_analytics']
  )
})
