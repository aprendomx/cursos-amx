import { supabase } from '@/lib/supabase.js'

/**
 * Obtiene el funnel de conversión para un curso.
 * @param {string} cursoId
 * @param {string} [desde] — ISO date
 * @param {string} [hasta] — ISO date
 */
export async function obtenerFunnel(cursoId, desde, hasta) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'funnel', curso_id: cursoId, desde, hasta },
  })
  if (error) throw error
  return data
}

/**
 * Obtiene la retención de cohortes para un curso.
 * @param {string} cursoId
 */
export async function obtenerRetencion(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'retencion', curso_id: cursoId },
  })
  if (error) throw error
  return data.cohortes || []
}

/**
 * Obtiene la comparativa entre cursos.
 * @param {string} [desde] — ISO date
 * @param {string} [hasta] — ISO date
 */
export async function obtenerComparativa(desde, hasta) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'comparativa', desde, hasta },
  })
  if (error) throw error
  return data.cursos || []
}
