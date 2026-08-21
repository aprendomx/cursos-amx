import { describe, it, expect } from 'vitest'
import { resolverEnlace } from '@/lib/enlacesInstitucionales.js'

// El origen del cambio: estos tres enlaces venían con href '#', y el
// formulario de alta recababa el consentimiento señalando a ese '#'. La regla
// es que la configuración del tema mande cuando define una URL, y que en su
// ausencia se use la página interna — nunca '#'.
describe('resolverEnlace', () => {
  it('respeta una URL externa configurada', () => {
    const r = resolverEnlace({ label: 'Aviso de privacidad', href: 'https://x.gob.mx/aviso' })
    expect(r.href).toBe('https://x.gob.mx/aviso')
    expect(r.externo).toBe(true)
  })

  it('usa la ruta interna cuando href está vacío y hay clave doc', () => {
    const r = resolverEnlace({ label: 'Aviso', doc: 'aviso-privacidad', href: '' })
    expect(r.href).toBe('#/aviso-privacidad')
    expect(r.externo).toBe(false)
  })

  it('reconoce las tres claves', () => {
    expect(resolverEnlace({ doc: 'terminos-uso', href: '' }).href).toBe('#/terminos-uso')
    expect(resolverEnlace({ doc: 'contacto', href: '' }).href).toBe('#/contacto')
  })

  // Las instalaciones que ya existen tienen theme.config.local.js con href '#'
  // y sin la clave `doc`, que es nueva. No deben quedarse con el enlace roto.
  it('rescata configuraciones antiguas con href "#" por la etiqueta', () => {
    expect(resolverEnlace({ label: 'Aviso de privacidad', href: '#' }).href).toBe(
      '#/aviso-privacidad'
    )
    expect(resolverEnlace({ label: 'Términos de uso', href: '#' }).href).toBe('#/terminos-uso')
    expect(resolverEnlace({ label: 'Contacto', href: '#' }).href).toBe('#/contacto')
  })

  it('la etiqueta se compara sin acentos ni mayúsculas', () => {
    expect(resolverEnlace({ label: 'TERMINOS DE USO', href: '#' }).href).toBe('#/terminos-uso')
  })

  it('la clave doc gana sobre la etiqueta', () => {
    const r = resolverEnlace({ label: 'Contacto', doc: 'aviso-privacidad', href: '' })
    expect(r.href).toBe('#/aviso-privacidad')
  })

  it('deja intacto un enlace que no es de los tres documentos', () => {
    const r = resolverEnlace({ label: 'Código fuente', href: 'https://github.com/x' })
    expect(r.href).toBe('https://github.com/x')
    expect(r.externo).toBe(true)
  })

  it('un enlace desconocido sin destino no revienta', () => {
    expect(resolverEnlace({ label: 'Otra cosa', href: '#' }).href).toBe('#')
  })
})
