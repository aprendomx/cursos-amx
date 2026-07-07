import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnalytics } from '@/composables/useAnalytics.js'
import * as analytics from '@/services/analytics.js'

vi.mock('@/services/analytics.js', () => ({
  obtenerRiesgoAlumnos: vi.fn(),
  obtenerEngagementDiario: vi.fn(),
  generarReporteCSV: vi.fn(),
}))

const mockAlumnosRiesgo = [
  { id: 'a1', nombre: 'Ana', riesgo_porcentaje: 75 },
  { id: 'a2', nombre: 'Luis', riesgo_porcentaje: 60 },
]

const mockEngagement = [
  { fecha: '2024-01-01', sesiones: 10, minutos_totales: 120 },
  { fecha: '2024-01-02', sesiones: 8, minutos_totales: 90 },
]

describe('useAnalytics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cargarRiesgo fetches risk students and stores them', async () => {
    analytics.obtenerRiesgoAlumnos.mockResolvedValue(mockAlumnosRiesgo)

    const a = useAnalytics()
    await a.cargarRiesgo('c1', 50)

    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeNull()
    expect(a.alumnosRiesgo.value).toEqual(mockAlumnosRiesgo)
    expect(analytics.obtenerRiesgoAlumnos).toHaveBeenCalledWith('c1', 50)
  })

  it('cargarRiesgo uses default minRiesgo when not provided', async () => {
    analytics.obtenerRiesgoAlumnos.mockResolvedValue(mockAlumnosRiesgo)

    const a = useAnalytics()
    await a.cargarRiesgo('c1')

    expect(analytics.obtenerRiesgoAlumnos).toHaveBeenCalledWith('c1', 50)
  })

  it('cargarRiesgo sets loading and error on failure', async () => {
    analytics.obtenerRiesgoAlumnos.mockRejectedValue(new Error('network'))

    const a = useAnalytics()
    const p = a.cargarRiesgo('c1', 50)
    expect(a.loading.value).toBe(true)
    await p

    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeInstanceOf(Error)
    expect(a.error.value.message).toBe('network')
  })

  it('cargarRiesgo is a no-op when cursoId is falsy', async () => {
    const a = useAnalytics()
    await a.cargarRiesgo(null, 50)
    expect(analytics.obtenerRiesgoAlumnos).not.toHaveBeenCalled()
    expect(a.loading.value).toBe(false)
  })

  it('cargarEngagement fetches engagement data and stores it', async () => {
    analytics.obtenerEngagementDiario.mockResolvedValue(mockEngagement)

    const a = useAnalytics()
    await a.cargarEngagement('c1', 30)

    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeNull()
    expect(a.engagement.value).toEqual(mockEngagement)
    expect(analytics.obtenerEngagementDiario).toHaveBeenCalledWith('c1', 30)
  })

  it('cargarEngagement uses default dias when not provided', async () => {
    analytics.obtenerEngagementDiario.mockResolvedValue(mockEngagement)

    const a = useAnalytics()
    await a.cargarEngagement('c1')

    expect(analytics.obtenerEngagementDiario).toHaveBeenCalledWith('c1', 30)
  })

  it('cargarEngagement sets loading and error on failure', async () => {
    analytics.obtenerEngagementDiario.mockRejectedValue(new Error('engagement error'))

    const a = useAnalytics()
    const p = a.cargarEngagement('c1', 30)
    expect(a.loading.value).toBe(true)
    await p

    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeInstanceOf(Error)
    expect(a.error.value.message).toBe('engagement error')
  })

  it('cargarEngagement is a no-op when cursoId is falsy', async () => {
    const a = useAnalytics()
    await a.cargarEngagement(null, 30)
    expect(analytics.obtenerEngagementDiario).not.toHaveBeenCalled()
    expect(a.loading.value).toBe(false)
  })

  it('descargarReporte calls generarReporteCSV and triggers browser download', async () => {
    const blob = new Blob(['col1,col2\n1,2'], { type: 'text/csv' })
    analytics.generarReporteCSV.mockResolvedValue(blob)

    const createElementSpy = vi.spyOn(document, 'createElement')
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    const revokeObjectURLSpy = vi.spyOn(window.URL, 'revokeObjectURL')

    const a = useAnalytics()
    await a.descargarReporte('riesgo', 'c1')

    expect(analytics.generarReporteCSV).toHaveBeenCalledWith('riesgo', 'c1')
    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeNull()

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(appendChildSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalled()

    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    clickSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('descargarReporte sets error on failure', async () => {
    analytics.generarReporteCSV.mockRejectedValue(new Error('report error'))

    const a = useAnalytics()
    await a.descargarReporte('riesgo', 'c1')

    expect(a.loading.value).toBe(false)
    expect(a.error.value).toBeInstanceOf(Error)
    expect(a.error.value.message).toBe('report error')
  })

  it('descargarReporte is a no-op when tipo or cursoId is falsy', async () => {
    const a = useAnalytics()
    await a.descargarReporte(null, 'c1')
    await a.descargarReporte('riesgo', null)
    expect(analytics.generarReporteCSV).not.toHaveBeenCalled()
    expect(a.loading.value).toBe(false)
  })
})
