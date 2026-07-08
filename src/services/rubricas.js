import { supabase } from '@/lib/supabase.js'

export async function crearRubrica(tareaId, { tipo, titulo, puntaje_maximo, criterios, niveles }) {
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

export async function listarRubricas() {
  const { data, error: err } = await supabase
    .from('rubricas')
    .select('*, rubrica_criterios(*), rubrica_niveles(*)')
    .order('creado_en', { ascending: false })
  if (err) throw err
  return data || []
}

export async function eliminarRubrica(id) {
  const { error: err } = await supabase.from('rubricas').delete().eq('id', id)
  if (err) throw err
}

export async function obtenerRubrica(tareaId) {
  const { data: rubrica, error: err1 } = await supabase
    .from('rubricas')
    .select('*, rubrica_criterios(*), rubrica_niveles(*)')
    .eq('tarea_id', tareaId)
    .single()
  if (err1 && err1.code !== 'PGRST116') throw err1
  return rubrica || null
}

export async function actualizarRubrica(rubricaId, { titulo, puntaje_maximo, criterios, niveles }) {
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
