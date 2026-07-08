import { ref, computed } from 'vue'
import { listarEventosCalendario, exportarCalendarioICS } from '@/services/sesionesVirtuales.js'

export function useCalendario(cursoId) {
  const eventos = ref([])
  const loading = ref(false)
  const error = ref('')

  const eventosPorMes = computed(() => {
    const map = new Map()
    for (const e of eventos.value) {
      const d = new Date(e.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(e)
    }
    return map
  })

  const eventosPorDia = computed(() => {
    const map = new Map()
    for (const e of eventos.value) {
      const d = new Date(e.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(e)
    }
    return map
  })

  async function cargar() {
    loading.value = true
    error.value = ''
    try {
      eventos.value = await listarEventosCalendario(cursoId)
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function exportarICS() {
    try {
      return await exportarCalendarioICS(cursoId)
    } catch (e) {
      error.value = e?.message || String(e)
      return null
    }
  }

  return { eventos, eventosPorMes, eventosPorDia, loading, error, cargar, exportarICS }
}
