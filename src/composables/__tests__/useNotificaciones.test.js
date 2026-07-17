import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useNotificaciones } from '../useNotificaciones'

vi.mock('@/services/notificaciones.js', () => ({
  cargarNotificaciones: vi.fn(),
  marcarNotificacionLeida: vi.fn(),
  marcarTodasLeidas: vi.fn(),
  cargarPreferencias: vi.fn(),
  guardarPreferencias: vi.fn(),
}))

import {
  cargarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  cargarPreferencias,
  guardarPreferencias,
} from '@/services/notificaciones.js'

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function mountComposable() {
  let result
  const TestComponent = defineComponent({
    setup() {
      result = useNotificaciones()
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return result
}

describe('useNotificaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cargarNotificaciones.mockResolvedValue([])
    cargarPreferencias.mockResolvedValue({ silenciados: [], canal_default: 'all' })
  })

  it('unreadCount starts at 0', async () => {
    const n = await mountComposable()
    expect(n.unreadCount.value).toBe(0)
  })

  it('refresh loads notifications and updates unreadCount', async () => {
    const mockNotis = [
      { id: 1, leido: false },
      { id: 2, leido: true },
      { id: 3, leido: false },
    ]
    cargarNotificaciones.mockResolvedValue(mockNotis)
    cargarPreferencias.mockResolvedValue({
      silenciados: ['email'],
      canal_default: 'push',
    })

    const n = await mountComposable()
    await n.refresh()

    expect(cargarNotificaciones).toHaveBeenCalledTimes(2)
    expect(cargarPreferencias).toHaveBeenCalledTimes(2)
    expect(n.notificaciones.value).toEqual(mockNotis)
    expect(n.preferencias.value).toEqual({
      silenciados: ['email'],
      canal_default: 'push',
    })
    expect(n.unreadCount.value).toBe(2)
    expect(n.loading.value).toBe(false)
    expect(n.error.value).toBeNull()
  })

  it('marcarLeida updates local state', async () => {
    marcarNotificacionLeida.mockResolvedValue(undefined)

    const n = await mountComposable()
    n.notificaciones.value = [
      { id: 1, leido: false },
      { id: 2, leido: false },
    ]

    await n.marcarLeida(1)

    expect(marcarNotificacionLeida).toHaveBeenCalledWith(1)
    expect(n.notificaciones.value[0].leido).toBe(true)
    expect(n.notificaciones.value[1].leido).toBe(false)
  })

  it('marcarTodas marks all as read', async () => {
    marcarTodasLeidas.mockResolvedValue(undefined)

    const n = await mountComposable()
    n.notificaciones.value = [
      { id: 1, leido: false },
      { id: 2, leido: false },
      { id: 3, leido: true },
    ]

    await n.marcarTodas()

    expect(marcarTodasLeidas).toHaveBeenCalledTimes(1)
    expect(n.notificaciones.value.every((x) => x.leido)).toBe(true)
  })

  it('guardarPrefs updates local state', async () => {
    guardarPreferencias.mockResolvedValue(undefined)

    const n = await mountComposable()
    n.preferencias.value = { silenciados: [], canal_default: 'all' }

    await n.guardarPrefs({ silenciados: ['push'], canal_default: 'email' })

    expect(guardarPreferencias).toHaveBeenCalledWith({
      silenciados: ['push'],
      canal_default: 'email',
    })
    expect(n.preferencias.value).toEqual({
      silenciados: ['push'],
      canal_default: 'email',
    })
  })
})
