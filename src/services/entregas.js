import { supabase } from '@/lib/supabase.js'

const BUCKET = 'entregas'

/* ── Lado alumno ───────────────────────────────────── */

// Sube el archivo al bucket y registra la entrega vía RPC (que valida
// tipo, tamaño, inscripción y versiona la entrega anterior).
export async function subirEntrega({ cursoId, leccionId, file }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const limpio = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const path = `${cursoId}/${leccionId}/${session.user.id}/${Date.now()}-${limpio}`

  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (upError) throw upError

  const { data, error } = await supabase.rpc('registrar_entrega', {
    p_leccion: leccionId,
    p_path: path,
    p_nombre: file.name,
    p_mime: file.type || null,
    p_bytes: file.size,
  })
  if (error) {
    // La RPC rechazó (tipo/tamaño): no dejamos el archivo huérfano.
    await supabase.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => {})
    throw error
  }
  return data
}

export async function fetchMiEntrega(leccionId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null
  const { data, error } = await supabase
    .from('entregas_leccion')
    .select('*')
    .eq('leccion_id', leccionId)
    .eq('user_id', session.user.id)
    .eq('vigente', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMiHistorial(leccionId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return []
  const { data, error } = await supabase
    .from('entregas_leccion')
    .select('*')
    .eq('leccion_id', leccionId)
    .eq('user_id', session.user.id)
    .order('version', { ascending: false })
  if (error) throw error
  return data || []
}

/* ── Compartido ────────────────────────────────────── */

export async function urlDescargaEntrega(path, segundos = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos)
  if (error) throw error
  return data.signedUrl
}

/* ── Lado instructor ───────────────────────────────── */

export async function fetchEntregasCurso(cursoId, { estado = null, soloVigentes = true } = {}) {
  let q = supabase
    .from('entregas_leccion')
    .select(
      '*, perfiles!entregas_leccion_user_id_fkey(nombres, apellido_paterno, correo), lecciones(titulo)'
    )
    .eq('curso_id', cursoId)
    .order('creado_en', { ascending: false })
    .limit(200)
  if (soloVigentes) q = q.eq('vigente', true)
  if (estado) q = q.eq('estado', estado)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// estado: pendiente | revisada | aprobada | rechazada
export async function revisarEntrega(entregaId, estado, comentario = null) {
  const { data, error } = await supabase.rpc('revisar_entrega', {
    p_entrega: entregaId,
    p_estado: estado,
    p_comentario: comentario,
  })
  if (error) throw error
  return data
}

/* ── Tareas (Fase K) ───────────────────────────────── */

export async function crearTarea(tarea) {
  const { data, error } = await supabase.from('tareas').insert(tarea).select().single()
  if (error) throw error
  return data
}

export async function actualizarTarea(tareaId, datos) {
  const { data, error } = await supabase
    .from('tareas')
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq('id', tareaId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarTarea(tareaId) {
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId)
  if (error) throw error
}

export async function listarTareasPorCurso(cursoId) {
  const { data, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('curso_id', cursoId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

/* ── Entregas (Fase K) ──────────────────────────────── */

export async function crearEntrega(tareaId, userId, { texto, archivos, comentario }) {
  const { data: entrega, error: err1 } = await supabase
    .from('entregas')
    .insert({
      tarea_id: tareaId,
      user_id: userId,
      estado: 'entregada',
      version_actual: 1,
      entregado_en: new Date().toISOString(),
    })
    .select()
    .single()
  if (err1) throw err1

  const { error: err2 } = await supabase.from('entrega_versiones').insert({
    entrega_id: entrega.id,
    numero_version: 1,
    texto,
    archivos,
    comentario_alumno: comentario,
    entregado_en: new Date().toISOString(),
  })
  if (err2) throw err2

  return entrega
}

export async function nuevaVersion(entregaId, { texto, archivos, comentario }) {
  const { data: entrega, error: err1 } = await supabase
    .from('entregas')
    .select('version_actual')
    .eq('id', entregaId)
    .single()
  if (err1) throw err1

  const nuevaVersion = (entrega.version_actual || 0) + 1

  const { error: err2 } = await supabase.from('entrega_versiones').insert({
    entrega_id: entregaId,
    numero_version: nuevaVersion,
    texto,
    archivos,
    comentario_alumno: comentario,
    entregado_en: new Date().toISOString(),
  })
  if (err2) throw err2

  const { data, error: err3 } = await supabase
    .from('entregas')
    .update({
      version_actual: nuevaVersion,
      estado: 'entregada',
      entregado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', entregaId)
    .select()
    .single()
  if (err3) throw err3

  return data
}

export async function obtenerEntrega(tareaId, userId) {
  const { data, error } = await supabase
    .from('entregas')
    .select('*, entrega_versiones(*), calificaciones(*)')
    .eq('tarea_id', tareaId)
    .eq('user_id', userId)
    .single()
  if (error) throw error
  return data
}

export async function listarEntregasPorTarea(tareaId) {
  const { data, error } = await supabase
    .from('entregas')
    .select(
      '*, perfiles!entregas_user_id_fkey(nombres, apellido_paterno, correo), entrega_versiones(*)'
    )
    .eq('tarea_id', tareaId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function calificarEntrega(
  entregaId,
  { calificaciones: cals, comentario, puntajeFinal }
) {
  const { error: err1 } = await supabase.from('calificaciones').upsert(
    cals.map((c) => ({
      entrega_id: entregaId,
      criterio_id: c.criterio_id,
      nivel_id: c.nivel_id || null,
      puntaje: c.puntaje,
      comentario: c.comentario || null,
    }))
  )
  if (err1) throw err1

  const { data, error: err2 } = await supabase
    .from('entregas')
    .update({
      estado: 'calificada',
      calificado_en: new Date().toISOString(),
      puntaje_final: puntajeFinal,
      comentario_instructor: comentario ? { comentario } : null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', entregaId)
    .select()
    .single()
  if (err2) throw err2

  return data
}

export async function devolverEntrega(entregaId, comentario) {
  const { data, error } = await supabase
    .from('entregas')
    .update({
      estado: 'devuelta',
      comentario_instructor: comentario ? { comentario } : null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', entregaId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function subirArchivo(tareaId, userId, version, file) {
  const limpio = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const path = `entregas/${tareaId}/${userId}/v${version}/${limpio}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error

  return path
}
