import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReproductorGrabacion from '@/components/ReproductorGrabacion.vue'

vi.mock('@/composables/useReproductor.js', () => ({
  useReproductor: vi.fn(),
}))

import { useReproductor } from '@/composables/useReproductor.js'

describe('ReproductorGrabacion', () => {
  it('renders video element with src', async () => {
    useReproductor.mockReturnValue({
      tiempoActual: ref(0),
      segmentoActual: ref(null),
      textoCercano: ref(''),
      cargarTranscripcion: vi.fn(),
      saltarATiempo: vi.fn(),
    })

    const wrapper = mount(ReproductorGrabacion, {
      props: { grabacion: { url_grabacion: 'https://video.mp4', sesion_id: 's1' } },
    })
    await flushPromises()

    const video = wrapper.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe('https://video.mp4')
  })

  it('shows transcription text when available', async () => {
    useReproductor.mockReturnValue({
      tiempoActual: ref(5),
      segmentoActual: ref({ start: 0, end: 10, text: 'Hola mundo' }),
      textoCercano: ref('Hola mundo'),
      cargarTranscripcion: vi.fn(),
      saltarATiempo: vi.fn(),
    })

    const wrapper = mount(ReproductorGrabacion, {
      props: { grabacion: { url_grabacion: 'https://video.mp4', sesion_id: 's1' } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Hola mundo')
  })
})

import { ref } from 'vue'
