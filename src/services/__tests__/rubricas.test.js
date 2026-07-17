import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crearRubrica, obtenerRubrica, actualizarRubrica } from '../rubricas'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}))

function mockChain(result) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve(result)),
      })),
      single: vi.fn(() => Promise.resolve(result)),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve(result)),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve(result)),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve(result)),
    })),
  }
}

function mockInsertNoSelect(result) {
  return {
    insert: vi.fn(() => Promise.resolve(result)),
  }
}

describe('crearRubrica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crea rubrica + criterios + niveles para tipo niveles', async () => {
    const rubrica = {
      id: 'r1',
      tarea_id: 't1',
      tipo: 'niveles',
      titulo: 'Rúbrica A',
      puntaje_maximo: 10,
    }
    mockFrom
      .mockReturnValueOnce(mockChain({ data: rubrica, error: null }))
      .mockReturnValueOnce(mockInsertNoSelect({ error: null }))
      .mockReturnValueOnce(mockInsertNoSelect({ error: null }))

    const result = await crearRubrica('t1', {
      tipo: 'niveles',
      titulo: 'Rúbrica A',
      puntaje_maximo: 10,
      criterios: [
        { nombre: 'C1', descripcion: 'Desc 1', puntaje_maximo: 5 },
        { nombre: 'C2', descripcion: 'Desc 2', puntaje_maximo: 5 },
      ],
      niveles: [
        { nombre: 'Excelente', puntaje: 5 },
        { nombre: 'Regular', puntaje: 3 },
      ],
    })

    expect(result.id).toBe('r1')
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'rubricas')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'rubrica_criterios')
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'rubrica_niveles')
  })

  it('crea rubrica + criterios sin niveles para tipo puntaje_libre', async () => {
    const rubrica = {
      id: 'r2',
      tarea_id: 't2',
      tipo: 'puntaje_libre',
      titulo: 'Rúbrica B',
      puntaje_maximo: 20,
    }
    mockFrom
      .mockReturnValueOnce(mockChain({ data: rubrica, error: null }))
      .mockReturnValueOnce(mockInsertNoSelect({ error: null }))

    const result = await crearRubrica('t2', {
      tipo: 'puntaje_libre',
      titulo: 'Rúbrica B',
      puntaje_maximo: 20,
      criterios: [{ nombre: 'C1', descripcion: 'Desc', puntaje_maximo: 20 }],
      niveles: [],
    })

    expect(result.id).toBe('r2')
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'rubricas')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'rubrica_criterios')
  })
})

describe('obtenerRubrica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve rubrica con criterios y niveles anidados', async () => {
    const rubrica = {
      id: 'r1',
      tarea_id: 't1',
      tipo: 'niveles',
      titulo: 'Rúbrica A',
      puntaje_maximo: 10,
      rubrica_criterios: [{ id: 'c1', nombre: 'C1' }],
      rubrica_niveles: [{ id: 'n1', nombre: 'Excelente' }],
    }
    mockFrom.mockReturnValueOnce(mockChain({ data: rubrica, error: null }))

    const result = await obtenerRubrica('t1')

    expect(result.titulo).toBe('Rúbrica A')
    expect(result.rubrica_criterios).toHaveLength(1)
    expect(result.rubrica_niveles).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('rubricas')
  })

  it('devuelve null si no hay rubrica (PGRST116)', async () => {
    mockFrom.mockReturnValueOnce(
      mockChain({ data: null, error: { code: 'PGRST116', message: 'No rows found' } })
    )

    const result = await obtenerRubrica('t999')

    expect(result).toBeNull()
  })
})

describe('actualizarRubrica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('actualiza rubrica, borra criterios viejos e inserta nuevos', async () => {
    mockFrom
      .mockReturnValueOnce({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })
      .mockReturnValueOnce({
        delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })
      .mockReturnValueOnce(mockInsertNoSelect({ error: null }))
      .mockReturnValueOnce({
        delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })
      .mockReturnValueOnce(mockInsertNoSelect({ error: null }))

    await actualizarRubrica('r1', {
      titulo: 'Rúbrica Actualizada',
      puntaje_maximo: 15,
      criterios: [{ nombre: 'C3', descripcion: 'Nuevo', puntaje_maximo: 15 }],
      niveles: [{ nombre: 'Bien', puntaje: 15 }],
    })

    expect(mockFrom).toHaveBeenCalledTimes(5)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'rubricas')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'rubrica_criterios')
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'rubrica_criterios')
    expect(mockFrom).toHaveBeenNthCalledWith(4, 'rubrica_niveles')
    expect(mockFrom).toHaveBeenNthCalledWith(5, 'rubrica_niveles')
  })
})
