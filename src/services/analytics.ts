import { supabase } from '@/lib/supabase.js'

/** Statement xAPI/Experience persistido en el LRS. */
export interface LrsStatement {
  id: string
  actor_id: string | null
  verb: string
  object_type: string
  object_id: string | null
  result: unknown
  timestamp: string
}

export interface EventoLrs {
  verb: string
  objectType: string
  objectId?: string
  result?: unknown
}

export interface FiltrosEventos {
  actorId?: string
  verb?: string
  objectType?: string
  objectId?: string
  /** ISO date string */
  desde?: string
  /** ISO date string */
  hasta?: string
  limit?: number
}

/**
 * Emite un evento xAPI/Experience al LRS.
 * Obtiene el actor (usuario autenticado) automáticamente.
 */
export async function emitirEvento({
  verb,
  objectType,
  objectId,
  result,
}: EventoLrs): Promise<LrsStatement> {
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

/** Lista eventos del LRS con filtros opcionales. */
export async function listarEventos({
  actorId,
  verb,
  objectType,
  objectId,
  desde,
  hasta,
  limit = 100,
}: FiltrosEventos = {}): Promise<LrsStatement[]> {
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
 * Las filas provienen de la vista v_riesgo_alumno (sin tipo generado aún).
 */
export async function obtenerRiesgoAlumnos(
  cursoId: string,
  minRiesgo = 0
): Promise<Record<string, unknown>[]> {
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
 */
export async function obtenerEngagementDiario(
  cursoId: string,
  dias = 30
): Promise<Record<string, unknown>[]> {
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

/** Genera un reporte CSV vía Edge Function. */
export async function generarReporteCSV(tipo: string, cursoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'reporte_csv', tipo, curso_id: cursoId },
  })
  if (error) throw error
  return data
}
