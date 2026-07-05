import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import CourseBuilder from '@/components/CourseBuilder.vue'
import * as svc from '@/services/courseBuilder.js'

vi.mock('@/services/courseBuilder.js', () => ({
  fetchEstructura: vi.fn(),
  crearModulo: vi.fn(),
  actualizarModulo: vi.fn(),
  eliminarModulo: vi.fn(),
  crearLeccion: vi.fn(),
  actualizarLeccion: vi.fn(),
  eliminarLeccion: vi.fn(),
  reordenarModulos: vi.fn(),
  reordenarLecciones: vi.fn(),
}))
vi.mock('@/services/evaluaciones.js', () => ({
  guardarEvaluacionAdmin: vi.fn(),
  cargarPreguntasAdmin: vi.fn().mockResolvedValue([]),
}))
vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end', 'add'],
    template: '<div><slot /></div>',
  },
}))
// Adaptation: LessonEditorPanel's sub-components import supabase (VideoUploadField
// via @/services/videos.js, DocumentoUploadField via @/services/documentos.js).
// Mock them so the test suite can initialize without VITE_SUPABASE_URL being set.
// EvaluacionEditor and LessonRichTextEditor are mocked to match LessonEditorPanel's
// own test setup and prevent any further transitive import issues.
vi.mock('@/components/VideoUploadField.vue', () => ({
  default: { name: 'VideoUploadField', props: ['leccionId', 'videoId'], template: '<div />' },
}))
vi.mock('@/components/DocumentoUploadField.vue', () => ({
  default: {
    name: 'DocumentoUploadField',
    props: ['leccionId', 'documentoPath', 'documentoTipo'],
    template: '<div />',
  },
}))
vi.mock('@/components/EvaluacionEditor.vue', () => ({
  default: { name: 'EvaluacionEditor', props: ['preguntas'], template: '<div />' },
}))
vi.mock('@/components/LessonRichTextEditor.vue', () => ({
  default: {
    name: 'LessonRichTextEditor',
    props: ['modelValue'],
    emits: ['update:modelValue', 'dirty'],
    methods: { flush() {} },
    template: '<div />',
  },
  EXTENSIONES_TEXTO: [],
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const arbol = [
  {
    id: 'm1',
    orden: 1,
    titulo: 'M1',
    lecciones: [
      {
        id: 'l1',
        orden: 1,
        modulo_id: 'm1',
        titulo: 'Intro',
        tipo_material: 'video',
        url_youtube: 'https://youtu.be/abc12345678',
        duracion_seg: 60,
      },
    ],
  },
  { id: 'm2', orden: 2, titulo: 'M2', lecciones: [] },
]

// Adaptation: mount with attachTo document.body so teleport has a real DOM target;
// clean up between tests so panel DOM does not leak across cases.
const wrappers = []
function factory() {
  const w = mount(CourseBuilder, {
    props: { cursoId: 'c1', session: null },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}

describe('CourseBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    svc.fetchEstructura.mockResolvedValue(JSON.parse(JSON.stringify(arbol)))
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    document.body.innerHTML = ''
  })

  it('carga la estructura al montar y renderiza sidebar + timeline', async () => {
    const w = factory()
    await flushPromises()
    expect(svc.fetchEstructura).toHaveBeenCalledWith('c1')
    expect(w.findAll('[data-test="module-item"]')).toHaveLength(2)
    expect(w.findAll('[data-test="lesson-card"]')).toHaveLength(1)
  })

  it('emite structure-changed con conteos', async () => {
    const w = factory()
    await flushPromises()
    const eventos = w.emitted('structure-changed')
    expect(eventos.at(-1)[0]).toEqual({ modulos: 2, lecciones: 1, advertencias: 0 })
  })

  it('seleccionar módulo cambia el timeline', async () => {
    const w = factory()
    await flushPromises()
    await w.findAll('[data-test="module-item"]')[1].trigger('click')
    expect(w.text()).toContain('M2')
    expect(w.findAll('[data-test="lesson-card"]')).toHaveLength(0)
  })

  it('abrir lección monta el panel y guardar persiste', async () => {
    svc.actualizarLeccion.mockResolvedValue({})
    const w = factory()
    await flushPromises()
    await w.findAll('[data-test="lesson-card"]')[0].trigger('click')
    expect(document.querySelector('.panel')).toBeTruthy()
    document.querySelector('[data-test="lesson-titulo"]').value = 'Editada'
    document.querySelector('[data-test="lesson-titulo"]').dispatchEvent(new Event('input'))
    document.querySelector('[data-test="panel-save"]').click()
    await flushPromises()
    expect(svc.actualizarLeccion).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ titulo: 'Editada' })
    )
  })

  it('la barra de validación resume el estado', async () => {
    const w = factory()
    await flushPromises()
    expect(w.find('[data-test="validation-bar"]').text()).toContain('2 módulos')
  })
})
