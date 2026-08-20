import { supabase } from '@/lib/supabase.js'

// Subtítulos por lección (WCAG 2.1 §1.2.2, nivel A). Viven en su propia tabla
// para no viajar en la lista de lecciones del curso: solo se pide el de la
// lección que se está viendo. Ver migración 065.

export async function obtenerSubtitulos(leccionId) {
  if (!leccionId) return null
  const { data, error } = await supabase
    .from('leccion_subtitulos')
    .select('idioma, contenido_vtt')
    .eq('leccion_id', leccionId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function guardarSubtitulos(leccionId, contenidoVtt, idioma = 'es') {
  const { error } = await supabase
    .from('leccion_subtitulos')
    .upsert(
      { leccion_id: leccionId, contenido_vtt: contenidoVtt, idioma },
      { onConflict: 'leccion_id' }
    )
  if (error) throw error
}

export async function borrarSubtitulos(leccionId) {
  const { error } = await supabase.from('leccion_subtitulos').delete().eq('leccion_id', leccionId)
  if (error) throw error
}

/** Lecciones de video sin subtítulos: el informe de conformidad. */
export async function leccionesSinSubtitulos() {
  const { data, error } = await supabase.from('v_lecciones_sin_subtitulos').select('*').limit(1000)
  if (error) throw error
  return data || []
}
