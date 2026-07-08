import { supabase } from '@/lib/supabase.js'

export async function listarGrabacionesPorCurso(cursoId) {
  const { data, error } = await supabase
    .from('sesiones_grabaciones')
    .select('*, sesiones_virtuales(titulo, programada_en)')
    .eq('sesiones_virtuales.curso_id', cursoId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function listarGrabacionesPorSesion(sesionId) {
  const { data, error } = await supabase
    .from('sesiones_grabaciones')
    .select('*')
    .eq('sesion_id', sesionId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function buscarTranscripciones(query) {
  const { data, error } = await supabase.rpc('buscar_transcripciones', { p_query: query })
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

export async function obtenerSegmentoActual(sesionId, tiempoSegundos) {
  const { data, error } = await supabase
    .from('sesiones_transcripciones')
    .select('segmentos')
    .eq('sesion_id', sesionId)
    .single()
  if (error || !data?.segmentos) return null

  const segmentos = Array.isArray(data.segmentos) ? data.segmentos : []
  return segmentos.find((s) => s.start <= tiempoSegundos && s.end >= tiempoSegundos) || null
}

export async function solicitarTranscripcion(sesionId, grabacionId, audioUrl) {
  const { error } = await supabase.functions.invoke('transcribir-sesion', {
    body: { sesion_id: sesionId, grabacion_id: grabacionId, audio_url: audioUrl },
  })
  if (error) throw error
}
