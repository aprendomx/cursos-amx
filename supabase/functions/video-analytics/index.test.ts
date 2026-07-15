// supabase/functions/video-analytics/index.test.ts
// Tests unitarios para video-analytics.
// Ejecutar: deno test --allow-all supabase/functions/video-analytics/index.test.ts

import {
  assertEquals,
  assertObjectMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  validateEvent,
  parseEvents,
  enforceOwnership,
  createHandler,
  EVENTOS_VALIDOS,
  MAX_EVENTS,
} from './handler.ts'
import { makeMockClient, makeRequest } from '../_shared/testing.ts'

// ───────────────────────────────────────────────────────────────
// validateEvent
// ───────────────────────────────────────────────────────────────

Deno.test('validateEvent acepta evento completo válido', () => {
  const event = {
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    leccion_id: '550e8400-e29b-41d4-a716-446655440001',
    curso_id: '550e8400-e29b-41d4-a716-446655440002',
    video_id: '550e8400-e29b-41d4-a716-446655440003',
    evento: 'play',
    tiempo_video: 15,
    datos: { playback_rate: 1.0 },
  }
  const result = validateEvent(event)
  assertEquals(result.valid, true)
  assertObjectMatch(result.data!, event)
})

Deno.test('validateEvent acepta evento sin video_id ni datos', () => {
  const event = {
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    leccion_id: '550e8400-e29b-41d4-a716-446655440001',
    curso_id: '550e8400-e29b-41d4-a716-446655440002',
    evento: 'pause',
    tiempo_video: 0,
  }
  const result = validateEvent(event)
  assertEquals(result.valid, true)
  assertEquals(result.data!.video_id, undefined)
  assertEquals(result.data!.datos, undefined)
})

Deno.test('validateEvent rechaza evento sin user_id', () => {
  const result = validateEvent({
    leccion_id: 'uuid',
    curso_id: 'uuid',
    evento: 'play',
    tiempo_video: 10,
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'user_id requerido')
})

Deno.test('validateEvent rechaza evento sin leccion_id', () => {
  const result = validateEvent({
    user_id: 'uuid',
    curso_id: 'uuid',
    evento: 'play',
    tiempo_video: 10,
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'leccion_id requerido')
})

Deno.test('validateEvent rechaza evento sin curso_id', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    evento: 'play',
    tiempo_video: 10,
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'curso_id requerido')
})

Deno.test('validateEvent rechaza evento sin evento', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    curso_id: 'uuid',
    tiempo_video: 10,
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'evento requerido')
})

Deno.test('validateEvent rechaza evento inválido', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    curso_id: 'uuid',
    evento: 'invalid',
    tiempo_video: 10,
  })
  assertEquals(result.valid, false)
  assertEquals(
    result.error,
    `evento inválido. Debe ser uno de: ${EVENTOS_VALIDOS.join(', ')}`
  )
})

Deno.test('validateEvent rechaza evento sin tiempo_video', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    curso_id: 'uuid',
    evento: 'play',
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'tiempo_video requerido')
})

Deno.test('validateEvent rechaza tiempo_video negativo', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    curso_id: 'uuid',
    evento: 'play',
    tiempo_video: -1,
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'tiempo_video debe ser >= 0')
})

Deno.test('validateEvent rechaza tiempo_video no numérico', () => {
  const result = validateEvent({
    user_id: 'uuid',
    leccion_id: 'uuid',
    curso_id: 'uuid',
    evento: 'play',
    tiempo_video: 'foo',
  })
  assertEquals(result.valid, false)
  assertEquals(result.error, 'tiempo_video debe ser un número')
})

Deno.test('validateEvent acepta todos los eventos válidos', () => {
  for (const ev of EVENTOS_VALIDOS) {
    const result = validateEvent({
      user_id: 'uuid',
      leccion_id: 'uuid',
      curso_id: 'uuid',
      evento: ev,
      tiempo_video: 0,
    })
    assertEquals(result.valid, true, `evento ${ev} debería ser válido`)
  }
})

// ───────────────────────────────────────────────────────────────
// parseEvents
// ───────────────────────────────────────────────────────────────

