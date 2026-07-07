import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelChart from '../FunnelChart.vue'

describe('FunnelChart', () => {
  it('renderiza 5 etapas con valores', () => {
    const wrapper = mount(FunnelChart, {
      props: {
        data: {
          visitantes: 1000,
          registrados: 500,
          inscritos: 200,
          activos: 150,
          completados: 80,
          conversiones: {
            registrados_pct: 50,
            inscritos_pct: 40,
            activos_pct: 75,
            completados_pct: 53,
          },
        },
      },
    })
    expect(wrapper.text()).toContain('Visitantes')
    expect(wrapper.text()).toContain('1000')
    expect(wrapper.text()).toContain('50.0%')
  })
})
