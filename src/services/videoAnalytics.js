import { supabase } from '@/lib/supabase.js'

/**
 * Carga las estadísticas de video para una lección.
 *
 * @param {string} leccionId
 */
export async function cargarStatsLeccion(leccionId) {
  const { data, error } = await supabase
    .from('v_video_leccion_stats')
    .select('*')
    .eq('leccion_id', leccionId)
    .single()

  if (error) throw error
  return data
}

/**
 * Carga las estadísticas de video para un curso.
 *
 * @param {string} cursoId
 */
export async function cargarStatsCurso(cursoId) {
  const { data, error } = await supabase
    .from('v_curso_video_stats')
    .select('*')
    .eq('curso_id', cursoId)
    .single()

  if (error) throw error
  return data
}

/**
 * Carga los intervalos de video para una lección en un rango de fechas.
 *
 * @param {string} leccionId
 * @param {string} fechaDesde  — ISO date
 * @param {string} fechaHasta  — ISO date
 */
export async function cargarIntervalosLeccion(leccionId, fechaDesde, fechaHasta) {
  let query = supabase
    .from('video_intervalos')
    .select('*')
    .eq('leccion_id', leccionId)

  if (fechaDesde) query = query.gte('fecha', fechaDesde)
  if (fechaHasta) query = query.lte('fecha', fechaHasta)

  const { data, error } = await query
    .order('fecha', { ascending: false })
    .order('intervalo_inicio', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Carga los datos de intervalos para el heatmap de una lección.
 *
 * @param {string} leccionId
 */
export async function cargarHeatmapData(leccionId) {
  const { data, error } = await supabase
    .from('video_intervalos')
    .select('intervalo_inicio, vistas_unicas, total_visto, abandonos')
    .eq('leccion_id', leccionId)
    .order('intervalo_inicio', { ascending: true })

  if (error) throw error
  return data || []
}
