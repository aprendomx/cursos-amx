// src/services/recuperacion.js
// Solicitud de restablecimiento de contraseña.
//
// La regla que gobierna este módulo: la respuesta debe ser la misma exista o no
// la cuenta. Cualquier diferencia —texto, código o tiempo— convierte el
// formulario en un detector de correos registrados, que es justo lo que no debe
// ser. Por eso aquí NO se comprueba si el correo existe antes de pedir el envío.
import { supabase } from '@/lib/supabase.js'

/** Lo que se responde siempre, haya cuenta o no. */
export const MENSAJE_ENVIADO =
  'Si ese correo tiene una cuenta, le enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de no deseado.'

/**
 * Distingue el fallo de ENVÍO —la instalación no tiene correo configurado— del
 * resto. Ese caso sí hay que decirlo: aceptar la solicitud en silencio deja a
 * la persona esperando un correo que nunca va a llegar.
 */
function esFalloDeEnvio(error) {
  const msg = String(error?.message || '')
  return /smtp|mail|email.*(send|deliver)|error sending/i.test(msg)
}

/**
 * @param {string} correo
 * @returns {Promise<{ok: boolean, mensaje: string, sinCorreo?: boolean}>}
 */
export async function solicitarRestablecimiento(correo) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(correo || '').trim(), {
    // Sin fragmento: el enrutador vive ahí, y el testigo tiene que llegar por
    // la cadena de consulta. La aplicación redirige a la pantalla de
    // restablecimiento al detectarlo.
    redirectTo: `${window.location.origin}/`,
  })

  if (error && esFalloDeEnvio(error)) {
    return {
      ok: false,
      sinCorreo: true,
      mensaje:
        'Esta instalación no puede enviar correo ahora mismo, así que no es posible restablecer la contraseña por esta vía. Avisa a quien administre la plataforma.',
    }
  }

  // Cualquier otro error se traga a propósito: distinguirlos revelaría si el
  // correo existe. GoTrue ya responde igual para un correo sin cuenta; esto
  // evita que un fallo distinto abra la rendija por otro lado.
  return { ok: true, mensaje: MENSAJE_ENVIADO }
}
