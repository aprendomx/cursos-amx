import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPreferences from '@/components/NotificationPreferences.vue'

const mockState = vi.hoisted(() => ({
  preferencias: {
    value: {
      canal_default: 'all',
      silenciados: [],
    },
  },
  guardarPrefs: vi.fn(),
}))

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => mockState,
}))

describe('NotificationPreferences', () => {
  it('renders notification types', () => {
    const wrapper = mount(NotificationPreferences)

    const items = wrapper.findAll('[data-test^="silenciar-"]')
    expect(items).toHaveLength(7)

    const labels = wrapper.findAll('.nprefs-label-text')
    const texts = labels.map((l) => l.text())
    expect(texts).toContain('Curso asignado')
    expect(texts).toContain('Evaluación calificada')
    expect(texts).toContain('Insignia desbloqueada')
    expect(texts).toContain('Respuesta en foro')
    expect(texts).toContain('Certificación lista')
    expect(texts).toContain('Deadline próximo')
    expect(texts).toContain('Anuncio del instructor')

    const canales = wrapper.findAll('[data-test^="canal-"]')
    expect(canales).toHaveLength(4)
  })

  it('toggle silenciado calls guardarPrefs', async () => {
    mockState.preferencias.value.silenciados = []
    mockState.guardarPrefs.mockClear()

    const wrapper = mount(NotificationPreferences)
    const checkbox = wrapper.find('[data-test="silenciar-curso_asignado"]')

    expect(checkbox.exists()).toBe(true)
    await checkbox.setValue(true)

    expect(mockState.guardarPrefs).toHaveBeenCalledTimes(1)
    expect(mockState.guardarPrefs).toHaveBeenCalledWith({
      silenciados: ['curso_asignado'],
    })
  })

  it('cambiar canal default calls guardarPrefs', async () => {
    mockState.preferencias.value.canal_default = 'all'
    mockState.guardarPrefs.mockClear()

    const wrapper = mount(NotificationPreferences)
    const btn = wrapper.find('[data-test="canal-email"]')

    expect(btn.exists()).toBe(true)
    await btn.trigger('click')

    expect(mockState.guardarPrefs).toHaveBeenCalledTimes(1)
    expect(mockState.guardarPrefs).toHaveBeenCalledWith({
      canal_default: 'email',
    })
  })
})
