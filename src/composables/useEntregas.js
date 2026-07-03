import { ref, computed } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import {
  subirEntrega,
  fetchMiEntrega,
  fetchMiHistorial,
  urlDescargaEntrega,
} from '@/services/entregas.js'

export const ESTADO_LABEL = {
  pendiente: 'Pendiente de revisión',
  revisada: 'Revisada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada — vuelve a subir',
}

/**
 * Estado de la entrega del alumno para una lección que la requiere:
 * entrega vigente, historial de versiones y subida con validación
 * client-side (la validación dura la hace la RPC registrar_entrega).
 */
export function useEntregas(cursoId, leccion) {
  const habilitado = featureEnabled('entregas')

  const entrega = ref(null) // vigente, o null
  const historial = ref([])
  const subiendo = ref(false)
  const loading = ref(false)
  const error = ref('')

  const tiposPermitidos = computed(
    () => leccion?.entrega_tipos || ['pdf', 'docx', 'zip', 'png', 'jpg']
  )
  const maxMb = computed(() => leccion?.entrega_max_mb || 10)
  const accept = computed(() => tiposPermitidos.value.map((t) => '.' + t).join(','))

  async function cargar() {
    if (!habilitado || !leccion?.id) return
    loading.value = true
    error.value = ''
    try {
      entrega.value = await fetchMiEntrega(leccion.id)
      historial.value = await fetchMiHistorial(leccion.id)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  function validarArchivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!tiposPermitidos.value.includes(ext)) {
      return `Tipo .${ext} no permitido. Acepta: ${tiposPermitidos.value.join(', ')}`
    }
    if (file.size > maxMb.value * 1024 * 1024) {
      return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${maxMb.value} MB`
    }
    return null
  }

  async function subir(file) {
    const problema = validarArchivo(file)
    if (problema) {
      error.value = problema
      return null
    }
    subiendo.value = true
    error.value = ''
    try {
      const nueva = await subirEntrega({ cursoId, leccionId: leccion.id, file })
      entrega.value = nueva
      historial.value = [nueva, ...historial.value.map((h) => ({ ...h, vigente: false }))]
      return nueva
    } catch (e) {
      error.value = e?.message || String(e)
      return null
    } finally {
      subiendo.value = false
    }
  }

  async function descargar(item) {
    const url = await urlDescargaEntrega(item.archivo_path)
    window.open(url, '_blank', 'noopener')
  }

  return {
    habilitado,
    entrega,
    historial,
    subiendo,
    loading,
    error,
    tiposPermitidos,
    maxMb,
    accept,
    cargar,
    subir,
    descargar,
  }
}
