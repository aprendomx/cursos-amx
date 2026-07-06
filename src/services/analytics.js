import { supabase } from '@/lib/supabase.js'

/**
 * Emite un evento xAPI/Experience al LRS.
 * Obtiene el actor (usuario autenticado) automáticamente.
 */
export async function emitirEvento({ verb, objectType, objectId, result }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('lrs_statements')
    .insert({
      actor_id: user?.id,
      verb,
      object_type: objectType,
      object_id: objectId,
      result,
      timestamp: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Lista eventos del LRS con filtros opcionales.
 *
 * @param {Object} filtros
 * @param {string} [filtros.actorId]
 * @param {string} [filtros.verb]
 * @param {string} [filtros.objectType]
 * @param {string} [filtros.objectId]
 * @param {string} [filtros.desde]  - ISO date string
 * @param {string} [filtros.hasta]  - ISO date string
 * @param {number} [filtros.limit=100]
 */
export async function listarEventos({
  actorId,
  verb,
  objectType,
  objectId,
  desde,
  hasta,
  limit = 100,
} = {}) {
  let query = supabase.from('lrs_statements').select('*')

  if (actorId) query = query.eq('actor_id', actorId)
  if (verb) query = query.eq('verb', verb)
  if (objectType) query = query.eq('object_type', objectType)
  if (objectId) query = query.eq('object_id', objectId)
  if (desde) query = query.gte('timestamp', desde)
  if (hasta) query = query.lte('timestamp', hasta)

  const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Consulta la vista de riesgo de alumnos para un curso.
 * Filtra por score mínimo y une perfiles para obtener nombres.
 *
 * @param {string} cursoId
 * @param {number} [minRiesgo=0]
 */
export async function obtenerRiesgoAlumnos(cursoId, minRiesgo = 0) {
  const { data, error } = await supabase
    .from('v_riesgo_alumno')
    .select('*, perfiles(nombres_completos, correo)')
    .eq('curso_id', cursoId)
    .gte('score', minRiesgo)
    .order('score', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Consulta la vista de engagement diario para un curso
 * en los últimos N días.
 *
 * @param {string} cursoId
 * @param {number} [dias=30]
 */
export async function obtenerEngagementDiario(cursoId, dias = 30) {
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  const fechaDesde = desde.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('v_engagement_diario')
    .select('*')
    .eq('curso_id', cursoId)
    .gte('fecha', fechaDesde)
    .order('fecha', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Genera un reporte CSV vía Edge Function.
 *
 * @param {string} tipo   - Tipo de reporte solicitado
 * @param {string} cursoId
 */
export async function generarReporteCSV(tipo, cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'reporte_csv', tipo, curso_id: cursoId },
  })
  if (error) throw error
  return data
}
