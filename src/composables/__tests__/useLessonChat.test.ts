import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { ref, computed, nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useLessonChat } from '../useLessonChat'
import { ejecutarODiferir } from '@/offline/sync-queue'

vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(() => Promise.resolve({ data: [], count: null })),
}))
vi.mock('@/offline/sync-queue', () => ({
  ejecutarODiferir: vi.fn(() => Promise.resolve({ diferido: false, resultado: {} })),
}))
vi.mock('@/services/instructores', () => ({
  fetchInstructoresDeCurso: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/data.js', () => ({ USER: { nombre: 'Test', apellidos: 'User' } }))

import { sbSelect } from '@/lib/sbRest'

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

  it('sendComment envía el comentario y limpia el borrador', async () => {
    const chat = withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    chat.draft.value = 'Nuevo comentario'
    await chat.sendComment()

    expect(ejecutarODiferir).toHaveBeenCalledWith(
      'forum_post',
      expect.objectContaining({ contenido: 'Nuevo comentario' })
    )
    expect(chat.draft.value).toBe('')
    expect(chat.comentarios.value).toHaveLength(1)
    // Enviado: sin marca de estado.
    expect(chat.comentarios.value[0].estado).toBeUndefined()
  })

  // La interfaz pinta el comentario de forma optimista. Si el envío no llegó a
  // la base, hay que decirlo: antes se hacía console.error y el comentario se
  // quedaba en pantalla como si estuviera guardado.
  it('marca el comentario como pendiente si quedó en la cola', async () => {
    ;(ejecutarODiferir as Mock).mockResolvedValueOnce({ diferido: true, resultado: null })
    const chat = withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    chat.draft.value = 'Sin conexión'
    await chat.sendComment()

    expect(chat.comentarios.value[0].estado).toBe('pendiente')
  })

  it('marca el comentario como fallido si el servidor lo rechaza', async () => {
    ;(ejecutarODiferir as Mock).mockRejectedValueOnce(new Error('rls'))
    const chat = withSetup(factory)
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))
    chat.draft.value = 'Rechazado'
    await chat.sendComment()

    expect(chat.comentarios.value[0].estado).toBe('fallido')
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
