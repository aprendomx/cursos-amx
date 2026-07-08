import { supabase } from '@/lib/supabase.js'

export async function crearReunionZoom(titulo, inicio, fin, descripcion) {
  const { data, error } = await supabase.functions.invoke('zoom-meeting', {
    body: { titulo, inicio, fin, descripcion },
  })
  if (error) throw error
  return data
}

export async function eliminarReunionZoom(meetingId) {
  const { error } = await supabase.functions.invoke('zoom-meeting', {
    method: 'DELETE',
    body: { meeting_id: meetingId },
  })
  if (error) throw error
}

export async function guardarConfiguracionZoom(config) {
  const { error } = await supabase.from('zoom_configuracion').upsert(config, { onConflict: 'id' })
  if (error) throw error
}

export async function obtenerConfiguracionZoom() {
  const { data, error } = await supabase.from('zoom_configuracion').select('*').single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
