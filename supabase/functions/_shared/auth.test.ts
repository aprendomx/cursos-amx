// supabase/functions/_shared/auth.test.ts
// Ejecutar: deno test --allow-all supabase/functions/_shared/auth.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { authorize, extractBearer } from './auth.ts'
import { makeMockClient, makeRequest } from './testing.ts'

// ───────────────────────────────────────────────────────────────
// extractBearer
// ───────────────────────────────────────────────────────────────

Deno.test('extractBearer devuelve null sin header', () => {
  assertEquals(extractBearer(null), null)
  assertEquals(extractBearer(''), null)
})

Deno.test('extractBearer extrae el token con prefijo Bearer', () => {
  assertEquals(extractBearer('Bearer abc123'), 'abc123')
  assertEquals(extractBearer('bearer abc123'), 'abc123')
})

Deno.test('extractBearer devuelve null si solo hay prefijo', () => {
  assertEquals(extractBearer('Bearer '), null)
})

// ───────────────────────────────────────────────────────────────
// authorize
// ───────────────────────────────────────────────────────────────

const USER = { id: 'user-1', email: 'user@example.com' }

Deno.test('authorize rechaza 401 sin header Authorization', async () => {
  const client = makeMockClient({ user: USER, perfil: { es_admin: true } })
  const result = await authorize(makeRequest({}), client)
  assertEquals(result.ok, false)
  assertEquals(result.status, 401)
})

Deno.test('authorize rechaza 401 con token inválido', async () => {
  const client = makeMockClient({ user: null })
  const result = await authorize(makeRequest({}, { jwt: 'bad' }), client)
  assertEquals(result.ok, false)
  assertEquals(result.status, 401)
})

Deno.test('authorize rechaza 403 si el usuario no tiene perfil', async () => {
  const client = makeMockClient({ user: USER, perfil: null })
  const result = await authorize(makeRequest({}, { jwt: 'jwt' }), client)
  assertEquals(result.ok, false)
  assertEquals(result.status, 403)
})

Deno.test('authorize rechaza 403 si falta el rol requerido', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
  })
  const result = await authorize(makeRequest({}, { jwt: 'jwt' }), client, {
    anyOf: ['admin'],
  })
  assertEquals(result.ok, false)
  assertEquals(result.status, 403)
})

Deno.test('authorize acepta admin cuando se requiere admin', async () => {
  const client = makeMockClient({ user: USER, perfil: { es_admin: true } })
  const result = await authorize(makeRequest({}, { jwt: 'jwt' }), client, {
    anyOf: ['admin'],
  })
  assertEquals(result.ok, true)
  assertEquals(result.user?.id, 'user-1')
  assertEquals(result.roles?.es_admin, true)
})

Deno.test('authorize acepta instructor cuando se acepta admin o instructor', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: true },
  })
  const result = await authorize(makeRequest({}, { jwt: 'jwt' }), client, {
    anyOf: ['admin', 'instructor'],
  })
  assertEquals(result.ok, true)
  assertEquals(result.roles?.es_instructor, true)
})

Deno.test('authorize sin roles requeridos basta con estar autenticado', async () => {
  const client = makeMockClient({
    user: USER,
    perfil: { es_admin: false, es_instructor: false },
  })
  const result = await authorize(makeRequest({}, { jwt: 'jwt' }), client)
  assertEquals(result.ok, true)
})
