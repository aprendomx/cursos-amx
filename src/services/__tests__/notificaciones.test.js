import { describe, it, expect, vi } from 'vitest'
import {
  cargarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  cargarPreferencias,
  guardarPreferencias,
  cargarPlantillas,
  cargarEmailConfig,
} from '../notificaciones.js'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}))

describe('cargarNotificaciones', () => {
  it('orders by fecha desc', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [{ id: 1, titulo: 'N1' }], error: null }),
        }),
      }),
    })

    const result = await cargarNotificaciones({ limit: 10 })

    expect(mockFrom).toHaveBeenCalledWith('notificaciones')
    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('N1')
  })

  it('filters soloNoLeidas', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: () => ({
            eq: () => Promise.resolve({ data: [{ id: 2, leido: false }], error: null }),
          }),
        }),
      }),
    })

    const result = await cargarNotificaciones({ soloNoLeidas: true })

    expect(mockFrom).toHaveBeenCalledWith('notificaciones')
    expect(result).toHaveLength(1)
    expect(result[0].leido).toBe(false)
  })
})

describe('marcarNotificacionLeida', () => {
  it('updates row', async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    })

    await marcarNotificacionLeida(123)

    expect(mockFrom).toHaveBeenCalledWith('notificaciones')
  })
})

describe('marcarTodasLeidas', () => {
  it('updates all unread', async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    })

    await marcarTodasLeidas()

    expect(mockFrom).toHaveBeenCalledWith('notificaciones')
  })
})

describe('cargarPreferencias', () => {
  it('returns defaults if not found', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' },
        }),
      }),
    })

    const result = await cargarPreferencias()

    expect(mockFrom).toHaveBeenCalledWith('notificacion_preferencias')
    expect(result).toEqual({ silenciados: [], canal_default: 'all' })
  })
})

describe('guardarPreferencias', () => {
  it('does upsert', async () => {
    mockFrom.mockReturnValue({
      upsert: () => Promise.resolve({ error: null }),
    })

    await guardarPreferencias({ silenciados: ['curso'], canal_default: 'email' })

    expect(mockFrom).toHaveBeenCalledWith('notificacion_preferencias')
  })
})

describe('cargarPlantillas', () => {
  it('filters activas', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [{ id: 1, tipo: 'bienvenida' }], error: null }),
      }),
    })

    const result = await cargarPlantillas()

    expect(mockFrom).toHaveBeenCalledWith('notificacion_plantillas')
    expect(result).toHaveLength(1)
    expect(result[0].tipo).toBe('bienvenida')
  })
})

describe('cargarEmailConfig', () => {
  it('returns config', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: 1, proveedor: 'sendgrid' },
            error: null,
          }),
        }),
      }),
    })

    const result = await cargarEmailConfig()

    expect(mockFrom).toHaveBeenCalledWith('email_configuracion')
    expect(result.proveedor).toBe('sendgrid')
  })
})
