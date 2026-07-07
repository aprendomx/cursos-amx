import { describe, it, expect, vi } from 'vitest'
import {
  obtenerFunnel,
  obtenerRetencion,
  obtenerComparativa,
  obtenerInstructorDashboard,
  obtenerInstructorAlumnos,
  obtenerLeccionAnalytics,
} from '../reportes.js'

const mockInvoke = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: { functions: { invoke: (...args) => mockInvoke(...args) } },
}))

describe('obtenerFunnel', () => {
  it('llama a la Edge Function con los parámetros correctos', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        curso_id: 'c1',
        visitantes: 1000,
        registrados: 500,
        inscritos: 200,
        activos: 150,
        completados: 80,
        conversiones: {
          registrados_pct: 50,
          inscritos_pct: 40,
          activos_pct: 75,
          completados_pct: 53,
        },
      },
    })

    const result = await obtenerFunnel('c1', '2026-01-01', '2026-06-30')

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'funnel', curso_id: 'c1', desde: '2026-01-01', hasta: '2026-06-30' },
    })
    expect(result.visitantes).toBe(1000)
    expect(result.completados).toBe(80)
  })

  it('propaga errores', async () => {
    mockInvoke.mockRejectedValue(new Error('network'))
    await expect(obtenerFunnel('c1')).rejects.toThrow('network')
  })
})

describe('obtenerRetencion', () => {
  it('retorna cohortes como array', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cohortes: [
          {
            semana: '2026-W01',
            total: 100,
            d7: 80,
            d14: 60,
            d30: 40,
            d60: 20,
            d90: 10,
            pcts: { d7: 80, d14: 60, d30: 40, d60: 20, d90: 10 },
          },
        ],
      },
    })

    const result = await obtenerRetencion('c1')

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'retencion', curso_id: 'c1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].semana).toBe('2026-W01')
  })
})

describe('obtenerComparativa', () => {
  it('retorna array de cursos', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cursos: [
          { curso_id: 'c1', curso_titulo: 'Curso A', total_inscritos: 500, tasa_finalizacion: 75 },
        ],
      },
    })

    const result = await obtenerComparativa()

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'comparativa', desde: undefined, hasta: undefined },
    })
    expect(result[0].curso_titulo).toBe('Curso A')
  })
})

describe('obtenerInstructorDashboard', () => {
  it('retorna cursos del instructor', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cursos: [
          { curso_id: 'c1', curso_titulo: 'Curso A', total_alumnos: 50, tasa_aprobacion: 80 },
        ],
      },
    })
    const result = await obtenerInstructorDashboard('inst-1')
    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'instructor_dashboard', instructor_id: 'inst-1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].curso_titulo).toBe('Curso A')
  })
})

describe('obtenerInstructorAlumnos', () => {
  it('retorna alumnos del curso', async () => {
    mockInvoke.mockResolvedValue({
      data: { alumnos: [{ user_id: 'u1', nombres_completos: 'Ana', pct_progreso: 75 }] },
    })
    const result = await obtenerInstructorAlumnos('c1')
    expect(result).toHaveLength(1)
    expect(result[0].nombres_completos).toBe('Ana')
  })
})

describe('obtenerLeccionAnalytics', () => {
  it('retorna analytics por lección', async () => {
    mockInvoke.mockResolvedValue({
      data: { lecciones: [{ leccion_id: 'l1', leccion_titulo: 'Intro', tasa_completitud: 90 }] },
    })
    const result = await obtenerLeccionAnalytics('c1')
    expect(result).toHaveLength(1)
    expect(result[0].leccion_titulo).toBe('Intro')
  })
})
