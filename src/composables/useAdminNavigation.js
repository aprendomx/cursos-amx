import { ref, computed, watch } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'

export function useAdminNavigation() {
  const activeSection = ref('resumen')
  const editingCurso = ref(null)

  const SIDEBAR_KEY = 'admin-sidebar-hidden'
  const sidebarHidden = ref(
    (() => {
      try {
        return localStorage.getItem(SIDEBAR_KEY) === '1'
      } catch {
        return false
      }
    })()
  )
  watch(sidebarHidden, (v) => {
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0')
    } catch {
      /* storage no disponible */
    }
  })
  function toggleSidebar() {
    sidebarHidden.value = !sidebarHidden.value
  }

  const navItems = computed(() => [
    { key: 'resumen', label: 'Resumen' },
    { key: 'cursos', label: 'Cursos' },
    { key: 'nuevo', label: '+ Nuevo curso', primary: true },
    { key: 'usuarios', label: 'Usuarios' },
    ...(featureEnabled('instructor') ? [{ key: 'instructores', label: 'Instructores' }] : []),
    ...(featureEnabled('rubrics') ? [{ key: 'rubricas', label: 'Rúbricas' }] : []),
    ...(featureEnabled('cohorts') ? [{ key: 'cohortes', label: 'Cohortes' }] : []),
    ...(featureEnabled('gamificacion') ? [{ key: 'gamificacion', label: 'Gamificación' }] : []),
    ...(featureEnabled('entregas')
      ? [{ key: 'entregas', label: 'Entregas', icon: 'clipboard' }]
      : []),
    ...(featureEnabled('analytics') ? [{ key: 'analytics', label: 'Analytics' }] : []),
    ...(featureEnabled('video_analytics')
      ? [{ key: 'video_analytics', label: 'Analytics Video' }]
      : []),
    ...(featureEnabled('ai_quiz_generator') ||
    featureEnabled('ai_summaries') ||
    featureEnabled('ai_study_assistant')
      ? [{ key: 'ai_config', label: 'Configuración IA' }]
      : []),
    { key: 'constancias', label: 'Constancias' },
    ...(featureEnabled('reportes_avanzados') ? [{ key: 'reportes', label: 'Reportes' }] : []),
    ...(featureEnabled('notificaciones')
      ? [{ key: 'notificaciones', label: 'Notificaciones' }]
      : []),
    { key: 'config', label: 'Configuraci\u00f3n' },
  ])

  function createBlankCurso() {
    return {
      id: 'c-new-' + Date.now(),
      slug: '',
      titulo: '',
      descripcion: '',
      nivel: 'Fundamental',
      idioma: 'Espa\u00f1ol',
      imagen: '',
      publicado: false,
      modulos: [
        {
          id: 'm-1',
          titulo: '',
          descripcion: '',
          imagen_portada: '',
          requiere_previo: false,
          lecciones: [
            {
              id: 'l-1',
              titulo: '',
              tipo: 'video',
              youtube_url: '',
              duracion: '',
              video_id: null,
              documento_path: null,
              documento_tipo: null,
              fuente: 'youtube',
              requiere_entrega: false,
              entrega_tipos_csv: 'pdf, docx, zip, png, jpg',
              entrega_max_mb: 10,
              eval_puntaje_minimo: 70,
              eval_max_intentos: 3,
              preguntas: [],
            },
          ],
        },
      ],
    }
  }

  function setSection(key) {
    if (key === 'nuevo') {
      activeSection.value = 'cursos'
      editingCurso.value = createBlankCurso()
      return
    }
    editingCurso.value = null
    activeSection.value = key
  }

  function editCurso(curso) {
    editingCurso.value = curso
    activeSection.value = 'cursos'
  }

  function onCoursePublished() {
    editingCurso.value = null
  }

  return {
    activeSection,
    editingCurso,
    sidebarHidden,
    toggleSidebar,
    navItems,
    setSection,
    editCurso,
    onCoursePublished,
    createBlankCurso,
  }
}
