import { supabase } from '@/lib/supabase.js'

/**
 * Evalúa todos los badges activos para un usuario y desbloquea los que cumplan criterios.
 * Devuelve array de badges recién desbloqueados (para mostrar notificación).
 */
export async function evaluarBadges(userId) {
  const { data: badges, error } = await supabase.from('badges').select('*').eq('activo', true)
  if (error) throw error

  const nuevos = []
  for (const badge of badges || []) {
    const cumple = await evaluarCriterio(userId, badge.criterio_tipo, badge.criterio_config)
    if (cumple) {
      const { data: existente, error: errExistente } = await supabase
        .from('badge_usuarios')
        .select('id')
        .eq('usuario_id', userId)
        .eq('badge_id', badge.id)
        .single()
      if (errExistente && errExistente.code !== 'PGRST116') throw errExistente
      if (!existente) {
        const { error: errInsert } = await supabase.from('badge_usuarios').insert({
          usuario_id: userId,
          badge_id: badge.id,
        })
        if (errInsert) throw errInsert
        // Otorgar puntos del badge
        const { error: errPuntos } = await supabase.rpc('otorgar_puntos', {
          p_usuario_id: userId,
          p_fuente_tipo: 'badge_desbloqueado',
          p_fuente_id: badge.id,
          p_puntos: badge.puntos_otorga,
          p_descripcion: `Badge desbloqueado: ${badge.nombre}`,
        })
        if (errPuntos) throw errPuntos
        nuevos.push(badge)
      }
    }
  }
  return nuevos
}

async function evaluarCriterio(userId, tipo, config) {
  switch (tipo) {
    case 'primer_login':
      return true // Se evalúa manualmente en login
    case 'completar_curso': {
      const { data } = await supabase.rpc('curso_completado_por_usuario', {
        p_user_id: userId,
        p_curso_id: config.curso_id,
      })
      return data === true
    }
    case 'completar_modulo': {
      const { data } = await supabase.rpc('modulo_completado_por_usuario', {
        p_user_id: userId,
        p_modulo_id: config.modulo_id,
      })
      return data === true
    }
    case 'calificacion_minima': {
      const { data } = await supabase
        .from('intentos_evaluacion')
        .select('id')
        .eq('user_id', userId)
        .eq('leccion_id', config.evaluacion_id)
        .gte('puntaje', config.puntaje_min)
        .single()
      return !!data
    }
    case 'participar_foros': {
      const { count } = await supabase
        .from('foro_hilos')
        .select('*', { count: 'exact', head: true })
        .eq('autor_id', userId)
      return (count || 0) >= (config.cantidad_min || 1)
    }
    case 'streak_dias': {
      const { data } = await supabase.rpc('streak_dias_usuario', {
        p_user_id: userId,
        p_dias: config.dias_consecutivos,
      })
      return data === true
    }
    default:
      return false
  }
}
