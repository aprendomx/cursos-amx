import { onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

export const SESION_ESTADO_LABEL = {
  programada: 'Programada',
  en_vivo: 'En vivo',
  terminada: 'Terminada',
}

export async function fetchSesionesCurso(cursoId) {
  const { data, error } = await supabase
    .from('sesiones_virtuales')
    .select('*, perfiles!sesiones_virtuales_instructor_id_fkey(nombres, apellido_paterno)')
    .eq('curso_id', cursoId)
    .order('programada_en', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

// Solo instructores del curso (RLS). La sesión nace 'programada';
// el room id lo genera la RPC al iniciar.
export async function crearSesion({ cursoId, titulo, programadaEn }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')
  const { data, error } = await supabase
    .from('sesiones_virtuales')
    .insert({
      curso_id: cursoId,
      instructor_id: session.user.id,
      titulo,
      programada_en: programadaEn,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarSesion(sesionId) {
  const { error } = await supabase.from('sesiones_virtuales').delete().eq('id', sesionId)
  if (error) throw error
}

export async function iniciarSesion(sesionId) {
  const { data, error } = await supabase.rpc('iniciar_sesion_virtual', { p_sesion: sesionId })
  if (error) throw error
  return data
}

export async function terminarSesion(sesionId, grabacionUrl = null) {
  const { data, error } = await supabase.rpc('terminar_sesion_virtual', {
    p_sesion: sesionId,
    p_grabacion_url: grabacionUrl,
  })
  if (error) throw error
  return data
}

// Cambios en vivo de las sesiones del curso (la tabla está en la
// publicación supabase_realtime desde la migración 026).
export function useSesionesRealtime(cursoId, onCambio) {
  const channel = supabase
    .channel(`sesiones:${cursoId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sesiones_virtuales',
        filter: `curso_id=eq.${cursoId}`,
      },
      (payload) => onCambio?.(payload)
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })

  return channel
}
