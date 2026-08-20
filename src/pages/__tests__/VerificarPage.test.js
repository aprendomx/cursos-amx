import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VerificarPage from '@/pages/VerificarPage.vue'
import { sbRpc } from '@/lib/sbRest'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/sbRest', () => ({ sbRpc: vi.fn() }))

const FOLIO = 'CON-2026-A3F1-9B2C-7D04'

function montar() {
  return mount(VerificarPage, {
    props: { folio: FOLIO },
    global: { stubs: { IconSet: true, AppLogo: true } },
  })
}

const BASE = {
  folio: FOLIO,
  emitida_en: '2026-05-01T12:00:00Z',
  hash_verif: 'deadbeefdeadbeefdeadbeef',
  nombre_persona: 'Ana Alumna',
  titulo_curso: 'Curso de prueba',
}

describe('VerificarPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra una constancia vigente como válida', async () => {
    sbRpc.mockResolvedValue([{ ...BASE, estado: 'vigente', revocada_en: null }])
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Ana Alumna')
    expect(wrapper.text()).toContain('Válida')
    expect(wrapper.text()).not.toContain('revocada')
  })

  // Los tres estados tienen que ser distinguibles: una constancia anulada no
  // es "válida" ni "no existe" (migración 066).
  it('muestra una constancia revocada como revocada, con su motivo', async () => {
    sbRpc.mockResolvedValue([
      {
        ...BASE,
        estado: 'revocada',
        revocada_en: '2026-06-01T12:00:00Z',
        motivo_revocacion: 'Emitida por error administrativo',
      },
    ])
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Revocada')
    expect(wrapper.text()).toContain('fue revocada')
    expect(wrapper.text()).toContain('Emitida por error administrativo')
    expect(wrapper.text()).not.toContain('Válida')
  })

  it('no presenta como acreditado un curso cuya constancia fue revocada', async () => {
    sbRpc.mockResolvedValue([{ ...BASE, estado: 'revocada', revocada_en: '2026-06-01T12:00:00Z' }])
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('aparecía como acreditando')
  })

  it('distingue un folio inexistente', async () => {
    sbRpc.mockResolvedValue([])
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('no encontrada')
  })
})
