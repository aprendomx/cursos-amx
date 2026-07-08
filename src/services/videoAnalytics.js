import { supabase } from '@/lib/supabase.js'

/**
 * Carga estadísticas de video por lección desde la vista
 * v_video_leccion_stats para un curso dado.
 *
 * @param {string} cursoId
 */
export async function cargarStatsCurso(cursoId) {
  if (!cursoId) return []
  const { data, error } = await supabase
    .from('v_video_leccion_stats')
    .select('*')
    .eq('curso_id', cursoId)
    .order('leccion_titulo', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Carga estadísticas de video para una lección específica.
 *
 * @param {string} leccionId
 */
export async function cargarStatsLeccion(leccionId) {
  if (!leccionId) return null
  const { data, error } = await supabase
    .from('v_video_leccion_stats')
    .select('*')
    .eq('leccion_id', leccionId)
    .single()

  if (error) throw error
  return data
}

/**
 * Carga intervalos agregados de una lección en un rango de fechas.
 *
 * @param {string} leccionId
 * @param {string} desde  - ISO date string (YYYY-MM-DD)
 * @param {string} hasta  - ISO date string (YYYY-MM-DD)
 */
export async function cargarIntervalosLeccion(leccionId, desde, hasta) {
  if (!leccionId) return []
  let query = supabase.from('video_intervalos').select('*').eq('leccion_id', leccionId)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query.order('fecha', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Carga datos agregados por intervalo para el heatmap de una lección.
 *
 * @param {string} leccionId
 */
export async function cargarHeatmapData(leccionId) {
  if (!leccionId) return []
  const { data, error } = await supabase
    .from('video_intervalos')
    .select('intervalo_inicio, vistas_unicas, total_visto, abandonos')
    .eq('leccion_id', leccionId)
    .order('intervalo_inicio', { ascending: true })

  if (error) throw error
  return data || []
}
