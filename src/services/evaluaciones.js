// src/services/evaluaciones.js
// Evaluaciones (lecciones tipo examen).
//  - Alumno: lee y califica vía RPC (las respuestas correctas viven solo
//    en el servidor).
//  - Admin: lee/guarda preguntas y opciones directamente (policy admin).
import { supabase } from '@/lib/supabase.js'

/** Lee el examen para el alumno (sin es_correcta). */
export async function obtenerEvaluacion(leccionId) {
  const { data, error } = await supabase.rpc('obtener_evaluacion', { p_leccion: leccionId })
  if (error) throw error
  return data
}

/**
 * Envía las respuestas y obtiene la calificación.
 * @param {string} leccionId
 * @param {Record<string, string[]>} respuestas  preguntaId -> [opcionId,...]
 */
export async function calificarEvaluacion(leccionId, respuestas) {
  const { data, error } = await supabase.rpc('calificar_evaluacion', {
    p_leccion: leccionId,
    p_respuestas: respuestas,
  })
  if (error) throw error
  return data
}

/** Carga preguntas + opciones (con es_correcta) para el editor del admin. */
export async function cargarPreguntasAdmin(leccionId) {
  const { data, error } = await supabase
    .from('preguntas')
    .select('id, orden, tipo, enunciado, pregunta_opciones(id, orden, texto, es_correcta)')
    .eq('leccion_id', leccionId)
    .order('orden')
  if (error) throw error
  return (data || []).map((p) => ({
    id: p.id,
    tipo: p.tipo,
    enunciado: p.enunciado || '',
    opciones: (p.pregunta_opciones || [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((o) => ({ id: o.id, texto: o.texto || '', es_correcta: !!o.es_correcta })),
  }))
}

/**
 * Reemplazo total de las preguntas de una lección examen. Borra las
 * existentes (cascade a opciones) y reinserta desde el formulario. Los
 * snapshots en intentos_evaluacion son jsonb y no se ven afectados.
 */
export async function guardarEvaluacionAdmin(leccionId, preguntas) {
  const { error: delErr } = await supabase.from('preguntas').delete().eq('leccion_id', leccionId)
  if (delErr) throw delErr

  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i]
    const { data: pRow, error: pErr } = await supabase
      .from('preguntas')
      .insert({ leccion_id: leccionId, orden: i + 1, tipo: p.tipo, enunciado: p.enunciado || '' })
      .select('id')
      .single()
    if (pErr) throw pErr

    const opciones = (p.opciones || []).map((o, j) => ({
      pregunta_id: pRow.id,
      orden: j + 1,
      texto: o.texto || '',
      es_correcta: !!o.es_correcta,
    }))
    if (opciones.length) {
      const { error: oErr } = await supabase.from('pregunta_opciones').insert(opciones)
      if (oErr) throw oErr
    }
  }
}
