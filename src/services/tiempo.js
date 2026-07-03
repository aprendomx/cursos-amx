import { supabase } from '@/lib/supabase.js'

// Persiste tiempo activo (segundos) del usuario actual en un curso.
// El RPC aplica el clamp anti-inflación del lado servidor.
export async function registrarTiempo(cursoId, segundos) {
  const secs = Math.round(segundos)
  if (!cursoId || secs <= 0) return
  const { error } = await supabase.rpc('registrar_tiempo_curso', {
    p_curso_id: cursoId,
    p_segundos: secs,
  })
  if (error) throw error
}

// Tiempo del propio usuario por curso (para PerfilPage).
export async function tiempoPorUsuario(userId) {
  const { data, error } = await supabase
    .from('tiempo_curso')
    .select('curso_id, segundos_activos, cursos(titulo)')
    .eq('user_id', userId)
    .order('segundos_activos', { ascending: false })
  if (error) throw error
  return data || []
}

// Formatea segundos a "Xh Ym" / "Ym" / "Xs".
export function formatearDuracion(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}
