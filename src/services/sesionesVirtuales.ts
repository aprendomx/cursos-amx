import { onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

export type EstadoSesion = 'programada' | 'en_vivo' | 'terminada'
export type PlataformaSesion = 'jitsi' | 'zoom'
export type EstadoRsvp = 'confirmado' | 'cancelado' | 'asistio' | 'no_asistio'

export const SESION_ESTADO_LABEL: Record<EstadoSesion, string> = {
  programada: 'Programada',
  en_vivo: 'En vivo',
  terminada: 'Terminada',
}

/** Fila de sesiones_virtuales. */
export interface SesionVirtual {
  id: string
  curso_id: string
  instructor_id: string
  modulo_id: string | null
  titulo: string
  descripcion: string | null
  estado: EstadoSesion
  plataforma: PlataformaSesion
  programada_en: string
  fin: string | null
  zoom_meeting_id: string | null
  zoom_join_url: string | null
  grabacion_url?: string | null
}

export interface NuevaSesion {
  cursoId: string
  titulo: string
  programadaEn: string
  descripcion?: string | null
  fin?: string | null
  plataforma?: PlataformaSesion
  moduloId?: string | null
}

export interface EventoCalendario {
  curso_id: string
  tipo: string
  titulo: string
  fecha: string
  fin: string | null
}

// ── Legacy: sesiones con información de instructor ──
export async function fetchSesionesCurso(cursoId: string): Promise<SesionVirtual[]> {
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
}: NuevaSesion): Promise<SesionVirtual> {
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
}: NuevaSesion & { zoomMeetingId: string; zoomJoinUrl: string }): Promise<SesionVirtual> {
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

export async function eliminarSesion(sesionId: string): Promise<void> {
  const { error } = await supabase.from('sesiones_virtuales').delete().eq('id', sesionId)
  if (error) throw error
}

export async function iniciarSesion(sesionId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('iniciar_sesion_virtual', { p_sesion: sesionId })
  if (error) throw error
  return data
}

export async function terminarSesion(
  sesionId: string,
  grabacionUrl: string | null = null
): Promise<unknown> {
  const { data, error } = await supabase.rpc('terminar_sesion_virtual', {
    p_sesion: sesionId,
    p_grabacion_url: grabacionUrl,
  })
  if (error) throw error
  return data
}

// ── RSVP ──
export async function confirmarRSVP(sesionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('sesiones_rsvp')
    .upsert(
      { sesion_id: sesionId, user_id: userId, estado: 'confirmado' },
      { onConflict: 'sesion_id,user_id' }
    )
  if (error) throw error
}

export async function cancelarRSVP(sesionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('sesiones_rsvp')
    .upsert(
      { sesion_id: sesionId, user_id: userId, estado: 'cancelado' },
      { onConflict: 'sesion_id,user_id' }
    )
  if (error) throw error
}

export async function listarRSVP(sesionId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('sesiones_rsvp')
    .select('*, perfiles(nombres, apellido_paterno)')
    .eq('sesion_id', sesionId)
  if (error) throw error
  return data || []
}

export async function marcarAsistencia(
  sesionId: string,
  userId: string,
  asistio: boolean
): Promise<void> {
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
export async function listarEventosCalendario(cursoId: string): Promise<EventoCalendario[]> {
  const { data, error } = await supabase
    .from('v_calendario_curso')
    .select('*')
    .eq('curso_id', cursoId)
    .order('fecha', { ascending: true })
  if (error) throw error
  return data || []
}

export async function exportarCalendarioICS(cursoId: string): Promise<string> {
  const eventos = await listarEventosCalendario(cursoId)
  return generarICS(eventos)
}

function generarICS(eventos: EventoCalendario[]): string {
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

function escapeICS(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

// ── Realtime ──
export function useSesionesRealtime(
  cursoId: string,
  onCambio?: (payload: unknown) => void
): unknown {
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
      (payload: unknown) => onCambio?.(payload)
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })

  return channel
}
