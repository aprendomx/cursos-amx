import { describe, it, expect, vi, beforeEach } from 'vitest'

const resetPasswordForEmail = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: { auth: { resetPasswordForEmail: (...a) => resetPasswordForEmail(...a) } },
}))

let solicitarRestablecimiento, MENSAJE_ENVIADO

beforeEach(async () => {
  vi.resetModules()
  resetPasswordForEmail.mockReset()
  ;({ solicitarRestablecimiento, MENSAJE_ENVIADO } = await import('@/services/recuperacion.js'))
})

// El requisito de seguridad de este flujo: la respuesta tiene que ser la misma
// exista o no la cuenta. Una diferencia en el texto, en el código o en el
// camino recorrido convierte el formulario en un detector de correos
// registrados.
describe('solicitarRestablecimiento', () => {
  it('responde lo mismo con cuenta y sin cuenta', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    const conCuenta = await solicitarRestablecimiento('existe@ejemplo.mx')

    // GoTrue devuelve error genérico para un correo sin cuenta en algunas
    // configuraciones; la respuesta al usuario no debe cambiar por eso.
    resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'User not found' } })
    const sinCuenta = await solicitarRestablecimiento('no-existe@ejemplo.mx')

    expect(sinCuenta).toEqual(conCuenta)
    expect(conCuenta.mensaje).toBe(MENSAJE_ENVIADO)
  })

  it('no consulta si el correo existe antes de pedir el envío', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    await solicitarRestablecimiento('alguien@ejemplo.mx')
    // Una comprobación previa sería observable por el tiempo de respuesta, y
    // además dejaría rastro en los registros del servidor.
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })

  it('el mensaje no afirma que el correo existe', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    const r = await solicitarRestablecimiento('alguien@ejemplo.mx')
    expect(r.mensaje).toMatch(/si ese correo/i)
    expect(r.mensaje).not.toMatch(/te enviamos un enlace a tu cuenta/i)
  })

  it('pide el retorno SIN fragmento, para no chocar con el enrutador', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    await solicitarRestablecimiento('alguien@ejemplo.mx')
    const opciones = resetPasswordForEmail.mock.calls[0][1]
    expect(opciones.redirectTo).toBeTruthy()
    expect(opciones.redirectTo).not.toContain('#')
  })

  it('recorta el correo antes de enviarlo', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    await solicitarRestablecimiento('  alguien@ejemplo.mx  ')
    expect(resetPasswordForEmail.mock.calls[0][0]).toBe('alguien@ejemplo.mx')
  })

  // Este caso SÍ se distingue: no revela nada sobre la cuenta, y callarlo deja
  // a la persona esperando un correo que no existe.
  it('el fallo de envío se dice, y no se disfraza de éxito', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: 'Error sending recovery email' },
    })
    const r = await solicitarRestablecimiento('alguien@ejemplo.mx')
    expect(r.ok).toBe(false)
    expect(r.sinCorreo).toBe(true)
    expect(r.mensaje).toMatch(/no puede enviar correo/i)
    expect(r.mensaje).not.toBe(MENSAJE_ENVIADO)
  })
})
