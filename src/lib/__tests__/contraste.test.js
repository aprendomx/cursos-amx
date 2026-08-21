import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  hexARgb,
  luminancia,
  contraste,
  cumpleAA,
  ajustarParaContraste,
  tintaLegible,
  mezclar,
} from '../contraste.js'

const PAPEL_OSCURO = '#0f1115'
const PAPEL_CLARO = '#ffffff'

describe('contraste', () => {
  it('coincide con los valores de referencia de WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 2)
    // #767676 sobre blanco es el ejemplo canónico de 4.5:1 justo.
    expect(contraste('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contraste('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it('es simétrico', () => {
    expect(contraste('#1e40af', '#ffffff')).toBeCloseTo(contraste('#ffffff', '#1e40af'), 5)
  })

  it('acepta notación de 3 dígitos y con o sin almohadilla', () => {
    expect(hexARgb('#fff')).toEqual([255, 255, 255])
    expect(hexARgb('000')).toEqual([0, 0, 0])
    expect(hexARgb('no-es-color')).toBeNull()
  })
})

// Este es el fallo concreto que motivó el módulo.
describe('el azul de marca en modo oscuro', () => {
  it('falla AA sin ajustar', () => {
    expect(contraste('#1e40af', PAPEL_OSCURO)).toBeLessThan(3)
    expect(cumpleAA('#1e40af', PAPEL_OSCURO)).toBe(false)
  })

  it('cumple AA después de ajustar', () => {
    const ajustado = ajustarParaContraste('#1e40af', PAPEL_OSCURO)
    expect(cumpleAA(ajustado, PAPEL_OSCURO)).toBe(true)
  })
})

describe('ajustarParaContraste', () => {
  it('no toca un color que ya cumple', () => {
    expect(ajustarParaContraste('#1e40af', PAPEL_CLARO)).toBe('#1e40af')
  })

  it('aclara sobre fondo oscuro y oscurece sobre fondo claro', () => {
    const sobreOscuro = ajustarParaContraste('#1e40af', PAPEL_OSCURO)
    const sobreClaro = ajustarParaContraste('#cccccc', PAPEL_CLARO)
    expect(luminancia(sobreOscuro)).toBeGreaterThan(luminancia('#1e40af'))
    expect(luminancia(sobreClaro)).toBeLessThan(luminancia('#cccccc'))
  })

  it('respeta el objetivo pedido', () => {
    const a = ajustarParaContraste('#1e40af', PAPEL_OSCURO, 3)
    const b = ajustarParaContraste('#1e40af', PAPEL_OSCURO, 7)
    expect(contraste(a, PAPEL_OSCURO)).toBeGreaterThanOrEqual(3)
    expect(contraste(b, PAPEL_OSCURO)).toBeGreaterThanOrEqual(7)
    // Un objetivo más exigente obliga a alejarse más del color original.
    expect(luminancia(b)).toBeGreaterThan(luminancia(a))
  })

  // No debe pasarse: un ajuste que lleve todo a blanco puro perdería la marca.
  it('conserva el color lo más posible', () => {
    const ajustado = ajustarParaContraste('#1e40af', PAPEL_OSCURO, 4.5)
    expect(ajustado).not.toBe('#ffffff')
    expect(contraste(ajustado, PAPEL_OSCURO)).toBeLessThan(8)
  })

  it('devuelve el color tal cual si no es un hex válido', () => {
    expect(ajustarParaContraste('rebeccapurple', PAPEL_OSCURO)).toBe('rebeccapurple')
  })
})

// Los estados semánticos deben distinguirse ENTRE SÍ y del color de la acción
// principal. `--danger` era un alias de `--brand-primary`: un mensaje de error
// se pintaba igual que un botón primario, en 32 sitios de uso.
describe('colores semánticos', () => {
  const css = readFileSync(resolve(__dirname, '../../assets/main.css'), 'utf8')

  it('danger no es un alias del color de marca', () => {
    expect(css).not.toMatch(/--danger:\s*var\(--brand-primary\)/)
    expect(css).toMatch(/--danger:\s*var\(--brand-danger\)/)
  })

  it('danger tiene un valor propio con contraste suficiente sobre papel claro', () => {
    const m = css.match(/--brand-danger:\s*(#[0-9a-f]{6})/i)
    expect(m, 'no hay valor por defecto para --brand-danger').toBeTruthy()
    expect(contraste(m[1], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('los tres estados son distinguibles entre sí', () => {
    const de = (nombre) => css.match(new RegExp(`--${nombre}:\\s*var\\((--[a-z-]+)\\)`))?.[1]
    const estados = ['success', 'warn', 'danger'].map(de)
    expect(new Set(estados).size, `estados duplicados: ${estados}`).toBe(3)
    expect(estados).not.toContain('--brand-primary')
  })
})

// Los cuatro niveles de tinta se usan como color de TEXTO, no como decoración:
// 68 usos de --ink-3 y 48 de --ink-4, todos en `color:`. Antes, --ink-3 daba
// 3.95:1 y --ink-4 1.61:1 sobre papel blanco.
describe('escala de tinta', () => {
  const css = readFileSync(resolve(__dirname, '../../assets/main.css'), 'utf8')

  function nivelesDe(bloque) {
    const vals = {}
    for (const m of bloque.matchAll(/--(ink(?:-\d)?):\s*(#[0-9a-f]{6})/gi)) vals[m[1]] = m[2]
    return vals
  }

  it('todos los niveles cumplen AA sobre papel claro', () => {
    const claro = nivelesDe(css.slice(0, css.indexOf("[data-theme='dark']")))
    // --ink viene del token de marca, que el tema sustituye; se comprueban los
    // que tienen valor literal.
    for (const [nombre, hex] of Object.entries(claro)) {
      expect(
        contraste(hex, PAPEL_CLARO),
        `${nombre} (${hex}) sobre papel claro`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('todos los niveles cumplen AA sobre papel oscuro', () => {
    const oscuro = nivelesDe(css.slice(css.indexOf("[data-theme='dark']")))
    for (const [nombre, hex] of Object.entries(oscuro)) {
      expect(
        contraste(hex, PAPEL_OSCURO),
        `${nombre} (${hex}) sobre papel oscuro`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('tintaLegible', () => {
  it('elige blanco sobre una marca oscura', () => {
    expect(tintaLegible('#1e3a8a')).toBe('#ffffff')
  })

  // El motivo de que exista: dar por hecho el blanco rompe las identidades
  // claras, y hay instituciones cuyo color es un amarillo o un cian.
  it('elige tinta oscura sobre una marca clara', () => {
    expect(tintaLegible('#fde68a')).toBe('#161a1d')
    expect(tintaLegible('#7dd3fc')).toBe('#161a1d')
  })

  it('respeta los candidatos que se le pasen', () => {
    expect(tintaLegible('#1e3a8a', '#fffbea', '#101010')).toBe('#fffbea')
  })

  it('lo que elige cumple AA en ambos extremos de la marca', () => {
    for (const marca of ['#1e40af', '#0f766e', '#b45309', '#fde68a', '#ffffff', '#000000']) {
      expect(cumpleAA(tintaLegible(marca), marca), `falla sobre ${marca}`).toBe(true)
    }
  })
})

describe('mezclar', () => {
  it('en los extremos devuelve cada color', () => {
    expect(mezclar('#ff0000', '#0000ff', 1)).toBe('#ff0000')
    expect(mezclar('#ff0000', '#0000ff', 0)).toBe('#0000ff')
  })

  it('coincide con lo que calcula color-mix a mitad', () => {
    expect(mezclar('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  // El caso real: la tinta del tinte suave se deriva contra la mezcla, no
  // contra el papel, porque contra el papel da 4.5:1 justos y no sobra nada.
  it('la tinta derivada contra el tinte cumple, y la derivada contra el papel no', () => {
    const papel = '#0f1115'
    const primario = ajustarParaContraste('#1e40af', papel, 4.5)
    const tinte = mezclar(primario, papel, 0.22)
    expect(cumpleAA(primario, tinte)).toBe(false)
    expect(cumpleAA(ajustarParaContraste(primario, tinte, 4.5), tinte)).toBe(true)
  })
})
