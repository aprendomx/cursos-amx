import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchCursos,
  fetchCursoBySlug,
  fetchCursoById,
  fetchModulos,
  fetchLecciones,
  fetchLeccionesByCurso,
  crearCurso,
  actualizarCurso,
  crearModulo,
  crearLeccion,
  fetchAllCursosAdmin,
} from '@/services/cursos.js'
import { invalidateCache } from '@/composables/cache.js'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}))

describe('Cursos Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache(/.*/)
  })

  function mockChain(result) {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve(result)),
          single: vi.fn(() => Promise.resolve(result)),
        })),
        order: vi.fn(() => Promise.resolve(result)),
        single: vi.fn(() => Promise.resolve(result)),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(result)),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve(result)),
          })),
        })),
      })),
      delete: vi.fn(() => Promise.resolve(result)),
    }
  }

  it('fetchCursos caches results', async () => {
    const result = { data: [{ id: '1', titulo: 'Curso A' }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const r1 = await fetchCursos()
    expect(r1).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledTimes(1)

    const r2 = await fetchCursos()
    expect(r2).toEqual(result.data)
    expect(mockFrom).toHaveBeenCalledTimes(1) // cache hit
  })

  it('fetchCursoBySlug caches by slug', async () => {
    const result = { data: { id: '1', slug: 'curso-a' }, error: null }
    mockFrom.mockReturnValue(mockChain(result))

    const r1 = await fetchCursoBySlug('curso-a')
    expect(r1).toEqual(result.data)

    const r2 = await fetchCursoBySlug('curso-a')
    expect(mockFrom).toHaveBeenCalledTimes(1) // cache hit
  })

  it('fetchModulos caches by cursoId', async () => {
    const result = { data: [{ id: 'm1', curso_id: 'c1' }], error: null }
    mockFrom.mockReturnValue(mockChain(result))

    await fetchModulos('c1')
    await fetchModulos('c1')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('crearCurso invalidates cursos cache', async () => {
    const listResult = { data: [{ id: '1' }], error: null }
    const insertResult = { data: { id: '2' }, error: null }
    mockFrom
      .mockReturnValueOnce(mockChain(listResult))
      .mockReturnValueOnce(mockChain(insertResult))
      .mockReturnValueOnce(mockChain(listResult))

    await fetchCursos()
    await crearCurso({ titulo: 'Nuevo' })
    await fetchCursos()

    expect(mockFrom).toHaveBeenCalledTimes(3)
  })

  it('actualizarCurso invalidates cursos cache', async () => {
    const listResult = { data: [{ id: '1' }], error: null }
    const updateResult = { data: { id: '1', titulo: 'Updated' }, error: null }
    mockFrom
      .mockReturnValueOnce(mockChain(listResult))
      .mockReturnValueOnce(mockChain(updateResult))
      .mockReturnValueOnce(mockChain(listResult))

    await fetchCursos()
    await actualizarCurso('1', { titulo: 'Updated' })
    await fetchCursos()

    expect(mockFrom).toHaveBeenCalledTimes(3)
  })

  it('crearModulo invalidates modulos and lecciones cache', async () => {
    const modulosResult = { data: [{ id: 'm1' }], error: null }
    const insertResult = { data: { id: 'm2' }, error: null }
    mockFrom
      .mockReturnValueOnce(mockChain(modulosResult))
      .mockReturnValueOnce(mockChain(insertResult))
      .mockReturnValueOnce(mockChain(modulosResult))

    await fetchModulos('c1')
    await crearModulo({ curso_id: 'c1', titulo: 'Modulo Nuevo' })
    await fetchModulos('c1')

    expect(mockFrom).toHaveBeenCalledTimes(3)
  })
})
