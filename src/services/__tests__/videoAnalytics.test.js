import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cargarStatsLeccion,
  cargarStatsCurso,
  cargarIntervalosLeccion,
  cargarHeatmapData,
} from '@/services/videoAnalytics.js'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}))

describe('Video Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockChain(result) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(result)),
      single: vi.fn(() => Promise.resolve(result)),
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      catch: (onRejected) => Promise.resolve(result).catch(onRejected),
    }
    return chain
  }

  describe('cargarStatsLeccion', () => {
    it('retorna una sola fila de stats por lección', async () => {
      const mockData = {
        leccion_id: 'lec-1',
        total_vistas: 150,
        tiempo_promedio_visto: 120,
        tasa_completitud: 85,
        abandonos: 15,
      }
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await cargarStatsLeccion('lec-1')

      expect(mockFrom).toHaveBeenCalledWith('v_video_leccion_stats')
      expect(result).toEqual(mockData)
    })

    it('lanza error si la consulta falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('View error') }))

      await expect(cargarStatsLeccion('lec-1')).rejects.toThrow('View error')
    })
  })

  describe('cargarStatsCurso', () => {
    it('retorna una sola fila de stats por curso', async () => {
      const mockData = {
        curso_id: 'c1',
        total_vistas: 500,
        tiempo_promedio_visto: 200,
        tasa_completitud: 70,
        total_abandonos: 50,
      }
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await cargarStatsCurso('c1')

      expect(mockFrom).toHaveBeenCalledWith('v_curso_video_stats')
      expect(result).toEqual(mockData)
    })

    it('lanza error si la consulta falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('View error') }))

      await expect(cargarStatsCurso('c1')).rejects.toThrow('View error')
    })
  })

  describe('cargarIntervalosLeccion', () => {
    it('filtra por rango de fechas y retorna array ordenado', async () => {
      const mockData = [
        {
          leccion_id: 'lec-1',
          fecha: '2026-01-15',
          intervalo_inicio: 0,
          intervalo_fin: 30,
          vistas_unicas: 10,
          total_visto: 300,
          abandonos: 1,
        },
        {
          leccion_id: 'lec-1',
          fecha: '2026-01-14',
          intervalo_inicio: 0,
          intervalo_fin: 30,
          vistas_unicas: 8,
          total_visto: 240,
          abandonos: 0,
        },
      ]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await cargarIntervalosLeccion('lec-1', '2026-01-01', '2026-01-31')

      expect(mockFrom).toHaveBeenCalledWith('video_intervalos')
      expect(result).toEqual(mockData)
      expect(result).toHaveLength(2)
    })

    it('lanza error si la consulta falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('Query error') }))

      await expect(cargarIntervalosLeccion('lec-1', '2026-01-01', '2026-01-31')).rejects.toThrow(
        'Query error'
      )
    })
  })

  describe('cargarHeatmapData', () => {
    it('retorna array con datos de intervalo para heatmap', async () => {
      const mockData = [
        { intervalo_inicio: 0, vistas_unicas: 50, total_visto: 2500, abandonos: 5 },
        { intervalo_inicio: 30, vistas_unicas: 45, total_visto: 2250, abandonos: 3 },
        { intervalo_inicio: 60, vistas_unicas: 40, total_visto: 2000, abandonos: 7 },
      ]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await cargarHeatmapData('lec-1')

      expect(mockFrom).toHaveBeenCalledWith('video_intervalos')
      expect(result).toEqual(mockData)
      expect(result).toHaveLength(3)
    })

    it('lanza error si la consulta falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('Query error') }))

      await expect(cargarHeatmapData('lec-1')).rejects.toThrow('Query error')
    })
  })
})
