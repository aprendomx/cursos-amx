import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePlayerPage } from '../usePlayerPage'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    user: { id: 'u1' },
    session: { access_token: 'tok', user: { id: 'u1' } },
  }),
}))
vi.mock('@/stores/ui.js', () => ({
  useUiStore: () => ({ tweaks: {}, updateTweaks: vi.fn() }),
}))
vi.mock('@/lib/featureFlags.js', () => ({ featureEnabled: () => false }))
vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(() => Promise.resolve({ data: [], count: null })),
}))
vi.mock('@/services/progreso.js', () => ({
  marcarLeccionCompletada: vi.fn(() => Promise.resolve({})),
  actualizarSegundosVistos: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/services/videos', () => ({ getPlayback: vi.fn(() => Promise.resolve({})) }))
vi.mock('@/services/instructores', () => ({
  fetchInstructoresDeCurso: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/services/tiempo', () => ({ registrarTiempo: vi.fn(() => Promise.resolve()) }))
vi.mock('@/composables/useHlsPlayer.js', () => ({ useHlsPlayer: vi.fn() }))
vi.mock('@/offline/sync-queue', () => ({
  ejecutarODiferir: vi.fn(() => Promise.resolve({ diferido: false, resultado: {} })),
}))

import { marcarLeccionCompletada } from '@/services/progreso.js'
import { sbSelect } from '@/lib/sbRest'

const LEC = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    modulo_id: 'm1',
    orden: 1,
    titulo: `Lección ${id}`,
    tipo_material: 'video',
    duracion: '1:00',
    duracion_seg: 60,
    youtube_url: '',
    video_id: 'vid-1',
    documento_path: null,
    documento_tipo: null,
    contenido: null,
    tipo: 'video',
    completado: false,
    modulo_titulo: 'M1',
    modulo_orden: 1,
    requiere_entrega: false,
    entrega_tipos: null,
    entrega_max_mb: 10,
    ...extra,
  }) as any

function factory() {
  let page!: ReturnType<typeof usePlayerPage>
  const Comp = defineComponent({
    setup() {
      page = usePlayerPage({ cursoId: 'c1', leccionId: '' })
      return () => h('div')
    },
  })
  mount(Comp)
  return page
}

describe('usePlayerPage — avance sin recargar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sbSelect).mockResolvedValue({ data: [], count: null } as any)
  })

  it('al terminar el video HLS marca la lección y habilita el botón sin F5', async () => {
    vi.mocked(marcarLeccionCompletada).mockResolvedValue({ diferido: false } as any)
    const page = factory()
    page.lecciones.value = [LEC('l1'), LEC('l2')]
    page.currentLeccion.value = 'l1'
    await nextTick()

    await page.onHlsEnded()
    await nextTick()

    expect(page.completada.value).toBe(true)
    expect(page.lecciones.value[0].completado).toBe(true)
  })

  it('muestra confirmación al guardar el avance', async () => {
    vi.mocked(marcarLeccionCompletada).mockResolvedValue({ diferido: false } as any)
    const page = factory()
    page.lecciones.value = [LEC('l1')]
    page.currentLeccion.value = 'l1'
    await nextTick()

    await page.onHlsEnded()

    expect(page.avisoAvance.value?.tipo).toBe('ok')
  })

  it('avisa cuando el avance quedó pendiente de sincronizar (offline)', async () => {
    vi.mocked(marcarLeccionCompletada).mockResolvedValue({ diferido: true } as any)
    const page = factory()
    page.lecciones.value = [LEC('l1')]
    page.currentLeccion.value = 'l1'
    await nextTick()

    await page.onHlsEnded()

    expect(page.completada.value).toBe(true)
    expect(page.avisoAvance.value?.tipo).toBe('offline')
  })

  it('avisa del error si el guardado falla y no marca la lección', async () => {
    vi.mocked(marcarLeccionCompletada).mockRejectedValue(new Error('500'))
    const page = factory()
    page.lecciones.value = [LEC('l1')]
    page.currentLeccion.value = 'l1'
    await nextTick()

    await page.onHlsEnded()

    expect(page.completada.value).toBe(false)
    expect(page.lecciones.value[0].completado).toBe(false)
    expect(page.avisoAvance.value?.tipo).toBe('error')
  })

  it('vuelve a consultar el avance después de guardar', async () => {
    vi.mocked(marcarLeccionCompletada).mockResolvedValue({ diferido: false } as any)
    const page = factory()
    page.lecciones.value = [LEC('l1')]
    page.currentLeccion.value = 'l1'
    await nextTick()
    vi.mocked(sbSelect).mockClear()
    vi.mocked(sbSelect).mockResolvedValue({ data: [{ leccion_id: 'l1' }], count: null } as any)

    await page.onHlsEnded()

    const consultas = vi.mocked(sbSelect).mock.calls.map((c) => String(c[0]))
    expect(consultas.some((q) => q.startsWith('progreso?'))).toBe(true)
  })

  it('marcar lectura completada también actualiza lista y confirma', async () => {
    vi.mocked(marcarLeccionCompletada).mockResolvedValue({ diferido: false } as any)
    const page = factory()
    page.lecciones.value = [
      LEC('l1', { tipo: 'lectura', tipo_material: 'lectura', video_id: null }),
    ]
    page.currentLeccion.value = 'l1'
    await nextTick()

    await page.marcarLecturaCompletada()

    expect(page.completada.value).toBe(true)
    expect(page.lecciones.value[0].completado).toBe(true)
    expect(page.avisoAvance.value?.tipo).toBe('ok')
  })
})
