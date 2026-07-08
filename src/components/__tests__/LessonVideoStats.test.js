import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LessonVideoStats from '../LessonVideoStats.vue'

describe('LessonVideoStats', () => {
  it('shows all 6 metrics when stats loaded', () => {
    const wrapper = mount(LessonVideoStats, {
      props: {
        stats: {
          vistas_unicas: 42,
          total_reproduccion_s: 3665,
          terminacion_pct: 78.5,
          abandonos: 3,
          avg_tiempo_visto_s: 120,
          max_tiempo_visto_s: 300,
          min_tiempo_visto_s: 30,
        },
        loading: false,
      },
    })
    expect(wrapper.text()).toContain('Vistas únicas')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('Tiempo total reproducción')
    expect(wrapper.text()).toContain('1:01:05')
    expect(wrapper.text()).toContain('Terminación')
    expect(wrapper.text()).toContain('78.5%')
    expect(wrapper.text()).toContain('Abandonos')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('Tiempo promedio visto')
    expect(wrapper.text()).toContain('2:00')
    expect(wrapper.text()).toContain('Tiempo máximo visto')
    expect(wrapper.text()).toContain('5:00')
  })

  it('shows loading state when loading=true', () => {
    const wrapper = mount(LessonVideoStats, {
      props: {
        stats: {},
        loading: true,
      },
    })
    const skeletons = wrapper.findAll('.skeleton')
    expect(skeletons.length).toBe(12) // 6 metrics × 2 skeleton blocks each
  })
})
