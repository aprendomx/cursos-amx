import { onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

export const SESION_ESTADO_LABEL = {
  programada: 'Programada',
  en_vivo: 'En vivo',
  terminada: 'Terminada',
}

// ── Legacy: sesiones con información de instructor ──
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

// ── Legacy: crear sesión (Jitsi por defecto) ──
export async function crearSesion({
  cursoId,
  titulo,
  programadaEn,
  descripcion,
  fin,
  plataforma = 'jitsi',
  moduloId,
}) {
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
      descripcion,
      fin,
      plataforma,
      modulo_id: moduloId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Nueva: crear sesión Zoom ──
export async function crearSesionZoom({
  cursoId,
  titulo,
  programadaEn,
  fin,
  descripcion,
  moduloId,
  zoomMeetingId,
  zoomJoinUrl,
}) {
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
      fin,
      descripcion,
      plataforma: 'zoom',
      modulo_id: moduloId,
      zoom_meeting_id: zoomMeetingId,
      zoom_join_url: zoomJoinUrl,
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

// ── RSVP ──
export async function confirmarRSVP(sesionId, userId) {
  const { error } = await supabase
    .from('sesiones_rsvp')
    .upsert(
      { sesion_id: sesionId, user_id: userId, estado: 'confirmado' },
      { onConflict: 'sesion_id,user_id' }
    )
  if (error) throw error
}

export async function cancelarRSVP(sesionId, userId) {
  const { error } = await supabase
    .from('sesiones_rsvp')
    .upsert(
      { sesion_id: sesionId, user_id: userId, estado: 'cancelado' },
      { onConflict: 'sesion_id,user_id' }
    )
  if (error) throw error
}

export async function listarRSVP(sesionId) {
  const { data, error } = await supabase
    .from('sesiones_rsvp')
    .select('*, perfiles(nombres, apellido_paterno)')
    .eq('sesion_id', sesionId)
  if (error) throw error
  return data || []
}

export async function marcarAsistencia(sesionId, userId, asistio) {
  const { error } = await supabase
    .from('sesiones_rsvp')
    .update({
      estado: asistio ? 'asistio' : 'no_asistio',
      asistio_en: new Date().toISOString(),
    })
    .eq('sesion_id', sesionId)
    .eq('user_id', userId)
  if (error) throw error
}

// ── Calendario unificado ──
export async function listarEventosCalendario(cursoId) {
  const { data, error } = await supabase
    .from('v_calendario_curso')
    .select('*')
    .eq('curso_id', cursoId)
    .order('fecha', { ascending: true })
  if (error) throw error
  return data || []
}

export async function exportarCalendarioICS(cursoId) {
  const eventos = await listarEventosCalendario(cursoId)
  return generarICS(eventos)
}

function generarICS(eventos) {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Cursos AMX//ES\n'
  for (const e of eventos) {
    const dtStart = e.fecha ? e.fecha.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : ''
    const dtEnd = e.fin ? e.fin.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : ''
    ics += `BEGIN:VEVENT\nSUMMARY:${escapeICS(e.titulo)}\n`
    ics += `DTSTART:${dtStart}\n`
    if (dtEnd) ics += `DTEND:${dtEnd}\n`
    ics += `END:VEVENT\n`
  }
  ics += 'END:VCALENDAR'
  return ics
}

function escapeICS(str) {
  if (!str) return ''
  return str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

// ── Realtime ──
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
