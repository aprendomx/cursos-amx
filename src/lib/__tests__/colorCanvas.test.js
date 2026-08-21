import { describe, it, expect } from 'vitest'
import { resolverColor, resolverColores } from '@/lib/colorCanvas.js'

// El contexto 2D de un canvas ignora `var(--x)`: la asignación no hace nada y
// conserva el color anterior. Comprobado en navegador. De ahí este ayudante.
describe('resolverColor', () => {
  const raiz = document.createElement('div')
  raiz.style.setProperty('--tono', '#1e40af')
  raiz.style.setProperty('--alias', 'var(--tono)')
  document.body.appendChild(raiz)

  it('resuelve una variable a su valor', () => {
    expect(resolverColor('var(--tono)', raiz)).toBe('#1e40af')
  })

  it('resuelve una variable que apunta a otra', () => {
    expect(resolverColor('var(--alias)', raiz)).toBe('#1e40af')
  })

  it('usa el respaldo cuando la variable no existe', () => {
    expect(resolverColor('var(--no-existe, #abcdef)', raiz)).toBe('#abcdef')
  })

  it('deja pasar un color literal', () => {
    expect(resolverColor('#123456', raiz)).toBe('#123456')
    expect(resolverColor('rgba(0, 0, 0, 0.5)', raiz)).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('no revienta con vacío', () => {
    expect(resolverColor('', raiz)).toBe('')
    expect(resolverColor(null, raiz)).toBe('')
  })

  it('resuelve un mapa completo', () => {
    expect(resolverColores({ linea: 'var(--tono)', relleno: '#fff' }, raiz)).toEqual({
      linea: '#1e40af',
      relleno: '#fff',
    })
  })
})
