import { supabase } from '@/lib/supabase.js'

// Catálogos de constancia: funcionarios que firman y diseños visuales.
// La configuración por curso vive en curso_constancia / curso_firmantes.
// Ver la migración 070 para el porqué de la separación.

const BUCKET_FIRMAS = 'constancia-firmas'
const BUCKET_DISENOS = 'constancia-disenos'

/* ── Funcionarios ─────────────────────────────────────────── */

export async function listarFuncionarios({ soloActivos = false } = {}) {
  let q = supabase
    .from('funcionarios')
    .select('id, nombre, cargo, firma_path, activo')
    .order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function guardarFuncionario(funcionario) {
  const payload = {
    nombre: funcionario.nombre?.trim(),
    cargo: funcionario.cargo?.trim(),
    firma_path: funcionario.firma_path || null,
    activo: funcionario.activo !== false,
    actualizado_en: new Date().toISOString(),
  }
  const q = funcionario.id
    ? supabase.from('funcionarios').update(payload).eq('id', funcionario.id)
    : supabase.from('funcionarios').insert(payload)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

/**
 * Dar de baja en vez de borrar.
 *
 * Borrar falla a propósito si el funcionario ya figura como firmante de algún
 * curso (ON DELETE RESTRICT). La baja conserva el histórico y no toca las
 * constancias ya emitidas, que llevan su propia copia congelada.
 */
export async function darDeBajaFuncionario(id) {
  const { error } = await supabase.from('funcionarios').update({ activo: false }).eq('id', id)
  if (error) throw error
}

/* ── Firmas escaneadas ────────────────────────────────────── */

/** Sube la firma y devuelve su ruta. El nombre lleva uuid para no ser adivinable. */
export async function subirFirma(archivo) {
  const ext = (archivo.name.split('.').pop() || 'png').toLowerCase()
  const ruta = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_FIRMAS)
    .upload(ruta, archivo, { upsert: false, contentType: archivo.type })
  if (error) throw error
  return ruta
}

export function urlFirma(path) {
  if (!path) return null
  // Ruta del tema: se sirve tal cual, sin pasar por Storage.
  if (path.startsWith('/')) return path
  return supabase.storage.from(BUCKET_FIRMAS).getPublicUrl(path).data.publicUrl
}

/* ── Diseños ──────────────────────────────────────────────── */

export async function listarDisenos({ soloActivos = false } = {}) {
  let q = supabase.from('constancia_disenos').select('*').order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function guardarDiseno(diseno) {
  const payload = {
    clave: diseno.clave?.trim(),
    nombre: diseno.nombre?.trim(),
    descripcion: diseno.descripcion || null,
    fondo_path: diseno.fondo_path || null,
    pleca_path: diseno.pleca_path || null,
    logo_path: diseno.logo_path || null,
    color_primario: diseno.color_primario || null,
    color_texto: diseno.color_texto || null,
    activo: diseno.activo !== false,
  }
  const q = diseno.id
    ? supabase.from('constancia_disenos').update(payload).eq('id', diseno.id)
    : supabase.from('constancia_disenos').insert(payload)
  const { data, error } = await q.select().single()
  if (error) throw error
  return data
}

export async function subirAssetDiseno(archivo) {
  const ext = (archivo.name.split('.').pop() || 'png').toLowerCase()
  const ruta = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_DISENOS)
    .upload(ruta, archivo, { upsert: false, contentType: archivo.type })
  if (error) throw error
  return ruta
}

export function urlAsset(path) {
  if (!path) return null
  if (path.startsWith('/')) return path
  return supabase.storage.from(BUCKET_DISENOS).getPublicUrl(path).data.publicUrl
}

/* ── Configuración por curso ──────────────────────────────── */

/** Configuración efectiva, con la herencia curso -> instalación ya resuelta. */
export async function configDeCurso(cursoId) {
  const { data, error } = await supabase.rpc('constancia_config', { p_curso: cursoId })
  if (error) throw error
  return data
}

/** Lo que el curso sobrescribe explícitamente (null = hereda). */
export async function overridesDeCurso(cursoId) {
  const { data, error } = await supabase
    .from('curso_constancia')
    .select('*')
    .eq('curso_id', cursoId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function guardarConfigCurso(cursoId, cambios) {
  const { error } = await supabase.from('curso_constancia').upsert(
    {
      curso_id: cursoId,
      diseno_id: cambios.diseno_id || null,
      lugar: cambios.lugar || null,
      texto_pre: cambios.texto_pre || null,
      texto_titulo: cambios.texto_titulo || null,
      texto_cuerpo: cambios.texto_cuerpo || null,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: 'curso_id' }
  )
  if (error) throw error
}

export async function firmantesDeCurso(cursoId) {
  const { data, error } = await supabase
    .from('curso_firmantes')
    .select('funcionario_id, orden, funcionarios(nombre, cargo, firma_path, activo)')
    .eq('curso_id', cursoId)
    .order('orden')
  if (error) throw error
  return data || []
}

/** Reemplaza la lista completa: es más simple y evita estados intermedios raros. */
export async function guardarFirmantesDeCurso(cursoId, funcionarioIds) {
  const { error: errDel } = await supabase.from('curso_firmantes').delete().eq('curso_id', cursoId)
  if (errDel) throw errDel
  if (!funcionarioIds.length) return
  const filas = funcionarioIds.map((id, i) => ({
    curso_id: cursoId,
    funcionario_id: id,
    orden: i + 1,
  }))
  const { error } = await supabase.from('curso_firmantes').insert(filas)
  if (error) throw error
}
