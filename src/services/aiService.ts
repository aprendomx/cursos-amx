import { supabase } from '@/lib/supabase.js'

export type ProveedorIA = 'openai' | 'claude'

/** Fila de ai_config (configuración global de IA, singleton). */
export interface ConfigIA {
  id: string
  provider: ProveedorIA
  model: string
  api_key_encrypted: string | null
  max_tokens_per_day: number
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface MensajeChat {
  role: 'user' | 'assistant'
  content: string
}

/** Pregunta generada por la Edge Function ai-proxy (shape del prompt, no de BD). */
export interface PreguntaQuizIA {
  enunciado: string
  opciones: string[]
  respuesta_correcta: number
  [key: string]: unknown
}

export interface ResumenLeccion {
  summary: string
  cached: boolean
}

/**
 * Genera preguntas de quiz con IA.
 * @param tema — tema del quiz
 * @param nivel — básico, intermedio, avanzado
 * @param cantidad — número de preguntas (default 5)
 */
export async function generarQuizIA(
  tema: string,
  nivel = 'intermedio',
  cantidad = 5
): Promise<PreguntaQuizIA[]> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'generate_quiz',
      payload: { tema, nivel, cantidad },
    },
  })
  if (error) throw error
  if (data.error) throw new Error(data.error)
  return data.preguntas || []
}

/**
 * Resume contenido de lección.
 * @param content — texto o transcript
 * @param contentType — tipo de contenido
 * @param leccionId — para caché
 */
export async function resumirLeccion(
  content: string,
  contentType: 'text' | 'video' = 'text',
  leccionId: string | null = null
): Promise<ResumenLeccion> {
  // Verificar caché primero
  if (leccionId) {
    const { data: cached } = await supabase
      .from('ai_summaries')
      .select('*')
      .eq('leccion_id', leccionId)
      .eq('content_type', contentType)
      .single()
    if (cached) return { summary: cached.summary_text, cached: true }
  }

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'summarize',
      payload: { content, contentType },
    },
  })
  if (error) throw error

  // Guardar en caché
  if (leccionId && data.summary) {
    await supabase.from('ai_summaries').insert({
      leccion_id: leccionId,
      content_type: contentType,
      summary_text: data.summary,
      model_used: 'gpt-4o-mini',
    })
  }

  return { summary: data.summary || '', cached: false }
}

/**
 * Chat con asistente de estudio.
 * @param message — mensaje del usuario
 * @param context — contenido de la lección
 * @param history — historial de mensajes [{role, content}]
 */
export async function chatAsistente(
  message: string,
  context: string,
  history: MensajeChat[] = []
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'chat',
      payload: { message, context, history },
    },
  })
  if (error) throw error
  return data.response || ''
}

export async function obtenerConfigIA(): Promise<ConfigIA> {
  const { data, error } = await supabase.from('ai_config').select('*').single()
  if (error) throw error
  return data
}

export async function actualizarConfigIA(
  config: Partial<ConfigIA> & { id: string }
): Promise<ConfigIA> {
  const { data, error } = await supabase
    .from('ai_config')
    .update(config)
    .eq('id', config.id)
    .select()
    .single()
  if (error) throw error
  return data
}
