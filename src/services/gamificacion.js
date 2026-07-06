import { supabase } from '@/lib/supabase.js'

export async function listarBadges() {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('activo', true)
    .order('puntos_otorga')
  if (error) throw error
  return data || []
}

export async function listarNiveles() {
  const { data, error } = await supabase.from('niveles').select('*').order('puntos_min')
  if (error) throw error
  return data || []
}

export async function obtenerPuntosUsuario(userId) {
  const { data, error } = await supabase
    .from('v_puntos_usuario')
    .select('*')
    .eq('usuario_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.puntos_totales || 0
}

export async function obtenerNivelUsuario(userId) {
  const { data, error } = await supabase
    .from('v_nivel_usuario')
    .select('*')
    .eq('usuario_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || { puntos_totales: 0, nivel_nombre: 'Novato', color: '#6b7280' }
}

export async function listarBadgesUsuario(userId) {
  const { data, error } = await supabase
    .from('badge_usuarios')
    .select('*, badges(*)')
    .eq('usuario_id', userId)
    .order('desbloqueado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function listarLogPuntos(userId, limit = 50) {
  const { data, error } = await supabase
    .from('log_puntos')
    .select('*')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function listarCondicionesDesbloqueo(moduloId) {
  const { data, error } = await supabase
    .from('condiciones_desbloqueo')
    .select('*')
    .eq('modulo_id', moduloId)
    .order('orden')
  if (error) throw error
  return data || []
}

export async function crearBadge(badge) {
  const { data, error } = await supabase.from('badges').insert(badge).select().single()
  if (error) throw error
  return data
}

export async function actualizarBadge(id, badge) {
  const { data, error } = await supabase.from('badges').update(badge).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function eliminarBadge(id) {
  const { error } = await supabase.from('badges').delete().eq('id', id)
  if (error) throw error
}

export async function crearCondicion(condicion) {
  const { data, error } = await supabase
    .from('condiciones_desbloqueo')
    .insert(condicion)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarCondicion(id) {
  const { error } = await supabase.from('condiciones_desbloqueo').delete().eq('id', id)
  if (error) throw error
}

export async function obtenerLeaderboard(cursoId, limit = 20) {
  const { data, error } = await supabase.rpc('leaderboard_curso', {
    p_curso_id: cursoId,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
}
