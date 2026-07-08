import { supabase } from '@/lib/supabase.js'

export async function listarTranscripciones() {
  const { data, error } = await supabase
    .from('sesiones_transcripciones')
    .select('*, sesiones_virtuales(titulo, curso_id, cursos(titulo))')
    .order('creado_en', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function obtenerTranscripcion(sesionId) {
  const { data, error } = await supabase
    .from('sesiones_transcripciones')
    .select('*')
    .eq('sesion_id', sesionId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function costoTotalTranscripciones() {
  const { data, error } = await supabase
    .from('sesiones_transcripciones')
    .select('costo_usd')
    .eq('estado', 'completada')
  if (error) throw error
  const rows = data || []
  return rows.reduce((sum, r) => sum + (r.costo_usd || 0), 0)
}
