import { supabase } from '@/lib/supabase.js'
import { sbInsert } from '@/lib/sbRest.js'
import { withCache, invalidateCache } from '@/composables/cache.js'

async function _fetchProgresoCurso(userId, cursoId) {
  const { data, error } = await supabase
    .from('progreso')
    .select('*, lecciones!inner(modulo_id, modulos!inner(curso_id))')
    .eq('user_id', userId)
    .eq('lecciones.modulos.curso_id', cursoId)
  if (error) throw error
  return data
}

export const fetchProgresoCurso = withCache(
  _fetchProgresoCurso,
  (userId, cursoId) => `progreso:curso:${userId}:${cursoId}`
)

async function _fetchProgresoUsuario(userId) {
  const { data, error } = await supabase
    .from('progreso')
    .select('*, lecciones!inner(modulo_id, modulos!inner(curso_id))')
    .eq('user_id', userId)
    .eq('completado', true)
  if (error) throw error
  return data
}

export const fetchProgresoUsuario = withCache(
  _fetchProgresoUsuario,
  (userId) => `progreso:usuario:${userId}`
)

export async function marcarLeccionCompletada(leccionId) {
  const { data, error } = await supabase.rpc('marcar_leccion_completada', {
    p_leccion_id: leccionId,
  })
  if (error) throw error
  invalidateCache(/^progreso:/)
  return data
}

export async function actualizarSegundosVistos(leccionId, segundos) {
  const { error } = await supabase.rpc('guardar_posicion', {
    p_leccion: leccionId,
    p_segundos: Math.max(0, Math.floor(segundos)),
  })
  if (error) throw error
  invalidateCache(/^progreso:/)
}

async function _fetchInscripciones(userId) {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*, cursos(*)')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export const fetchInscripciones = withCache(
  _fetchInscripciones,
  (userId) => `inscripciones:${userId}`
)

export async function inscribirse(cursoId, session) {
  // Usa sbRest.js (PostgREST directo con JWT explícito) en vez de supabase-js,
  // porque el auth-refresh de supabase-js está roto en self-hosted y los inserts
  // pueden mandarse sin JWT, fallando el RLS check (auth.uid() = user_id).
  if (!session?.user?.id || !session?.access_token) throw new Error('No autenticado')
  const result = await sbInsert(
    'inscripciones',
    { user_id: session.user.id, curso_id: cursoId },
    session.access_token
  )
  invalidateCache(/^inscripciones:/)
  return result
}
