// Utilidades de contraste (WCAG 2.1 §1.4.3).
//
// Existen porque la capa de tema inyecta los colores de marca en runtime y el
// modo oscuro NO los redefinía: con el tema de ejemplo, --brand-primary
// (#1e40af) sobre el papel oscuro (#0f1115) daba 2.17:1, muy por debajo del
// 4.5:1 que exige el nivel AA. Y como ese mismo color es el del anillo de
// foco, en modo oscuro el foco tampoco se veía.
//
// En vez de pedirle a cada institución que calcule variantes a mano, se
// derivan: se aclara el color hasta que cumple. Si el tema declara una
// variante explícita, manda esa.

export function hexARgb(hex) {
  const h = String(hex).trim().replace(/^#/, '')
  const completo =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null
  return [0, 2, 4].map((i) => parseInt(completo.slice(i, i + 2), 16))
}

export function rgbAHex([r, g, b]) {
  const c = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function luminancia(hex) {
  const rgb = hexARgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste entre dos colores. 1 = idénticos, 21 = negro sobre blanco. */
export function contraste(colorA, colorB) {
  const a = luminancia(colorA)
  const b = luminancia(colorB)
  const claro = Math.max(a, b)
  const oscuro = Math.min(a, b)
  return (claro + 0.05) / (oscuro + 0.05)
}

export function cumpleAA(colorA, colorB, textoGrande = false) {
  return contraste(colorA, colorB) >= (textoGrande ? 3 : 4.5)
}

/**
 * Aclara u oscurece un color hasta alcanzar el contraste objetivo contra
 * `fondo`. Devuelve el original si ya cumple, o el extremo (blanco/negro) si
 * no hay forma de llegar.
 */
export function ajustarParaContraste(color, fondo, objetivo = 4.5) {
  const rgb = hexARgb(color)
  if (!rgb) return color
  if (contraste(color, fondo) >= objetivo) return color

  // Hacia dónde moverse: si el fondo es oscuro, se aclara; si no, se oscurece.
  const haciaBlanco = luminancia(fondo) < 0.5
  const destino = haciaBlanco ? [255, 255, 255] : [0, 0, 0]

  // Búsqueda binaria sobre la mezcla: 24 pasos bastan para ser exactos al
  // entero y evita el bucle de 100 iteraciones de un barrido lineal.
  let bajo = 0
  let alto = 1
  let mejor = rgbAHex(destino)

  for (let i = 0; i < 24; i++) {
    const t = (bajo + alto) / 2
    const mezcla = rgb.map((c, j) => c + (destino[j] - c) * t)
    const hex = rgbAHex(mezcla)
    if (contraste(hex, fondo) >= objetivo) {
      mejor = hex
      alto = t // se puede mezclar menos y seguir cumpliendo
    } else {
      bajo = t
    }
  }
  return mejor
}

/**
 * Elige, entre una tinta clara y una oscura, la que más contraste da sobre
 * `fondo`.
 *
 * Es para las superficies cuyo color NO sigue al tema: la barra de navegación,
 * el hero o la pleca se pintan con el color institucional, que es el mismo en
 * claro y en oscuro porque es la marca. El texto de encima tiene que seguir al
 * fondo que pisa, no al modo de la página.
 *
 * No se da por hecho el blanco: una identidad clara —un amarillo, un cian—
 * necesita tinta oscura encima.
 *
 * @param {string} fondo color de la superficie, en hex
 * @param {string} claro candidato claro
 * @param {string} oscuro candidato oscuro
 * @returns {string} el de los dos que más contraste da
 */
export function tintaLegible(fondo, claro = '#ffffff', oscuro = '#161a1d') {
  return contraste(fondo, claro) >= contraste(fondo, oscuro) ? claro : oscuro
}

/**
 * Mezcla dos colores en proporción `parte` del primero. Equivale a
 * color-mix(in srgb, a <parte>%, b), pero en JS: hace falta para derivar la
 * tinta de una superficie teñida antes de que el navegador la calcule.
 *
 * @param {string} a color en hex
 * @param {string} b color en hex
 * @param {number} parte proporción de `a`, de 0 a 1
 * @returns {string} hex de la mezcla
 */
export function mezclar(a, b, parte) {
  const ra = hexARgb(a)
  const rb = hexARgb(b)
  return rgbAHex([0, 1, 2].map((i) => Math.round(ra[i] * parte + rb[i] * (1 - parte))))
}
