import { describe, it, expect, vi } from 'vitest'
import { useReportes } from '../useReportes.js'

vi.mock('@/services/reportes.js', () => ({
  obtenerFunnel: vi.fn(),
  obtenerRetencion: vi.fn(),
  obtenerComparativa: vi.fn(),
  obtenerInstructorDashboard: vi.fn(),
  obtenerInstructorAlumnos: vi.fn(),
  obtenerLeccionAnalytics: vi.fn(),
  obtenerCostos: vi.fn(),
}))

import { obtenerFunnel, obtenerRetencion, obtenerComparativa } from '@/services/reportes.js'

describe('useReportes', () => {
  it('carga los 3 reportes en paralelo', async () => {
    obtenerFunnel.mockResolvedValue({ visitantes: 100 })
    obtenerRetencion.mockResolvedValue([{ semana: 'W01' }])
    obtenerComparativa.mockResolvedValue([{ curso_id: 'c1' }])

    const r = useReportes()
    await r.cargarTodo('c1', '2026-01-01', '2026-06-30')

    expect(r.funnel.value.visitantes).toBe(100)
    expect(r.retencion.value).toHaveLength(1)
    expect(r.comparativa.value).toHaveLength(1)
    expect(r.loading.value.funnel).toBe(false)
  })

  it('maneja errores individuales', async () => {
    obtenerFunnel.mockRejectedValue(new Error('funnel error'))
    obtenerRetencion.mockResolvedValue([])
    obtenerComparativa.mockResolvedValue([])

    const r = useReportes()
    await r.cargarTodo('c1')

    expect(r.error.value.funnel).toBe('funnel error')
    expect(r.error.value.retencion).toBeNull()
  })
})

describe('useReportes - instructor', () => {
  it('carga dashboard del instructor', async () => {
    const { obtenerInstructorDashboard } = await import('@/services/reportes.js')
    obtenerInstructorDashboard.mockResolvedValue([{ curso_id: 'c1', total_alumnos: 50 }])

    const r = useReportes()
    await r.cargarInstructorDashboard('inst-1')

    expect(r.instructorDashboard.value).toHaveLength(1)
    expect(r.instructorDashboard.value[0].total_alumnos).toBe(50)
  })

  it('carga alumnos del curso', async () => {
    const { obtenerInstructorAlumnos } = await import('@/services/reportes.js')
    obtenerInstructorAlumnos.mockResolvedValue([{ user_id: 'u1', pct_progreso: 75 }])

    const r = useReportes()
    await r.cargarInstructorAlumnos('c1')

    expect(r.instructorAlumnos.value).toHaveLength(1)
    expect(r.instructorAlumnos.value[0].pct_progreso).toBe(75)
  })

  it('carga costos', async () => {
    const { obtenerCostos } = await import('@/services/reportes.js')
    obtenerCostos.mockResolvedValue({ almacenamiento_videos_gb: 10 })
    const r = useReportes()
    await r.cargarCostos()
    expect(r.costos.value.almacenamiento_videos_gb).toBe(10)
  })
})
