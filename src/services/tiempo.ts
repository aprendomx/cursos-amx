import { supabase } from '@/lib/supabase.js'

export interface TiempoCursoRow {
  curso_id: string
  segundos_activos: number
  cursos: { titulo: string } | null
}

// Persiste tiempo activo (segundos) del usuario actual en un curso.
// El RPC aplica el clamp anti-inflación del lado servidor.
export async function registrarTiempo(cursoId: string, segundos: number): Promise<void> {
  const secs = Math.round(segundos)
  if (!cursoId || secs <= 0) return
  const { error } = await supabase.rpc('registrar_tiempo_curso', {
    p_curso_id: cursoId,
    p_segundos: secs,
  })
  if (error) throw error
}

// Tiempo del propio usuario por curso (para PerfilPage).
export async function tiempoPorUsuario(userId: string): Promise<TiempoCursoRow[]> {
  const { data, error } = await supabase
    .from('tiempo_curso')
    .select('curso_id, segundos_activos, cursos(titulo)')
    .eq('user_id', userId)
    .order('segundos_activos', { ascending: false })
  if (error) throw error
  // PostgREST devuelve objeto en relaciones to-one; la inferencia del
  // cliente (sin tipos generados de BD) asume array.
  return (data || []) as unknown as TiempoCursoRow[]
}

// Formatea segundos a "Xh Ym" / "Ym" / "Xs".
export function formatearDuracion(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.floor(segundos || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}
