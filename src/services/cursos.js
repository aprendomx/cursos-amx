import { supabase } from '@/lib/supabase.js'
import { withCache, invalidateCache } from '@/composables/cache.js'

async function _fetchCursos() {
  const { data, error } = await supabase
    .from('cursos')
    .select('*')
    .eq('publicado', true)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export const fetchCursos = withCache(_fetchCursos, () => 'cursos:list')

async function _fetchCursoBySlug(slug) {
  const { data, error } = await supabase.from('cursos').select('*').eq('slug', slug).single()
  if (error) throw error
  return data
}

export const fetchCursoBySlug = withCache(_fetchCursoBySlug, (slug) => `cursos:slug:${slug}`)

async function _fetchCursoById(id) {
  const { data, error } = await supabase.from('cursos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export const fetchCursoById = withCache(_fetchCursoById, (id) => `cursos:id:${id}`)

async function _fetchModulos(cursoId) {
  const { data, error } = await supabase
    .from('modulos')
    .select('*')
    .eq('curso_id', cursoId)
    .order('orden')
  if (error) throw error
  return data
}

export const fetchModulos = withCache(_fetchModulos, (cursoId) => `modulos:${cursoId}`)

async function _fetchLecciones(moduloId) {
  const { data, error } = await supabase
    .from('lecciones')
    .select('*')
    .eq('modulo_id', moduloId)
    .order('orden')
  if (error) throw error
  return data
}

export const fetchLecciones = withCache(
  _fetchLecciones,
  (moduloId) => `lecciones:modulo:${moduloId}`
)

async function _fetchLeccionesByCurso(cursoId) {
  const { data, error } = await supabase
    .from('lecciones')
    .select('*, modulos!inner(curso_id, orden)')
    .eq('modulos.curso_id', cursoId)
    .order('orden')
  if (error) throw error
  return data
}

export const fetchLeccionesByCurso = withCache(
  _fetchLeccionesByCurso,
  (cursoId) => `lecciones:curso:${cursoId}`
)

// Admin: CRUD
export async function crearCurso(curso) {
  const { data, error } = await supabase.from('cursos').insert(curso).select().single()
  if (error) throw error
  invalidateCache(/^cursos:/)
  return data
}

export async function actualizarCurso(id, patch) {
  const { data, error } = await supabase.from('cursos').update(patch).eq('id', id).select().single()
  if (error) throw error
  invalidateCache(/^cursos:/)
  return data
}

export async function crearModulo(modulo) {
  const { data, error } = await supabase.from('modulos').insert(modulo).select().single()
  if (error) throw error
  invalidateCache(/^modulos:/)
  invalidateCache(/^lecciones:/)
  return data
}

export async function crearLeccion(leccion) {
  const { data, error } = await supabase.from('lecciones').insert(leccion).select().single()
  if (error) throw error
  invalidateCache(/^lecciones:/)
  return data
}

async function _fetchAllCursosAdmin() {
  const { data, error } = await supabase
    .from('cursos')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export const fetchAllCursosAdmin = withCache(_fetchAllCursosAdmin, () => 'cursos:admin:list')
