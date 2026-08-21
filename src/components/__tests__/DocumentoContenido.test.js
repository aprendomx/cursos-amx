import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentoContenido from '@/components/DocumentoContenido.vue'

// El caso que importa: contenido HOSTIL YA ALMACENADO. Un administrador puede
// hacer PATCH contra PostgREST sin pasar por el editor, así que la defensa
// tiene que estar aquí, en el renderizado, y no en el editor.
function doc(...nodos) {
  return { type: 'doc', content: nodos }
}
function parrafo(...hijos) {
  return { type: 'paragraph', content: hijos }
}
function texto(t, marks) {
  return marks ? { type: 'text', text: t, marks } : { type: 'text', text: t }
}

describe('DocumentoContenido', () => {
  it('presenta el formato legítimo', () => {
    const w = mount(DocumentoContenido, {
      props: {
        contenido: doc(
          { type: 'heading', attrs: { level: 2 }, content: [texto('Responsable')] },
          parrafo(texto('La institución', [{ type: 'bold' }]), texto(' trata sus datos.'))
        ),
      },
    })
    const html = w.find('[data-test="documento-cuerpo"]').html()
    expect(html).toContain('Responsable')
    expect(html).toContain('<strong>La institución</strong>')
  })

  it('neutraliza un href javascript: escrito a mano en el JSON', () => {
    const w = mount(DocumentoContenido, {
      props: {
        contenido: doc(
          parrafo(texto('pulsa', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))
        ),
      },
    })
    const html = w.find('[data-test="documento-cuerpo"]').html()
    expect(html).not.toContain('javascript:')
    expect(html).toContain('pulsa')
  })

  it('degrada a un aviso cuando el JSON trae un nodo desconocido', () => {
    // generateHTML LANZA ante un nodo fuera de la whitelist en vez de
    // descartarlo. Un documento corrupto no debe tumbar la página.
    const w = mount(DocumentoContenido, {
      props: { contenido: doc({ type: 'nodoInventado', content: [texto('x')] }) },
    })
    expect(w.find('[data-test="documento-roto"]').exists()).toBe(true)
    expect(w.find('[data-test="documento-cuerpo"]').exists()).toBe(false)
  })

  it('sin contenido no rompe', () => {
    const w = mount(DocumentoContenido, { props: { contenido: null } })
    expect(w.find('[data-test="documento-cuerpo"]').text()).toBe('')
  })

  it('abre los enlaces externos fuera', () => {
    const w = mount(DocumentoContenido, {
      props: {
        contenido: doc(
          parrafo(texto('ir', [{ type: 'link', attrs: { href: 'https://ejemplo.test' } }]))
        ),
      },
    })
    expect(w.find('[data-test="documento-cuerpo"]').html()).toContain('rel="noopener noreferrer"')
  })
})
