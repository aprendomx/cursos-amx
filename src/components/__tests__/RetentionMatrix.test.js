import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RetentionMatrix from '../RetentionMatrix.vue'

describe('RetentionMatrix', () => {
  it('renderiza tabla con heatmap', () => {
    const wrapper = mount(RetentionMatrix, {
      props: {
        data: [{ semana: '2026-W01', total: 100, d7: 80, d14: 60, d30: 40, d60: 20, d90: 10 }],
      },
    })
    expect(wrapper.text()).toContain('2026-W01')
    expect(wrapper.text()).toContain('80.0%')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
