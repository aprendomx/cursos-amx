import { describe, it, expect, vi } from 'vitest'
import {
  obtenerFunnel,
  obtenerRetencion,
  obtenerComparativa,
  obtenerInstructorDashboard,
  obtenerInstructorAlumnos,
  obtenerLeccionAnalytics,
  obtenerCostos,
  obtenerInscripcionesTiempo,
  obtenerCursosPopulares,
  guardarFavorito,
  cargarFavoritos,
  eliminarFavorito,
  programarReporte,
  cargarProgramados,
} from '../reportes.js'

const mockInvoke = vi.fn()
const mockFrom = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
  },
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

describe('obtenerCostos', () => {
  it('retorna datos de costos', async () => {
    mockInvoke.mockResolvedValue({
      data: { almacenamiento_videos_gb: 10, costo_total_estimado_usd: 5 },
    })
    const result = await obtenerCostos()
    expect(result.costo_total_estimado_usd).toBe(5)
  })
})

describe('obtenerInscripcionesTiempo', () => {
  it('retorna serie temporal', async () => {
    mockInvoke.mockResolvedValue({
      data: { puntos: [{ fecha: '2026-01-01', total_inscripciones: 10 }] },
    })
    const result = await obtenerInscripcionesTiempo('2026-01-01', '2026-01-31')
    expect(result).toHaveLength(1)
  })
})

describe('obtenerCursosPopulares', () => {
  it('retorna cursos populares', async () => {
    mockInvoke.mockResolvedValue({
      data: { cursos: [{ curso_id: 'c1', titulo: 'Curso A', total_inscripciones: 100 }] },
    })
    const result = await obtenerCursosPopulares()
    expect(result[0].titulo).toBe('Curso A')
  })
})

describe('guardarFavorito', () => {
  it('inserta y retorna el favorito', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'f1', nombre: 'Fav 1' }, error: null }),
        }),
      }),
    })
    const result = await guardarFavorito('Fav 1', 'comparativa', { desde: '2026-01-01' })
    expect(mockFrom).toHaveBeenCalledWith('reportes_favoritos')
    expect(result.nombre).toBe('Fav 1')
  })
})

describe('cargarFavoritos', () => {
  it('retorna lista de favoritos ordenada', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: [{ id: 'f1', nombre: 'Fav 1' }], error: null }),
      }),
    })
    const result = await cargarFavoritos()
    expect(mockFrom).toHaveBeenCalledWith('reportes_favoritos')
    expect(result).toHaveLength(1)
  })
})

describe('eliminarFavorito', () => {
  it('elimina favorito por id', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    })
    await eliminarFavorito('f1')
    expect(mockFrom).toHaveBeenCalledWith('reportes_favoritos')
  })
})

describe('programarReporte', () => {
  it('inserta y retorna el reporte programado', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'p1', nombre: 'Prog 1' }, error: null }),
        }),
      }),
    })
    const result = await programarReporte(
      'Prog 1',
      'comparativa',
      { desde: '2026-01-01' },
      'semanal'
    )
    expect(mockFrom).toHaveBeenCalledWith('reportes_programados')
    expect(result.nombre).toBe('Prog 1')
  })
})

describe('cargarProgramados', () => {
  it('retorna lista de reportes programados ordenada', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: [{ id: 'p1', nombre: 'Prog 1' }], error: null }),
      }),
    })
    const result = await cargarProgramados()
    expect(mockFrom).toHaveBeenCalledWith('reportes_programados')
    expect(result).toHaveLength(1)
  })
})
