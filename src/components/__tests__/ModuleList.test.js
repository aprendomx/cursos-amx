import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import ModuleList from '@/components/ModuleList.vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end', 'add'],
    template: '<div class="mock-draggable"><slot /></div>',
  },
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const modules = [
  { id: 'm1', titulo: 'Fundamentos', lecciones: [{ id: 'l1' }] },
  { id: 'm2', titulo: 'Avanzado', lecciones: [] },
]

function factory(props = {}) {
  return mount(ModuleList, {
    props: { modules, activeIndex: 0, ...props },
    global: { plugins: [i18n] },
  })
}

describe('ModuleList', () => {
  it('renderiza un item por módulo con conteo de lecciones', () => {
    const w = factory()
    const items = w.findAll('[data-test="module-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Fundamentos')
    expect(items[0].text()).toContain('1')
  })

  it('marca activo el módulo según activeIndex', () => {
    const w = factory({ activeIndex: 1 })
    expect(w.findAll('[data-test="module-item"]')[1].classes()).toContain('active')
  })

  it('click en un módulo emite select con el índice', async () => {
    const w = factory()
    await w.findAll('[data-test="module-item"]')[1].trigger('click')
    expect(w.emitted('select')).toEqual([[1]])
  })

  it('click en + emite add', async () => {
    const w = factory()
    await w.find('[data-test="add-module"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
  })

  it('emite remove con confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = factory()
    await w.findAll('[data-test="module-remove"]')[0].trigger('click')
    expect(w.emitted('remove')).toEqual([[0]])
    window.confirm.mockRestore()
  })

  it('drag end emite reorder con índices', async () => {
    const w = factory()
    await w.findComponent({ name: 'VueDraggable' }).vm.$emit('end', { oldIndex: 0, newIndex: 1 })
    expect(w.emitted('reorder')).toEqual([[0, 1]])
  })

  it('botones ↑/↓ (fallback accesible) emiten reorder', async () => {
    const w = factory()
    await w.findAll('[data-test="module-down"]')[0].trigger('click')
    expect(w.emitted('reorder')).toEqual([[0, 1]])
  })

  it('estado vacío muestra invitación', () => {
    const w = factory({ modules: [] })
    expect(w.text()).toContain('Comienza agregando tu primer módulo')
  })

  it('renombrado inline emite update con el nuevo título', async () => {
    const w = factory()
    await w.findAll('[data-test="module-rename"]')[0].trigger('click')
    const input = w.find('[data-test="module-title-input"]')
    await input.setValue('Renombrado')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update')).toEqual([[0, { titulo: 'Renombrado' }]])
  })
})
