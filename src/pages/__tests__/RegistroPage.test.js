import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RegistroPage from '@/pages/RegistroPage.vue'

const selectMock = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: selectMock }) }),
    }),
  },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function montar(props = {}) {
  return mount(RegistroPage, {
    props,
    global: { stubs: { IconSet: true, AppLogo: true } },
  })
}

// Avanza el asistente rellenando cada paso con datos válidos.
async function llenarHasta(wrapper, pasoFinal) {
  const vm = wrapper.vm
  if (pasoFinal >= 0) {
    vm.nombres = 'Ana'
    vm.apellido_p = 'Alumna'
    vm.password = 'contrasena123'
  }
  if (pasoFinal >= 1) {
    vm.correo = 'ana@ejemplo.mx'
    vm.telefono = '5550000001'
  }
  if (pasoFinal >= 2) {
    vm.dependencia = 'Secretaría de Educación Pública'
    vm.cargo = 'Analista'
  }
  await flushPromises()
}

describe('RegistroPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectMock.mockResolvedValue({ data: [{ nombre: 'Secretaría de Educación Pública' }] })
  })

  it('arranca en el primer paso del asistente', async () => {
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.vm.step).toBe(0)
  })

  it('no deja avanzar sin los datos obligatorios del paso', async () => {
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.vm.canAdvance).toBe(false)

    wrapper.vm.nombres = 'Ana'
    wrapper.vm.apellido_p = 'Alumna'
    await flushPromises()
    // Falta la contraseña: sigue bloqueado.
    expect(wrapper.vm.canAdvance).toBe(false)
  })

  it('exige una contraseña de al menos 8 caracteres', async () => {
    const wrapper = montar()
    await flushPromises()
    wrapper.vm.nombres = 'Ana'
    wrapper.vm.apellido_p = 'Alumna'
    wrapper.vm.password = 'corta'
    await flushPromises()
    expect(wrapper.vm.canAdvance).toBe(false)

    wrapper.vm.password = 'contrasena123'
    await flushPromises()
    expect(wrapper.vm.canAdvance).toBe(true)
  })

  it('valida el correo y el teléfono en el paso de contacto', async () => {
    const wrapper = montar()
    await flushPromises()
    await llenarHasta(wrapper, 0)
    wrapper.vm.step = 1
    wrapper.vm.correo = 'no-es-correo'
    wrapper.vm.telefono = '123'
    await flushPromises()
    expect(wrapper.vm.canAdvance).toBe(false)

    wrapper.vm.correo = 'ana@ejemplo.mx'
    wrapper.vm.telefono = '5550000001'
    await flushPromises()
    expect(wrapper.vm.canAdvance).toBe(true)
  })

  // El consentimiento del aviso de privacidad es obligatorio bajo LFPDPPP y se
  // persiste en perfiles.aviso_privacidad. Sin marcarlo no se puede completar
  // el registro.
  it('no permite completar el registro sin aceptar el aviso de privacidad', async () => {
    const wrapper = montar()
    await flushPromises()
    await llenarHasta(wrapper, 2)
    wrapper.vm.step = 3
    await flushPromises()

    expect(wrapper.vm.acepta).toBe(false)
    expect(wrapper.vm.canAdvance).toBe(false)

    wrapper.vm.next()
    await flushPromises()
    expect(wrapper.emitted('complete')).toBeFalsy()
  })

  it('emite los datos, con el consentimiento, al aceptar', async () => {
    const wrapper = montar()
    await flushPromises()
    await llenarHasta(wrapper, 2)
    wrapper.vm.step = 3
    wrapper.vm.acepta = true
    await flushPromises()

    wrapper.vm.next()
    await flushPromises()

    const emitido = wrapper.emitted('complete')
    expect(emitido).toBeTruthy()
    expect(emitido[0][0]).toMatchObject({
      nombres: 'Ana',
      apellido_p: 'Alumna',
      correo: 'ana@ejemplo.mx',
      acepta: true,
    })
  })

  it('carga el catálogo real de dependencias', async () => {
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.vm.dependenciasLista).toContain('Secretaría de Educación Pública')
  })

  // Si el catálogo no carga, el formulario debe seguir siendo usable: el
  // registro es la puerta de entrada al producto.
  it('sigue siendo usable si el catálogo de dependencias no carga', async () => {
    selectMock.mockRejectedValue(new Error('sin red'))
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.vm.dependenciasLista.length).toBeGreaterThan(0)
  })

  // App.vue pasa `:registro-error`/`:registro-loading` por router-view. Si la
  // página declara otros nombres, el alta fallida no muestra nada: el atributo
  // se queda suelto en el DOM y el usuario se queda mirando un botón quieto.
  // Estos tests pasan las props en kebab-case, igual que la plantilla real.
  it('muestra el error del alta que llega desde App.vue', async () => {
    const wrapper = montar({ 'registro-error': 'Ese correo ya está registrado.' })
    await flushPromises()

    const aviso = wrapper.find('.registro-error')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('Ese correo ya está registrado.')
    expect(aviso.attributes('role')).toBe('alert')
  })

  it('lleva el foco al error del alta para que no pase inadvertido', async () => {
    const wrapper = mount(RegistroPage, {
      attachTo: document.body,
      global: { stubs: { IconSet: true, AppLogo: true } },
    })
    await flushPromises()

    await wrapper.setProps({ 'registro-error': 'No se pudo crear la cuenta.' })
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.find('.registro-error').element)
    wrapper.unmount()
  })

  it('anuncia la espera y bloquea el botón mientras se crea la cuenta', async () => {
    const wrapper = montar({ 'registro-loading': true })
    await flushPromises()
    await llenarHasta(wrapper, 2)
    wrapper.vm.step = 3
    wrapper.vm.acepta = true
    await flushPromises()

    const crear = wrapper.findAll('button').at(-1)
    expect(crear.text()).toContain('Creando cuenta')
    expect(crear.attributes('disabled')).toBeDefined()

    // Y no vuelve a emitir el alta mientras la anterior sigue en vuelo.
    wrapper.vm.next()
    await flushPromises()
    expect(wrapper.emitted('complete')).toBeFalsy()
  })

  // El error del login viaja por `:error` en el mismo router-view. La página de
  // registro no debe confundirlo con el suyo.
  it('ignora el error de inicio de sesión', async () => {
    const wrapper = montar({ error: 'Credenciales incorrectas' })
    await flushPromises()
    expect(wrapper.find('.registro-error').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Credenciales incorrectas')
  })

  it('permite volver al paso anterior sin perder lo escrito', async () => {
    const wrapper = montar()
    await flushPromises()
    await llenarHasta(wrapper, 1)
    wrapper.vm.step = 2
    await flushPromises()

    wrapper.vm.prev()
    await flushPromises()
    expect(wrapper.vm.step).toBe(1)
    expect(wrapper.vm.correo).toBe('ana@ejemplo.mx')
  })
})
