import { onMounted, onBeforeUnmount } from 'vue'
import { registrarTiempo } from '@/services/tiempo'

// Mide TIEMPO ACTIVO real dentro de un curso:
//  - solo cuenta con la pestaña visible (Page Visibility API) y
//  - con interacción reciente (mouse/teclado/scroll/touch) O un <video>
//    reproduciéndose.
// Acumula localmente y hace flush periódico al servidor (y al ocultar/
// desmontar) para no machacar la base con una llamada cada tick.
//
// Uso (en setup, nivel superior):
//   useTiempoActividad({
//     cursoId: () => esCursoReal ? props.cursoId : null,
//     enabled: () => !!props.session?.access_token,
//   })

const TICK_MS = 15_000 // cadencia del heartbeat
const FLUSH_EVERY_TICKS = 4 // flush ~cada 60 s
const ACTIVITY_TIMEOUT_MS = 30_000 // "activo" si hubo interacción en los últimos 30 s

export function useTiempoActividad({ cursoId, enabled }) {
  let timer = null
  let lastActivity = Date.now()
  let pending = 0 // segundos acumulados sin enviar
  let tickCount = 0
  let flushing = false

  const getCurso = typeof cursoId === 'function' ? cursoId : () => cursoId
  const isEnabled = typeof enabled === 'function' ? enabled : () => enabled !== false

  function markActivity() {
    lastActivity = Date.now()
  }

  function videoPlaying() {
    const vids = document.querySelectorAll('video')
    for (const v of vids) {
      if (!v.paused && !v.ended && v.readyState > 2) return true
    }
    return false
  }

  function isActive() {
    if (document.visibilityState !== 'visible') return false
    if (videoPlaying()) return true
    return Date.now() - lastActivity < ACTIVITY_TIMEOUT_MS
  }

  async function flush() {
    const curso = getCurso()
    if (flushing || pending <= 0 || !curso || !isEnabled()) return
    const secs = pending
    pending = 0
    flushing = true
    try {
      await registrarTiempo(curso, secs)
    } catch (e) {
      // Reintenta en el próximo flush: devuelve los segundos al acumulador.
      pending += secs
      console.warn('tiempo flush:', e?.message || e)
    } finally {
      flushing = false
    }
  }

  function tick() {
    if (isActive()) pending += TICK_MS / 1000
    tickCount++
    if (tickCount % FLUSH_EVERY_TICKS === 0) flush()
  }

  function onVisibility() {
    // Al ocultar la pestaña, vuelca lo pendiente antes de que el navegador
    // pueda descartar la página.
    if (document.visibilityState === 'hidden') flush()
    else markActivity()
  }

  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']

  onMounted(() => {
    activityEvents.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    timer = setInterval(tick, TICK_MS)
  })

  onBeforeUnmount(() => {
    activityEvents.forEach((ev) => window.removeEventListener(ev, markActivity))
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
    if (timer) clearInterval(timer)
    flush()
  })
}
