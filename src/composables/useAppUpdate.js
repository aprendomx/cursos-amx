import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

// Cada cuánto se pregunta al servidor si hay una versión nueva desplegada.
// Sin esta comprobación, un alumno con la pestaña abierta durante horas se
// queda en la versión vieja hasta que recarga a mano.
const INTERVALO_COMPROBACION_MS = 60 * 60 * 1000

/** @param {{ enabled?: boolean, intervaloMs?: number }} [opciones] */
export function useAppUpdate({ enabled, intervaloMs = INTERVALO_COMPROBACION_MS } = {}) {
  const nuevaVersionDisponible = ref(false)
  let updateSW = null

  if (enabled) {
    updateSW = registerSW({
      onNeedRefresh() {
        // Antes este callback estaba vacío: el service worker descargaba la
        // versión nueva pero nadie la activaba ni avisaba al usuario.
        nuevaVersionDisponible.value = true
      },
      onOfflineReady() {},
      onRegisteredSW(_url, registration) {
        if (registration) {
          setInterval(() => registration.update(), intervaloMs)
        }
      },
    })
  }

  function actualizarAhora() {
    if (updateSW) updateSW(true)
  }

  return { nuevaVersionDisponible, actualizarAhora }
}
