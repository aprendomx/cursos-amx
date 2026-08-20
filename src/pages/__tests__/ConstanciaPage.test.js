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
