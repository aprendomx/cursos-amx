import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAiQuizGenerator } from '@/composables/useAiQuizGenerator.js'
import { useAiSummarizer } from '@/composables/useAiSummarizer.js'
import { useAiChatbot } from '@/composables/useAiChatbot.js'

const mockGenerarQuizIA = vi.fn()
const mockResumirLeccion = vi.fn()
const mockChatAsistente = vi.fn()

vi.mock('@/services/aiService', () => ({
  generarQuizIA: (...args) => mockGenerarQuizIA(...args),
  resumirLeccion: (...args) => mockResumirLeccion(...args),
  chatAsistente: (...args) => mockChatAsistente(...args),
}))

describe('useAiQuizGenerator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('genera preguntas correctamente', async () => {
    const preguntasMock = [{ enunciado: 'P1', opciones: ['a', 'b'], respuesta_correcta: 0 }]
    mockGenerarQuizIA.mockResolvedValue(preguntasMock)

    const ai = useAiQuizGenerator()
    await ai.generar('Tema', 'basico', 3)

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('')
    expect(ai.preguntas.value).toEqual(preguntasMock)
    expect(mockGenerarQuizIA).toHaveBeenCalledWith('Tema', 'basico', 3)
  })

  it('maneja errores', async () => {
    mockGenerarQuizIA.mockRejectedValue(new Error('Fallo'))

    const ai = useAiQuizGenerator()
    await ai.generar('Tema', 'basico', 3)

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('Fallo')
    expect(ai.preguntas.value).toEqual([])
  })

  it('limpiar resetea el estado', async () => {
    mockGenerarQuizIA.mockResolvedValue([{ enunciado: 'P1' }])

    const ai = useAiQuizGenerator()
    await ai.generar('Tema', 'basico', 3)
    ai.limpiar()

    expect(ai.preguntas.value).toEqual([])
    expect(ai.error.value).toBe('')
  })
})

describe('useAiSummarizer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resume contenido correctamente', async () => {
    mockResumirLeccion.mockResolvedValue({ summary: 'Resumen', cached: false })

    const ai = useAiSummarizer()
    await ai.resumir('contenido', 'text', 'l1')

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('')
    expect(ai.summary.value).toBe('Resumen')
    expect(ai.isCached.value).toBe(false)
  })

  it('maneja errores', async () => {
    mockResumirLeccion.mockRejectedValue(new Error('Error'))

    const ai = useAiSummarizer()
    await ai.resumir('contenido')

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('Error')
    expect(ai.summary.value).toBe('')
  })
})

describe('useAiChatbot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía mensaje y recibe respuesta', async () => {
    mockChatAsistente.mockResolvedValue('Respuesta IA')

    const ai = useAiChatbot()
    await ai.enviarMensaje('Hola', 'contexto')

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('')
    expect(ai.messages.value).toHaveLength(2)
    expect(ai.messages.value[0]).toEqual({ role: 'user', content: 'Hola' })
    expect(ai.messages.value[1]).toEqual({ role: 'assistant', content: 'Respuesta IA' })
  })

  it('no envía mensaje vacío', async () => {
    const ai = useAiChatbot()
    await ai.enviarMensaje('   ', 'contexto')

    expect(ai.messages.value).toHaveLength(0)
    expect(mockChatAsistente).not.toHaveBeenCalled()
  })

  it('maneja errores y revierte mensaje', async () => {
    mockChatAsistente.mockRejectedValue(new Error('Timeout'))

    const ai = useAiChatbot()
    await ai.enviarMensaje('Hola', 'contexto')

    expect(ai.loading.value).toBe(false)
    expect(ai.error.value).toBe('Timeout')
    expect(ai.messages.value).toHaveLength(0)
  })

  it('limpiar resetea mensajes', async () => {
    mockChatAsistente.mockResolvedValue('OK')

    const ai = useAiChatbot()
    await ai.enviarMensaje('Hola', 'contexto')
    ai.limpiar()

    expect(ai.messages.value).toHaveLength(0)
    expect(ai.error.value).toBe('')
  })
})
