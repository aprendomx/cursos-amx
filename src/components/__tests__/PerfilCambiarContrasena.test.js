import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const cambiarContrasena = vi.fn()
vi.mock('@/services/recuperacion.js', () => ({
  cambiarContrasena: (...a) => cambiarContrasena(...a),
}))

import PerfilCambiarContrasena from '@/components/PerfilCambiarContrasena.vue'

function montar() {
  return mount(PerfilCambiarContrasena, {
    props: { correo: 'a@b.mx' },
    global: { stubs: { IconSet: true } },
    attachTo: document.body,
  })
}

async function rellenar(w, actual, nueva) {
  await w.find('#pcc-actual').setValue(actual)
  await w.find('#pcc-nueva').setValue(nueva)
}

beforeEach(() => cambiarContrasena.mockReset())

describe('PerfilCambiarContrasena', () => {
  it('no permite enviar sin la actual o con una nueva inválida', async () => {
    const w = montar()
    const btn = w.find('button[type="submit"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await rellenar(w, 'laDeAhora', 'corta')
    expect(btn.attributes('disabled')).toBeDefined()
    await rellenar(w, 'laDeAhora', 'nuevaValida123')
    expect(btn.attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('el campo de la actual no anuncia reglas: esa contraseña ya existe', () => {
    const w = montar()
    // Solo la caja de la nueva lista requisitos; junto a la actual sugerirían
    // que hay que cambiarla.
    expect(w.findAll('.campo-contrasena-reglas')).toHaveLength(1)
    expect(w.find('#pcc-actual').attributes('autocomplete')).toBe('current-password')
    w.unmount()
  })

  it('un fallo de la actual aparece en SU campo, y la nueva se conserva', async () => {
    cambiarContrasena.mockResolvedValueOnce({
      ok: false,
      campo: 'actual',
      mensaje: 'La contraseña actual no es correcta. La nueva no se ha guardado.',
    })
    const w = montar()
    await rellenar(w, 'equivocada', 'nuevaValida123')
    await w.find('form').trigger('submit')
    await flushPromises()
    const errores = w.findAll('.campo-contrasena-error')
    expect(errores).toHaveLength(1)
    expect(w.find('#pcc-actual').element.closest('.campo-contrasena').textContent).toMatch(
      /actual no es correcta/i
    )
    // Lo escrito no se borra: obligar a reescribir la nueva castiga el error equivocado.
    expect(w.find('#pcc-nueva').element.value).toBe('nuevaValida123')
    w.unmount()
  })

  it('al cambiar, confirma con role=alert, recibe el foco y vacía los campos', async () => {
    cambiarContrasena.mockResolvedValueOnce({ ok: true })
    const w = montar()
    await rellenar(w, 'laDeAhora', 'nuevaValida123')
    await w.find('form').trigger('submit')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    const exito = w.find('.pcc-exito')
    expect(exito.exists()).toBe(true)
    expect(exito.attributes('role')).toBe('alert')
    expect(document.activeElement).toBe(exito.element)
    expect(w.find('#pcc-actual').element.value).toBe('')
    expect(w.find('#pcc-nueva').element.value).toBe('')
    w.unmount()
  })

  it('pasa el correo de la sesión, no uno escrito a mano', async () => {
    cambiarContrasena.mockResolvedValueOnce({ ok: true })
    const w = montar()
    await rellenar(w, 'laDeAhora', 'nuevaValida123')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(cambiarContrasena).toHaveBeenCalledWith('a@b.mx', 'laDeAhora', 'nuevaValida123')
    w.unmount()
  })
})
