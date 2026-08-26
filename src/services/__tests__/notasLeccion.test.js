import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listarNotas, crearNota, actualizarNota, eliminarNota } from '@/services/notasLeccion.js'

const mockFrom = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    auth: { getSession: (...args) => mockGetSession(...args) },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
})

describe('listarNotas', () => {
  it('lista las notas de la lección en orden de creación', async () => {
    const filas = [{ id: 'n1', contenido: 'hola', segundo_video: 42 }]
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: filas, error: null }) }),
      }),
    })
    expect(await listarNotas('l1')).toEqual(filas)
    expect(mockFrom).toHaveBeenCalledWith('notas_leccion')
  })

  it('propaga el error de la base', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: null, error: new Error('rls') }) }),
      }),
    })
    await expect(listarNotas('l1')).rejects.toThrow('rls')
  })
})

describe('crearNota', () => {
  it('inserta con el user de la sesión y el segundo del video', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'n1' }, error: null }) }),
    }))
    mockFrom.mockReturnValue({ insert })

    await crearNota({ leccionId: 'l1', contenido: 'apunte', segundoVideo: 90 })

    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      leccion_id: 'l1',
      contenido: 'apunte',
      segundo_video: 90,
    })
  })

  it('sin segundo de video inserta null (lecciones sin línea de tiempo)', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'n1' }, error: null }) }),
    }))
    mockFrom.mockReturnValue({ insert })

    await crearNota({ leccionId: 'l1', contenido: 'apunte' })

    expect(insert.mock.calls[0][0].segundo_video).toBeNull()
  })

  it('sin sesión no intenta insertar', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    await expect(crearNota({ leccionId: 'l1', contenido: 'x' })).rejects.toThrow('No autenticado')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('actualizarNota / eliminarNota', () => {
  it('actualiza el contenido por id', async () => {
    const eq = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'n1' }, error: null }) }),
    }))
    mockFrom.mockReturnValue({ update: vi.fn(() => ({ eq })) })
    await actualizarNota('n1', 'nuevo texto')
    expect(eq).toHaveBeenCalledWith('id', 'n1')
  })

  it('elimina por id y propaga error', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: new Error('nope') }) }),
    })
    await expect(eliminarNota('n1')).rejects.toThrow('nope')
  })
})
