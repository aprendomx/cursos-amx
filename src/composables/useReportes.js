import { ref } from 'vue'
import {
  obtenerFunnel,
  obtenerRetencion,
  obtenerComparativa,
  obtenerInstructorDashboard,
  obtenerInstructorAlumnos,
  obtenerLeccionAnalytics,
} from '@/services/reportes.js'

export function useReportes() {
  const funnel = ref(null)
  const retencion = ref([])
  const comparativa = ref([])
  const instructorDashboard = ref([])
  const instructorAlumnos = ref([])
  const leccionAnalytics = ref([])
  const loading = ref({
    funnel: false,
    retencion: false,
    comparativa: false,
    instructorDashboard: false,
    instructorAlumnos: false,
    leccionAnalytics: false,
  })
  const error = ref({
    funnel: null,
    retencion: null,
    comparativa: null,
    instructorDashboard: null,
    instructorAlumnos: null,
    leccionAnalytics: null,
  })

  async function cargarFunnel(cursoId, desde, hasta) {
    loading.value.funnel = true
    error.value.funnel = null
    try {
      funnel.value = await obtenerFunnel(cursoId, desde, hasta)
    } catch (e) {
      error.value.funnel = e?.message || 'Error al cargar funnel'
    } finally {
      loading.value.funnel = false
    }
  }

  async function cargarRetencion(cursoId) {
    loading.value.retencion = true
    error.value.retencion = null
    try {
      retencion.value = await obtenerRetencion(cursoId)
    } catch (e) {
      error.value.retencion = e?.message || 'Error al cargar retención'
    } finally {
      loading.value.retencion = false
    }
  }

  async function cargarComparativa(desde, hasta) {
    loading.value.comparativa = true
    error.value.comparativa = null
    try {
      comparativa.value = await obtenerComparativa(desde, hasta)
    } catch (e) {
      error.value.comparativa = e?.message || 'Error al cargar comparativa'
    } finally {
      loading.value.comparativa = false
    }
  }

  async function cargarTodo(cursoId, desde, hasta) {
    await Promise.all([
      cargarFunnel(cursoId, desde, hasta),
      cargarRetencion(cursoId),
      cargarComparativa(desde, hasta),
    ])
  }

  async function cargarInstructorDashboard(instructorId) {
    loading.value.instructorDashboard = true
    error.value.instructorDashboard = null
    try {
      instructorDashboard.value = await obtenerInstructorDashboard(instructorId)
    } catch (e) {
      error.value.instructorDashboard = e?.message || 'Error al cargar dashboard'
    } finally {
      loading.value.instructorDashboard = false
    }
  }

  async function cargarInstructorAlumnos(cursoId) {
    loading.value.instructorAlumnos = true
    error.value.instructorAlumnos = null
    try {
      instructorAlumnos.value = await obtenerInstructorAlumnos(cursoId)
    } catch (e) {
      error.value.instructorAlumnos = e?.message || 'Error al cargar alumnos'
    } finally {
      loading.value.instructorAlumnos = false
    }
  }

  async function cargarLeccionAnalytics(cursoId) {
    loading.value.leccionAnalytics = true
    error.value.leccionAnalytics = null
    try {
      leccionAnalytics.value = await obtenerLeccionAnalytics(cursoId)
    } catch (e) {
      error.value.leccionAnalytics = e?.message || 'Error al cargar analytics'
    } finally {
      loading.value.leccionAnalytics = false
    }
  }

  return {
    funnel,
    retencion,
    comparativa,
    instructorDashboard,
    instructorAlumnos,
    leccionAnalytics,
    loading,
    error,
    cargarFunnel,
    cargarRetencion,
    cargarComparativa,
    cargarTodo,
    cargarInstructorDashboard,
    cargarInstructorAlumnos,
    cargarLeccionAnalytics,
  }
}
