import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SesionesCalendario from '@/components/SesionesCalendario.vue'

const mockListarEventosCalendario = vi.fn()

vi.mock('@/services/sesionesVirtuales.js', () => ({
  listarEventosCalendario: (...args) => mockListarEventosCalendario(...args),
}))

describe('SesionesCalendario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders calendar grid', async () => {
    mockListarEventosCalendario.mockResolvedValue([])

    const wrapper = mount(SesionesCalendario, {
      props: { cursoId: 'c1' },
    })
    await flushPromises()

    expect(wrapper.find('[data-test="mes-titulo"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="calendario-celda"]').length).toBeGreaterThan(0)
  })

  it('displays events in calendar', async () => {
    const fecha = new Date()
    const iso = fecha.toISOString().slice(0, 10)
    mockListarEventosCalendario.mockResolvedValue([
      { tipo: 'sesion', titulo: 'S1', fecha: `${iso}T10:00:00Z`, id: 'e1' },
    ])

    const wrapper = mount(SesionesCalendario, {
      props: { cursoId: 'c1' },
    })
    await flushPromises()

    const eventosLista = wrapper.findAll('[data-test="evento-lista"]')
    expect(eventosLista.length).toBe(1)
    expect(eventosLista[0].text()).toContain('S1')
  })

  it('navigates months', async () => {
    mockListarEventosCalendario.mockResolvedValue([])

    const wrapper = mount(SesionesCalendario, {
      props: { cursoId: 'c1' },
    })
    await flushPromises()

    const tituloInicial = wrapper.find('[data-test="mes-titulo"]').text()

    await wrapper.find('[data-test="mes-siguiente"]').trigger('click')
    await flushPromises()

    const tituloNuevo = wrapper.find('[data-test="mes-titulo"]').text()
    expect(tituloNuevo).not.toBe(tituloInicial)
  })
})
