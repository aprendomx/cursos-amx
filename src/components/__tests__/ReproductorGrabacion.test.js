import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ReproductorGrabacion from '@/components/ReproductorGrabacion.vue'

vi.mock('@/composables/useReproductor.js', () => ({
  useReproductor: vi.fn(),
}))

import { useReproductor } from '@/composables/useReproductor.js'

// jsdom no implementa createObjectURL.
beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:subtitulos')
  globalThis.URL.revokeObjectURL = vi.fn()
})

function mockComposable(overrides = {}) {
  useReproductor.mockReturnValue({
    tiempoActual: ref(0),
    segmentoActual: ref(null),
    textoCercano: ref(''),
    transcripcion: ref(null),
    loading: ref(false),
    cargarTranscripcion: vi.fn(),
    saltarATiempo: vi.fn(),
    actualizarTiempo: vi.fn(),
    ...overrides,
  })
}

function montar() {
  return mount(ReproductorGrabacion, {
    props: { grabacion: { url_grabacion: 'https://video.mp4', sesion_id: 's1' } },
  })
}

describe('ReproductorGrabacion', () => {
  it('renders video element with src', async () => {
    mockComposable()
    const wrapper = montar()
    await flushPromises()

    const video = wrapper.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe('https://video.mp4')
  })

  it('shows transcription text when available', async () => {
    mockComposable({
      tiempoActual: ref(5),
      segmentoActual: ref({ start: 0, end: 10, text: 'Hola mundo' }),
      textoCercano: ref('Hola mundo'),
    })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Hola mundo')
  })

  // WCAG 2.1 §1.2.2 (nivel A): un video pregrabado con audio necesita
  // subtítulos, no solo un panel de transcripción al lado.
  it('monta una pista de subtítulos cuando hay segmentos', async () => {
    mockComposable({
      transcripcion: ref({
        idioma: 'es',
        segmentos: [{ start: 0, end: 2, text: 'Hola' }],
      }),
    })
    const wrapper = montar()
    await flushPromises()

    const track = wrapper.find('track')
    expect(track.exists()).toBe(true)
    expect(track.attributes('kind')).toBe('captions')
    expect(track.attributes('srclang')).toBe('es')
    expect(track.attributes('default')).toBeDefined()
  })

  it('usa el idioma detectado por la transcripción', async () => {
    mockComposable({
      transcripcion: ref({ idioma: 'en', segmentos: [{ start: 0, end: 1, text: 'Hi' }] }),
    })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('track').attributes('srclang')).toBe('en')
  })

  // Un <track> vacío anuncia subtítulos que no existen: peor que no ofrecerlos.
  it('no monta la pista si no hay segmentos utilizables', async () => {
    mockComposable({ transcripcion: ref({ idioma: 'es', segmentos: [] }) })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('track').exists()).toBe(false)
  })

  it('libera la Blob URL al desmontar', async () => {
    mockComposable({
      transcripcion: ref({ idioma: 'es', segmentos: [{ start: 0, end: 1, text: 'Hola' }] }),
    })
    const wrapper = montar()
    await flushPromises()
    wrapper.unmount()

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:subtitulos')
  })
})
