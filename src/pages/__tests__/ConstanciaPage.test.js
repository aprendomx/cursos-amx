import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConstanciaPage from '@/pages/ConstanciaPage.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Cadena mínima: supabase.from(...).select(...).eq(...).eq(...).single()
const singleMock = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: singleMock }),
        }),
      }),
    }),
  },
}))

vi.mock('html2pdf.js', () => ({ default: vi.fn() }))
vi.mock('qrcode.vue', () => ({
  default: { name: 'QrcodeVue', props: ['value', 'size'], template: '<div data-test="qr" />' },
}))
vi.mock('@/services/constanciaConfig.js', () => ({
  getConstanciaConfig: vi.fn().mockResolvedValue({}),
  CONSTANCIA_DEFAULTS: {},
}))
vi.mock('@/services/constanciaDisenos.js', () => ({
  urlFirma: (p) => (p ? `https://cdn.test/${p}` : null),
  urlAsset: (p) => (p ? `https://cdn.test/${p}` : null),
}))

const CURSO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SESSION = { user: { id: 'user-1' } }

function montar(props = {}) {
  return mount(ConstanciaPage, {
    props: { cursoId: CURSO_ID, session: SESSION, ...props },
    global: { stubs: { IconSet: true } },
  })
}

describe('ConstanciaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: null, error: null })
  })

  // Regresión de la migración 061 / acción A9: la página fabricaba un folio
  // terminado en «-4721» con datos demo cuando no había constancia real, y
  // seguía ofreciendo el PDF descargable.
  it('no pinta ningún documento cuando no hay constancia real', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('.cnst-doc').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aún no tienes constancia')
    expect(wrapper.text()).not.toContain('4721')
  })

  it('no ofrece descargar ni compartir sin constancia real', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('.cnst-topbar-actions').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Descargar PDF')
  })

  it('tampoco pinta documento cuando no hay sesión', async () => {
    const wrapper = montar({ session: null })
    await flushPromises()

    expect(wrapper.find('.cnst-doc').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aún no tienes constancia')
  })

  it('pinta la constancia real, con su folio de la base', async () => {
    singleMock.mockResolvedValue({
      data: {
        folio: 'CON-2026-A3F1-9B2C-7D04',
        emitida_en: '2026-05-01T12:00:00Z',
        hash_verif: 'deadbeef',
        cursos: { titulo: 'Curso de prueba', duracion: '3h' },
        perfiles: {
          nombres: 'Ana',
          apellido_paterno: 'Alumna',
          apellido_materno: null,
          nombres_completos: 'Ana Alumna',
        },
      },
      error: null,
    })

    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('.cnst-doc').exists()).toBe(true)
    expect(wrapper.text()).toContain('CON-2026-A3F1-9B2C-7D04')
    expect(wrapper.text()).toContain('Ana Alumna')
    expect(wrapper.text()).toContain('Curso de prueba')
    expect(wrapper.find('.cnst-topbar-actions').exists()).toBe(true)
  })

  it('el folio mostrado nunca se inventa a partir del id del curso', async () => {
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.text()).not.toContain(CURSO_ID.slice(0, 4).toUpperCase())
  })
})

describe('ConstanciaPage · firmantes y textos', () => {
  const base = {
    folio: 'CON-2026-A3F1-9B2C-7D04',
    emitida_en: '2026-05-01T12:00:00Z',
    hash_verif: 'deadbeef',
    cursos: { titulo: 'Transparencia', duracion: '4 horas' },
    perfiles: { nombres_completos: 'Ana Alumna' },
  }

  it('pinta varias firmas, en el orden congelado', async () => {
    singleMock.mockResolvedValue({
      data: {
        ...base,
        firmantes: [
          { nombre: 'Ana Directora', cargo: 'Directora General', firma_path: 'a.png', orden: 1 },
          { nombre: 'Beto Secretario', cargo: 'Secretario Técnico', firma_path: 'b.png', orden: 2 },
        ],
      },
      error: null,
    })
    const wrapper = montar()
    await flushPromises()

    const nombres = wrapper.findAll('.cnst-titular-nombre').map((n) => n.text())
    expect(nombres).toEqual(['Ana Directora', 'Beto Secretario'])
    expect(wrapper.findAll('.cnst-firma-img')).toHaveLength(2)
  })

  it('funciona con un solo firmante', async () => {
    singleMock.mockResolvedValue({
      data: { ...base, firmantes: [{ nombre: 'Ana', cargo: 'Directora' }] },
      error: null,
    })
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.findAll('.cnst-titular-nombre')).toHaveLength(1)
    // Sin imagen de firma no se pinta un <img> roto.
    expect(wrapper.findAll('.cnst-firma-img')).toHaveLength(0)
  })

  it('sustituye los marcadores del texto', async () => {
    singleMock.mockResolvedValue({
      data: {
        ...base,
        firmantes: [],
        textos: {
          texto_titulo: 'DIPLOMA',
          texto_cuerpo: 'a {{nombre}} por el curso {{curso}} de {{duracion}}',
        },
      },
      error: null,
    })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('DIPLOMA')
    expect(wrapper.text()).toContain('a Ana Alumna por el curso Transparencia de 4 horas')
    expect(wrapper.text()).not.toContain('{{nombre}}')
  })

  // Lo esencial del diseño: el documento refleja lo que se firmó, no el
  // catálogo de hoy.
  it('usa lo congelado y NO la configuración actual', async () => {
    singleMock.mockResolvedValue({
      data: {
        ...base,
        firmantes: [{ nombre: 'Quien firmó', cargo: 'Cargo de entonces' }],
        textos: { texto_titulo: 'CONSTANCIA DE 2026', lugar: 'Puebla' },
      },
      error: null,
    })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Quien firmó')
    expect(wrapper.text()).toContain('Cargo de entonces')
    expect(wrapper.text()).toContain('CONSTANCIA DE 2026')
    expect(wrapper.text()).toContain('Puebla')
  })

  it('una constancia anterior a la migración 070 sigue mostrando su firmante', async () => {
    const { getConstanciaConfig } = await import('@/services/constanciaConfig.js')
    getConstanciaConfig.mockResolvedValue({
      titular_nombre: 'Titular Antiguo',
      titular_cargo: 'Cargo Antiguo',
      lugar: 'Ciudad de México',
    })
    singleMock.mockResolvedValue({ data: { ...base }, error: null })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Titular Antiguo')
  })
})
