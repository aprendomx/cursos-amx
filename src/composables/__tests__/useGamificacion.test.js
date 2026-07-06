import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGamificacion } from '@/composables/useGamificacion.js'
import * as gamificacion from '@/services/gamificacion.js'
import * as badgeEngine from '@/services/badgeEngine.js'

vi.mock('@/services/gamificacion.js', () => ({
  listarBadges: vi.fn(),
  listarNiveles: vi.fn(),
  obtenerPuntosUsuario: vi.fn(),
  obtenerNivelUsuario: vi.fn(),
  listarBadgesUsuario: vi.fn(),
  listarLogPuntos: vi.fn(),
}))

vi.mock('@/services/badgeEngine.js', () => ({
  evaluarBadges: vi.fn(),
}))

const mockBadges = [
  { id: 'b1', nombre: 'Primer login', puntos_otorga: 10 },
  { id: 'b2', nombre: 'Curso completado', puntos_otorga: 50 },
]

const mockNiveles = [
  { id: 'n1', nombre: 'Novato', puntos_min: 0 },
  { id: 'n2', nombre: 'Aprendiz', puntos_min: 100 },
]

const mockNivel = { puntos_totales: 150, nivel_nombre: 'Aprendiz', color: '#3b82f6' }

const mockBadgesUsuario = [
  { id: 'bu1', badge_id: 'b1', usuario_id: 'u1', desbloqueado_en: '2024-01-01' },
]

const mockLogPuntos = [
  { id: 'lp1', usuario_id: 'u1', puntos: 10, fuente_tipo: 'badge_desbloqueado' },
]

