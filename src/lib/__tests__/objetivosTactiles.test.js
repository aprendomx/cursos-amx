import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Un control demasiado pequeño no se falla «un poco»: se falla del todo, y lo
// pagan quien tiene el pulso menos fino, quien usa el móvil en la calle y
// quien no ve bien dónde está apuntando.
//
// El objetivo táctil de una casilla NO es el cuadrito: si un <label> la
// envuelve, pinchar el texto también la alterna, así que el objetivo es la
// etiqueta entera. Por eso lo que se exige aquí es una altura mínima en la
// etiqueta, y de paso un cuadrito que se pueda apuntar.
//
// Medido en navegador antes de arreglarlo: la casilla del consentimiento del
// aviso —paso 4 del alta, camino crítico de registro— daba 464 x 21 px. El
// ancho sobraba; la altura no llegaba ni a los 24 px del mínimo AA.

const RAIZ = resolve(__dirname, '../../..')
const MINIMO_CUADRO = 24 // WCAG 2.5.8, Target Size (Minimum)
const MINIMO_ETIQUETA = 44 // Apple HIG / Material, y lo que usa el resto del repo

function archivos() {
  const salida = []
  for (const dir of ['src/components', 'src/pages']) {
    for (const nombre of readdirSync(join(RAIZ, dir))) {
      if (!nombre.endsWith('.vue')) continue
      const ruta = join(dir, nombre)
      salida.push({ ruta, texto: readFileSync(join(RAIZ, ruta), 'utf8') })
    }
  }
  return salida
}

function reglas(texto) {
  return [...texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].trim().split('\n').pop().trim(),
    cuerpo: m[2],
  }))
}

function px(cuerpo, prop) {
  const m = cuerpo.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*(\\d+)px`))
  return m ? Number(m[1]) : null
}

describe('objetivos táctiles', () => {
  it('ninguna casilla o radio se declara por debajo del mínimo', () => {
    const pequeños = []
    for (const { ruta, texto } of archivos()) {
      for (const { sel, cuerpo } of reglas(texto)) {
        if (!/checkbox|radio/.test(sel)) continue
        const w = px(cuerpo, 'width')
        const h = px(cuerpo, 'height')
        if ((w !== null && w < MINIMO_CUADRO) || (h !== null && h < MINIMO_CUADRO)) {
          pequeños.push(`${ruta} ${sel}: ${w ?? '?'}x${h ?? '?'} px`)
        }
      }
    }
    expect(pequeños, `por debajo de ${MINIMO_CUADRO}px`).toEqual([])
  })

  // El consentimiento del aviso de privacidad está en el camino crítico del
  // alta: si no se puede marcar, no hay registro posible.
  it('la etiqueta del consentimiento reserva altura suficiente', () => {
    const registro = readFileSync(join(RAIZ, 'src/pages/RegistroPage.vue'), 'utf8')
    const regla = reglas(registro).find((r) => r.sel === '.registro-accept')
    expect(regla, 'no se encontró .registro-accept').toBeTruthy()
    expect(px(regla.cuerpo, 'min-height')).toBeGreaterThanOrEqual(MINIMO_ETIQUETA)
  })
})
