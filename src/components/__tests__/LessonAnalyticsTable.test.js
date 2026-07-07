import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LessonAnalyticsTable from '../LessonAnalyticsTable.vue'

describe('LessonAnalyticsTable', () => {
  it('renderiza tabla y destaca baja completitud', () => {
    const wrapper = mount(LessonAnalyticsTable, {
      props: {
        data: [
          { leccion_id: 'l1', leccion_titulo: 'Intro', tasa_completitud: 40 },
          { leccion_id: 'l2', leccion_titulo: 'Avanzado', tasa_completitud: 90 },
        ],
      },
    })
    expect(wrapper.text()).toContain('Intro')
    expect(wrapper.find('.row-warning').exists()).toBe(true)
  })
})
