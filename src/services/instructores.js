import { supabase } from '@/lib/supabase.js'
import { featureEnabled } from '@/lib/featureFlags.js'

/* ──────────────────────────────────────────────────────────
   Lado instructor: cursos asignados, alumnos, moderación
   ────────────────────────────────────────────────────────── */

export async function fetchMisCursosInstructor() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return []
  const { data, error } = await supabase
    .from('cursos_instructores')
    .select('curso_id, asignado_en, cursos(id, slug, titulo, publicado, imagen_portada)')
    .eq('user_id', session.user.id)
    .order('asignado_en', { ascending: false })
  if (error) throw error
  return (data || []).map((r) => r.cursos).filter(Boolean)
}

export async function fetchAlumnosCurso(cursoId) {
  const { data, error } = await supabase
    .from('inscripciones')
    .select(
      'user_id, inscrito_en, perfiles(nombres, apellido_paterno, apellido_materno, correo, cargo, dependencias(siglas))'
    )
    .eq('curso_id', cursoId)
    .order('inscrito_en', { ascending: false })
  if (error) throw error
  return data || []
}

// Comentarios de todas las lecciones de un curso (incluye ocultos:
// la RLS deja verlos al instructor del curso).
export async function fetchComentariosCurso(cursoId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('comentarios')
    .select(
      '*, perfiles(nombres, apellido_paterno), lecciones!inner(titulo, modulos!inner(curso_id))'
    )
    .eq('lecciones.modulos.curso_id', cursoId)
    .order('creado_en', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Única vía de moderación: la RPC valida instructor-ship, aplica la
// acción y escribe log_moderacion en la misma transacción.
// accion ∈ ocultar | mostrar | destacar | quitar_destacado | eliminar
export async function moderarComentario(comentarioId, accion) {
  const { data, error } = await supabase.rpc('moderar_comentario', {
    p_comentario_id: comentarioId,
    p_accion: accion,
  })
  if (error) throw error
  return data
}

export async function fetchLogModeracion(cursoId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('log_moderacion')
    .select('*, perfiles!log_moderacion_moderador_id_fkey(nombres, apellido_paterno)')
    .eq('curso_id', cursoId)
    .order('creado_en', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Métricas básicas del dashboard para un curso.
export async function fetchMetricasCurso(cursoId) {
  const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [inscritos, comentarios7d, ocultos, sesiones] = await Promise.all([
    supabase
      .from('inscripciones')
      .select('id', { count: 'exact', head: true })
      .eq('curso_id', cursoId),
    supabase
      .from('comentarios')
      .select('id, lecciones!inner(modulos!inner(curso_id))', { count: 'exact', head: true })
      .eq('lecciones.modulos.curso_id', cursoId)
      .gte('creado_en', hace7d),
    supabase
      .from('comentarios')
      .select('id, lecciones!inner(modulos!inner(curso_id))', { count: 'exact', head: true })
      .eq('lecciones.modulos.curso_id', cursoId)
      .eq('oculto', true),
    // Sesiones próximas o en vivo (módulo aulas; tolera tabla ausente)
    featureEnabled('aulas')
      ? supabase
          .from('sesiones_virtuales')
          .select('id', { count: 'exact', head: true })
          .eq('curso_id', cursoId)
          .in('estado', ['programada', 'en_vivo'])
      : Promise.resolve({ count: 0 }),
  ])

  return {
    alumnos: inscritos.count ?? 0,
    comentarios7d: comentarios7d.count ?? 0,
    ocultos: ocultos.count ?? 0,
    sesionesProgramadas: sesiones.count ?? 0,
  }
}

// IDs de instructores de un curso (para pintar badges en el feed).
export async function fetchInstructoresDeCurso(cursoId) {
  const { data, error } = await supabase
    .from('cursos_instructores')
    .select('user_id')
    .eq('curso_id', cursoId)
  if (error) throw error
  return (data || []).map((r) => r.user_id)
}

/* ──────────────────────────────────────────────────────────
   Lado admin: alta de instructores y asignación a cursos
   ────────────────────────────────────────────────────────── */

export async function fetchPerfilesInstructores() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombres, apellido_paterno, apellido_materno, correo, es_instructor')
    .eq('es_instructor', true)
    .order('apellido_paterno')
  if (error) throw error
  return data || []
}

export async function buscarPerfiles(termino) {
  const t = `%${termino}%`
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombres, apellido_paterno, apellido_materno, correo, es_instructor')
    .or(`nombres.ilike.${t},apellido_paterno.ilike.${t},correo.ilike.${t}`)
    .limit(10)
  if (error) throw error
  return data || []
}

export async function setEsInstructor(userId, valor) {
  const { error } = await supabase
    .from('perfiles')
    .update({ es_instructor: valor })
    .eq('id', userId)
  if (error) throw error
}

export async function fetchAsignacionesInstructor(userId) {
  const { data, error } = await supabase
    .from('cursos_instructores')
    .select('curso_id, cursos(titulo)')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

export async function asignarInstructorACurso(cursoId, userId) {
  const { error } = await supabase
    .from('cursos_instructores')
    .insert({ curso_id: cursoId, user_id: userId })
  if (error && error.code !== '23505') throw error // 23505 = ya asignado
}

export async function desasignarInstructorDeCurso(cursoId, userId) {
  const { error } = await supabase
    .from('cursos_instructores')
    .delete()
    .eq('curso_id', cursoId)
    .eq('user_id', userId)
  if (error) throw error
}
