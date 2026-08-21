import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Por qué existe esta prueba:
//
// Nueve componentes declaraban `outline: none` con selectores como
// `input:focus` (especificidad 0,1,1), que ganan a un `:focus-visible` global
// (0,1,0). El anillo de foco desaparecía y quien navega con teclado se quedaba
// sin saber dónde está. Seis de ellos lo "sustituían" por un cambio de color de
// borde de 1px, que es precisamente lo que el repo ya había descartado como
// insuficiente al arreglar `.field input`.
//
// Ese arreglo se hizo solo para `.field` y el defecto reapareció en otros nueve
// sitios. La lección no es "arreglar nueve componentes" sino impedir el décimo:
// la regla base lleva `!important`, y esta prueba vigila que nadie la desactive.
//
// Lo que NO se prohíbe: `outline: none` sin `!important`. Es legítimo y
// deseable — suprime el anillo al hacer clic con el ratón, mientras
// `:focus-visible` lo conserva para el teclado. Prohibirlo daría cientos de
// falsos positivos y la prueba acabaría desactivada.

// __dirname y no import.meta.url: bajo vitest, éste resuelve a una ruta
// virtual de Vite (/@fs/...) que readFileSync no sabe abrir. Es la misma forma
// que usa src/test/cursoTutorial.test.js.
const RAIZ = resolve(__dirname, '../../..')
const CSS = join(RAIZ, 'src/assets/main.css')

function archivosVue(dir) {
  const salida = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...archivosVue(ruta))
    else if (entrada.name.endsWith('.vue')) salida.push(ruta)
  }
  return salida
}

describe('indicador de foco', () => {
  const css = readFileSync(CSS, 'utf8')

  it('la regla base de :focus-visible existe y es inanulable', () => {
    const regla = css.match(/:focus-visible\s*\{[^}]*\}/)
    expect(regla, 'no hay regla global de :focus-visible').toBeTruthy()
    expect(
      regla[0],
      'la regla base debe llevar !important o cualquier componente la anula'
    ).toMatch(/outline:[^;]*!important/)
  })

  it('el anillo tiene grosor suficiente para verse sobre fondos con color', () => {
    const regla = css.match(/:focus-visible\s*\{[^}]*\}/)[0]
    const grosor = regla.match(/outline:\s*(\d+)px/)
    expect(grosor, 'el contorno debe declarar un grosor en px').toBeTruthy()
    expect(Number(grosor[1])).toBeGreaterThanOrEqual(3)
  })

  it('el color del anillo sale de un token invertible por superficie', () => {
    const regla = css.match(/:focus-visible\s*\{[^}]*\}/)[0]
    // No `var(--primary)` directo: las superficies con fondo oscuro propio
    // —el hero, el panel del reproductor— necesitan invertirlo localmente, y
    // con el color incrustado en la regla base no podrían.
    expect(regla).toContain('var(--focus-ring)')
    // Y el token deriva del color de marca en PRIMER PLANO, que theme.js
    // ajusta por contraste en ambos modos — no del color de fondo tal cual.
    expect(css).toMatch(/--focus-ring:\s*var\(--primary-fg\)/)
  })

  it('ningún componente suprime el foco con !important', () => {
    const culpables = []
    for (const archivo of archivosVue(join(RAIZ, 'src'))) {
      const txt = readFileSync(archivo, 'utf8')
      // Solo se persigue la supresión imperativa: `outline: none !important`.
      for (const m of txt.matchAll(/outline:\s*(none|0)[^;]*!important/g)) {
        culpables.push(`${archivo.replace(RAIZ, '')}: ${m[0]}`)
      }
    }
    expect(
      culpables,
      'un componente anuló el anillo de foco de forma inanulable; si necesita otro ' +
        'indicador debe declararlo, no suprimirlo'
    ).toEqual([])
  })
})
