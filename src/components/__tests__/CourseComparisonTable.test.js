import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CourseComparisonTable from '../CourseComparisonTable.vue'

describe('CourseComparisonTable', () => {
  it('renderiza tabla sortable con top 3 badges', () => {
    const wrapper = mount(CourseComparisonTable, {
      props: {
        data: [
          {
            curso_id: 'c1',
            curso_titulo: 'Curso A',
            total_inscritos: 500,
            total_completados: 400,
            tasa_finalizacion: 80,
            engagement_promedio: 12,
            calificacion_promedio: 85,
          },
          {
            curso_id: 'c2',
            curso_titulo: 'Curso B',
            total_inscritos: 300,
            total_completados: 150,
            tasa_finalizacion: 50,
            engagement_promedio: 8,
            calificacion_promedio: 70,
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Curso A')
    expect(wrapper.text()).toContain('🥇')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
