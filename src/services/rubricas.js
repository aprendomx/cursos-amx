import { supabase } from '@/lib/supabase.js'

export async function listarRubricas() {
  const { data, error } = await supabase
    .from('rubricas')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function crearRubrica(rubrica) {
  const { data, error } = await supabase
    .from('rubricas')
    .insert({
      nombre: rubrica.nombre,
      descripcion: rubrica.descripcion,
      criterios: rubrica.criterios,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarRubrica(id, rubrica) {
  const { data, error } = await supabase
    .from('rubricas')
    .update({
      nombre: rubrica.nombre,
      descripcion: rubrica.descripcion,
      criterios: rubrica.criterios,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarRubrica(id) {
  const { error } = await supabase.from('rubricas').delete().eq('id', id)
  if (error) throw error
}

export async function obtenerAsignaciones(filtros = {}) {
  let q = supabase.from('asignaciones_rubrica').select('*')
  if (filtros.evaluacion_id) q = q.eq('evaluacion_id', filtros.evaluacion_id)
  if (filtros.pregunta_id) q = q.eq('pregunta_id', filtros.pregunta_id)
  if (filtros.curso_id) q = q.eq('curso_id', filtros.curso_id)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function asignarRubrica({ rubrica_id, evaluacion_id, pregunta_id, curso_id }) {
  const { data, error } = await supabase
    .from('asignaciones_rubrica')
    .insert({ rubrica_id, evaluacion_id, pregunta_id, curso_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function quitarAsignacion(id) {
  const { error } = await supabase.from('asignaciones_rubrica').delete().eq('id', id)
  if (error) throw error
}
