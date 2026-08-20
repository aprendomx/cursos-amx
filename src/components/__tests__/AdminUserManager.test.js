import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminUserManager from '@/components/AdminUserManager.vue'
import { listarUsuarios, setPassword } from '@/services/usuarios.js'

vi.mock('@/services/usuarios.js', () => ({
  listarUsuarios: vi.fn(),
  setPassword: vi.fn(),
}))
vi.mock('@/lib/featureFlags.js', () => ({ featureEnabled: vi.fn(() => false) }))
vi.mock('@/components/AdminBulkImport.vue', () => ({
  default: { name: 'AdminBulkImport', template: '<div data-test="bulk" />' },
}))

const USUARIOS = [
  { id: 'u1', nombres_completos: 'Ana Alumna', correo: 'ana@ejemplo.mx', es_admin: false },
  { id: 'u2', nombres_completos: 'Caro Admin', correo: 'caro@ejemplo.mx', es_admin: true },
]

function montar() {
  return mount(AdminUserManager, {
    props: { session: { user: { id: 'admin' } } },
    global: { stubs: { IconSet: true } },
  })
}

describe('AdminUserManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarUsuarios.mockResolvedValue({ rows: USUARIOS, total: 2, pageSize: 25 })
    setPassword.mockResolvedValue(undefined)
  })

  it('lista los usuarios que devuelve el servidor', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Ana Alumna')
    expect(wrapper.text()).toContain('caro@ejemplo.mx')
  })

  it('informa si no se pueden cargar, en vez de mostrar una lista vacía sin más', async () => {
    listarUsuarios.mockRejectedValue(new Error('permiso denegado'))
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('permiso denegado')
    expect(wrapper.vm.usuarios).toEqual([])
  })

  // El restablecimiento de contraseña lo hace un administrador sobre la cuenta
  // de otra persona: las validaciones de cliente son la primera barrera contra
  // dejar una cuenta con una contraseña trivial o distinta de la comunicada.
  it('rechaza una contraseña de menos de 8 caracteres sin llamar al servidor', async () => {
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.abrirReset(USUARIOS[0])
    wrapper.vm.pwNew = 'corta'
    wrapper.vm.pwConfirm = 'corta'
    await wrapper.vm.confirmarReset()

    expect(setPassword).not.toHaveBeenCalled()
    expect(wrapper.vm.pwMsg.type).toBe('error')
    expect(wrapper.vm.pwMsg.text).toContain('8 caracteres')
  })

  it('rechaza si la confirmación no coincide', async () => {
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.abrirReset(USUARIOS[0])
    wrapper.vm.pwNew = 'contrasena123'
    wrapper.vm.pwConfirm = 'contrasena124'
    await wrapper.vm.confirmarReset()

    expect(setPassword).not.toHaveBeenCalled()
    expect(wrapper.vm.pwMsg.text).toContain('no coinciden')
  })

  it('restablece la contraseña del usuario correcto y limpia los campos', async () => {
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.abrirReset(USUARIOS[0])
    wrapper.vm.pwNew = 'contrasena123'
    wrapper.vm.pwConfirm = 'contrasena123'
    await wrapper.vm.confirmarReset()

    expect(setPassword).toHaveBeenCalledWith('u1', 'contrasena123')
    expect(wrapper.vm.pwMsg.type).toBe('ok')
    expect(wrapper.vm.pwMsg.text).toContain('Ana Alumna')
    // No debe quedar la contraseña en memoria del componente.
    expect(wrapper.vm.pwNew).toBe('')
    expect(wrapper.vm.pwConfirm).toBe('')
  })

  it('muestra el rechazo del servidor sin decir que se guardó', async () => {
    setPassword.mockRejectedValue(new Error('forbidden'))
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.abrirReset(USUARIOS[0])
    wrapper.vm.pwNew = 'contrasena123'
    wrapper.vm.pwConfirm = 'contrasena123'
    await wrapper.vm.confirmarReset()

    expect(wrapper.vm.pwMsg.type).toBe('error')
    expect(wrapper.vm.pwMsg.text).toContain('forbidden')
  })

  it('no cierra el diálogo mientras la operación está en curso', async () => {
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.abrirReset(USUARIOS[0])
    wrapper.vm.pwLoading = true
    wrapper.vm.cerrarReset()

    expect(wrapper.vm.pwModalOpen).toBe(true)
  })

  it('la búsqueda reinicia la paginación', async () => {
    vi.useFakeTimers()
    const wrapper = montar()
    await flushPromises()

    wrapper.vm.usuariosPage = 3
    wrapper.vm.usuarioSearch = 'ana'
    wrapper.vm.onUsuarioSearch()
    vi.runAllTimers()
    await flushPromises()

    expect(wrapper.vm.usuariosPage).toBe(0)
    expect(listarUsuarios).toHaveBeenLastCalledWith({ q: 'ana', page: 0 })
    vi.useRealTimers()
  })
})
