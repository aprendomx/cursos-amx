import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InscripcionesTimeline from '../InscripcionesTimeline.vue'

vi.mock('chart.js/auto', () => ({
  default: class {
    constructor() {
      this.destroy = vi.fn()
    }
  },
}))

describe('InscripcionesTimeline', () => {
  it('renderiza mensaje cuando no hay datos', () => {
    const wrapper = mount(InscripcionesTimeline, {
      props: { data: [] },
    })
    expect(wrapper.text()).toContain('Sin datos')
  })

  it('renderiza canvas cuando hay datos', () => {
    const wrapper = mount(InscripcionesTimeline, {
      props: {
        data: [{ fecha: '2026-01-01', total_inscripciones: 10 }],
      },
    })
    expect(wrapper.find('canvas').exists()).toBe(true)
  })
})
