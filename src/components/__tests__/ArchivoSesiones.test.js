import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArchivoSesiones from '@/components/ArchivoSesiones.vue'

vi.mock('@/composables/useGrabaciones.js', () => ({
  useGrabaciones: vi.fn(),
}))

import { useGrabaciones } from '@/composables/useGrabaciones.js'

describe('ArchivoSesiones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders recordings grid', async () => {
    useGrabaciones.mockReturnValue({
      grabaciones: ref([
        {
          id: 'g1',
          url_grabacion: 'https://...',
          duracion_segundos: 120,
          tamano_mb: 45.2,
          estado: 'lista',
          sesiones_virtuales: { titulo: 'S1' },
        },
      ]),
      loading: ref(false),
      error: ref(''),
      cargar: vi.fn(),
    })

    const wrapper = mount(ArchivoSesiones, {
      props: { cursoId: 'c1' },
    })
    await flushPromises()

    const tarjetas = wrapper.findAll('[data-test="grabacion-tarjeta"]')
    expect(tarjetas.length).toBe(1)
    expect(tarjetas[0].text()).toContain('S1')
  })

  it('emits reproducir on card click', async () => {
    const g = { id: 'g1', url_grabacion: 'https://...', sesion_id: 's1' }
    useGrabaciones.mockReturnValue({
      grabaciones: ref([g]),
      loading: ref(false),
      error: ref(''),
      cargar: vi.fn(),
    })

    const wrapper = mount(ArchivoSesiones, {
      props: { cursoId: 'c1' },
    })
    await flushPromises()

    await wrapper.find('[data-test="grabacion-tarjeta"]').trigger('click')
    expect(wrapper.emitted('reproducir')).toBeTruthy()
    expect(wrapper.emitted('reproducir')[0]).toEqual([g])
  })
})

import { ref } from 'vue'
