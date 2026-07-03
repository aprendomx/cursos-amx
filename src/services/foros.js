import { supabase } from '@/lib/supabase.js'

// Ventana de edición de contenido propio (espejo de la policy RLS).
export const FORO_VENTANA_EDICION_MIN = 15

export function dentroDeVentanaEdicion(item) {
  if (!item?.creado_en) return false
  return Date.now() - new Date(item.creado_en).getTime() < FORO_VENTANA_EDICION_MIN * 60 * 1000
}

/* ── Foros ─────────────────────────────────────────── */

export async function fetchForosCurso(cursoId) {
  const { data, error } = await supabase
    .from('foros')
    .select('*, foro_hilos(count)')
    .eq('curso_id', cursoId)
    .order('orden')
    .order('creado_en')
  if (error) throw error
  return (data || []).map((f) => ({
    ...f,
    hilos_count: f.foro_hilos?.[0]?.count ?? 0,
  }))
}

// Solo instructores del curso (y admin) — RLS lo garantiza.
export async function crearForo({ cursoId, titulo, descripcion = '', orden = 0 }) {
  const { data, error } = await supabase
    .from('foros')
    .insert({ curso_id: cursoId, titulo, descripcion, orden })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarForo(foroId) {
  const { error } = await supabase.from('foros').delete().eq('id', foroId)
  if (error) throw error
}

/* ── Hilos ─────────────────────────────────────────── */

export async function fetchHilos(foroId) {
  const { data, error } = await supabase
    .from('foro_hilos')
    .select('*, perfiles(nombres, apellido_paterno), foro_respuestas(count)')
    .eq('foro_id', foroId)
    .order('fijado', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data || []).map((h) => ({
    ...h,
    respuestas_count: h.foro_respuestas?.[0]?.count ?? 0,
  }))
}

export async function crearHilo(foroId, titulo, cuerpo) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')
  const { data, error } = await supabase
    .from('foro_hilos')
    .insert({ foro_id: foroId, autor_id: session.user.id, titulo, cuerpo })
    .select('*, perfiles(nombres, apellido_paterno)')
    .single()
  if (error) throw error
  return data
}

// La ventana de 15 min la valida RLS; aquí solo reportamos el error.
export async function editarHilo(hiloId, { titulo, cuerpo }) {
  const { data, error } = await supabase
    .from('foro_hilos')
    .update({ titulo, cuerpo })
    .eq('id', hiloId)
    .select()
    .single()
  if (error) throw error
  return data
}

/* ── Respuestas ────────────────────────────────────── */

export async function fetchRespuestas(hiloId) {
  const { data, error } = await supabase
    .from('foro_respuestas')
    .select('*, perfiles(nombres, apellido_paterno)')
    .eq('hilo_id', hiloId)
    .order('creado_en')
    .limit(500)
  if (error) throw error
  return data || []
}

export async function crearRespuesta(hiloId, cuerpo, respuestaPadreId = null) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')
  const { data, error } = await supabase
    .from('foro_respuestas')
    .insert({
      hilo_id: hiloId,
      autor_id: session.user.id,
      cuerpo,
      respuesta_padre_id: respuestaPadreId,
    })
    .select('*, perfiles(nombres, apellido_paterno)')
    .single()
  if (error) throw error
  return data
}

export async function editarRespuesta(respuestaId, cuerpo) {
  const { data, error } = await supabase
    .from('foro_respuestas')
    .update({ cuerpo })
    .eq('id', respuestaId)
    .select()
    .single()
  if (error) throw error
  return data
}

/* ── Moderación ────────────────────────────────────── */

// tipo: 'hilo' | 'respuesta'
// acciones hilo: ocultar|mostrar|fijar|quitar_fijado|eliminar
// acciones respuesta: ocultar|mostrar|destacar|quitar_destacado|eliminar
export async function moderarForo(tipo, id, accion) {
  const { error } = await supabase.rpc('moderar_foro', {
    p_tipo: tipo,
    p_id: id,
    p_accion: accion,
  })
  if (error) throw error
}
