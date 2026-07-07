import { describe, it, expect, vi } from 'vitest'
import { useReportes } from '../useReportes.js'

vi.mock('@/services/reportes.js', () => ({
  obtenerFunnel: vi.fn(),
  obtenerRetencion: vi.fn(),
  obtenerComparativa: vi.fn(),
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
