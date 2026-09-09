// src/lib/leccionAbierta.js
// ¿Cuál es la primera lección de un curso publicado? El espejo frontend de la
// regla de supabase/functions/_shared/leccionAbierta.ts.
//
// OJO CON EL ALCANCE: esto solo informa la navegación del modo invitado (que
// el enrutador no rebote al login una pantalla que sí puede montarse). La
// autorización REAL vive en las funciones que firman URLs de contenido, que
// verifican lo mismo con el service role.
import { sbSelect } from '@/lib/sbRest'

/**
 * Devuelve el id de la primera lección (módulo de menor orden, dentro de él
 * la lección de menor orden) si el curso existe y está publicado; null en
 * cualquier otro caso. Consulta con la anon key: cursos y lecciones ya son
 * legibles públicamente.
 */
export async function primeraLeccionAbierta(cursoId) {
  if (!cursoId || !/^[0-9a-f]{8}-/.test(cursoId)) return null
  try {
    const { data: cursos } = await sbSelect(`cursos?select=publicado&id=eq.${cursoId}`)
    if (cursos?.[0]?.publicado !== true) return null

    const { data: lecciones } = await sbSelect(
      `lecciones?select=id,orden,modulos!inner(orden,curso_id)&modulos.curso_id=eq.${cursoId}&limit=1000`
    )
    if (!lecciones?.length) return null
    lecciones.sort((a, b) => a.modulos.orden - b.modulos.orden || a.orden - b.orden)
    return lecciones[0].id
  } catch {
    return null
  }
}
