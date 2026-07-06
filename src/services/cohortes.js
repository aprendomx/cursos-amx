import { supabase } from '@/lib/supabase.js'

export async function listarCohortes(cursoId) {
  const { data, error } = await supabase
    .from('cohortes')
    .select('*')
    .eq('curso_id', cursoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function crearCohorte(payload) {
  const { data, error } = await supabase.from('cohortes').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function actualizarCohorte(id, payload) {
  const { data, error } = await supabase
    .from('cohortes')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarCohorte(id) {
  const { error } = await supabase.from('cohortes').delete().eq('id', id)
  if (error) throw error
}

export async function listarMiembros(cohorteId) {
  const { data, error } = await supabase
    .from('miembros_cohorte')
    .select('*, usuario:usuario_id(nombres, apellido_paterno, email)')
    .eq('cohorte_id', cohorteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function agregarMiembro(cohorteId, usuarioId, rol = 'estudiante') {
  const { data, error } = await supabase
    .from('miembros_cohorte')
    .insert({ cohorte_id: cohorteId, usuario_id: usuarioId, rol })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function quitarMiembro(cohorteId, usuarioId) {
  const { error } = await supabase
    .from('miembros_cohorte')
    .delete()
    .eq('cohorte_id', cohorteId)
    .eq('usuario_id', usuarioId)
  if (error) throw error
}

export async function obtenerCohorteUsuario(cursoId, usuarioId) {
  const { data, error } = await supabase.rpc('obtener_cohorte_usuario', {
    p_curso_id: cursoId,
    p_usuario_id: usuarioId,
  })
  if (error) throw error
  return data
}
