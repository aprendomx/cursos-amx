import { onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

// sesionId null → chat del curso; con valor → chat del aula virtual.
export async function fetchMensajes(cursoId, { sesionId = null, limit = 100 } = {}) {
  let q = supabase
    .from('mensajes_chat')
    .select('*, perfiles(nombres, apellido_paterno)')
    .eq('curso_id', cursoId)
    .order('creado_en', { ascending: true })
    .limit(limit)
  q = sesionId ? q.eq('sesion_id', sesionId) : q.is('sesion_id', null)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function enviarMensaje({ cursoId, sesionId = null, contenido }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')
  const { data, error } = await supabase
    .from('mensajes_chat')
    .insert({
      curso_id: cursoId,
      sesion_id: sesionId,
      user_id: session.user.id,
      contenido,
    })
    .select('*, perfiles(nombres, apellido_paterno)')
    .single()
  if (error) throw error
  return data
}

// Solo instructores del curso; escribe log_moderacion en la misma transacción.
export async function eliminarMensajeChat(mensajeId) {
  const { error } = await supabase.rpc('eliminar_mensaje_chat', { p_mensaje: mensajeId })
  if (error) throw error
}

// Lista mínima de participantes (alumnos + instructores) para las
// @menciones. RPC security definer: los alumnos no pueden leer
// inscripciones ajenas directamente.
export async function fetchParticipantesCurso(cursoId) {
  const { data, error } = await supabase.rpc('participantes_curso', { p_curso: cursoId })
  if (error) throw error
  return data || []
}

// INSERT y DELETE en vivo del chat del curso/sesión.
export function useChatRealtime(cursoId, sesionId, { onInsert, onDelete } = {}) {
  const channel = supabase
    .channel(`chat:${cursoId}:${sesionId || 'curso'}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_chat',
        filter: `curso_id=eq.${cursoId}`,
      },
      async (payload) => {
        const fila = payload.new
        // El canal es por curso; descartar lo que no es de este chat.
        if ((fila.sesion_id || null) !== (sesionId || null)) return
        const { data } = await supabase
          .from('mensajes_chat')
          .select('*, perfiles(nombres, apellido_paterno)')
          .eq('id', fila.id)
          .single()
        if (data) onInsert?.(data)
      }
    )
    .on(
      'postgres_changes',
      // DELETE llega con la fila completa (replica identity full, migración 027)
      { event: 'DELETE', schema: 'public', table: 'mensajes_chat' },
      (payload) => {
        if (payload.old?.curso_id && payload.old.curso_id !== cursoId) return
        onDelete?.(payload.old?.id)
      }
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })

  return channel
}
