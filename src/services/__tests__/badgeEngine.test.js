import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluarBadges } from '@/services/badgeEngine.js'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}))

describe('badgeEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setupBadges(badges) {
    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: badges, error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })
  }

  it('evaluarBadges returns empty array when no badges match', async () => {
    setupBadges([
      {
        id: 'b1',
        nombre: 'Test',
        criterio_tipo: 'primer_login',
        criterio_config: {},
        puntos_otorga: 10,
      },
    ])
    // primer_login always returns true, but we need badge_usuarios mock to say it doesn't exist
    // Actually primer_login is in the loop - let me mock badge_usuarios properly

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        }
      }
      return { select: vi.fn() }
    })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toEqual([])
  })

  it('evaluarBadges unlocks primer_login badge', async () => {
    const badge = {
      id: 'b1',
      nombre: 'Bienvenida',
      criterio_tipo: 'primer_login',
      criterio_config: {},
      puntos_otorga: 10,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockResolvedValue({ data: null, error: null })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(nuevos[0].id).toBe('b1')
    expect(mockRpc).toHaveBeenCalledWith('otorgar_puntos', {
      p_usuario_id: 'user-1',
      p_fuente_tipo: 'badge_desbloqueado',
      p_fuente_id: 'b1',
      p_puntos: 10,
      p_descripcion: 'Badge desbloqueado: Bienvenida',
    })
  })

  it('evaluarBadges does not unlock already unlocked badge', async () => {
    const badge = {
      id: 'b1',
      nombre: 'Bienvenida',
      criterio_tipo: 'primer_login',
      criterio_config: {},
      puntos_otorga: 10,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'existing' }, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toEqual([])
  })

  it('evaluarBadges evaluates completar_curso via RPC', async () => {
    const badge = {
      id: 'b2',
      nombre: 'Curso Completo',
      criterio_tipo: 'completar_curso',
      criterio_config: { curso_id: 'c1' },
      puntos_otorga: 50,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockImplementation((name, params) => {
      if (name === 'curso_completado_por_usuario') {
        return Promise.resolve({ data: true, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(nuevos[0].id).toBe('b2')
    expect(mockRpc).toHaveBeenCalledWith('curso_completado_por_usuario', {
      p_user_id: 'user-1',
      p_curso_id: 'c1',
    })
  })

  it('evaluarBadges evaluates completar_modulo via RPC', async () => {
    const badge = {
      id: 'b3',
      nombre: 'Modulo Completo',
      criterio_tipo: 'completar_modulo',
      criterio_config: { modulo_id: 'm1' },
      puntos_otorga: 30,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockImplementation((name, params) => {
      if (name === 'modulo_completado_por_usuario') {
        return Promise.resolve({ data: true, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(mockRpc).toHaveBeenCalledWith('modulo_completado_por_usuario', {
      p_user_id: 'user-1',
      p_modulo_id: 'm1',
    })
  })

  it('evaluarBadges evaluates calificacion_minima via intentos_evaluacion', async () => {
    const badge = {
      id: 'b4',
      nombre: 'Aprobado',
      criterio_tipo: 'calificacion_minima',
      criterio_config: { evaluacion_id: 'e1', puntaje_min: 70 },
      puntos_otorga: 50,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      if (table === 'intentos_evaluacion') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: 'i1' }, error: null })),
                })),
              })),
            })),
          })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockResolvedValue({ data: null, error: null })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('intentos_evaluacion')
  })

  it('evaluarBadges evaluates participar_foros via count', async () => {
    const badge = {
      id: 'b5',
      nombre: 'Social',
      criterio_tipo: 'participar_foros',
      criterio_config: { cantidad_min: 5 },
      puntos_otorga: 30,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      if (table === 'foro_hilos') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 5, error: null })),
          })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockResolvedValue({ data: null, error: null })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('foro_hilos')
  })

  it('evaluarBadges evaluates streak_dias via RPC', async () => {
    const badge = {
      id: 'b6',
      nombre: 'Constante',
      criterio_tipo: 'streak_dias',
      criterio_config: { dias_consecutivos: 7 },
      puntos_otorga: 100,
    }

    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [badge], error: null })),
          })),
        }
      }
      if (table === 'badge_usuarios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return { select: vi.fn() }
    })

    mockRpc.mockImplementation((name, params) => {
      if (name === 'streak_dias_usuario') {
        return Promise.resolve({ data: true, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const nuevos = await evaluarBadges('user-1')
    expect(nuevos).toHaveLength(1)
    expect(mockRpc).toHaveBeenCalledWith('streak_dias_usuario', {
      p_user_id: 'user-1',
      p_dias: 7,
    })
  })

  it('evaluarBadges throws on badge query error', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'badges') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: null, error: new Error('DB Error') })),
          })),
        }
      }
      return { select: vi.fn() }
    })

    await expect(evaluarBadges('user-1')).rejects.toThrow('DB Error')
  })
})
