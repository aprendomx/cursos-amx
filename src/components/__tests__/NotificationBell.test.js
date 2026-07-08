import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationBell from '@/components/NotificationBell.vue'

const mockState = vi.hoisted(() => ({
  notificaciones: {
    value: [
      {
        id: 'n1',
        titulo: 'Nueva lección',
        cuerpo: 'Se publicó una nueva lección.',
        leido: false,
        created_at: new Date(Date.now() - 60000).toISOString(),
        datos: { url: '/cursos/abc' },
      },
      {
        id: 'n2',
        titulo: 'Recordatorio',
        cuerpo: 'Entrega mañana.',
        leido: true,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        datos: {},
      },
    ],
  },
  unreadCount: { value: 1 },
  marcarLeida: vi.fn(),
}))

vi.mock('@/composables/useNotificaciones.js', () => ({
  useNotificaciones: () => mockState,
}))

describe('NotificationBell', () => {
  it('renders badge with count', () => {
    const wrapper = mount(NotificationBell)
    const badge = wrapper.find('[data-test="badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
    expect(wrapper.find('[data-test="bell-button"]').attributes('aria-label')).toContain('1')
  })

  it('opens dropdown on click', async () => {
    const wrapper = mount(NotificationBell)
    expect(wrapper.find('[data-test="dropdown"]').exists()).toBe(false)
    await wrapper.find('[data-test="bell-button"]').trigger('click')
    expect(wrapper.find('[data-test="dropdown"]').exists()).toBe(true)
  })

  it('shows notifications in dropdown', async () => {
    const wrapper = mount(NotificationBell)
    await wrapper.find('[data-test="bell-button"]').trigger('click')
    const items = wrapper.findAll('[data-test="notification-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Nueva lección')
    expect(items[0].classes()).toContain('unread')
    expect(items[1].text()).toContain('Recordatorio')
  })

  it('no badge when count is 0', () => {
    mockState.unreadCount.value = 0
    mockState.notificaciones.value = []
    const wrapper = mount(NotificationBell)
    expect(wrapper.find('[data-test="badge"]').exists()).toBe(false)
  })
})
