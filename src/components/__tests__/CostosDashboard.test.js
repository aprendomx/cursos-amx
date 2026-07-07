import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CostosDashboard from '../CostosDashboard.vue'

describe('CostosDashboard', () => {
  it('renderiza cards con métricas de costos', () => {
    const wrapper = mount(CostosDashboard, {
      props: {
        data: {
          almacenamiento_videos_gb: 10,
          almacenamiento_docs_gb: 5,
          total_tokens: 1000000,
          costo_total_estimado_usd: 25.5,
        },
      },
    })
    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).toContain('GB')
    expect(wrapper.text()).toContain('1,000,000')
    expect(wrapper.text()).toContain('$25.50')
  })
})
