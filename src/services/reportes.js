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

export async function obtenerCostos() {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'costos' },
  })
  if (error) throw error
  return data
}

export async function obtenerInscripcionesTiempo(desde, hasta, agrupacion) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'inscripciones_tiempo', desde, hasta, agrupacion },
  })
  if (error) throw error
  return data.puntos || []
}

export async function obtenerCursosPopulares(limite = 10) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'cursos_populares', limite },
  })
  if (error) throw error
  return data.cursos || []
}

export async function guardarFavorito(nombre, tipoReporte, filtros) {
  const { data, error } = await supabase
    .from('reportes_favoritos')
    .insert({ nombre, tipo_reporte: tipoReporte, filtros })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cargarFavoritos() {
  const { data, error } = await supabase
    .from('reportes_favoritos')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function eliminarFavorito(id) {
  const { error } = await supabase.from('reportes_favoritos').delete().eq('id', id)
  if (error) throw error
}

export async function programarReporte(nombre, tipoReporte, filtros, frecuencia) {
  const { data, error } = await supabase
    .from('reportes_programados')
    .insert({ nombre, tipo_reporte: tipoReporte, filtros, frecuencia })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cargarProgramados() {
  const { data, error } = await supabase
    .from('reportes_programados')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}
