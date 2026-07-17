import { supabase } from '@/lib/supabase.js'

export type TipoRubrica = 'niveles' | 'puntaje_libre'

/** Fila de rubrica_criterios (Fase K). */
export interface RubricaCriterio {
  id?: string
  rubrica_id?: string
  titulo: string
  descripcion?: string | null
  orden?: number
  peso?: number
  puntaje_maximo?: number | null
}

/** Fila de rubrica_niveles (Fase K). */
export interface RubricaNivel {
  id?: string
  rubrica_id?: string
  etiqueta: string
  puntaje: number
  orden?: number
}

/** Fila de rubricas con relaciones embebidas. */
export interface Rubrica {
  id: string
  tarea_id: string
  tipo: TipoRubrica
  titulo: string
  puntaje_maximo: number
  creado_en?: string
  rubrica_criterios?: RubricaCriterio[]
  rubrica_niveles?: RubricaNivel[]
}

export interface RubricaInput {
  tipo: TipoRubrica
  titulo: string
  puntaje_maximo: number
  criterios: RubricaCriterio[]
  niveles?: RubricaNivel[]
}

export async function crearRubrica(
  tareaId: string,
  { tipo, titulo, puntaje_maximo, criterios, niveles }: RubricaInput
): Promise<Rubrica> {
  const { data: rubrica, error: err1 } = await supabase
    .from('rubricas')
    .insert({ tarea_id: tareaId, tipo, titulo, puntaje_maximo })
    .select()
    .single()
  if (err1) throw err1

  const criteriosConRubrica = criterios.map((c, i) => ({ ...c, rubrica_id: rubrica.id, orden: i }))
  const { error: err2 } = await supabase.from('rubrica_criterios').insert(criteriosConRubrica)
  if (err2) throw err2

  if (tipo === 'niveles' && niveles?.length) {
    const nivelesConRubrica = niveles.map((n, i) => ({ ...n, rubrica_id: rubrica.id, orden: i }))
    const { error: err3 } = await supabase.from('rubrica_niveles').insert(nivelesConRubrica)
    if (err3) throw err3
  }

  return rubrica
}

export async function listarRubricas(): Promise<Rubrica[]> {
  const { data, error: err } = await supabase
    .from('rubricas')
    .select('*, rubrica_criterios(*), rubrica_niveles(*)')
    .order('creado_en', { ascending: false })
  if (err) throw err
  return data || []
}

export async function eliminarRubrica(id: string): Promise<void> {
  const { error: err } = await supabase.from('rubricas').delete().eq('id', id)
  if (err) throw err
}

export async function obtenerRubrica(tareaId: string): Promise<Rubrica | null> {
  const { data: rubrica, error: err1 } = await supabase
    .from('rubricas')
    .select('*, rubrica_criterios(*), rubrica_niveles(*)')
    .eq('tarea_id', tareaId)
    .single()
  if (err1 && err1.code !== 'PGRST116') throw err1
  return rubrica || null
}

export async function actualizarRubrica(
  rubricaId: string,
  { titulo, puntaje_maximo, criterios, niveles }: Omit<RubricaInput, 'tipo'>
): Promise<void> {
  const { error: err1 } = await supabase
    .from('rubricas')
    .update({ titulo, puntaje_maximo })
    .eq('id', rubricaId)
  if (err1) throw err1

  await supabase.from('rubrica_criterios').delete().eq('rubrica_id', rubricaId)
  const criteriosConRubrica = criterios.map((c, i) => ({ ...c, rubrica_id: rubricaId, orden: i }))
  const { error: err2 } = await supabase.from('rubrica_criterios').insert(criteriosConRubrica)
  if (err2) throw err2

  await supabase.from('rubrica_niveles').delete().eq('rubrica_id', rubricaId)
  if (niveles?.length) {
    const nivelesConRubrica = niveles.map((n, i) => ({ ...n, rubrica_id: rubricaId, orden: i }))
    const { error: err3 } = await supabase.from('rubrica_niveles').insert(nivelesConRubrica)
    if (err3) throw err3
  }
}
