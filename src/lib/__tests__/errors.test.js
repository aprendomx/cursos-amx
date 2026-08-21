import { describe, it, expect } from 'vitest'
import {
  AppError,
  NetworkError,
  PermissionError,
  ValidationError,
  RateLimitError,
  ModuloApagadoError,
  mapSupabaseError,
} from '../errors.ts'

// Estos mensajes son los que produce de verdad este repositorio (migraciones
// 059, 061, 063, 057). Sin el mapeo, al usuario le llega el texto crudo de
// Postgres, que ni explica ni sugiere qué hacer.
describe('mapSupabaseError', () => {
  it('traduce el límite de tasa de la verificación pública', () => {
    const e = mapSupabaseError({
      code: '53400',
      message: 'demasiadas verificaciones, intenta en un minuto',
    })
    expect(e).toBeInstanceOf(RateLimitError)
    expect(e.status).toBe(429)
  })

  it('traduce el rechazo por no estar inscrito', () => {
    const e = mapSupabaseError({ message: 'no estás inscrito en este curso' })
    expect(e).toBeInstanceOf(PermissionError)
    expect(e.message).toContain('No estás inscrito')
  })

  it('traduce el rechazo por video no visto en algo accionable', () => {
    const e = mapSupabaseError({
      message: 'no se puede completar un video sin haberlo visto (12 de 600 segundos)',
    })
    expect(e).toBeInstanceOf(ValidationError)
    expect(e.message).toContain('ver el video completo')
    expect(e.message).not.toContain('600 segundos')
  })

  it('traduce los intentos agotados', () => {
    const e = mapSupabaseError({ message: 'sin intentos restantes' })
    expect(e).toBeInstanceOf(ValidationError)
    expect(e.message).toContain('todos tus intentos')
  })

  it('traduce el intento de cambiarse el rol', () => {
    const e = mapSupabaseError({ message: 'no autorizado para modificar es_admin/es_instructor' })
    expect(e).toBeInstanceOf(PermissionError)
    expect(e.message).toContain('tu propio rol')
  })

  // Un módulo apagado se manifiesta como violación de RLS sin más contexto;
  // "permisos insuficientes" desorientaría a quien lo ve.
  it('distingue un módulo apagado de una falta de permisos', () => {
    const e = mapSupabaseError({
      code: '42501',
      message: 'new row violates row-level security policy for table "foro_hilos"',
    })
    expect(e).toBeInstanceOf(ModuloApagadoError)
    expect(e.message).toContain('desactivado')
  })

  it('sigue traduciendo los casos genéricos', () => {
    expect(mapSupabaseError({ message: 'network timeout' })).toBeInstanceOf(NetworkError)
    expect(mapSupabaseError({ message: 'duplicate key value' })).toBeInstanceOf(ValidationError)
    expect(mapSupabaseError({ message: 'jwt expired' })).toBeInstanceOf(PermissionError)
  })

  it('no pierde el error original', () => {
    const original = { code: '53400', message: 'demasiadas verificaciones' }
    expect(mapSupabaseError(original).details).toBe(original)
  })

  it('devuelve AppError ante algo desconocido', () => {
    const e = mapSupabaseError({ message: 'algo raro pasó' })
    expect(e).toBeInstanceOf(AppError)
    expect(e.code).toBe('SUPABASE_ERROR')
  })
})

describe('fallo de envío de correo', () => {
  it('se distingue del error genérico de red, aunque el texto contenga "error"', async () => {
    const { mapSupabaseError } = await import('@/lib/errors')
    const e = mapSupabaseError({ message: 'Error sending recovery email' })
    // Sin la regla propia, esto caería en NetworkError («error de conexión») y
    // la persona buscaría el problema en su wifi en vez de avisar a quien
    // administra.
    expect(e.code).toBe('MAIL_UNAVAILABLE')
    expect(e.message).toMatch(/no puede enviar correo/i)
    expect(e.message).toMatch(/administre/i)
  })

  it('reconoce también el fallo nombrado por SMTP', async () => {
    const { mapSupabaseError } = await import('@/lib/errors')
    expect(mapSupabaseError({ message: 'smtp connection refused' }).code).toBe('MAIL_UNAVAILABLE')
  })
})
