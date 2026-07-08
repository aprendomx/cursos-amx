import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import EntregaAlumnoPanel from '@/components/EntregaAlumnoPanel.vue'

const mockState = vi.hoisted(() => {
  const { ref } = require('vue')
  const entrega = ref(null)
  const historial = ref([])
  const subiendo = ref(false)
  const error = ref('')
  return {
    entrega,
    historial,
    subiendo,
    error,
    accept: ref('.pdf,.docx,.zip,.png,.jpg'),
    maxMb: ref(10),
    cargar: vi.fn(),
    subir: vi.fn(),
    descargar: vi.fn(),
    __setEntrega: (val) => {
      entrega.value = val
    },
    __setHistorial: (val) => {
      historial.value = val
    },
  }
})

vi.mock('@/composables/useEntregas.js', () => ({
  useEntregas: () => mockState,
  ESTADO_LABEL: {
    pendiente: 'Pendiente de revisión',
    revisada: 'Revisada',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada — vuelve a subir',
  },
}))

vi.mock('@/components/LessonRichTextEditor.vue', () => ({
  default: {
    name: 'LessonRichTextEditor',
    props: ['modelValue'],
    emits: ['update:modelValue', 'dirty'],
    template: '<div data-test="tiptap-editor" />',
  },
  EXTENSIONES_TEXTO: [],
}))

vi.mock('@/components/RubricaAlumnoView.vue', () => ({
  default: {
    name: 'RubricaAlumnoView',
    props: ['rubrica', 'calificaciones', 'puntajeFinal'],
    template: '<div data-test="rubrica-view" />',
  },
}))

describe('EntregaAlumnoPanel', () => {
  beforeEach(() => {
    mockState.__setEntrega(null)
    mockState.__setHistorial([])
    mockState.error.value = ''
    mockState.subiendo.value = false
    mockState.cargar.mockClear()
    mockState.subir.mockClear()
  })

  it('muestra formulario de entrega cuando estado es pendiente', async () => {
    mockState.__setEntrega({
      id: 'e1',
      estado: 'pendiente',
      version: 0,
      creado_en: '2024-01-15T10:00:00Z',
    })
    const wrapper = mount(EntregaAlumnoPanel, {
      props: { tareaId: 't1', userId: 'u1' },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Pendiente de entrega')
    expect(wrapper.find('[data-test="tiptap-editor"]').exists()).toBe(true)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    expect(wrapper.find('button').text()).toContain('Entregar')
  })

  it('muestra vista calificada cuando estado es calificada', async () => {
    mockState.__setEntrega({
      id: 'e1',
      estado: 'calificada',
      version: 1,
      creado_en: '2024-01-15T10:00:00Z',
      puntaje: 85,
      comentario_instructor: 'Buen trabajo',
      rubrica: {
        id: 'r1',
        tipo: 'niveles',
        criterios: [{ id: 'c1', nombre: 'Criterio 1', descripcion: 'Desc' }],
        niveles: [{ id: 'n1', nombre: 'Excelente', puntaje: 100 }],
      },
      calificaciones: [{ criterio_id: 'c1', nivel_id: 'n1', puntaje: 85, comentario: 'Bien' }],
      puntaje_final: 85,
    })
    const wrapper = mount(EntregaAlumnoPanel, {
      props: { tareaId: 't1', userId: 'u1' },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Calificada')
    expect(wrapper.find('[data-test="rubrica-view"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Buen trabajo')
    expect(wrapper.text()).toContain('85')
  })
})
