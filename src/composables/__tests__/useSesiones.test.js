import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSesiones } from '@/composables/useSesiones.js'

const mockFetchSesionesCurso = vi.fn()
const mockConfirmarRSVP = vi.fn()
const mockCancelarRSVP = vi.fn()
const mockListarRSVP = vi.fn()

vi.mock('@/services/sesionesVirtuales', () => ({
  fetchSesionesCurso: (...args) => mockFetchSesionesCurso(...args),
  confirmarRSVP: (...args) => mockConfirmarRSVP(...args),
  cancelarRSVP: (...args) => mockCancelarRSVP(...args),
  listarRSVP: (...args) => mockListarRSVP(...args),
}))

describe('useSesiones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carga sesiones y RSVPs', async () => {
    mockFetchSesionesCurso.mockResolvedValue([
      { id: 's1', titulo: 'Sesión 1', programada_en: '2025-03-15T10:00:00Z' },
      { id: 's2', titulo: 'Sesión 2', programada_en: '2025-03-16T10:00:00Z' },
    ])
    mockListarRSVP
      .mockResolvedValueOnce([{ sesion_id: 's1', user_id: 'u1', estado: 'confirmado' }])
      .mockResolvedValueOnce([])

    const { sesiones, rsvps, miRSVP, loading, cargar } = useSesiones('c1', 'u1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(sesiones.value).toHaveLength(2)
    expect(rsvps.value).toHaveLength(1)
    expect(miRSVP.value.get('s1')).toBe('confirmado')
  })

  it('puedeUnirse cuando la sesión está en curso', () => {
    const ahora = new Date()
    const hace5min = new Date(ahora.getTime() - 5 * 60000).toISOString()
    const en55min = new Date(ahora.getTime() + 55 * 60000).toISOString()

    const { puedeUnirse } = useSesiones('c1', 'u1')

    expect(puedeUnirse({ programada_en: hace5min, fin: en55min })).toBe(true)
    expect(puedeUnirse({ programada_en: en55min })).toBe(false)
  })

  it('estaEnVivo detecta estado en_vivo', () => {
    const { estaEnVivo } = useSesiones('c1', 'u1')

    expect(estaEnVivo({ estado: 'en_vivo' })).toBe(true)
    expect(estaEnVivo({ estado: 'programada' })).toBe(false)
  })

  it('confirmar RSVP y recarga', async () => {
    mockFetchSesionesCurso.mockResolvedValue([])
    mockListarRSVP.mockResolvedValue([])
    mockConfirmarRSVP.mockResolvedValue()

    const { confirmar } = useSesiones('c1', 'u1')
    await confirmar('s1')

    expect(mockConfirmarRSVP).toHaveBeenCalledWith('s1', 'u1')
    expect(mockFetchSesionesCurso).toHaveBeenCalledTimes(1) // cargar() inside confirmar
  })

  it('cancelar RSVP y recarga', async () => {
    mockFetchSesionesCurso.mockResolvedValue([])
    mockListarRSVP.mockResolvedValue([])
    mockCancelarRSVP.mockResolvedValue()

    const { cancelar } = useSesiones('c1', 'u1')
    await cancelar('s1')

    expect(mockCancelarRSVP).toHaveBeenCalledWith('s1', 'u1')
  })

  it('confirmadosCount calcula correctamente', async () => {
    mockFetchSesionesCurso.mockResolvedValue([{ id: 's1' }])
    mockListarRSVP.mockResolvedValue([
      { sesion_id: 's1', estado: 'confirmado' },
      { sesion_id: 's1', estado: 'confirmado' },
      { sesion_id: 's1', estado: 'cancelado' },
      { sesion_id: 's1', estado: 'asistio' },
    ])

    const { confirmadosCount, cargar } = useSesiones('c1', 'u1')
    await cargar()

    expect(confirmadosCount.value.get('s1')).toBe(3)
  })

  it('maneja error al cargar', async () => {
    mockFetchSesionesCurso.mockRejectedValue(new Error('Network error'))

    const { error, cargar, loading } = useSesiones('c1', 'u1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(error.value).toBe('Network error')
  })
})