describe('useGamificacion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cargar fetches all data in parallel and populates refs', async () => {
    gamificacion.listarBadges.mockResolvedValue(mockBadges)
    gamificacion.listarNiveles.mockResolvedValue(mockNiveles)
    gamificacion.obtenerPuntosUsuario.mockResolvedValue(150)
    gamificacion.obtenerNivelUsuario.mockResolvedValue(mockNivel)
    gamificacion.listarBadgesUsuario.mockResolvedValue(mockBadgesUsuario)
    gamificacion.listarLogPuntos.mockResolvedValue(mockLogPuntos)

    const g = useGamificacion('u1')
    await g.cargar()

    expect(g.loading.value).toBe(false)
    expect(g.error.value).toBeNull()
    expect(g.badges.value).toEqual(mockBadges)
    expect(g.niveles.value).toEqual(mockNiveles)
    expect(g.puntos.value).toBe(150)
    expect(g.nivel.value).toEqual(mockNivel)
    expect(g.badgesUsuario.value).toEqual(mockBadgesUsuario)
    expect(g.logPuntos.value).toEqual(mockLogPuntos)

    expect(gamificacion.listarBadges).toHaveBeenCalledTimes(1)
    expect(gamificacion.listarNiveles).toHaveBeenCalledTimes(1)
    expect(gamificacion.obtenerPuntosUsuario).toHaveBeenCalledWith('u1')
    expect(gamificacion.obtenerNivelUsuario).toHaveBeenCalledWith('u1')
    expect(gamificacion.listarBadgesUsuario).toHaveBeenCalledWith('u1')
    expect(gamificacion.listarLogPuntos).toHaveBeenCalledWith('u1')
  })

  it('cargar sets loading and error on failure', async () => {
    gamificacion.listarBadges.mockRejectedValue(new Error('network'))
    gamificacion.listarNiveles.mockResolvedValue(mockNiveles)
    gamificacion.obtenerPuntosUsuario.mockResolvedValue(0)
    gamificacion.obtenerNivelUsuario.mockResolvedValue({})
    gamificacion.listarBadgesUsuario.mockResolvedValue([])
    gamificacion.listarLogPuntos.mockResolvedValue([])

    const g = useGamificacion('u1')
    const p = g.cargar()
    expect(g.loading.value).toBe(true)
    await p

    expect(g.loading.value).toBe(false)
    expect(g.error.value).toBeInstanceOf(Error)
    expect(g.error.value.message).toBe('network')
  })

  it('cargar is a no-op when userId is falsy', async () => {
    const g = useGamificacion(null)
    await g.cargar()
    expect(gamificacion.listarBadges).not.toHaveBeenCalled()
    expect(g.loading.value).toBe(false)
  })

  it('badgesIdsUsuario is a Set of badge IDs the user has unlocked', async () => {
    gamificacion.listarBadges.mockResolvedValue(mockBadges)
    gamificacion.listarNiveles.mockResolvedValue(mockNiveles)
    gamificacion.obtenerPuntosUsuario.mockResolvedValue(0)
    gamificacion.obtenerNivelUsuario.mockResolvedValue(mockNivel)
    gamificacion.listarBadgesUsuario.mockResolvedValue(mockBadgesUsuario)
    gamificacion.listarLogPuntos.mockResolvedValue(mockLogPuntos)

    const g = useGamificacion('u1')
    await g.cargar()

    expect(g.badgesIdsUsuario.value).toBeInstanceOf(Set)
    expect(g.badgesIdsUsuario.value.has('b1')).toBe(true)
    expect(g.badgesIdsUsuario.value.has('b2')).toBe(false)
  })

  it('verificarBadges calls evaluarBadges and refreshes when new badges found', async () => {
    gamificacion.listarBadges.mockResolvedValue(mockBadges)
    gamificacion.listarNiveles.mockResolvedValue(mockNiveles)
    gamificacion.obtenerPuntosUsuario.mockResolvedValue(160)
    gamificacion.obtenerNivelUsuario.mockResolvedValue(mockNivel)
    gamificacion.listarBadgesUsuario.mockResolvedValue([
      ...mockBadgesUsuario,
      { id: 'bu2', badge_id: 'b2', usuario_id: 'u1', desbloqueado_en: '2024-01-02' },
    ])
    gamificacion.listarLogPuntos.mockResolvedValue(mockLogPuntos)

    const nuevoBadge = { id: 'b2', nombre: 'Curso completado', puntos_otorga: 50 }
    badgeEngine.evaluarBadges.mockResolvedValue([nuevoBadge])

    const g = useGamificacion('u1')
    await g.verificarBadges()

    expect(badgeEngine.evaluarBadges).toHaveBeenCalledWith('u1')
    expect(g.nuevosBadges.value).toEqual([nuevoBadge])
    expect(gamificacion.listarBadges).toHaveBeenCalledTimes(1) // cargar triggered
    expect(g.puntos.value).toBe(160) // refreshed value
  })

  it('verificarBadges does not call cargar when no new badges found', async () => {
    badgeEngine.evaluarBadges.mockResolvedValue([])

    const g = useGamificacion('u1')
    await g.verificarBadges()

    expect(badgeEngine.evaluarBadges).toHaveBeenCalledWith('u1')
    expect(g.nuevosBadges.value).toEqual([])
    expect(gamificacion.listarBadges).not.toHaveBeenCalled()
  })

  it('verificarBadges sets error on failure', async () => {
    badgeEngine.evaluarBadges.mockRejectedValue(new Error('eval error'))

    const g = useGamificacion('u1')
    await g.verificarBadges()

    expect(g.error.value).toBeInstanceOf(Error)
    expect(g.error.value.message).toBe('eval error')
  })

  it('verificarBadges is a no-op when userId is falsy', async () => {
    const g = useGamificacion(null)
    await g.verificarBadges()
    expect(badgeEngine.evaluarBadges).not.toHaveBeenCalled()
  })

  it('clearNuevos resets nuevosBadges to empty array', () => {
    const g = useGamificacion('u1')
    g.nuevosBadges.value = [{ id: 'b1' }]
    g.clearNuevos()
    expect(g.nuevosBadges.value).toEqual([])
  })
})
