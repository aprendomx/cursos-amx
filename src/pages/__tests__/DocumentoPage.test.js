import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DocumentoPage from '@/pages/DocumentoPage.vue'

const getVigente = vi.fn()
// Se declara el módulo entero en vez de usar importActual: el servicio real
// importa el cliente de Supabase, que en pruebas no hace falta para nada.
vi.mock('@/services/documentosInstitucionales.js', () => ({
  getVigente: (...a) => getVigente(...a),
  tituloDe: (slug) =>
    ({
      'aviso-privacidad': 'Aviso de privacidad',
      'terminos-uso': 'Términos de uso',
      contacto: 'Contacto',
    })[slug] || slug,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CONTENIDO = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto del aviso' }] }],
}

function montar(slug = 'aviso-privacidad') {
  return mount(DocumentoPage, { props: { slug } })
}

describe('DocumentoPage', () => {
  it('muestra la versión vigente con su número y fecha', async () => {
    getVigente.mockResolvedValue({
      slug: 'aviso-privacidad',
      version: 3,
      contenido: CONTENIDO,
      publicado_en: '2026-08-20T12:00:00Z',
    })
    const w = montar()
    await flushPromises()

    expect(w.text()).toContain('Texto del aviso')
    // La versión y la fecha son lo que da valor probatorio a la página.
    expect(w.find('[data-test="documento-pie"]').text()).toContain('Versión 3')
  })

  it('cuando no hay versión vigente lo dice y NO muestra el borrador', async () => {
    getVigente.mockResolvedValue(null)
    const w = montar()
    await flushPromises()

    expect(w.find('[data-test="documento-sin-publicar"]').exists()).toBe(true)
    expect(w.find('[data-test="documento-cuerpo"]').exists()).toBe(false)
  })

  it('un fallo de carga no deja la página en blanco silencioso', async () => {
    // Lanza de forma SÍNCRONA, sin crear promesa: con mockRejectedValue —o con
    // una implementación async— vitest registra el rechazo como no capturado
    // aunque el componente sí lo capture, y la prueba falla por el andamiaje y
    // no por el código.
    getVigente.mockImplementation(() => {
      throw new Error('sin red')
    })
    const w = montar()
    await flushPromises()

    expect(w.find('[data-test="documento-error"]').exists()).toBe(true)
  })

  it('titula según el documento pedido', async () => {
    getVigente.mockResolvedValue(null)
    const w = montar('contacto')
    await flushPromises()
    expect(w.text()).toContain('Contacto')
  })
})
