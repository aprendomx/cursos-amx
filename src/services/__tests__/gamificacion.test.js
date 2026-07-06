import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listarBadges,
  listarNiveles,
  obtenerPuntosUsuario,
  obtenerNivelUsuario,
  listarBadgesUsuario,
  listarLogPuntos,
  listarCondicionesDesbloqueo,
  crearBadge,
  actualizarBadge,
  eliminarBadge,
  crearCondicion,
  eliminarCondicion,
  obtenerLeaderboard,
} from '@/services/gamificacion.js'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}))

function mockChain(result) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve(result)),
        single: vi.fn(() => Promise.resolve(result)),
      })),
      order: vi.fn(() => Promise.resolve(result)),
      single: vi.fn(() => Promise.resolve(result)),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve(result)),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve(result)),
    })),
  }
}

describe('gamificacion service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listarBadges returns active badges ordered by puntos_otorga', async () => {
    const result = { data: [{ id: 'b1', nombre: 'Badge 1' }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await listarBadges()
    expect(data).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledWith('badges')
  })

  it('listarBadges throws on error', async () => {
    mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('DB Error') }))
    await expect(listarBadges()).rejects.toThrow('DB Error')
  })

  it('listarNiveles returns niveles ordered by puntos_min', async () => {
    const result = { data: [{ id: 1, nombre: 'Novato' }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await listarNiveles()
    expect(data).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledWith('niveles')
  })

  it('obtenerPuntosUsuario returns puntos_totales', async () => {
    const result = { data: { puntos_totales: 150 }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const puntos = await obtenerPuntosUsuario('user-123')
    expect(puntos).toBe(150)
  })

  it('obtenerPuntosUsuario returns 0 when no rows (PGRST116)', async () => {
    const result = { data: null, error: { code: 'PGRST116' } }
    mockFrom.mockReturnValue(mockChain(result))

    const puntos = await obtenerPuntosUsuario('user-123')
    expect(puntos).toBe(0)
  })

  it('obtenerPuntosUsuario throws on other errors', async () => {
    const result = { data: null, error: new Error('DB Error') }
    mockFrom.mockReturnValue(mockChain(result))

    await expect(obtenerPuntosUsuario('user-123')).rejects.toThrow('DB Error')
  })

  it('obtenerNivelUsuario returns nivel data', async () => {
    const result = { data: { nivel_nombre: 'Experto', color: '#8B5CF6' }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const nivel = await obtenerNivelUsuario('user-123')
    expect(nivel).toEqual(result.data)
  })

  it('obtenerNivelUsuario returns default when no rows (PGRST116)', async () => {
    const result = { data: null, error: { code: 'PGRST116' } }
    mockFrom.mockReturnValue(mockChain(result))

    const nivel = await obtenerNivelUsuario('user-123')
    expect(nivel).toEqual({ puntos_totales: 0, nivel_nombre: 'Novato', color: '#6b7280' })
  })

  it('obtenerNivelUsuario throws on other errors', async () => {
    const result = { data: null, error: new Error('DB Error') }
    mockFrom.mockReturnValue(mockChain(result))

    await expect(obtenerNivelUsuario('user-123')).rejects.toThrow('DB Error')
  })

  it('listarBadgesUsuario returns badges with join', async () => {
    const result = { data: [{ id: 'bu1', badges: { nombre: 'B1' } }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await listarBadgesUsuario('user-123')
    expect(data).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledWith('badge_usuarios')
  })

  it('listarLogPuntos returns log ordered by created_at desc with default limit', async () => {
    const result = { data: [{ id: 'l1', puntos: 10 }], error: null }
    const limitMock = vi.fn(() => Promise.resolve(result))
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: limitMock,
          })),
        })),
      })),
    })

    const data = await listarLogPuntos('user-123')
    expect(data).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledWith('log_puntos')
    expect(limitMock).toHaveBeenCalledWith(50)
  })

  it('listarLogPuntos respects custom limit', async () => {
    const result = { data: [], error: null }
    const limitMock = vi.fn(() => Promise.resolve(result))
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: limitMock,
          })),
        })),
      })),
    })

    await listarLogPuntos('user-123', 10)
    expect(limitMock).toHaveBeenCalledWith(10)
  })

  it('listarCondicionesDesbloqueo returns condiciones ordered by orden', async () => {
    const result = { data: [{ id: 'c1', tipo_condicion: 'completar_modulo_previo' }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await listarCondicionesDesbloqueo('modulo-1')
    expect(data).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledWith('condiciones_desbloqueo')
  })

  it('crearBadge inserts and returns single row', async () => {
    const result = { data: { id: 'b1', nombre: 'Nuevo' }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await crearBadge({ nombre: 'Nuevo' })
    expect(data).toEqual(result.data)
  })

  it('actualizarBadge updates by id and returns single row', async () => {
    const result = { data: { id: 'b1', nombre: 'Updated' }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await actualizarBadge('b1', { nombre: 'Updated' })
    expect(data).toEqual(result.data)
  })

  it('eliminarBadge deletes by id', async () => {
    const result = { error: null }
    mockFrom.mockReturnValue(mockChain(result))

    await eliminarBadge('b1')
    expect(mockFrom).toHaveBeenCalledWith('badges')
  })

  it('crearCondicion inserts and returns single row', async () => {
    const result = { data: { id: 'c1' }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const data = await crearCondicion({
      modulo_id: 'm1',
      tipo_condicion: 'completar_modulo_previo',
    })
    expect(data).toEqual(result.data)
  })

  it('eliminarCondicion deletes by id', async () => {
    const result = { error: null }
    mockFrom.mockReturnValue(mockChain(result))

    await eliminarCondicion('c1')
    expect(mockFrom).toHaveBeenCalledWith('condiciones_desbloqueo')
  })

  it('obtenerLeaderboard calls RPC', async () => {
    const result = { data: [{ usuario_id: 'u1', puntos_totales: 100 }], error: null }
    mockRpc.mockResolvedValue(result)

    const data = await obtenerLeaderboard('curso-1', 10)
    expect(data).toEqual(result.data)
    expect(mockRpc).toHaveBeenCalledWith('leaderboard_curso', {
      p_curso_id: 'curso-1',
      p_limit: 10,
    })
  })

  it('obtenerLeaderboard uses default limit', async () => {
    const result = { data: [], error: null }
    mockRpc.mockResolvedValue(result)

    await obtenerLeaderboard('curso-1')
    expect(mockRpc).toHaveBeenCalledWith('leaderboard_curso', {
      p_curso_id: 'curso-1',
      p_limit: 20,
    })
  })
})
