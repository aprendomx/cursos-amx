import { supabase } from '@/lib/supabase.js'

/**
 * Obtiene el funnel de conversión para un curso.
 *
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
 *
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
 *
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

/**
 * Obtiene el dashboard de cursos para un instructor.
 * @param {string} instructorId
 */
export async function obtenerInstructorDashboard(instructorId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'instructor_dashboard', instructor_id: instructorId },
  })
  if (error) throw error
  return data.cursos || []
}

/**
 * Obtiene los alumnos de un curso (vista del instructor).
 * @param {string} cursoId
 */
export async function obtenerInstructorAlumnos(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'instructor_alumnos', curso_id: cursoId },
  })
  if (error) throw error
  return data.alumnos || []
}

/**
 * Obtiene analytics por lección de un curso.
 * @param {string} cursoId
 */
export async function obtenerLeccionAnalytics(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'leccion_analytics', curso_id: cursoId },
  })
  if (error) throw error
  return data.lecciones || []
}
