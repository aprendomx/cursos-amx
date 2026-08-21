import { describe, it, expect } from 'vitest'
import { sanitizarHtml, marcarEnlacesExternos } from '@/lib/sanitizarHtml.js'

// Estas pruebas fijan la SEGUNDA capa del renderizado de documentos
// institucionales. La primera es la whitelist de Tiptap, que restringe la
// estructura; esta filtra los atributos y esquemas de URI que la whitelist no
// mira, y cubre el caso de un administrador que escribe contra la API sin
// pasar por el editor.
describe('sanitizarHtml', () => {
  it('elimina scripts', () => {
    const salida = sanitizarHtml('<p>Hola</p><script>alert(1)</script>')
    expect(salida).toContain('Hola')
    expect(salida).not.toContain('script')
  })

  it('elimina atributos de evento', () => {
    const salida = sanitizarHtml('<p onclick="alert(1)">texto</p>')
    expect(salida).toContain('texto')
    expect(salida).not.toContain('onclick')
  })

  it('elimina href con esquema javascript', () => {
    const salida = sanitizarHtml('<a href="javascript:alert(1)">pulsa</a>')
    expect(salida).not.toContain('javascript:')
  })

  it('elimina iframes y objetos incrustados', () => {
    const salida = sanitizarHtml('<iframe src="https://x.test"></iframe><object></object>')
    expect(salida).not.toContain('iframe')
    expect(salida).not.toContain('object')
  })

  it('conserva el formato legítimo', () => {
    const entrada =
      '<h2>Título</h2><p><strong>negrita</strong> y <em>cursiva</em></p>' +
      '<ul><li>uno</li></ul><ol><li>dos</li></ol>' +
      '<a href="https://ejemplo.test">enlace</a>'
    const salida = sanitizarHtml(entrada)
    expect(salida).toContain('<h2>Título</h2>')
    expect(salida).toContain('<strong>negrita</strong>')
    expect(salida).toContain('<em>cursiva</em>')
    expect(salida).toContain('<li>uno</li>')
    expect(salida).toContain('<li>dos</li>')
    expect(salida).toContain('href="https://ejemplo.test"')
  })

  it('admite mailto y tel, que un contacto necesita', () => {
    const salida = sanitizarHtml(
      '<a href="mailto:a@b.mx">correo</a><a href="tel:5512345678">teléfono</a>'
    )
    expect(salida).toContain('mailto:a@b.mx')
    expect(salida).toContain('tel:5512345678')
  })

  it('devuelve cadena vacía sin contenido', () => {
    expect(sanitizarHtml('')).toBe('')
    expect(sanitizarHtml(null)).toBe('')
  })
})

describe('marcarEnlacesExternos', () => {
  it('abre los enlaces externos fuera y sin referente', () => {
    const salida = marcarEnlacesExternos('<a href="https://ejemplo.test">x</a>')
    expect(salida).toContain('target="_blank"')
    expect(salida).toContain('rel="noopener noreferrer"')
  })

  it('no toca los enlaces internos', () => {
    const salida = marcarEnlacesExternos('<a href="#/contacto">x</a>')
    expect(salida).not.toContain('target="_blank"')
  })

  it('respeta un target ya presente', () => {
    const salida = marcarEnlacesExternos('<a href="https://ejemplo.test" target="_self">x</a>')
    expect(salida).toContain('target="_self"')
    expect(salida).not.toContain('target="_blank"')
  })
})
