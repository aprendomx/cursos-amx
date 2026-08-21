import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminDocumentos from '@/components/AdminDocumentos.vue'
import DocumentoContenido from '@/components/DocumentoContenido.vue'

const CONTENIDO = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'contenido' }] }],
}

const getVigente = vi.fn()
const getBorrador = vi.fn()
const getHistorial = vi.fn()
const guardarBorrador = vi.fn()
const publicar = vi.fn()
const estadoConsentimiento = vi.fn()

vi.mock('@/services/documentosInstitucionales.js', () => ({
  SLUGS: { AVISO: 'aviso-privacidad', TERMINOS: 'terminos-uso', CONTACTO: 'contacto' },
  DOCUMENTOS: [
    { slug: 'aviso-privacidad', titulo: 'Aviso de privacidad', ruta: '/aviso-privacidad' },
    { slug: 'terminos-uso', titulo: 'Términos de uso', ruta: '/terminos-uso' },
    { slug: 'contacto', titulo: 'Contacto', ruta: '/contacto' },
  ],
  getVigente: (...a) => getVigente(...a),
  getBorrador: (...a) => getBorrador(...a),
  getHistorial: (...a) => getHistorial(...a),
  guardarBorrador: (...a) => guardarBorrador(...a),
  publicar: (...a) => publicar(...a),
  estadoConsentimiento: (...a) => estadoConsentimiento(...a),
  estaVacio: (c) => !c || !JSON.stringify(c).includes('"text"'),
}))

// El editor arrastra Tiptap y aquí no aporta nada.
//
// __esModule es necesario: el componente lo carga con defineAsyncComponent, y
// Vue solo desenvuelve `default` si el objeto viene marcado como módulo ES. Sin
// esa marca toma el módulo entero por componente y el render revienta.
vi.mock('@/components/LessonRichTextEditor.vue', () => ({
  __esModule: true,
  default: { name: 'LessonRichTextEditor', template: '<div class="mock-editor" />' },
  EXTENSIONES_TEXTO: [],
}))

function prepararMocks({ vigente = null, borrador = null, historial = [] } = {}) {
  getVigente.mockResolvedValue(vigente)
  getBorrador.mockResolvedValue(borrador)
  getHistorial.mockResolvedValue(historial)
  estadoConsentimiento.mockResolvedValue({
    vigente: vigente?.version || null,
    alDia: 3,
    pendientes: 2,
    sinAceptar: 0,
  })
  guardarBorrador.mockResolvedValue(2)
  publicar.mockResolvedValue(2)
}

async function montar(estado) {
  prepararMocks(estado)
  const w = mount(AdminDocumentos)
  await flushPromises()
  return w
}

describe('AdminDocumentos', () => {
  // clearAllMocks y no mockReset: solo interesa borrar el historial de
  // llamadas entre pruebas; las implementaciones las fija prepararMocks.
  beforeEach(() => vi.clearAllMocks())

  it('guardar borrador no publica nada', async () => {
    const w = await montar({ borrador: { version: 2, contenido: CONTENIDO } })
    await w.find('[data-test="ad-guardar"]').trigger('click')
    await flushPromises()

    expect(guardarBorrador).toHaveBeenCalledWith('aviso-privacidad', CONTENIDO)
    // Lo que ven las personas no cambia hasta publicar.
    expect(publicar).not.toHaveBeenCalled()
    expect(w.find('[data-test="ad-mensaje"]').text()).toMatch(/no ha cambiado/i)
  })

  it('publicar pide confirmación y traslada si exige volver a aceptar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = await montar({ borrador: { version: 2, contenido: CONTENIDO } })

    await w.find('[data-test="ad-exige-reaceptacion"]').setValue(true)
    await w.find('[data-test="ad-publicar"]').trigger('click')
    await flushPromises()

    expect(confirmar).toHaveBeenCalled()
    expect(publicar).toHaveBeenCalledWith('aviso-privacidad', { requiereReaceptacion: true })
    confirmar.mockRestore()
  })

  it('si se cancela la confirmación no publica', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const w = await montar({ borrador: { version: 2, contenido: CONTENIDO } })

    await w.find('[data-test="ad-publicar"]').trigger('click')
    await flushPromises()

    expect(publicar).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('no deja publicar un documento vacío', async () => {
    const w = await montar({ borrador: { version: 2, contenido: { type: 'doc', content: [] } } })
    expect(w.find('[data-test="ad-publicar"]').attributes('disabled')).toBeDefined()
  })

  // Si la vista previa usara otro componente, lo previsualizado podría dejar de
  // ser lo que se publica.
  it('la vista previa usa el mismo componente que la página pública', async () => {
    const w = await montar({ borrador: { version: 2, contenido: CONTENIDO } })
    expect(w.findAllComponents(DocumentoContenido).length).toBeGreaterThan(0)
  })

  it('muestra el estado del consentimiento solo para el aviso', async () => {
    const w = await montar({ vigente: { version: 4, contenido: CONTENIDO } })
    expect(w.find('[data-test="ad-consentimiento"]').text()).toContain('pendientes')

    await w.find('[data-test="tab-contacto"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="ad-consentimiento"]').exists()).toBe(false)
  })

  it('avisa de que el registro está bloqueado si el aviso no está publicado', async () => {
    const w = await montar({ vigente: null })
    expect(w.find('[data-test="ad-consentimiento"]').text()).toMatch(/bloqueado/i)
  })
})
