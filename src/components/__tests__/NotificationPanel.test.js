import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPanel from '@/components/NotificationPanel.vue'

const mockState = vi.hoisted(() => {
  const { ref } = require('vue')
  const now = new Date()
  const todayIso = now.toISOString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = yesterday.toISOString()
  const older = new Date(now)
  older.setDate(older.getDate() - 3)
  const olderIso = older.toISOString()

  return {
    notificaciones: ref([
      {
        id: 'n1',
        titulo: 'Nueva lección',
        cuerpo: 'Se publicó una nueva lección hoy.',
        leido: false,
        created_at: todayIso,
        datos: {},
      },
      {
        id: 'n2',
        titulo: 'Recordatorio',
        cuerpo: 'Entrega ayer.',
        leido: true,
        created_at: yesterdayIso,
        datos: {},
      },
      {
        id: 'n3',
        titulo: 'Anuncio viejo',
        cuerpo: 'Revisa este anuncio anterior.',
        leido: false,
        created_at: olderIso,
        datos: { url: '/cursos/abc' },
      },
    ]),
    loading: ref(false),
    marcarLeida: vi.fn(),
    marcarTodas: vi.fn(),
  }
})

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => mockState,
}))

describe('NotificationPanel', () => {
  it('renders when visible=true', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    expect(wrapper.find('[data-test="notification-panel-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="notification-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="close-button"]').exists()).toBe(true)
  })

  it('does not render when visible=false', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: false } })
    expect(wrapper.find('[data-test="notification-panel-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="notification-panel"]').exists()).toBe(false)
  })

  it('shows grouped notifications', () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    const groups = wrapper.findAll('[data-test="group-title"]')
    const groupTexts = groups.map((g) => g.text())
    expect(groupTexts).toContain('Hoy')
    expect(groupTexts).toContain('Ayer')
    expect(groupTexts).toContain('Anteriores')

    const items = wrapper.findAll('[data-test="notification-item"]')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('Nueva lección')
    expect(items[0].classes()).toContain('unread')
    expect(items[1].text()).toContain('Recordatorio')
    expect(items[2].text()).toContain('Anuncio viejo')
  })

  it('emits close on overlay click', async () => {
    const wrapper = mount(NotificationPanel, { props: { visible: true } })
    await wrapper.find('[data-test="notification-panel-overlay"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
