// src/services/constanciaConfig.js
// Lee y actualiza la configuración global del firmante de la constancia
// (titular_nombre, titular_cargo, lugar). Tabla constancia_settings.
import { supabase } from '@/lib/supabase.js'

const DEFAULTS = Object.freeze({
  titular_nombre: 'Nombre Completo Del Titular',
  titular_cargo: 'Comisionado Nacional contra las Adicciones',
  lugar: 'Ciudad de México',
})

export async function getConstanciaConfig() {
  try {
    const { data, error } = await supabase
      .from('constancia_settings')
      .select('titular_nombre, titular_cargo, lugar, actualizado_en')
      .eq('id', true)
      .maybeSingle()
    if (error) throw error
    return data || { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function updateConstanciaConfig({ titular_nombre, titular_cargo, lugar }) {
  const payload = {
    titular_nombre: (titular_nombre || '').trim() || DEFAULTS.titular_nombre,
    titular_cargo: (titular_cargo || '').trim() || DEFAULTS.titular_cargo,
    lugar: (lugar || '').trim() || DEFAULTS.lugar,
  }
  const { error } = await supabase.from('constancia_settings').update(payload).eq('id', true)
  if (error) throw error
  return payload
}

export { DEFAULTS as CONSTANCIA_DEFAULTS }
