import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import LessonTimeline from '@/components/LessonTimeline.vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end'],
    template: '<div class="mock-draggable"><slot /></div>',
  },
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const lessons = [
  { id: 'l1', titulo: 'Intro', fuente: 'youtube', duracion_seg: 720, requiere_entrega: false },
  { id: 'l2', titulo: 'Quiz', fuente: 'examen', duracion_seg: 0, requiere_entrega: false },
  { id: 'l3', titulo: 'Vacía', fuente: 'ninguno', duracion_seg: 0, requiere_entrega: true },
]

function factory(props = {}) {
  return mount(LessonTimeline, {
    props: { lessons, moduleTitle: 'Módulo 1', moduleTitles: ['Módulo 1', 'Módulo 2'], ...props },
    global: { plugins: [i18n] },
  })
}

describe('LessonTimeline', () => {
  it('renderiza una tarjeta por lección', () => {
    expect(factory().findAll('[data-test="lesson-card"]')).toHaveLength(3)
  })

  it('badge de examen, entrega y sin-contenido', () => {
    const cards = factory().findAll('[data-test="lesson-card"]')
    expect(cards[1].text()).toContain('Examen')
    expect(cards[2].text()).toContain('Entrega')
    expect(cards[2].text()).toContain('Sin contenido')
  })

  it('duración formateada en la tarjeta', () => {
    expect(factory().findAll('[data-test="lesson-card"]')[0].text()).toContain('12:00')
  })

  it('click en tarjeta emite select', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-card"]')[0].trigger('click')
    expect(w.emitted('select')).toEqual([[0]])
  })

  it('drag end emite reorder', async () => {
    const w = factory()
    await w.findComponent({ name: 'VueDraggable' }).vm.$emit('end', { oldIndex: 2, newIndex: 0 })
    expect(w.emitted('reorder')).toEqual([[2, 0]])
  })

  it('menú Mover a… emite move con índice de módulo destino', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="move-to-1"]')[0].trigger('click')
    expect(w.emitted('move')).toEqual([[0, 1]])
  })

  it('eliminar pide confirmación y emite remove', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="lesson-delete"]')[0].trigger('click')
    expect(w.emitted('remove')).toEqual([[0]])
    window.confirm.mockRestore()
  })

  it('duplicar emite duplicate con el índice', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="lesson-duplicate"]')[0].trigger('click')
    expect(w.emitted('duplicate')).toEqual([[0]])
  })

  it('eliminar NO emite remove si el usuario cancela la confirmación', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="lesson-delete"]')[0].trigger('click')
    expect(w.emitted('remove')).toBeFalsy()
    spy.mockRestore()
  })

  it('botón + emite add y estado vacío invita a arrastrar', async () => {
    const w = factory({ lessons: [] })
    expect(w.text()).toContain('Arrastra lecciones aquí o haz clic en +')
    await w.find('[data-test="add-lesson"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
  })
})
