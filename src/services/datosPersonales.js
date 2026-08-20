import { supabase } from '@/lib/supabase.js'

// Derechos ARCO (LFPDPPP). Ver docs/CUMPLIMIENTO.md y la migración 064.

export const CONFIRMACION_BAJA = 'ELIMINAR MIS DATOS'

/** Derecho de acceso y portabilidad: todo lo del titular, en JSON. */
export async function exportarMisDatos() {
  const { data, error } = await supabase.rpc('exportar_mis_datos')
  if (error) throw error
  return data
}

/**
 * Derecho de cancelación. Exige la confirmación literal: es irreversible y no
 * debe poder dispararse por un clic accidental.
 */
export async function eliminarMisDatos(confirmacion, conservarConstancias = true) {
  const { data, error } = await supabase.rpc('eliminar_mis_datos', {
    p_confirmacion: confirmacion,
    p_conservar_constancias: conservarConstancias,
  })
  if (error) throw error
  return data
}

/** Dispara la descarga del JSON en el navegador. */
export function descargarJson(datos, nombreArchivo) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
