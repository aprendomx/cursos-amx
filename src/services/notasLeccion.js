import { supabase } from '@/lib/supabase.js'

// Notas personales por lección (migración 002). Privadas por RLS: cada quien
// lee y escribe solo las suyas, y ni instructores ni administración las ven.
// `segundo_video` es opcional: las lecciones de lectura no tienen línea de
// tiempo.

export async function listarNotas(leccionId) {
  const { data, error } = await supabase
    .from('notas_leccion')
    .select('*')
    .eq('leccion_id', leccionId)
    .order('creado_en', { ascending: true })
  if (error) throw error
  return data || []
}

export async function crearNota({ leccionId, contenido, segundoVideo = null }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('notas_leccion')
    .insert({
      user_id: session.user.id,
      leccion_id: leccionId,
      contenido,
      segundo_video: segundoVideo,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarNota(id, contenido) {
  const { data, error } = await supabase
    .from('notas_leccion')
    .update({ contenido })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarNota(id) {
  const { error } = await supabase.from('notas_leccion').delete().eq('id', id)
  if (error) throw error
}
