import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CrearSesionPanel from '@/components/CrearSesionPanel.vue'

const mockCrearSesion = vi.fn()
const mockCrearSesionZoom = vi.fn()
const mockCrearReunionZoom = vi.fn()

vi.mock('@/services/sesionesVirtuales', () => ({
  crearSesion: (...args) => mockCrearSesion(...args),
  crearSesionZoom: (...args) => mockCrearSesionZoom(...args),
}))

vi.mock('@/services/zoom.js', () => ({
  crearReunionZoom: (...args) => mockCrearReunionZoom(...args),
}))

describe('CrearSesionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form inputs', () => {
    const wrapper = mount(CrearSesionPanel, {
      props: { cursoId: 'c1' },
    })
    expect(wrapper.find('[data-test="titulo-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="descripcion-textarea"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="plataforma-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="inicio-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="fin-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="guardar-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="cancelar-btn"]').exists()).toBe(true)
  })

  it('emits saved when Jitsi session created', async () => {
    mockCrearSesion.mockResolvedValue({ id: 's1', titulo: 'Sesión 1' })

    const wrapper = mount(CrearSesionPanel, {
      props: { cursoId: 'c1', moduloId: 'm1' },
    })

    await wrapper.find('[data-test="titulo-input"]').setValue('Sesión 1')
    await wrapper.find('[data-test="inicio-input"]').setValue('2025-01-01T10:00')

    await wrapper.find('[data-test="guardar-btn"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.emitted('saved')).toBeTruthy()
    })

    expect(mockCrearSesion).toHaveBeenCalled()
    expect(wrapper.emitted('saved')[0]).toEqual([{ id: 's1', titulo: 'Sesión 1' }])
  })

  it('creates Zoom meeting when platform is zoom', async () => {
    mockCrearReunionZoom.mockResolvedValue({ meeting_id: '123', join_url: 'https://zoom.us/j/123' })
    mockCrearSesionZoom.mockResolvedValue({ id: 's2', titulo: 'Zoom Session', plataforma: 'zoom' })

    const wrapper = mount(CrearSesionPanel, {
      props: { cursoId: 'c1' },
    })

    await wrapper.find('[data-test="titulo-input"]').setValue('Zoom Session')
    await wrapper.find('[data-test="plataforma-select"]').setValue('zoom')
    await wrapper.find('[data-test="inicio-input"]').setValue('2025-01-01T10:00')

    await wrapper.find('[data-test="guardar-btn"]').trigger('click')

    await vi.waitFor(() => {
      expect(mockCrearReunionZoom).toHaveBeenCalled()
    })

    expect(mockCrearSesionZoom).toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('emits cancel when cancel clicked', async () => {
    const wrapper = mount(CrearSesionPanel, {
      props: { cursoId: 'c1' },
    })

    await wrapper.find('[data-test="cancelar-btn"]').trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
