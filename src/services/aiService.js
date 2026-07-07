import { supabase } from '@/lib/supabase.js'

/**
 * Genera preguntas de quiz con IA.
 * @param {string} tema — tema del quiz
 * @param {string} nivel — básico, intermedio, avanzado
 * @param {number} cantidad — número de preguntas (default 5)
 */
export async function generarQuizIA(tema, nivel = 'intermedio', cantidad = 5) {
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
 * @param {string} content — texto o transcript
 * @param {'text'|'video'} contentType — tipo de contenido
 * @param {string} leccionId — para caché
 */
export async function resumirLeccion(content, contentType = 'text', leccionId = null) {
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
 * @param {string} message — mensaje del usuario
 * @param {string} context — contenido de la lección
 * @param {Array} history — historial de mensajes [{role, content}]
 */
export async function chatAsistente(message, context, history = []) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'chat',
      payload: { message, context, history },
    },
  })
  if (error) throw error
  return data.response || ''
}

export async function obtenerConfigIA() {
  const { data, error } = await supabase.from('ai_config').select('*').single()
  if (error) throw error
  return data
}

export async function actualizarConfigIA(config) {
  const { data, error } = await supabase
    .from('ai_config')
    .update(config)
    .eq('id', config.id)
    .select()
    .single()
  if (error) throw error
  return data
}
