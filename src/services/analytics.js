import { supabase } from '@/lib/supabase.js'

export async function obtenerAlumnosRiesgo(cursoId, minRiesgo = 50) {
  const { data, error } = await supabase
    .from('v_alumnos_riesgo')
    .select('*')
    .eq('curso_id', cursoId)
    .gte('riesgo_porcentaje', minRiesgo)
    .order('riesgo_porcentaje', { ascending: false })
  if (error) throw error
  return data || []
}

export async function obtenerEngagement(cursoId, dias = 30) {
  const { data, error } = await supabase.rpc('engagement_curso', {
    p_curso_id: cursoId,
    p_dias: dias,
  })
  if (error) throw error
  return data || []
}

export async function generarReporteCSV(tipo, cursoId) {
  const { data, error } = await supabase.functions.invoke('reporte-csv', {
    body: { tipo, curso_id: cursoId },
  })
  if (error) throw error
  return data?.blob || data
}
