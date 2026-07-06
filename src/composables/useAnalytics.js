import { ref, computed, watch } from 'vue'
import { fetchAllCursosAdmin } from '@/services/cursos.js'

export function useAnalytics(getSession) {
  const cursos = ref([])
  const selectedCursoId = ref('')
  const minRisk = ref(50)
  const alumnos = ref([])
  const engagement = ref([])
  const loading = ref(false)
  const error = ref(null)

  const selectedCurso = computed(
    () => cursos.value.find((c) => String(c.id) === String(selectedCursoId.value)) || null
  )

  async function loadCursos() {
    const session = getSession()
    if (!session?.access_token) return
    try {
      cursos.value = await fetchAllCursosAdmin()
      if (cursos.value.length && !selectedCursoId.value) {
        selectedCursoId.value = cursos.value[0].id
      }
    } catch (err) {
      console.error('Error loading cursos for analytics:', err)
      error.value = err?.message || 'Error al cargar cursos'
    }
  }

  async function loadAnalytics() {
    const session = getSession()
    if (!session?.access_token || !selectedCursoId.value) return
    loading.value = true
    error.value = null
    try {
      // TODO: replace with real analytics endpoints when available
      alumnos.value = []
      engagement.value = []
    } catch (err) {
      console.error('Error loading analytics:', err)
      error.value = err?.message || 'Error al cargar analytics'
    } finally {
      loading.value = false
    }
  }

  watch(selectedCursoId, loadAnalytics, { immediate: false })

  const filteredAlumnos = computed(() => {
    if (!minRisk.value && minRisk.value !== 0) return alumnos.value
    return alumnos.value.filter((a) => (a.score ?? 0) >= minRisk.value)
  })

  return {
    cursos,
    selectedCursoId,
    selectedCurso,
    minRisk,
    alumnos,
    filteredAlumnos,
    engagement,
    loading,
    error,
    loadCursos,
    loadAnalytics,
  }
}