Deno.test('parseEvents extrae eventos válidos de un batch', () => {
  const body = {
    events: [
      { user_id: 'u1', leccion_id: 'l1', curso_id: 'c1', evento: 'play', tiempo_video: 10 },
      { user_id: 'u2', leccion_id: 'l2', curso_id: 'c2', evento: 'pause', tiempo_video: 20 },
    ],
  }
  const result = parseEvents(body)
  assertEquals(result.events.length, 2)
  assertEquals(result.errors.length, 0)
})

Deno.test('parseEvents filtra eventos inválidos y reporta errores', () => {
  const body = {
    events: [
      { user_id: 'u1', leccion_id: 'l1', curso_id: 'c1', evento: 'play', tiempo_video: 10 },
      { user_id: '', leccion_id: 'l2', curso_id: 'c2', evento: 'pause', tiempo_video: 20 },
      { user_id: 'u3', leccion_id: 'l3', curso_id: 'c3', evento: 'bad', tiempo_video: 30 },
    ],
  }
  const result = parseEvents(body)
  assertEquals(result.events.length, 1)
  assertEquals(result.errors.length, 2)
})

Deno.test('parseEvents rechaza más de MAX_EVENTS eventos', () => {
  const body = {
    events: Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({
      user_id: `u${i}`,
      leccion_id: `l${i}`,
      curso_id: `c${i}`,
      evento: 'play',
      tiempo_video: i,
    })),
  }
  const result = parseEvents(body)
  assertEquals(result.events.length, 0)
  assertEquals(result.errors.length, 1)
  assertEquals(result.errors[0], `Límite de ${MAX_EVENTS} eventos excedido`)
})

Deno.test('parseEvents rechaza body sin events', () => {
  const result = parseEvents({})
  assertEquals(result.events.length, 0)
  assertEquals(result.errors.length, 1)
  assertEquals(result.errors[0], 'events debe ser un array')
})

Deno.test('parseEvents rechaza events no-array', () => {
  const result = parseEvents({ events: 'foo' })
  assertEquals(result.events.length, 0)
  assertEquals(result.errors.length, 1)
  assertEquals(result.errors[0], 'events debe ser un array')
})

// ───────────────────────────────────────────────────────────────
// enforceOwnership
// ───────────────────────────────────────────────────────────────

function makeEvent(userId: string) {
  return {
    user_id: userId,
    leccion_id: 'l1',
    curso_id: 'c1',
    evento: 'play',
    tiempo_video: 10,
  }
}

Deno.test('enforceOwnership deja pasar todo a un admin', () => {
  const events = [makeEvent('user-1'), makeEvent('otro')]
  const result = enforceOwnership(events, 'admin-1', true)
  assertEquals(result.events.length, 2)
  assertEquals(result.errors.length, 0)
})

Deno.test('enforceOwnership descarta eventos de otros usuarios', () => {
  const events = [makeEvent('user-1'), makeEvent('otro'), makeEvent('user-1')]
  const result = enforceOwnership(events, 'user-1', false)
  assertEquals(result.events.length, 2)
  assertEquals(result.errors.length, 1)
})

// ───────────────────────────────────────────────────────────────
// createHandler (auth)
// ───────────────────────────────────────────────────────────────

const AUTH_BODY = { events: [makeEvent('user-1')] }

Deno.test('handler rechaza 401 sin Authorization', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(AUTH_BODY))
  assertEquals(res.status, 401)
})

Deno.test('handler rechaza 401 con token inválido', async () => {
  const client = makeMockClient({ user: null })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(AUTH_BODY, { jwt: 'bad' }))
  assertEquals(res.status, 401)
})

Deno.test('handler inserta eventos propios del usuario autenticado', async () => {
  const client = makeMockClient({
    user: { id: 'user-1' },
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(AUTH_BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.inserted, 1)
  assertEquals(client.inserts['video_eventos'].length, 1)
})

Deno.test('handler rechaza 400 si todos los eventos son de otro usuario', async () => {
  const client = makeMockClient({
    user: { id: 'user-2' },
    perfil: { es_admin: false, es_instructor: false },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(AUTH_BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 400)
  assertEquals((client.inserts['video_eventos'] ?? []).length, 0)
})

Deno.test('handler admin puede reportar eventos de cualquier usuario', async () => {
  const client = makeMockClient({
    user: { id: 'admin-1' },
    perfil: { es_admin: true },
  })
  const handler = createHandler(() => client)
  const res = await handler(makeRequest(AUTH_BODY, { jwt: 'jwt' }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.inserted, 1)
})
