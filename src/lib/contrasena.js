// src/lib/contrasena.js
// Las reglas que debe cumplir una contraseña, en UN solo sitio.
//
// Estaban escritas en cinco: el mensaje y el marcador de posición de
// AdminUserManager, la comprobación y el marcador de RegistroPage, y la
// constante de la función admin-set-password. Cinco copias de un mismo número
// son cinco números que pueden separarse — y este repositorio ya vivió eso con
// tres opacidades distintas para el mismo estado y dieciocho estados de error
// con casi tantos colores.
//
// El servidor sigue validando por su cuenta: esto es para poder DECIRLE a la
// persona qué se le exige antes de que escriba, no para sustituir la
// comprobación de quien manda.

/** Longitud mínima exigida. El mismo número que aplica la función edge. */
export const MINIMO_LONGITUD = 8

/**
 * Las reglas en un formato que la interfaz puede mostrar ANTES de que alguien
 * escriba. Anunciarlas solo al rechazar convierte el formulario en adivinanza.
 */
export const REGLAS = Object.freeze([
  {
    id: 'longitud',
    texto: `Al menos ${MINIMO_LONGITUD} caracteres`,
    cumple: (valor) => String(valor || '').length >= MINIMO_LONGITUD,
  },
])

/**
 * Evalúa una contraseña contra todas las reglas.
 *
 * @param {string} valor
 * @returns {{valida: boolean, reglas: Array<{id: string, texto: string, cumple: boolean}>, error: string|null}}
 */
export function evaluarContrasena(valor) {
  const reglas = REGLAS.map((r) => ({ id: r.id, texto: r.texto, cumple: r.cumple(valor) }))
  const incumplida = reglas.find((r) => !r.cumple)
  return {
    valida: !incumplida,
    reglas,
    // El mensaje nombra el problema concreto, no «contraseña inválida»: quien
    // lo lee tiene que saber qué corregir sin volver a intentarlo a ciegas.
    error: incumplida ? incumplida.texto : null,
  }
}

/**
 * @param {string} valor
 * @returns {boolean}
 */
export function contrasenaValida(valor) {
  return evaluarContrasena(valor).valida
}
