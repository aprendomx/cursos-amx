// supabase/functions/notifications-worker/index.test.ts
// Tests unitarios para notifications-worker.
// Ejecutar: deno test --allow-all supabase/functions/notifications-worker/index.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildEmailHtml,
  escapeHtml,
  loadEmailConfig,
  processNotification,
  sendEmail,
} from './index.ts'

// ───────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────

Deno.test('escapeHtml escapa caracteres especiales', () => {
  assertEquals(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  assertEquals(escapeHtml("'foo' & bar"), '&#039;foo&#039; &amp; bar')
  assertEquals(escapeHtml(''), '')
  assertEquals(escapeHtml(undefined as unknown as string), '')
})

Deno.test('buildEmailHtml genera HTML con datos escapados', () => {
  const html = buildEmailHtml(
    { titulo: 'Hola <b>mundo</b>', cuerpo: 'Texto & más' },
    { nombres: 'Juan <script>', apellido_paterno: 'Pérez' },
  )
  assertStringIncludes(html, 'Hola &lt;b&gt;mundo&lt;/b&gt;')
  assertStringIncludes(html, 'Texto &amp; más')
  assertStringIncludes(html, 'Juan &lt;script&gt;')
  assertStringIncludes(html, 'Cursos AMX')
})

// ───────────────────────────────────────────────────────────────
// Mock utilities
// ───────────────────────────────────────────────────────────────

function mockSupabase(responses: Record<string, any>) {
  return {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: any) => ({
          single: () => Promise.resolve(responses[`${table}.single`] ?? { data: null, error: null }),
          limit: (_n: number) => Promise.resolve(responses[`${table}.limit`] ?? { data: [], error: null }),
        }),
        order: (_col: string, _opts: any) => ({
          limit: (_n: number) => Promise.resolve(responses[`${table}.limit`] ?? { data: [], error: null }),
        }),
        in: (_col: string, _vals: any[]) => ({
          delete: () => Promise.resolve(responses[`${table}.delete`] ?? { error: null }),
        }),
      }),
      update: (_vals: any) => ({
        eq: (_col: string, _val: any) => Promise.resolve(responses[`${table}.update`] ?? { error: null }),
      }),
      delete: () => ({
        in: (_col: string, _vals: any[]) => Promise.resolve(responses[`${table}.delete`] ?? { error: null }),
      }),
    }),
  }
}

// ───────────────────────────────────────────────────────────────
// loadEmailConfig
// ───────────────────────────────────────────────────────────────

Deno.test('loadEmailConfig devuelve configuración activa', async () => {
  const config = {
    id: 1,
    proveedor: 'resend',
    api_key: 're_test_key',
    remitente_email: 'noreply@test.local',
    remitente_nombre: 'Test',
    activo: true,
  }
  const supabase = mockSupabase({ 'email_configuracion.single': { data: config, error: null } })
  const result = await loadEmailConfig(supabase)
  assertEquals(result, config)
})

Deno.test('loadEmailConfig devuelve null si hay error', async () => {
  const supabase = mockSupabase({
    'email_configuracion.single': { data: null, error: { message: 'not found' } },
  })
  const result = await loadEmailConfig(supabase)
  assertEquals(result, null)
})

// ───────────────────────────────────────────────────────────────
// sendEmail
// ───────────────────────────────────────────────────────────────

Deno.test('sendEmail retorna true cuando email no está configurado', async () => {
  const supabase = mockSupabase({})
  const ok = await sendEmail(supabase, { usuario_id: 'u1', titulo: 'T', cuerpo: 'C' }, null)
  assertEquals(ok, true)
})

Deno.test('sendEmail retorna true cuando proveedor no es resend', async () => {
  const supabase = mockSupabase({})
  const ok = await sendEmail(supabase, { usuario_id: 'u1', titulo: 'T', cuerpo: 'C' }, {
    activo: true,
    api_key: 'key',
    proveedor: 'smtp',
  })
  assertEquals(ok, true)
})

Deno.test('sendEmail envía vía Resend y retorna true', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  let fetchBody: any = null

  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalled = true
    fetchBody = JSON.parse(init?.body as string)
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 })
  }

  const supabase = mockSupabase({
    'perfiles.single': {
      data: { correo: 'test@example.com', nombres: 'Juan', apellido_paterno: 'Pérez' },
      error: null,
    },
  })

  const ok = await sendEmail(supabase, { usuario_id: 'u1', titulo: 'Título', cuerpo: 'Cuerpo' }, {
    activo: true,
    api_key: 're_test',
    proveedor: 'resend',
    remitente_email: 'noreply@test.local',
    remitente_nombre: 'Cursos AMX',
  })

  assertEquals(ok, true)
  assertEquals(fetchCalled, true)
  assertEquals(fetchBody.to, 'test@example.com')
  assertEquals(fetchBody.subject, 'Título')
  assertStringIncludes(fetchBody.html, 'Cuerpo')
  assertEquals(fetchBody.from, 'Cursos AMX <noreply@test.local>')

  globalThis.fetch = originalFetch
})

