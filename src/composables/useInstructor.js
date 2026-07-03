import { ref, computed } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import {
  fetchMisCursosInstructor,
  fetchAlumnosCurso,
  fetchComentariosCurso,
  fetchLogModeracion,
  fetchMetricasCurso,
  moderarComentario,
} from '@/services/instructores.js'
import { fetchEntregasCurso, revisarEntrega, urlDescargaEntrega } from '@/services/entregas.js'

/**
 * Estado del dashboard de instructor: cursos asignados, curso activo,
 * alumnos, comentarios para moderar, métricas y log.
 *
 * El rol viene del perfil (perfiles.es_instructor) que App.vue ya
 * carga; este composable solo maneja datos, no autenticación.
 */
export function useInstructor() {
  const habilitado = featureEnabled('instructor')

  const misCursos = ref([])
  const cursoActivo = ref(null)
  const alumnos = ref([])
  const comentarios = ref([])
  const log = ref([])
  const metricas = ref({ alumnos: 0, comentarios7d: 0, ocultos: 0, sesionesProgramadas: 0 })
  const entregas = ref([])
  const entregasHabilitadas = featureEnabled('entregas')
  const loading = ref(false)
  const error = ref('')

  async function init() {
    if (!habilitado) return
    loading.value = true
    error.value = ''
    try {
      misCursos.value = await fetchMisCursosInstructor()
      if (misCursos.value.length && !cursoActivo.value) {
        await seleccionarCurso(misCursos.value[0].id)
      }
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function seleccionarCurso(cursoId) {
    cursoActivo.value = misCursos.value.find((c) => c.id === cursoId) || null
    if (!cursoActivo.value) return
    loading.value = true
    error.value = ''
    try {
      const [a, c, m, l, e] = await Promise.all([
        fetchAlumnosCurso(cursoId),
        fetchComentariosCurso(cursoId),
        fetchMetricasCurso(cursoId),
        fetchLogModeracion(cursoId),
        entregasHabilitadas ? fetchEntregasCurso(cursoId) : Promise.resolve([]),
      ])
      alumnos.value = a
      comentarios.value = c
      metricas.value = m
      log.value = l
      entregas.value = e
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function moderar(comentarioId, accion) {
    error.value = ''
    try {
      const actualizado = await moderarComentario(comentarioId, accion)
      if (accion === 'eliminar') {
        comentarios.value = comentarios.value.filter((c) => c.id !== comentarioId)
      } else if (actualizado) {
        const idx = comentarios.value.findIndex((c) => c.id === comentarioId)
        if (idx !== -1) {
          comentarios.value[idx] = { ...comentarios.value[idx], ...actualizado }
        }
      }
      if (cursoActivo.value) {
        log.value = await fetchLogModeracion(cursoActivo.value.id)
      }
    } catch (e) {
      error.value = e?.message || String(e)
      throw e
    }
  }

  // estado: pendiente | revisada | aprobada | rechazada
  async function revisar(entregaId, estado, comentario = null) {
    error.value = ''
    try {
      const actualizada = await revisarEntrega(entregaId, estado, comentario)
      const idx = entregas.value.findIndex((e) => e.id === entregaId)
      if (idx !== -1) entregas.value[idx] = { ...entregas.value[idx], ...actualizada }
    } catch (e) {
      error.value = e?.message || String(e)
      throw e
    }
  }

  async function descargarEntrega(item) {
    const url = await urlDescargaEntrega(item.archivo_path)
    window.open(url, '_blank', 'noopener')
  }

  const tieneCursos = computed(() => misCursos.value.length > 0)

  return {
    habilitado,
    misCursos,
    cursoActivo,
    alumnos,
    comentarios,
    log,
    metricas,
    entregas,
    entregasHabilitadas,
    loading,
    error,
    tieneCursos,
    init,
    seleccionarCurso,
    moderar,
    revisar,
    descargarEntrega,
  }
}
