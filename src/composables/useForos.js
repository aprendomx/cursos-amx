import { ref, computed } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import {
  fetchForosCurso,
  crearForo,
  eliminarForo,
  fetchHilos,
  crearHilo,
  editarHilo,
  fetchRespuestas,
  crearRespuesta,
  editarRespuesta,
  moderarForo,
  dentroDeVentanaEdicion,
} from '@/services/foros.js'
import { fetchInstructoresDeCurso } from '@/services/instructores'
import { obtenerCohorteUsuario } from '@/services/cohortes.js'

/**
 * Estado del módulo de foros para un curso: lista de foros, hilos del
 * foro activo y respuestas del hilo abierto (árbol de 2 niveles, con
 * destacadas al tope). Maneja también la moderación de instructores.
 */
export function useForos(cursoId, { userId = null, esAdmin = false } = {}) {
  const habilitado = featureEnabled('foros')

  const foros = ref([])
  const foroActivo = ref(null)
  const hilos = ref([])
  const hiloActivo = ref(null)
  const respuestas = ref([])
  const instructorIds = ref(new Set())
  const loading = ref(false)
  const error = ref('')

  const esInstructorCurso = computed(() => esAdmin || (userId && instructorIds.value.has(userId)))

  const cohorteId = ref(null)

  async function init() {
    if (!habilitado) return
    loading.value = true
    error.value = ''
    try {
      if (userId) {
        cohorteId.value = await obtenerCohorteUsuario(cursoId, userId)
      }
      const [f, ids] = await Promise.all([
        fetchForosCurso(cursoId, cohorteId.value),
        fetchInstructoresDeCurso(cursoId),
      ])
      foros.value = f
      instructorIds.value = new Set(ids)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function abrirForo(foro) {
    foroActivo.value = foro
    hiloActivo.value = null
    respuestas.value = []
    loading.value = true
    error.value = ''
    try {
      hilos.value = await fetchHilos(foro.id)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function abrirHilo(hilo) {
    hiloActivo.value = hilo
    loading.value = true
    error.value = ''
    try {
      respuestas.value = await fetchRespuestas(hilo.id)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  function cerrarHilo() {
    hiloActivo.value = null
    respuestas.value = []
  }

  function cerrarForo() {
    cerrarHilo()
    foroActivo.value = null
    hilos.value = []
  }

  // Árbol de 2 niveles. Respuestas destacadas por instructor van
  // fijadas al tope del hilo, el resto en orden cronológico.
  const arbolRespuestas = computed(() => {
    const raices = respuestas.value.filter((r) => !r.respuesta_padre_id)
    const hijasDe = (id) => respuestas.value.filter((r) => r.respuesta_padre_id === id)
    const orden = [...raices.filter((r) => r.destacado), ...raices.filter((r) => !r.destacado)]
    return orden.map((r) => ({ ...r, hijas: hijasDe(r.id) }))
  })

  /* ── Acciones de participante ── */

  async function nuevoForo(titulo, descripcion) {
    const f = await crearForo({ cursoId, titulo, descripcion, orden: foros.value.length })
    await init()
    return f
  }

  async function borrarForo(foroId) {
    await eliminarForo(foroId)
    if (foroActivo.value?.id === foroId) cerrarForo()
    await init()
  }

  async function nuevoHilo(titulo, cuerpo) {
    if (!foroActivo.value) return
    const h = await crearHilo(foroActivo.value.id, titulo, cuerpo)
    hilos.value = [h, ...hilos.value.filter((x) => !x.fijado)]
    hilos.value = [...hilos.value.filter((x) => x.fijado), ...hilos.value.filter((x) => !x.fijado)]
    return h
  }

  async function guardarHilo(hiloId, titulo, cuerpo) {
    const h = await editarHilo(hiloId, { titulo, cuerpo })
    const idx = hilos.value.findIndex((x) => x.id === hiloId)
    if (idx !== -1) hilos.value[idx] = { ...hilos.value[idx], ...h }
    if (hiloActivo.value?.id === hiloId) hiloActivo.value = { ...hiloActivo.value, ...h }
  }

  async function responder(cuerpo, respuestaPadreId = null) {
    if (!hiloActivo.value) return
    const r = await crearRespuesta(hiloActivo.value.id, cuerpo, respuestaPadreId)
    respuestas.value = [...respuestas.value, r]
    return r
  }

  async function guardarRespuesta(respuestaId, cuerpo) {
    const r = await editarRespuesta(respuestaId, cuerpo)
    const idx = respuestas.value.findIndex((x) => x.id === respuestaId)
    if (idx !== -1) respuestas.value[idx] = { ...respuestas.value[idx], ...r }
  }

  /* ── Moderación (instructor) ── */

  async function moderar(tipo, id, accion) {
    await moderarForo(tipo, id, accion)
    if (tipo === 'hilo') {
      if (foroActivo.value) await abrirForo(foroActivo.value)
    } else if (hiloActivo.value) {
      respuestas.value = await fetchRespuestas(hiloActivo.value.id)
    }
  }

  const puedeEditar = (item) =>
    item?.autor_id === userId && (esInstructorCurso.value || dentroDeVentanaEdicion(item))

  const esDeInstructor = (item) => instructorIds.value.has(item?.autor_id)

  return {
    habilitado,
    foros,
    foroActivo,
    hilos,
    hiloActivo,
    respuestas,
    arbolRespuestas,
    instructorIds,
    esInstructorCurso,
    loading,
    error,
    init,
    abrirForo,
    abrirHilo,
    cerrarHilo,
    cerrarForo,
    nuevoForo,
    borrarForo,
    nuevoHilo,
    guardarHilo,
    responder,
    guardarRespuesta,
    moderar,
    puedeEditar,
    esDeInstructor,
  }
}
