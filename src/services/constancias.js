import { supabase } from '@/lib/supabase.js'

export async function fetchConstanciasUsuario(userId) {
  const { data, error } = await supabase
    .from('constancias')
    .select('*, cursos(titulo, slug, nivel, duracion_min)')
    .eq('user_id', userId)
    .order('emitida_en', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchConstancia(cursoId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('constancias')
    .select(
      '*, cursos(*), perfiles(nombres, apellido_paterno, apellido_materno, nombres_completos)'
    )
    .eq('user_id', session.user.id)
    .eq('curso_id', cursoId)
    .single()
  if (error) throw error
  return data
}

export async function fetchConstanciasAdmin() {
  const { data, error } = await supabase
    .from('constancias')
    .select('*, cursos(titulo), perfiles(nombres_completos, correo)')
    .order('emitida_en', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}
