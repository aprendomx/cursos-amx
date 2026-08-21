// src/services/documentosInstitucionales.js
// Documentos institucionales versionados: aviso de privacidad, términos de uso
// y contacto. Tabla documento_versiones (migración 073).
//
// OJO: no confundir con services/documentos.js, que es otra cosa — los
// archivos adjuntos a una lección.
//
// Reglas del modelo que conviene tener presentes al leer esto:
//   * borrador = fila con publicado_en nulo, como mucho una por documento;
//   * vigente  = la de mayor `version` entre las publicadas (vista
//                v_documento_vigente);
//   * publicar es irreversible: un trigger impide modificar o borrar una
//     versión ya publicada.
import { supabase } from '@/lib/supabase.js'
import { mapSupabaseError } from '@/lib/errors'

export const SLUGS = Object.freeze({
  AVISO: 'aviso-privacidad',
  TERMINOS: 'terminos-uso',
  CONTACTO: 'contacto',
})

export const DOCUMENTOS = Object.freeze([
  { slug: SLUGS.AVISO, titulo: 'Aviso de privacidad', ruta: '/aviso-privacidad' },
  { slug: SLUGS.TERMINOS, titulo: 'Términos de uso', ruta: '/terminos-uso' },
  { slug: SLUGS.CONTACTO, titulo: 'Contacto', ruta: '/contacto' },
])

export function tituloDe(slug) {
  return DOCUMENTOS.find((d) => d.slug === slug)?.titulo || slug
}

/** La versión vigente de un documento, o null si aún no se ha publicado. */
export async function getVigente(slug) {
  const { data, error } = await supabase
    .from('v_documento_vigente')
    .select('slug, version, contenido, publicado_en, requiere_reaceptacion')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw mapSupabaseError(error)
  return data || null
}

/** El borrador sin publicar, o null. Solo legible por administradores. */
export async function getBorrador(slug) {
  const { data, error } = await supabase
    .from('documento_versiones')
    .select('slug, version, contenido, creado_en, actualizado_en')
    .eq('slug', slug)
    .is('publicado_en', null)
    .maybeSingle()
  if (error) throw mapSupabaseError(error)
  return data || null
}

/** Historial de versiones publicadas, de la más reciente a la más antigua. */
export async function getHistorial(slug) {
  const { data, error } = await supabase
    .from('documento_versiones')
    .select('slug, version, contenido, publicado_en, requiere_reaceptacion, publicado_por')
    .eq('slug', slug)
    .not('publicado_en', 'is', null)
    .order('version', { ascending: false })
  if (error) throw mapSupabaseError(error)
  return data || []
}

/**
 * Guarda el borrador. No toca la versión que ven las personas: mientras no se
 * publique, la vigente sigue siendo la misma.
 */
export async function guardarBorrador(slug, contenido) {
  const existente = await getBorrador(slug)

  if (existente) {
    const { error } = await supabase
      .from('documento_versiones')
      .update({ contenido, actualizado_en: new Date().toISOString() })
      .eq('slug', slug)
      .eq('version', existente.version)
    if (error) throw mapSupabaseError(error)
    return existente.version
  }

  // Sin borrador: el siguiente número va después de la última publicada.
  const version = (await ultimaVersion(slug)) + 1
  const { error } = await supabase.from('documento_versiones').insert({ slug, version, contenido })
  if (error) throw mapSupabaseError(error)
  return version
}

/**
 * Un documento de Tiptap "vacío" no es null: es un doc con un párrafo sin
 * texto, que es lo que deja el editor al borrarlo todo.
 */
export function estaVacio(contenido) {
  if (!contenido || typeof contenido !== 'object') return true
  const nodos = contenido.content || []
  return !nodos.some((n) => JSON.stringify(n).includes('"text"'))
}

async function ultimaVersion(slug) {
  const { data, error } = await supabase
    .from('documento_versiones')
    .select('version')
    .eq('slug', slug)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw mapSupabaseError(error)
  return data?.version || 0
}

/**
 * Publica el borrador. Es irreversible por diseño: a partir de aquí esa
 * versión no se puede modificar ni borrar.
 * @param {boolean} requiereReaceptacion si el cambio obliga a volver a aceptar
 */
export async function publicar(slug, { requiereReaceptacion = false } = {}) {
  const borrador = await getBorrador(slug)
  if (!borrador) throw new Error('No hay borrador que publicar.')
  if (estaVacio(borrador.contenido)) throw new Error('No se publica un documento vacío.')

  const { data: sesion } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('documento_versiones')
    .update({
      publicado_en: new Date().toISOString(),
      requiere_reaceptacion: requiereReaceptacion,
      publicado_por: sesion?.user?.id || null,
    })
    .eq('slug', slug)
    .eq('version', borrador.version)
  if (error) throw mapSupabaseError(error)
  return borrador.version
}

// ---------- Consentimiento ----------

/**
 * Registra la aceptación del aviso. El número de versión NO viaja desde aquí:
 * lo resuelve la función en la base, para que nadie pueda declararse al día
 * con una versión que nunca vio.
 */
export async function aceptarAviso() {
  const { data, error } = await supabase.rpc('aceptar_aviso_vigente')
  if (error) throw mapSupabaseError(error)
  return data
}

/** ¿A esta persona hay que volver a pedirle que acepte el aviso? */
export async function requiereReaceptacion() {
  const { data, error } = await supabase.rpc('aviso_requiere_reaceptacion')
  if (error) throw mapSupabaseError(error)
  return data === true
}

/** Resumen para el panel: cuántas personas están al día y cuántas pendientes. */
export async function estadoConsentimiento() {
  const vigente = await getVigente(SLUGS.AVISO)
  if (!vigente) return { vigente: null, alDia: 0, pendientes: 0, sinAceptar: 0 }

  const { data, error } = await supabase
    .from('perfiles')
    .select('aviso_version_aceptada')
    .eq('aviso_privacidad', true)
  if (error) throw mapSupabaseError(error)

  const filas = data || []
  return {
    vigente: vigente.version,
    alDia: filas.filter((f) => f.aviso_version_aceptada === vigente.version).length,
    pendientes: filas.filter(
      (f) => f.aviso_version_aceptada != null && f.aviso_version_aceptada < vigente.version
    ).length,
    sinAceptar: filas.filter((f) => f.aviso_version_aceptada == null).length,
  }
}
