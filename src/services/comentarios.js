import { ref, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

export async function fetchComentarios(leccionId) {
  const { data, error } = await supabase
    .from('comentarios')
    .select('*, perfiles(nombres, apellido_paterno, dependencias(siglas))')
    .eq('leccion_id', leccionId)
    .order('creado_en', { ascending: true })
    .limit(50)
  if (error) throw error
  return data
}

export async function enviarComentario(leccionId, contenido) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const { data, error } = await supabase
    .from('comentarios')
    .insert({
      user_id: session.user.id,
      leccion_id: leccionId,
      contenido,
    })
    .select('*, perfiles(nombres, apellido_paterno, dependencias(siglas))')
    .single()
  if (error) throw error
  return data
}

export function useComentariosRealtime(leccionId) {
  const nuevosComentarios = ref([])

  const channel = supabase
    .channel(`comentarios:${leccionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comentarios',
        filter: `leccion_id=eq.${leccionId}`,
      },
      async (payload) => {
        // Fetch el comentario completo con perfil
        const { data } = await supabase
          .from('comentarios')
          .select('*, perfiles(nombres, apellido_paterno, dependencias(siglas))')
          .eq('id', payload.new.id)
          .single()
        if (data) {
          nuevosComentarios.value.push(data)
        }
      }
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })

  return { nuevosComentarios }
}
