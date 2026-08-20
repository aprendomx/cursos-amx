import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MisDatosPanel from '@/components/MisDatosPanel.vue'
import { exportarMisDatos, eliminarMisDatos, descargarJson } from '@/services/datosPersonales.js'

vi.mock('@/services/datosPersonales.js', async () => {
  const real = await vi.importActual('@/services/datosPersonales.js')
  return {
    ...real,
    exportarMisDatos: vi.fn(),
    eliminarMisDatos: vi.fn(),
    descargarJson: vi.fn(),
  }
})

describe('MisDatosPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportarMisDatos.mockResolvedValue({ titular: { correo: 'a@b.mx' } })
    eliminarMisDatos.mockResolvedValue({ ok: true, mensaje: 'Listo', constancias_conservadas: 2 })
  })

  it('descarga los datos del titular (derecho de acceso)', async () => {
    const wrapper = mount(MisDatosPanel)
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(exportarMisDatos).toHaveBeenCalled()
    expect(descargarJson).toHaveBeenCalledWith(
      { titular: { correo: 'a@b.mx' } },
      expect.stringMatching(/^mis-datos-\d{4}-\d{2}-\d{2}\.json$/)
    )
  })

  // La baja es irreversible: el botón no debe poder activarse hasta que la
  // confirmación literal coincida exactamente.
  it('el botón de baja está deshabilitado sin la confirmación exacta', async () => {
    const wrapper = mount(MisDatosPanel)
    await wrapper.find('.mis-datos-peligro').trigger('click')

    const confirmar = wrapper.findAll('.mis-datos-peligro').at(-1)
    expect(confirmar.attributes('disabled')).toBeDefined()

    await wrapper.find('#confirmacion-baja').setValue('eliminar mis datos')
    expect(wrapper.findAll('.mis-datos-peligro').at(-1).attributes('disabled')).toBeDefined()

    await wrapper.find('#confirmacion-baja').setValue('ELIMINAR MIS DATOS')
    expect(wrapper.findAll('.mis-datos-peligro').at(-1).attributes('disabled')).toBeUndefined()
  })

  it('avisa de que las constancias emitidas se conservan', async () => {
    const wrapper = mount(MisDatosPanel)
    await wrapper.find('.mis-datos-peligro').trigger('click')
    expect(wrapper.text()).toContain('se conservan')
  })

  it('emite el evento de baja para que la sesión se cierre', async () => {
    const wrapper = mount(MisDatosPanel)
    await wrapper.find('.mis-datos-peligro').trigger('click')
    await wrapper.find('#confirmacion-baja').setValue('ELIMINAR MIS DATOS')
    await wrapper.findAll('.mis-datos-peligro').at(-1).trigger('click')
    await flushPromises()

    expect(eliminarMisDatos).toHaveBeenCalledWith('ELIMINAR MIS DATOS')
    expect(wrapper.emitted('baja')).toBeTruthy()
  })

  it('si la baja falla, no emite el evento ni miente al titular', async () => {
    eliminarMisDatos.mockRejectedValue(new Error('no se pudo'))
    const wrapper = mount(MisDatosPanel)
    await wrapper.find('.mis-datos-peligro').trigger('click')
    await wrapper.find('#confirmacion-baja').setValue('ELIMINAR MIS DATOS')
    await wrapper.findAll('.mis-datos-peligro').at(-1).trigger('click')
    await flushPromises()

    expect(wrapper.emitted('baja')).toBeFalsy()
    expect(wrapper.text()).toContain('no se pudo')
  })
})
