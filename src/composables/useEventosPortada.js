// src/composables/useEventosPortada.js
// Emisión de eventos del embudo de portada (migración 076).
//
// Dos reglas por encima de todo:
//
// 1. NUNCA romper la página. La analítica es prescindible; la navegación no.
//    Todo fallo —red, límite, RPC ausente en una instalación vieja— se traga.
// 2. Sin datos personales. El identificador de visita es un UUID aleatorio que
//    vive en sessionStorage: relaciona los pasos de un mismo recorrido y muere
//    con la pestaña. No identifica a nadie ni persiste entre visitas.
import { supabase } from '@/lib/supabase.js'

const CLAVE_VISITA = 'portada-visita'

function idDeVisita() {
  try {
    let v = sessionStorage.getItem(CLAVE_VISITA)
    if (!v) {
      v = crypto.randomUUID()
      sessionStorage.setItem(CLAVE_VISITA, v)
    }
    return v
  } catch {
    // sessionStorage bloqueado: los eventos salen sin hilo conductor, que es
    // mejor que no salir.
    return null
  }
}

/**
 * Registra un evento del embudo. Devuelve siempre, falle lo que falle.
 *
 * @param {string} evento uno de la lista blanca de la migración 076
 * @param {{seccion?: string, posicion?: number}} [detalle]
 */
export async function registrarEventoPortada(evento, detalle = {}) {
  try {
    await supabase.rpc('registrar_evento_portada', {
      p_evento: evento,
      p_seccion: detalle.seccion ?? null,
      p_posicion: detalle.posicion ?? null,
      p_visita: idDeVisita(),
    })
  } catch {
    // Silencio deliberado. Ver la regla 1.
  }
}
