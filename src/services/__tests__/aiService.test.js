import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generarQuizIA,
  resumirLeccion,
  chatAsistente,
  obtenerConfigIA,
  actualizarConfigIA,
} from '@/services/aiService.js'

const mockFrom = vi.fn()
const mockInvoke = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}))

describe('AI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockChain(result) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result)),
      insert: vi.fn(() => Promise.resolve(result)),
      update: vi.fn(() => chain),
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    }
    return chain
  }

  describe('generarQuizIA', () => {
    it('llama ai-proxy con action generate_quiz', async () => {
      const preguntas = [{ enunciado: 'P1', opciones: ['a', 'b'], respuesta_correcta: 0 }]
      mockInvoke.mockResolvedValue({ data: { preguntas }, error: null })

      const result = await generarQuizIA('Tema', 'basico', 3)

      expect(mockInvoke).toHaveBeenCalledWith('ai-proxy', {
        body: { action: 'generate_quiz', payload: { tema: 'Tema', nivel: 'basico', cantidad: 3 } },
      })
      expect(result).toEqual(preguntas)
    })

    it('lanza error si la respuesta contiene error', async () => {
      mockInvoke.mockResolvedValue({ data: { error: 'Fallo IA' }, error: null })

      await expect(generarQuizIA('Tema')).rejects.toThrow('Fallo IA')
    })

    it('lanza error si invoke falla', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Network') })

      await expect(generarQuizIA('Tema')).rejects.toThrow('Network')
    })
  })

  describe('resumirLeccion', () => {
    it('devuelve caché si existe', async () => {
      mockFrom.mockReturnValue(mockChain({ data: { summary_text: 'Resumen cached' }, error: null }))

      const result = await resumirLeccion('contenido', 'text', 'l1')

      expect(result).toEqual({ summary: 'Resumen cached', cached: true })
    })

    it('llama ai-proxy y guarda en caché si no existe', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'ai_summaries') {
          return mockChain({ data: null, error: { code: 'PGRST116' } })
        }
        return mockChain({ data: null, error: null })
      })
      mockInvoke.mockResolvedValue({ data: { summary: 'Resumen nuevo' }, error: null })

      const result = await resumirLeccion('contenido', 'text', 'l1')

      expect(mockInvoke).toHaveBeenCalledWith('ai-proxy', {
        body: { action: 'summarize', payload: { content: 'contenido', contentType: 'text' } },
      })
      expect(result).toEqual({ summary: 'Resumen nuevo', cached: false })
    })

    it('funciona sin leccionId', async () => {
      mockInvoke.mockResolvedValue({ data: { summary: 'Resumen' }, error: null })

      const result = await resumirLeccion('contenido')

      expect(result).toEqual({ summary: 'Resumen', cached: false })
    })
  })

  describe('chatAsistente', () => {
    it('devuelve la respuesta del asistente', async () => {
      mockInvoke.mockResolvedValue({ data: { response: 'Hola alumno' }, error: null })

      const result = await chatAsistente('Hola', 'contexto')

      expect(mockInvoke).toHaveBeenCalledWith('ai-proxy', {
        body: { action: 'chat', payload: { message: 'Hola', context: 'contexto', history: [] } },
      })
      expect(result).toBe('Hola alumno')
    })
  })

  describe('obtenerConfigIA', () => {
    it('devuelve la configuración', async () => {
      const config = { id: '1', provider: 'openai', model: 'gpt-4o-mini' }
      mockFrom.mockReturnValue(mockChain({ data: config, error: null }))

      const result = await obtenerConfigIA()

      expect(result).toEqual(config)
    })
  })

  describe('actualizarConfigIA', () => {
    it('actualiza la configuración', async () => {
      const config = { id: '1', provider: 'claude', model: 'claude-3' }
      mockFrom.mockReturnValue(mockChain({ data: config, error: null }))

      const result = await actualizarConfigIA(config)

      expect(result).toEqual(config)
    })
  })
})
