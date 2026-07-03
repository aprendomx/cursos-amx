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
