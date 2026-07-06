import { ref } from 'vue'
import { obtenerAlumnosRiesgo, obtenerEngagement, generarReporteCSV } from '@/services/analytics.js'

export function useAnalytics() {
  const alumnosRiesgo = ref([])
  const engagement = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function cargarRiesgo(cursoId, minRiesgo = 50) {
    if (!cursoId) return
    loading.value = true
    error.value = null
    try {
      const data = await obtenerAlumnosRiesgo(cursoId, minRiesgo)
      alumnosRiesgo.value = data
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function cargarEngagement(cursoId, dias = 30) {
    if (!cursoId) return
    loading.value = true
    error.value = null
    try {
      const data = await obtenerEngagement(cursoId, dias)
      engagement.value = data
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function descargarReporte(tipo, cursoId) {
    if (!tipo || !cursoId) return
    loading.value = true
    error.value = null
    try {
      const blob = await generarReporteCSV(tipo, cursoId)
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${tipo}_${cursoId}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  return {
    alumnosRiesgo,
    engagement,
    loading,
    error,
    cargarRiesgo,
    cargarEngagement,
    descargarReporte,
  }
}
