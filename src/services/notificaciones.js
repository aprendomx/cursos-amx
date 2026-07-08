import { supabase } from '@/lib/supabase.js'

/**
 * Carga notificaciones del usuario.
 * @param {object} [params]
 * @param {number} [params.limit=50]
 * @param {boolean} [params.soloNoLeidas=false]
 */
export async function cargarNotificaciones({ limit = 50, soloNoLeidas = false } = {}) {
  let query = supabase
    .from('notificaciones')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(limit)

  if (soloNoLeidas) {
    query = query.eq('leido', false)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Marca una notificación como leída.
 * @param {string|number} id
 */
export async function marcarNotificacionLeida(id) {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('id', id)
  if (error) throw error
}

/**
 * Marca todas las notificaciones no leídas como leídas.
 */
export async function marcarTodasLeidas() {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('leido', false)
  if (error) throw error
}

/**
 * Carga las preferencias de notificación.
 * Si no existen, retorna valores por defecto.
 */
export async function cargarPreferencias() {
  const { data, error } = await supabase
    .from('notificacion_preferencias')
    .select('*')
    .single()

  if (error && error.code === 'PGRST116') {
    return { silenciados: [], canal_default: 'all' }
  }
  if (error) throw error
  return data || { silenciados: [], canal_default: 'all' }
}

/**
 * Guarda las preferencias de notificación.
 * @param {object} preferencias
 */
export async function guardarPreferencias(preferencias) {
  const { error } = await supabase
    .from('notificacion_preferencias')
    .upsert(preferencias)
  if (error) throw error
}

/**
 * Carga las plantillas de notificación activas.
 */
export async function cargarPlantillas() {
  const { data, error } = await supabase
    .from('notificacion_plantillas')
    .select('*')
    .eq('activa', true)
  if (error) throw error
  return data || []
}

/**
 * Actualiza una plantilla de notificación.
 * @param {string} tipo
 * @param {object} campos
 */
export async function actualizarPlantilla(tipo, campos) {
  const { error } = await supabase
    .from('notificacion_plantillas')
    .update(campos)
    .eq('tipo', tipo)
  if (error) throw error
}

/**
 * Carga la configuración de email.
 */
export async function cargarEmailConfig() {
  const { data, error } = await supabase
    .from('email_configuracion')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

/**
 * Guarda la configuración de email.
 * @param {object} config
 */
export async function guardarEmailConfig(config) {
  const { error } = await supabase
    .from('email_configuracion')
    .upsert({ ...config, id: 1 })
  if (error) throw error
}