Deno.test('sendEmail retorna false si Resend falla', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    return new Response('Bad Request', { status: 400 })
  }

  const supabase = mockSupabase({
    'perfiles.single': {
      data: { correo: 'test@example.com', nombres: 'Juan', apellido_paterno: 'Pérez' },
      error: null,
    },
  })

  const ok = await sendEmail(supabase, { usuario_id: 'u1', titulo: 'T', cuerpo: 'C' }, {
    activo: true,
    api_key: 're_bad',
    proveedor: 'resend',
    remitente_email: 'noreply@test.local',
    remitente_nombre: 'Test',
  })

  assertEquals(ok, false)
  globalThis.fetch = originalFetch
})

// ───────────────────────────────────────────────────────────────
// processNotification
// ───────────────────────────────────────────────────────────────

Deno.test('processNotification marca silenciado y actualiza estado', async () => {
  const updates: any[] = []
  const supabase = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: any) => ({
          single: () => {
            if (table === 'notificacion_preferencias') {
              return Promise.resolve({ data: { silenciados: ['badge_desbloqueado'], canal_default: 'in_app' }, error: null })
            }
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
      update: (vals: any) => ({
        eq: (_col: string, _val: any) => {
          updates.push(vals)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }

  const result = await processNotification(supabase, {
    id: 'n1',
    usuario_id: 'u1',
    tipo: 'badge_desbloqueado',
    canal: 'all',
    titulo: 'Badge',
    cuerpo: 'Cuerpo',
  }, null)

  assertEquals(result, 'silenciado')
  assertEquals(updates.length, 1)
  assertEquals(updates[0].estado, 'enviado')
})

Deno.test('processNotification usa canal por defecto cuando canal es all', async () => {
  const updates: any[] = []
  const supabase = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: any) => ({
          single: () => {
            if (table === 'notificacion_preferencias') {
              return Promise.resolve({ data: { silenciados: [], canal_default: 'email' }, error: null })
            }
            if (table === 'perfiles') {
              return Promise.resolve({ data: { correo: 'a@b.com', nombres: 'A', apellido_paterno: 'B' }, error: null })
            }
            return Promise.resolve({ data: null, error: null })
          },
        }),
        in: (_col: string, _vals: any[]) => ({
          delete: () => Promise.resolve({ error: null }),
        }),
      }),
      update: (vals: any) => ({
        eq: (_col: string, _val: any) => {
          updates.push(vals)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'e1' }), { status: 200 })

  const result = await processNotification(supabase, {
    id: 'n2',
    usuario_id: 'u1',
    tipo: 'curso_asignado',
    canal: 'all',
    titulo: 'Curso',
    cuerpo: 'Nuevo curso',
  }, {
    activo: true,
    api_key: 're_test',
    proveedor: 'resend',
    remitente_email: 'noreply@test.local',
    remitente_nombre: 'Test',
  })

  assertEquals(result, 'enviado')
  assertEquals(updates.length, 1)
  assertEquals(updates[0].estado, 'enviado')

  globalThis.fetch = originalFetch
})

Deno.test('processNotification marca fallido si email falla', async () => {
  const updates: any[] = []
  const supabase = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: any) => ({
          single: () => {
            if (table === 'notificacion_preferencias') {
              return Promise.resolve({ data: { silenciados: [], canal_default: 'email' }, error: null })
            }
            if (table === 'perfiles') {
              return Promise.resolve({ data: { correo: 'a@b.com', nombres: 'A', apellido_paterno: 'B' }, error: null })
            }
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
      update: (vals: any) => ({
        eq: (_col: string, _val: any) => {
          updates.push(vals)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('Bad Request', { status: 400 })

  const result = await processNotification(supabase, {
    id: 'n3',
    usuario_id: 'u1',
    tipo: 'curso_asignado',
    canal: 'email',
    titulo: 'Curso',
    cuerpo: 'Nuevo curso',
  }, {
    activo: true,
    api_key: 're_bad',
    proveedor: 'resend',
    remitente_email: 'noreply@test.local',
    remitente_nombre: 'Test',
  })

  assertEquals(result, 'fallido')
  assertEquals(updates.length, 1)
  assertEquals(updates[0].estado, 'fallido')

  globalThis.fetch = originalFetch
})
