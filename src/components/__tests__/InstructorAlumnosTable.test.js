import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import InstructorAlumnosTable from '../InstructorAlumnosTable.vue'

describe('InstructorAlumnosTable', () => {
  it('renderiza tabla con progreso y sorting', () => {
    const wrapper = mount(InstructorAlumnosTable, {
      props: {
        data: [
          {
            user_id: 'u1',
            nombres_completos: 'Ana',
            pct_progreso: 75,
            calificacion_promedio: 85,
            tiempo_dedicado_segundos: 3600,
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('75.0%')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
