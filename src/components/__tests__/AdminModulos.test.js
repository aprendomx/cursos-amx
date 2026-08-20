import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminModulos from '@/components/AdminModulos.vue'
import { listarFlags, cambiarFlag } from '@/services/featureToggles.js'

vi.mock('@/services/featureToggles.js', async () => {
  const real = await vi.importActual('@/services/featureToggles.js')
  return { ...real, listarFlags: vi.fn(), cambiarFlag: vi.fn() }
})

describe('AdminModulos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarFlags.mockResolvedValue([
      { key: 'foros', enabled: true },
      { key: 'chat', enabled: false },
    ])
    cambiarFlag.mockResolvedValue(undefined)
  })

  it('refleja el estado que viene de la base', async () => {
    const wrapper = mount(AdminModulos)
    await flushPromises()

    expect(wrapper.find('#flag-foros').element.checked).toBe(true)
    expect(wrapper.find('#flag-chat').element.checked).toBe(false)
  })

  it('guarda el cambio al alternar', async () => {
    const wrapper = mount(AdminModulos)
    await flushPromises()

    await wrapper.find('#flag-chat').trigger('change')
    await flushPromises()

    expect(cambiarFlag).toHaveBeenCalledWith('chat', true)
    expect(wrapper.find('#flag-chat').element.checked).toBe(true)
  })

  // El apagado de estos módulos cierra sus tablas (migración 063): la interfaz
  // debe decirlo, porque no es lo mismo ocultar que bloquear.
  it('marca los módulos cuyo apagado cierra datos', async () => {
    const wrapper = mount(AdminModulos)
    await flushPromises()

    const fila = wrapper.find('#flag-foros').element.closest('.admin-modulos-fila')
    expect(fila.textContent).toContain('cierra datos')
  })

  it('muestra las claves que la versión no reconoce, en vez de ocultarlas', async () => {
    listarFlags.mockResolvedValue([{ key: 'modulo_del_futuro', enabled: true }])
    const wrapper = mount(AdminModulos)
    await flushPromises()

    expect(wrapper.text()).toContain('modulo_del_futuro')
  })

  it('avisa si no se pudo guardar y no miente sobre el estado', async () => {
    cambiarFlag.mockRejectedValue(new Error('permiso denegado'))
    const wrapper = mount(AdminModulos)
    await flushPromises()

    await wrapper.find('#flag-chat').trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('permiso denegado')
    expect(wrapper.find('#flag-chat').element.checked).toBe(false)
  })
})
