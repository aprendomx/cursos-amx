import { supabase } from '@/lib/supabase.js'
import { invalidateCache } from '@/composables/cache.js'

function invalidarEstructura() {
  invalidateCache(/^cursos:/)
  invalidateCache(/^modulos:/)
  invalidateCache(/^lecciones:/)
}

// Estructura viva del builder: sin withCache a propósito (cada operación la muta).
export async function fetchEstructura(cursoId) {
  const { data, error } = await supabase
    .from('modulos')
    .select('*, lecciones(*)')
    .eq('curso_id', cursoId)
    .order('orden', { ascending: true })
    .order('orden', { referencedTable: 'lecciones', ascending: true })
  if (error) throw error
  return data
}

export async function crearModulo(modulo) {
  const { data, error } = await supabase.from('modulos').insert(modulo).select().single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function actualizarModulo(id, patch) {
  const { data, error } = await supabase
    .from('modulos')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function eliminarModulo(id) {
  const { error } = await supabase.from('modulos').delete().eq('id', id)
  if (error) throw error
  invalidarEstructura()
}

export async function crearLeccion(leccion) {
  const { data, error } = await supabase.from('lecciones').insert(leccion).select().single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function actualizarLeccion(id, patch) {
  const { data, error } = await supabase
    .from('lecciones')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function eliminarLeccion(id) {
  const { error } = await supabase.from('lecciones').delete().eq('id', id)
  if (error) throw error
  invalidarEstructura()
}

export async function reordenarModulos(items) {
  const { error } = await supabase.rpc('reordenar_modulos', { items })
  if (error) throw error
  invalidarEstructura()
}

export async function reordenarLecciones(items) {
  const { error } = await supabase.rpc('reordenar_lecciones', { items })
  if (error) throw error
  invalidarEstructura()
}
