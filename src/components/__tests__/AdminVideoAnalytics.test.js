import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AdminVideoAnalytics from '../AdminVideoAnalytics.vue'

describe('AdminVideoAnalytics', () => {
  it('shows system stats cards', async () => {
    const wrapper = mount(AdminVideoAnalytics)
    await nextTick()

    expect(wrapper.text()).toContain('Eventos hoy')
    expect(wrapper.text()).toContain('1,523')
    expect(wrapper.text()).toContain('Vistas únicas')
    expect(wrapper.text()).toContain('892')
    expect(wrapper.text()).toContain('Completitud promedio')
    expect(wrapper.text()).toContain('67%')
    expect(wrapper.text()).toContain('Videos activos')
    expect(wrapper.text()).toContain('45')
  })

  it('shows top courses table', async () => {
    const wrapper = mount(AdminVideoAnalytics)
    await nextTick()

    expect(wrapper.text()).toContain('Top cursos por vistas')
    expect(wrapper.text()).toContain('Curso A')
    expect(wrapper.text()).toContain('Curso B')
    expect(wrapper.text()).toContain('234')
    expect(wrapper.text()).toContain('189')
    expect(wrapper.text()).toContain('78%')
    expect(wrapper.text()).toContain('65%')
  })
})
