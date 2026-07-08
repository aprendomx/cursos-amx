import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listarGrabacionesPorCurso,
  listarGrabacionesPorSesion,
  buscarTranscripciones,
  obtenerTranscripcion,
  obtenerSegmentoActual,
  solicitarTranscripcion,
} from '@/services/grabaciones.js'

const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockInvoke = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}))

describe('Grabaciones Service (Fase M)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarGrabacionesPorCurso', () => {
    it('returns recordings with session info', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({ data: [{ id: 'g1', url_grabacion: 'https://...' }], error: null })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarGrabacionesPorCurso('c1')

      expect(mockFrom).toHaveBeenCalledWith('sesiones_grabaciones')
      expect(result).toHaveLength(1)
    })
  })

  describe('listarGrabacionesPorSesion', () => {
    it('returns recordings for a session', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [{ id: 'g1' }], error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarGrabacionesPorSesion('s1')

      expect(result).toHaveLength(1)
    })
  })

  describe('buscarTranscripciones', () => {
    it('calls RPC buscar_transcripciones', async () => {
      mockRpc.mockResolvedValue({
        data: [{ sesion_id: 's1', titulo: 'S1', snippet: '...', rank: 0.5 }],
        error: null,
      })

      const result = await buscarTranscripciones('query')

      expect(mockRpc).toHaveBeenCalledWith('buscar_transcripciones', { p_query: 'query' })
      expect(result[0].titulo).toBe('S1')
    })
  })

  describe('obtenerTranscripcion', () => {
    it('returns transcription when found', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { id: 't1', texto_completo: 'Hola' }, error: null })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerTranscripcion('s1')

      expect(result.texto_completo).toBe('Hola')
    })

    it('returns null when no rows', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerTranscripcion('s1')

      expect(result).toBeNull()
    })
  })

  describe('obtenerSegmentoActual', () => {
    it('returns segment matching current time', async () => {
      const segmentos = [
        { start: 0, end: 5, text: 'Hola' },
        { start: 5, end: 10, text: 'Mundo' },
      ]
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { segmentos }, error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerSegmentoActual('s1', 7)

      expect(result.text).toBe('Mundo')
    })

    it('returns null when no match', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { segmentos: [] }, error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerSegmentoActual('s1', 100)

      expect(result).toBeNull()
    })
  })

  describe('solicitarTranscripcion', () => {
    it('invokes transcribir-sesion edge function', async () => {
      mockInvoke.mockResolvedValue({ error: null })

      await solicitarTranscripcion('s1', 'g1', 'https://audio.mp4')

      expect(mockInvoke).toHaveBeenCalledWith('transcribir-sesion', {
        body: { sesion_id: 's1', grabacion_id: 'g1', audio_url: 'https://audio.mp4' },
      })
    })
  })
})
