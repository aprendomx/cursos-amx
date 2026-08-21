import { describe, it, expect, vi, beforeEach } from 'vitest'

const resetPasswordForEmail = vi.fn()
const verifyOtp = vi.fn()
const signInWithPassword = vi.fn()
const updateUser = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...a) => resetPasswordForEmail(...a),
      verifyOtp: (...a) => verifyOtp(...a),
      signInWithPassword: (...a) => signInWithPassword(...a),
      updateUser: (...a) => updateUser(...a),
    },
  },
}))

let solicitarRestablecimiento,
  MENSAJE_ENVIADO,
  canjearEnlace,
  clasificarFalloDeEnlace,
  cambiarContrasena

beforeEach(async () => {
  vi.resetModules()
  resetPasswordForEmail.mockReset()
  verifyOtp.mockReset()
  signInWithPassword.mockReset()
  updateUser.mockReset()
  ;({
    solicitarRestablecimiento,
    MENSAJE_ENVIADO,
    canjearEnlace,
    clasificarFalloDeEnlace,
    cambiarContrasena,
  } = await import('@/services/recuperacion.js'))
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

// Un enlace ya usado y uno caducado NO son el mismo problema: al primero le
// sirve mirar si la contraseña ya cambió, al segundo pedir otro. Responder
// «enlace inválido» a los dos obliga a adivinar cuál de las dos cosas pasó.
describe('clasificarFalloDeEnlace', () => {
  it('distingue el caducado', () => {
    const r = clasificarFalloDeEnlace({ message: 'Email link is invalid or has expired' })
    expect(r.motivo).toBe('caducado')
    expect(r.mensaje).toMatch(/caduc/i)
  })

  it('reconoce el código otp_expired aunque el texto cambie', () => {
    expect(clasificarFalloDeEnlace({ code: 'otp_expired', message: 'x' }).motivo).toBe('caducado')
  })

  it('distingue el ya usado', () => {
    const r = clasificarFalloDeEnlace({ message: 'Token has already been used' })
    expect(r.motivo).toBe('usado')
    expect(r.mensaje).toMatch(/ya se usó/i)
  })

  it('cae en inválido cuando no reconoce el fallo, sin inventar una causa', () => {
    const r = clasificarFalloDeEnlace({ message: 'algo inesperado' })
    expect(r.motivo).toBe('invalido')
  })

  it('los tres mensajes son distintos entre sí', () => {
    const m = [
      clasificarFalloDeEnlace({ message: 'expired' }).mensaje,
      clasificarFalloDeEnlace({ message: 'already been used' }).mensaje,
      clasificarFalloDeEnlace({ message: '???' }).mensaje,
    ]
    expect(new Set(m).size).toBe(3)
  })
})

describe('canjearEnlace', () => {
  it('canja con token_hash y tipo recovery, NO con el código PKCE', async () => {
    verifyOtp.mockResolvedValueOnce({ error: null })
    const r = await canjearEnlace('abc123')
    expect(r.ok).toBe(true)
    // Es lo que hace que el enlace sirva en un dispositivo distinto del que lo
    // pidió: verifyOtp no necesita el verificador PKCE.
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' })
  })

  it('devuelve el motivo del fallo, no solo que falló', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: 'Token has already been used' } })
    const r = await canjearEnlace('abc123')
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('usado')
  })
})

describe('cambiarContrasena', () => {
  // `updateUser` NO comprueba la contraseña vieja. Sin la verificación previa,
  // una sesión ajena momentáneamente desatendida basta para apropiarse de la
  // cuenta: se cambia la contraseña y el dueño queda fuera.
  it('verifica la actual CONTRA EL SERVIDOR antes de tocar nada', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    const r = await cambiarContrasena('a@b.mx', 'equivocada', 'nuevaValida123')
    expect(r.ok).toBe(false)
    expect(r.campo).toBe('actual')
    // Lo importante: la nueva NO llegó a guardarse.
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('con la actual correcta, guarda la nueva', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null })
    updateUser.mockResolvedValueOnce({ error: null })
    const r = await cambiarContrasena('a@b.mx', 'laDeAhora123', 'laNueva12345')
    expect(r.ok).toBe(true)
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.mx', password: 'laDeAhora123' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'laNueva12345' })
  })

  it('dice QUÉ campo falló, para no obligar a adivinar entre las dos cajas', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    const r1 = await cambiarContrasena('a@b.mx', 'mala', 'nuevaValida123')
    expect(r1.campo).toBe('actual')
    expect(r1.mensaje).toMatch(/actual/i)

    signInWithPassword.mockResolvedValueOnce({ error: null })
    updateUser.mockResolvedValueOnce({ error: { message: 'Password should be different' } })
    const r2 = await cambiarContrasena('a@b.mx', 'buena', 'rechazada123')
    expect(r2.campo).toBe('nueva')
  })

  it('al fallar la actual lo dice también de la nueva: no se guardó', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    const r = await cambiarContrasena('a@b.mx', 'mala', 'nuevaValida123')
    expect(r.mensaje).toMatch(/no se ha guardado/i)
  })
})
