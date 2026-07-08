import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReproductor } from '@/composables/useReproductor.js'

const mockObtenerTranscripcion = vi.fn()

vi.mock('@/services/grabaciones.js', () => ({
  obtenerTranscripcion: (...args) => mockObtenerTranscripcion(...args),
}))

describe('useReproductor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calcula segmento actual', async () => {
    mockObtenerTranscripcion.mockResolvedValue({
      id: 't1',
      segmentos: [
        { start: 0, end: 5, text: 'Hola' },
        { start: 5, end: 10, text: 'Mundo' },
        { start: 10, end: 15, text: '!' },
      ],
    })

    const { segmentoActual, cargarTranscripcion, actualizarTiempo } = useReproductor('s1')
    await cargarTranscripcion()
    actualizarTiempo(7)

    expect(segmentoActual.value.text).toBe('Mundo')
  })

  it('calcula texto cercano con contexto', async () => {
    mockObtenerTranscripcion.mockResolvedValue({
      id: 't1',
      segmentos: [
        { start: 0, end: 5, text: 'A' },
        { start: 5, end: 10, text: 'B' },
        { start: 10, end: 15, text: 'C' },
      ],
    })

    const { textoCercano, cargarTranscripcion, actualizarTiempo } = useReproductor('s1')
    await cargarTranscripcion()
    actualizarTiempo(7)

    expect(textoCercano.value).toBe('A B C')
  })

  it('salta a tiempo específico', () => {
    const { tiempoActual, saltarATiempo } = useReproductor('s1')
    saltarATiempo(42)
    expect(tiempoActual.value).toBe(42)
  })

  it('maneja transcripción sin segmentos', async () => {
    mockObtenerTranscripcion.mockResolvedValue({ id: 't1', segmentos: null })

    const { segmentoActual, cargarTranscripcion, actualizarTiempo } = useReproductor('s1')
    await cargarTranscripcion()
    actualizarTiempo(5)

    expect(segmentoActual.value).toBeNull()
  })
})
