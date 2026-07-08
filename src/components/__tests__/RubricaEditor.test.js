import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RubricaEditor from '@/components/RubricaEditor.vue'

describe('RubricaEditor', () => {
  it('renders criterio inputs', () => {
    const wrapper = mount(RubricaEditor, {
      props: {
        modelValue: {
          tipo: 'niveles',
          titulo: 'Rúbrica de prueba',
          puntaje_maximo: 100,
          criterios: [{ titulo: 'Calidad', descripcion: 'Desc', peso: 1.0 }],
          niveles: [{ etiqueta: 'Excelente', puntaje: 100 }],
        },
      },
    })

    expect(wrapper.find('[data-test="tipo-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="titulo-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="puntaje-max-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="criterio-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="criterio-titulo"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="criterio-descripcion"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="criterio-peso"]').exists()).toBe(true)
  })

  it('adding a criterio updates modelValue', async () => {
    const wrapper = mount(RubricaEditor, {
      props: {
        modelValue: {
          tipo: 'niveles',
          titulo: '',
          puntaje_maximo: 100,
          criterios: [],
          niveles: [],
        },
      },
    })

    await wrapper.find('[data-test="add-criterio-btn"]').trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted).toHaveLength(1)

    const updated = emitted[0][0]
    expect(updated.criterios).toHaveLength(1)
    expect(updated.criterios[0]).toMatchObject({
      titulo: '',
      descripcion: '',
      peso: 1.0,
    })
  })
})
