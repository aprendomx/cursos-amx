import { supabase } from '@/lib/supabase.js'

const PAGE_SIZE = 25

// Lista perfiles con búsqueda server-side (nombre o correo) y paginación.
// La RLS de `perfiles` permite al admin leer todos los registros.
export async function listarUsuarios({ q = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const from = page * pageSize
  const to = from + pageSize - 1
  let query = supabase
    .from('perfiles')
    .select(
      'id, nombres_completos, correo, es_admin, es_instructor, actualizado_en, dependencias(siglas)',
      { count: 'exact' }
    )
    .order('nombres_completos', { ascending: true })
    .range(from, to)

  const term = q.trim()
  if (term) {
    const t = `%${term}%`
    query = query.or(`nombres_completos.ilike.${t},correo.ilike.${t}`)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data || [], total: count || 0, pageSize }
}

// Restablece la contraseña de un usuario. Toda la autorización (es_admin)
// y el service_role viven en la Edge Function; aquí solo se invoca.
export async function setPassword(userId, newPassword) {
  const { data, error } = await supabase.functions.invoke('admin-set-password', {
    body: { user_id: userId, new_password: newPassword },
  })
  if (error) {
    // functions.invoke envuelve los errores HTTP; intenta sacar el mensaje real.
    let msg = error.message || 'Error al restablecer la contraseña'
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
