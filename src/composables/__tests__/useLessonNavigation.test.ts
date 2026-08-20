import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useLessonNavigation } from '../useLessonNavigation'

vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(() => Promise.resolve({ data: [], count: null })),
}))

import { sbSelect } from '@/lib/sbRest'

describe('useLessonNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sbSelect).mockReset()
  })

  const mockRouter = { push: vi.fn() }
  const mockUpdateTweaks = vi.fn()

  function withSetup<T>(fn: () => T): T {
    let result!: T
    const Comp = defineComponent({
      setup() {
        result = fn()
        return () => h('div')
      },
    })
    mount(Comp)
    return result
  }

  function factory(props: { cursoId: string; leccionId?: string } = { cursoId: 'c1' }) {
    return withSetup(() =>
      useLessonNavigation({
        props,
        session: computed(() => ({ access_token: 'tok', user: { id: 'u1' } })),
        tweaks: computed(() => ({ playerLayout: 'split' })),
        router: mockRouter as any,
        updateTweaks: mockUpdateTweaks,
      })
    )
  }

  it.skip('carga lecciones y curso al montar', async () => {
    // TODO: fix mocking of sbSelect in vitest hoisted vi.mock
    vi.mocked(sbSelect)
      .mockResolvedValueOnce({ data: [{ titulo: 'Curso Test' }], count: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'l1',
            modulo_id: 'm1',
            orden: 1,
            titulo: 'Lección 1',
            tipo_material: 'video',
            duracion_seg: 60,
            url_youtube: '',
            video_id: null,
            documento_path: null,
            documento_tipo: null,
            contenido: null,
            modulos: { titulo: 'M1', orden: 1, curso_id: 'c1' },
            requiere_entrega: false,
            entrega_tipos: null,
            entrega_max_mb: 10,
          },
        ],
        count: null,
      })

    const nav = factory({ cursoId: 'c1', leccionId: 'l1' })
    await flushPromises()

    expect(nav.lecciones.value).toHaveLength(1)
    expect(nav.lecciones.value[0].titulo).toBe('Lección 1')
    expect(nav.cursoTitulo.value).toBe('Curso Test')
    expect(nav.currentLeccion.value).toBe('l1')
  })

  it('selectLesson cambia lección actual', () => {
    const nav = factory()
    nav.lecciones.value = [{ id: 'l2', duracion_seg: 120, modulo_titulo: 'M2' } as any]
    nav.selectLesson('l2')
    expect(nav.currentLeccion.value).toBe('l2')
  })

  it('goToNextLesson navega a la siguiente lección', () => {
    const nav = factory()
    nav.lecciones.value = [{ id: 'l1' } as any, { id: 'l2' } as any]
    nav.currentLeccion.value = 'l1'
    nav.goToNextLesson()
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: 'player',
      params: { cursoId: 'c1', leccionId: 'l2' },
    })
  })

  it('fmtTime formatea segundos', () => {
    const nav = factory()
    expect(nav.fmtTime(65)).toBe('1:05')
    expect(nav.fmtTime(0)).toBe('0:00')
  })

  it('setVariant actualiza layout', () => {
    const nav = factory()
    nav.setVariant('stacked')
    expect(mockUpdateTweaks).toHaveBeenCalledWith(
      expect.objectContaining({ playerLayout: 'stacked' })
    )
  })

  it('source computed determina tipo de contenido', () => {
    const nav = factory()
    nav.lecciones.value = [{ id: 'l1', video_id: 'vid-123', tipo: 'video' } as any]
    nav.currentLeccion.value = 'l1'
    expect(nav.source.value.kind).toBe('hls')
  })
})
