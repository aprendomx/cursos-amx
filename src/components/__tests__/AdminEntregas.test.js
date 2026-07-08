import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AdminEntregas from '../AdminEntregas.vue'

describe('AdminEntregas', () => {
  it('renders stats cards', async () => {
    const wrapper = mount(AdminEntregas)
    await nextTick()

    expect(wrapper.text()).toContain('Total tareas')
    expect(wrapper.text()).toContain('Entregas pendientes de calificación')
    expect(wrapper.text()).toContain('Tasa de entrega promedio')
  })

  it('renders table', async () => {
    const wrapper = mount(AdminEntregas)
    await nextTick()

    expect(wrapper.text()).toContain('Tareas recientes')
    expect(wrapper.text()).toContain('Curso')
    expect(wrapper.text()).toContain('Título')
    expect(wrapper.text()).toContain('Fecha límite')
    expect(wrapper.text()).toContain('Entregas')
    expect(wrapper.text()).toContain('Calificadas')

    expect(wrapper.text()).toContain('Derecho Administrativo')
    expect(wrapper.text()).toContain('Ensayo sobre principios de legalidad')
    expect(wrapper.text()).toContain('Ética Pública')
  })
})
