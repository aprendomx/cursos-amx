import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { obtenerEntrega, crearEntrega, nuevaVersion } from '@/services/entregas.js'
import { obtenerRubrica } from '@/services/rubricas.js'

export const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export function useEntregas(tareaId, userId) {
  const entrega = ref(null)
  const tarea = ref(null)
  const rubrica = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const estado = computed(() => entrega.value?.estado || 'pendiente')
  const versionActual = computed(() => entrega.value?.version_actual || 0)

  const diasRestantes = computed(() => {
    if (!tarea.value?.fecha_limite) return null
    const diff = new Date(tarea.value.fecha_limite) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  })

  const diasRetraso = computed(() => {
    if (!tarea.value?.fecha_limite || !entrega.value?.entregado_en) return 0
    const diff = new Date(entrega.value.entregado_en) - new Date(tarea.value.fecha_limite)
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })

  const puedeEntregar = computed(() => {
    if (!tarea.value) return false
    const ahora = new Date()
    if (tarea.value.fecha_apertura && new Date(tarea.value.fecha_apertura) > ahora) return false
    if (estado.value === 'calificada') return false
    if (diasRestantes.value !== null && diasRestantes.value < 0 && !tarea.value.permitir_retraso)
      return false
    return true
  })

  async function cargar() {
    loading.value = true
    error.value = null
    try {
      const { data: tareaData, error: tareaError } = await supabase
        .from('tareas')
        .select('*')
        .eq('id', tareaId)
        .single()
      if (tareaError) throw tareaError
      tarea.value = tareaData

      const [entregaData, rubricaData] = await Promise.all([
        obtenerEntrega(tareaId, userId).catch(() => null),
        obtenerRubrica(tareaId).catch(() => null),
      ])
      entrega.value = entregaData
      rubrica.value = rubricaData
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function subirVersion({ texto, archivos, comentario }) {
    loading.value = true
    error.value = null
    try {
      if (!entrega.value) {
        entrega.value = await crearEntrega(tareaId, userId, { texto, archivos, comentario })
      } else {
        entrega.value = await nuevaVersion(entrega.value.id, { texto, archivos, comentario })
      }
      await cargar()
      return entrega.value
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    entrega,
    tarea,
    rubrica,
    loading,
    error,
    estado,
    versionActual,
    diasRestantes,
    diasRetraso,
    puedeEntregar,
    cargar,
    subirVersion,
  }
}
