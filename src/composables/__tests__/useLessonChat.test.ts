import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { ref, computed, nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useLessonChat } from '../useLessonChat'

vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(() => Promise.resolve({ data: [], count: null })),
  sbInsert: vi.fn(() => Promise.resolve({})),
}))
vi.mock('@/services/instructores', () => ({
  fetchInstructoresDeCurso: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/data.js', () => ({ USER: { nombre: 'Test', apellidos: 'User' } }))

import { sbSelect, sbInsert } from '@/lib/sbRest'

describe('useLessonChat', () => {
  beforeEach(() => vi.clearAllMocks())

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

  function factory() {
    return useLessonChat({
      leccionId: ref('12345678-1234-1234-1234-123456789abc'),
      session: computed(() => ({ access_token: 'tok', user: { id: 'u1' } })),
      appUser: computed(() => null),
      cursoId: 'c1',
    })
  }

  it('carga comentarios al montar', async () => {
    ;(sbSelect as Mock).mockResolvedValueOnce({
      data: [
        {
          id: 1,
          contenido: 'Hola',
          creado_en: '2024-01-01T10:00:00Z',
          perfiles: { nombres: 'Ana', apellido_paterno: 'García' },
          user_id: 'u2',
        },
      ],
      count: null,
    })
    const chat = withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    expect(chat.comentarios.value).toHaveLength(1)
    expect(chat.comentarios.value[0].texto).toBe('Hola')
  })

  it('sendComment inserta en BD', async () => {
    const chat = withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    chat.draft.value = 'Nuevo comentario'
    await chat.sendComment()
    expect(sbInsert).toHaveBeenCalled()
    expect(chat.draft.value).toBe('')
    expect(chat.comentarios.value).toHaveLength(1)
  })

  it('hace polling cada 8s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // El valor no se usa: esta prueba solo comprueba que el polling dispara.
    withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    expect(sbSelect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(8000)
    expect(sbSelect).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
