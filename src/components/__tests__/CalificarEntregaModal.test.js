import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalificarEntregaModal from '@/components/CalificarEntregaModal.vue'

describe('CalificarEntregaModal', () => {
  const entrega = {
    id: 'e1',
    versiones: [
      { numero_version: 1, texto: 'Texto v1', archivos: [] },
      { numero_version: 2, texto: 'Texto v2', archivos: ['file.pdf'] },
    ],
    calificaciones: [],
  }

  const rubrica = {
    tipo: 'niveles',
    criterios: [
      { id: 'c1', titulo: 'Criterio 1', descripcion: 'Desc 1', peso: 1.0 },
      { id: 'c2', titulo: 'Criterio 2', descripcion: 'Desc 2', peso: 0.5 },
    ],
    niveles: [
      { id: 'n1', etiqueta: 'Básico', puntaje: 50 },
      { id: 'n2', etiqueta: 'Avanzado', puntaje: 100 },
    ],
  }

  it('renders rubrica criterios when rubrica provided', () => {
    const wrapper = mount(CalificarEntregaModal, {
      props: { entrega, rubrica },
    })
    const criterios = wrapper.findAll('[data-test="criterio-item"]')
    expect(criterios).toHaveLength(2)
    expect(wrapper.find('[data-test="criterio-titulo-0"]').text()).toContain('Criterio 1')
    expect(wrapper.find('[data-test="criterio-descripcion-0"]').text()).toContain('Desc 1')

    const radios = wrapper.findAll('[data-test="nivel-radio-c1"]')
    expect(radios.length).toBeGreaterThan(0)
  })

  it('calculates puntaje correctly', async () => {
    const wrapper = mount(CalificarEntregaModal, {
      props: { entrega, rubrica },
    })

    // Select first nivel for first criterio (puntaje 50 * peso 1.0 = 50)
    const radiosC1 = wrapper.findAll('[data-test="nivel-radio-c1"]')
    radiosC1[0].element.checked = true
    await radiosC1[0].trigger('change')

    // Select second nivel for second criterio (puntaje 100 * peso 0.5 = 50)
    const radiosC2 = wrapper.findAll('[data-test="nivel-radio-c2"]')
    radiosC2[1].element.checked = true
    await radiosC2[1].trigger('change')

    // Total should be 50 + 50 = 100
    expect(wrapper.find('[data-test="puntaje-total"]').text()).toContain('100')
  })
})
