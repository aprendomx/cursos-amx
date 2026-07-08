import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CrearTareaPanel from '@/components/CrearTareaPanel.vue'

const mockCrearTarea = vi.fn()

vi.mock('@/services/entregas.js', () => ({
  crearTarea: (...args) => mockCrearTarea(...args),
}))

vi.mock('@/services/rubricas.js', () => ({
  crearRubrica: vi.fn(),
}))

describe('CrearTareaPanel', () => {
  beforeEach(() => {
    mockCrearTarea.mockReset()
  })

  it('renders form inputs', () => {
    const wrapper = mount(CrearTareaPanel, {
      props: { cursoId: 'c1' },
    })
    expect(wrapper.find('[data-test="titulo-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="instrucciones-textarea"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="fecha-apertura"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="fecha-limite"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="maximo-archivos"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="peso-maximo-mb"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="permitir-retraso"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="usar-rubrica"]').exists()).toBe(true)
  })

  it('emits saved when form submitted', async () => {
    mockCrearTarea.mockResolvedValue({ id: 't1', titulo: 'Tarea 1' })

    const wrapper = mount(CrearTareaPanel, {
      props: { cursoId: 'c1', moduloId: 'm1' },
    })

    await wrapper.find('[data-test="titulo-input"]').setValue('Tarea 1')
    await wrapper.find('[data-test="instrucciones-textarea"]').setValue('Instrucciones')
    await wrapper.find('[data-test="fecha-apertura"]').setValue('2026-07-01T00:00')
    await wrapper.find('[data-test="fecha-limite"]').setValue('2026-07-15T23:59')

    await wrapper.find('[data-test="guardar-btn"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.emitted('saved')).toBeTruthy()
    })

    expect(mockCrearTarea).toHaveBeenCalled()
    expect(wrapper.emitted('saved')[0]).toEqual([{ id: 't1', titulo: 'Tarea 1' }])
  })
})
