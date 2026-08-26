import { describe, it, expect } from 'vitest'
import { categoriaVisual, inicialPortada } from '../categoriaVisual.js'

describe('categoriaVisual', () => {
  it('cada nivel del esquema tiene su pastel', () => {
    expect(categoriaVisual({ nivel: 'Fundamental' })).toBe('datos')
    expect(categoriaVisual({ nivel: 'Intermedio' })).toBe('red')
    expect(categoriaVisual({ nivel: 'Avanzado' })).toBe('seguridad')
  })

  it('sin nivel (columna nullable) cae al pastel restante, nunca a undefined', () => {
    expect(categoriaVisual({})).toBe('personas')
    expect(categoriaVisual(null)).toBe('personas')
    expect(categoriaVisual({ nivel: 'otro' })).toBe('personas')
  })
})

describe('inicialPortada', () => {
  it('toma la primera letra en mayúscula', () => {
    expect(inicialPortada('redes para todos')).toBe('R')
    expect(inicialPortada('  Ética pública')).toBe('É')
  })

  it('sin título no deja la portada vacía', () => {
    expect(inicialPortada('')).toBe('?')
    expect(inicialPortada(null)).toBe('?')
  })
})
