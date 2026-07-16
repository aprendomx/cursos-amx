import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEntregasInstructor } from '@/composables/useEntregasInstructor.js'
import * as entregasService from '@/services/entregas'

vi.mock('@/services/entregas', () => ({
  listarEntregasPorTarea: vi.fn(),
  calificarEntrega: vi.fn(),
  devolverEntrega: vi.fn(),
}))

describe('useEntregasInstructor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('estadisticas computes counts and promedio correctly', async () => {
    const mockEntregas = [
      { id: 'e1', estado: 'entregada', puntaje_final: null },
      { id: 'e2', estado: 'calificada', puntaje_final: 80 },
      { id: 'e3', estado: 'calificada', puntaje_final: 90 },
    ]
    entregasService.listarEntregasPorTarea.mockResolvedValue(mockEntregas)

    const u = useEntregasInstructor('t1')
    await u.cargar()

    expect(u.estadisticas.value).toEqual({
      total: 3,
      pendientes: 1,
      calificadas: 2,
      promedio: 85,
    })
  })

  it('estadisticas promedio is 0 when no calificadas', async () => {
    entregasService.listarEntregasPorTarea.mockResolvedValue([
      { id: 'e1', estado: 'entregada', puntaje_final: null },
    ])

    const u = useEntregasInstructor('t1')
    await u.cargar()

    expect(u.estadisticas.value.promedio).toBe(0)
  })

  it('pendientes and calificadas computed properties filter correctly', async () => {
    entregasService.listarEntregasPorTarea.mockResolvedValue([
      { id: 'e1', estado: 'entregada' },
      { id: 'e2', estado: 'calificada' },
      { id: 'e3', estado: 'entregada' },
    ])

    const u = useEntregasInstructor('t1')
    await u.cargar()

    expect(u.pendientes.value).toHaveLength(2)
    expect(u.calificadas.value).toHaveLength(1)
  })

  it('calificar calls service and reloads', async () => {
    entregasService.listarEntregasPorTarea.mockResolvedValue([{ id: 'e1', estado: 'entregada' }])
    entregasService.calificarEntrega.mockResolvedValue({ id: 'e1', estado: 'calificada' })

    const u = useEntregasInstructor('t1')
    await u.cargar()

    const payload = {
      calificaciones: [{ criterio_id: 'c1', puntaje: 90 }],
      comentario: 'Bien',
      puntajeFinal: 90,
    }
    await u.calificar('e1', payload)

    expect(entregasService.calificarEntrega).toHaveBeenCalledWith('e1', payload)
    expect(entregasService.listarEntregasPorTarea).toHaveBeenCalledTimes(2)
  })

  it('devolver calls service and reloads', async () => {
    entregasService.listarEntregasPorTarea.mockResolvedValue([{ id: 'e1', estado: 'entregada' }])
    entregasService.devolverEntrega.mockResolvedValue({ id: 'e1', estado: 'devuelta' })

    const u = useEntregasInstructor('t1')
    await u.cargar()

    await u.devolver('e1', 'Necesita correcciones')

    expect(entregasService.devolverEntrega).toHaveBeenCalledWith('e1', 'Necesita correcciones')
    expect(entregasService.listarEntregasPorTarea).toHaveBeenCalledTimes(2)
  })
})
