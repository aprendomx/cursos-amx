import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AsistenciaPanel from '@/components/AsistenciaPanel.vue'

const mockListarRSVP = vi.fn()
const mockMarcarAsistencia = vi.fn()

vi.mock('@/services/sesionesVirtuales.js', () => ({
  listarRSVP: (...args) => mockListarRSVP(...args),
  marcarAsistencia: (...args) => mockMarcarAsistencia(...args),
}))

describe('AsistenciaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders RSVP list', async () => {
    mockListarRSVP.mockResolvedValue([
      {
        id: 'r1',
        user_id: 'u1',
        estado: 'confirmado',
        perfiles: { nombres: 'Ana', apellido_paterno: 'López' },
      },
      {
        id: 'r2',
        user_id: 'u2',
        estado: 'cancelado',
        perfiles: { nombres: 'Luis', apellido_paterno: 'Pérez' },
      },
    ])

    const wrapper = mount(AsistenciaPanel, {
      props: { sesionId: 's1' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Ana López')
    expect(wrapper.text()).toContain('Luis Pérez')
  })

  it('marks attendance on checkbox change', async () => {
    mockListarRSVP.mockResolvedValue([
      {
        id: 'r1',
        user_id: 'u1',
        estado: 'confirmado',
        perfiles: { nombres: 'Ana', apellido_paterno: 'López' },
      },
    ])
    mockMarcarAsistencia.mockResolvedValue()

    const wrapper = mount(AsistenciaPanel, {
      props: { sesionId: 's1' },
    })
    await flushPromises()

    const checkbox = wrapper.find('[data-test="asistio-check"]')
    await checkbox.setValue(true)

    expect(mockMarcarAsistencia).toHaveBeenCalledWith('s1', 'u1', true)
  })
})
