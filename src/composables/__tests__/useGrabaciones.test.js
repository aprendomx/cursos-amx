import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGrabaciones } from '@/composables/useGrabaciones.js'

vi.mock('@/services/grabaciones.js', () => ({
  listarGrabacionesPorCurso: vi.fn(),
  buscarTranscripciones: vi.fn(),
}))

import { listarGrabacionesPorCurso, buscarTranscripciones } from '@/services/grabaciones.js'

describe('useGrabaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carga grabaciones y agrupa por estado', async () => {
    listarGrabacionesPorCurso.mockResolvedValue([
      { id: 'g1', estado: 'lista' },
      { id: 'g2', estado: 'procesando' },
      { id: 'g3', estado: 'lista' },
    ])

    const { grabaciones, grabacionesPorEstado, cargar, loading } = useGrabaciones('c1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(grabaciones.value).toHaveLength(3)
    expect(grabacionesPorEstado.value.get('lista')).toHaveLength(2)
    expect(grabacionesPorEstado.value.get('procesando')).toHaveLength(1)
  })

  it('busca transcripciones', async () => {
    buscarTranscripciones.mockResolvedValue([{ sesion_id: 's1', titulo: 'Resultado' }])

    const { resultadosBusqueda, buscar, loading } = useGrabaciones('c1')
    await buscar('query')

    expect(loading.value).toBe(false)
    expect(resultadosBusqueda.value).toHaveLength(1)
    expect(resultadosBusqueda.value[0].titulo).toBe('Resultado')
  })

  it('limpia resultados cuando query vacío', async () => {
    const { resultadosBusqueda, buscar } = useGrabaciones('c1')
    await buscar('')

    expect(resultadosBusqueda.value).toHaveLength(0)
    expect(buscarTranscripciones).not.toHaveBeenCalled()
  })

  it('maneja error al cargar', async () => {
    listarGrabacionesPorCurso.mockRejectedValue(new Error('DB error'))

    const { error, cargar, loading } = useGrabaciones('c1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(error.value).toBe('DB error')
  })
})
