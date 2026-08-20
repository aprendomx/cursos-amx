import { describe, it, expect } from 'vitest'
import { hexARgb, luminancia, contraste, cumpleAA, ajustarParaContraste } from '../contraste.js'

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
