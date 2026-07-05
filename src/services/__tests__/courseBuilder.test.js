import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEstructura,
  crearModulo,
  actualizarModulo,
  eliminarModulo,
  crearLeccion,
  actualizarLeccion,
  eliminarLeccion,
  reordenarModulos,
  reordenarLecciones,
} from '@/services/courseBuilder.js'
import { invalidateCache, withCache } from '@/composables/cache.js'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}))

function mockChain(result) {
  const thenable = Promise.resolve(result)
  const eqOrden = {
    order: vi.fn(() => ({ order: vi.fn(() => thenable) })), // .order().order() de fetchEstructura
  }
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => eqOrden),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => thenable) })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => thenable) })) })),
    })),
    delete: vi.fn(() => ({ eq: vi.fn(() => thenable) })),
  }
}

describe('courseBuilder service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache(/.*/)
  })

  it('fetchEstructura consulta modulos con lecciones anidadas y ordena', async () => {
    const data = [{ id: 'm1', orden: 1, lecciones: [{ id: 'l1', orden: 1 }] }]
    mockFrom.mockReturnValue(mockChain({ data, error: null }))
    const r = await fetchEstructura('c1')
    expect(mockFrom).toHaveBeenCalledWith('modulos')
    expect(r).toEqual(data)
  })

  it('lanza en error de supabase', async () => {
    mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('boom') }))
    await expect(fetchEstructura('c1')).rejects.toThrow('boom')
    await expect(crearModulo({ titulo: 'M' })).rejects.toThrow('boom')
    await expect(eliminarLeccion('l1')).rejects.toThrow('boom')
  })

  it('crearModulo inserta y retorna la fila', async () => {
    const row = { id: 'm1', titulo: 'M', orden: 1 }
    mockFrom.mockReturnValue(mockChain({ data: row, error: null }))
    expect(await crearModulo({ titulo: 'M', curso_id: 'c1', orden: 1 })).toEqual(row)
  })

  it('actualizarLeccion guarda contenido jsonb', async () => {
    const row = { id: 'l1', contenido: { type: 'doc', content: [] } }
    mockFrom.mockReturnValue(mockChain({ data: row, error: null }))
    const r = await actualizarLeccion('l1', { contenido: { type: 'doc', content: [] } })
    expect(r.contenido.type).toBe('doc')
  })

  it('reordenarModulos llama al RPC con items', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const items = [{ id: 'm1', orden: 1.5 }]
    await reordenarModulos(items)
    expect(mockRpc).toHaveBeenCalledWith('reordenar_modulos', { items })
  })

  it('reordenarLecciones llama al RPC y lanza en error', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const items = [{ id: 'l1', modulo_id: 'm2', orden: 2.5 }]
    await reordenarLecciones(items)
    expect(mockRpc).toHaveBeenCalledWith('reordenar_lecciones', { items })

    mockRpc.mockResolvedValue({ error: new Error('42501') })
    await expect(reordenarLecciones(items)).rejects.toThrow('42501')
  })

  it('las escrituras invalidan el cache de cursos/modulos/lecciones', async () => {
    // withCache real: cachear una lectura, escribir, verificar re-fetch
    const cachedFetch = withCache(
      async () => 'v1',
      () => 'cursos:probe'
    )
    expect(await cachedFetch()).toBe('v1')
    mockFrom.mockReturnValue(mockChain({ data: { id: 'm1' }, error: null }))
    await actualizarModulo('m1', { titulo: 'X' })
    // si invalidó /^cursos:/, la siguiente llamada re-ejecuta el fetcher
    let calls = 0
    const cachedFetch2 = withCache(
      async () => {
        calls++
        return 'v2'
      },
      () => 'cursos:probe'
    )
    await cachedFetch2()
    expect(calls).toBe(1)
  })
})
