// supabase/functions/_shared/leccionAbierta.ts
// La única superficie de contenido abierta a visitantes SIN sesión: la primera
// lección de un curso publicado (change portada-cursos-primero, decisión 4).
//
// La barrera real del contenido son las URLs firmadas que emiten
// hls-playlist-url y documento-url; este módulo es la regla con la que esas
// funciones deciden si un anónimo pasa. Se comprueba contra la base con el
// service role: el identificador que mande el cliente no otorga nada por sí
// mismo, y cualquier duda —lección inexistente, curso sin publicar, error de
// consulta— responde false: cerrado por defecto.

/**
 * Cliente supabase con service role (inyectable en tests). `any` a propósito,
 * como en auth.ts: tipar la cadena de PostgREST obligaría al fake de los tests
 * a imitar PostgrestBuilder entero.
 */
export interface ClienteConsulta {
  // deno-lint-ignore no-explicit-any
  from(table: string): any
}

interface FilaLeccion {
  id: string
  orden: number
  modulos?: { orden: number; curso_id: string; cursos?: { id: string; publicado: boolean } }
}

/**
 * ¿Tiene el JWT el rol `authenticated`? La anon key también es un JWT (rol
 * `anon`), así que «hay Bearer» no significa «hay sesión». No verifica la
 * firma a propósito: la verificación real la hace PostgREST en el camino
 * autenticado; aquí solo se decide QUÉ camino toma la petición, y el camino
 * anónimo no concede nada que el rol anon no tenga ya.
 */
export function esJwtDeUsuario(jwt: string | null | undefined): boolean {
  if (!jwt) return false
  try {
    const payload = jwt.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return claims?.role === 'authenticated'
  } catch {
    return false
  }
}

/**
 * ¿Es `leccionId` la primera lección (módulo de menor orden, dentro de él la
 * lección de menor orden) de un curso PUBLICADO? Misma regla de orden que usa
 * el reproductor al listar.
 */
export async function esPrimeraLeccionAbierta(
  admin: ClienteConsulta,
  leccionId: string | null | undefined
): Promise<boolean> {
  if (!leccionId) return false
  try {
    const { data, error } = await admin
      .from('lecciones')
      .select('id, orden, modulos!inner(orden, curso_id, cursos!inner(id, publicado))')
      .eq('id', leccionId)
      .single()
    const fila = data as FilaLeccion | null
    if (error || !fila) return false

    const curso = fila.modulos?.cursos
    if (!curso?.publicado) return false

    const { data: todas, error: e2 } = await admin
      .from('lecciones')
      .select('id, orden, modulos!inner(orden, curso_id)')
      .eq('modulos.curso_id', curso.id)
      .limit(1000)
    const filas = (todas as FilaLeccion[] | null) ?? []
    if (e2 || filas.length === 0) return false

    filas.sort(
      (a, b) => (a.modulos?.orden ?? 0) - (b.modulos?.orden ?? 0) || (a.orden ?? 0) - (b.orden ?? 0)
    )
    return filas[0].id === leccionId
  } catch {
    return false
  }
}
