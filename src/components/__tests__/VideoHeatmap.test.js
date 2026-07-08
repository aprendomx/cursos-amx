import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoHeatmap from '../VideoHeatmap.vue'

describe('VideoHeatmap', () => {
  it('renderiza una barra por bucket', () => {
    const wrapper = mount(VideoHeatmap, {
      props: {
        data: [
          { intervalo_inicio: 0, vistas_unicas: 10, abandonos: 2 },
          { intervalo_inicio: 10, vistas_unicas: 8, abandonos: 1 },
          { intervalo_inicio: 20, vistas_unicas: 5, abandonos: 3 },
        ],
        duracionTotal: 30,
      },
    })
    const bars = wrapper.findAll('.heatmap-bar')
    expect(bars.length).toBe(3)
  })

  it('muestra etiquetas de tiempo', () => {
    const wrapper = mount(VideoHeatmap, {
      props: {
        data: [
          { intervalo_inicio: 0, vistas_unicas: 10, abandonos: 2 },
          { intervalo_inicio: 10, vistas_unicas: 8, abandonos: 1 },
          { intervalo_inicio: 20, vistas_unicas: 5, abandonos: 3 },
        ],
        duracionTotal: 30,
      },
    })
    expect(wrapper.text()).toContain('0:00')
    expect(wrapper.text()).toContain('0:15')
    expect(wrapper.text()).toContain('0:30')
  })
})
