import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  emitirEvento,
  listarEventos,
  obtenerRiesgoAlumnos,
  obtenerEngagementDiario,
  generarReporteCSV,
} from '@/services/analytics'

const mockFrom = vi.fn()
const mockGetUser = vi.fn()
const mockInvoke = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}))

describe('Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockChain(result) {
    let chain
    chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(result)),
      insert: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result)),
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      catch: (onRejected) => Promise.resolve(result).catch(onRejected),
    }
    return chain
  }

  describe('emitirEvento', () => {
    it('inserta un evento con el usuario actual', async () => {
      const user = { id: 'user-123' }
      mockGetUser.mockResolvedValue({ data: { user } })

      const insertResult = {
        data: { id: 'stmt-1', actor_id: user.id, verb: 'completed' },
        error: null,
      }
      mockFrom.mockReturnValue(mockChain(insertResult))

      const result = await emitirEvento({
        verb: 'completed',
        objectType: 'leccion',
        objectId: 'lec-1',
        result: { score: 100 },
      })

      expect(mockGetUser).toHaveBeenCalled()
      expect(mockFrom).toHaveBeenCalledWith('lrs_statements')
      expect(result).toEqual(insertResult.data)
    })

    it('lanza error si getUser falla', async () => {
      mockGetUser.mockRejectedValue(new Error('Auth error'))
      await expect(
        emitirEvento({ verb: 'viewed', objectType: 'curso', objectId: 'c1', result: {} })
      ).rejects.toThrow('Auth error')
    })

    it('lanza error si el insert falla', async () => {
      const user = { id: 'user-123' }
      mockGetUser.mockResolvedValue({ data: { user } })

      const errorResult = {
        data: null,
        error: new Error('Insert failed'),
      }
      mockFrom.mockReturnValue(mockChain(errorResult))

      await expect(
        emitirEvento({ verb: 'viewed', objectType: 'curso', objectId: 'c1', result: {} })
      ).rejects.toThrow('Insert failed')
    })
  })

  describe('listarEventos', () => {
    it('lista eventos sin filtros', async () => {
      const mockData = [
        { id: '1', verb: 'completed', actor_id: 'u1' },
        { id: '2', verb: 'viewed', actor_id: 'u2' },
      ]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await listarEventos()

      expect(mockFrom).toHaveBeenCalledWith('lrs_statements')
      expect(result).toEqual(mockData)
    })

    it('aplica filtros individuales', async () => {
      const mockData = [{ id: '1', verb: 'completed', actor_id: 'u1', object_type: 'leccion' }]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await listarEventos({
        actorId: 'u1',
        verb: 'completed',
        objectType: 'leccion',
        objectId: 'lec-1',
      })

      expect(mockFrom).toHaveBeenCalledWith('lrs_statements')
      expect(result).toEqual(mockData)
    })

    it('aplica rango de fechas', async () => {
      const mockData = [{ id: '1', timestamp: '2024-01-15T10:00:00Z' }]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      await listarEventos({ desde: '2024-01-01', hasta: '2024-01-31' })

      expect(mockFrom).toHaveBeenCalledWith('lrs_statements')
    })

    it('respeta límite personalizado', async () => {
      const mockData = [{ id: '1' }]
      const chain = mockChain({ data: mockData, error: null })
      mockFrom.mockReturnValue(chain)

      await listarEventos({ limit: 10 })

      expect(chain.limit).toHaveBeenCalledWith(10)
    })

    it('usa límite 100 por defecto', async () => {
      const mockData = [{ id: '1' }]
      const chain = mockChain({ data: mockData, error: null })
      mockFrom.mockReturnValue(chain)

      await listarEventos()

      expect(chain.limit).toHaveBeenCalledWith(100)
    })

    it('retorna array vacío cuando no hay datos', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: null }))

      const result = await listarEventos()

      expect(result).toEqual([])
    })

    it('lanza error si la query falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('Query failed') }))

      await expect(listarEventos()).rejects.toThrow('Query failed')
    })
  })

  describe('obtenerRiesgoAlumnos', () => {
    it('consulta riesgo con cursoId y minRiesgo', async () => {
      const mockData = [
        {
          usuario_id: 'u1',
          score: 85,
          perfiles: { nombres_completos: 'Ana', correo: 'ana@test.com' },
        },
        {
          usuario_id: 'u2',
          score: 70,
          perfiles: { nombres_completos: 'Luis', correo: 'luis@test.com' },
        },
      ]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await obtenerRiesgoAlumnos('curso-1', 60)

      expect(mockFrom).toHaveBeenCalledWith('v_riesgo_alumno')
      expect(result).toEqual(mockData)
    })

    it('usa minRiesgo 0 por defecto', async () => {
      mockFrom.mockReturnValue(mockChain({ data: [], error: null }))

      await obtenerRiesgoAlumnos('curso-1')

      expect(mockFrom).toHaveBeenCalledWith('v_riesgo_alumno')
    })

    it('retorna array vacío cuando no hay datos', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: null }))

      const result = await obtenerRiesgoAlumnos('curso-1', 50)

      expect(result).toEqual([])
    })

    it('lanza error si la query falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('View error') }))

      await expect(obtenerRiesgoAlumnos('curso-1', 50)).rejects.toThrow('View error')
    })
  })

  describe('obtenerEngagementDiario', () => {
    it('consulta engagement de los últimos N días', async () => {
      const mockData = [
        { fecha: '2024-01-15', curso_id: 'curso-1', eventos: 42 },
        { fecha: '2024-01-16', curso_id: 'curso-1', eventos: 55 },
      ]
      mockFrom.mockReturnValue(mockChain({ data: mockData, error: null }))

      const result = await obtenerEngagementDiario('curso-1', 7)

      expect(mockFrom).toHaveBeenCalledWith('v_engagement_diario')
      expect(result).toEqual(mockData)
    })

    it('usa 30 días por defecto', async () => {
      mockFrom.mockReturnValue(mockChain({ data: [], error: null }))

      await obtenerEngagementDiario('curso-1')

      expect(mockFrom).toHaveBeenCalledWith('v_engagement_diario')
    })

    it('retorna array vacío cuando no hay datos', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: null }))

      const result = await obtenerEngagementDiario('curso-1', 7)

      expect(result).toEqual([])
    })

    it('lanza error si la query falla', async () => {
      mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('Engagement error') }))

      await expect(obtenerEngagementDiario('curso-1', 7)).rejects.toThrow('Engagement error')
    })
  })

  describe('generarReporteCSV', () => {
    it('invoca la Edge Function analytics', async () => {
      const mockData = { csv_url: 'https://example.com/report.csv' }
      mockInvoke.mockResolvedValue({ data: mockData, error: null })

      const result = await generarReporteCSV('engagement', 'curso-1')

      expect(mockInvoke).toHaveBeenCalledWith('analytics', {
        body: { action: 'reporte_csv', tipo: 'engagement', curso_id: 'curso-1' },
      })
      expect(result).toEqual(mockData)
    })

    it('lanza error si la invocación falla', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Edge Function error') })

      await expect(generarReporteCSV('engagement', 'curso-1')).rejects.toThrow(
        'Edge Function error'
      )
    })
  })
})
