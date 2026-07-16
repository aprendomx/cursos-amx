import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchProgresoCurso,
  fetchProgresoUsuario,
  marcarLeccionCompletada,
  actualizarSegundosVistos,
  fetchInscripciones,
  inscribirse,
} from '@/services/progreso.js'
import { invalidateCache } from '@/composables/cache.js'

// Create mock functions
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockSbInsert = vi.fn()

// Mock the modules before any imports
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}))

vi.mock('@/lib/sbRest', () => ({
  sbInsert: (...args) => mockSbInsert(...args),
}))

describe('Progreso Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache(/.*/)
  })

  it('fetchProgresoCurso should return data', async () => {
    const mockData = [{ id: '1', leccion_id: 'l1', completado: true }]
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
        })),
      })),
    })

    const result = await fetchProgresoCurso('user1', 'curso1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('progreso')
  })

  it('fetchProgresoCurso should throw on error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: new Error('DB Error') })),
        })),
      })),
    })

    await expect(fetchProgresoCurso('user1', 'curso1')).rejects.toThrow('DB Error')
  })

  it('marcarLeccionCompletada should call RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await marcarLeccionCompletada('leccion1')
    expect(mockRpc).toHaveBeenCalledWith('marcar_leccion_completada', {
      p_leccion_id: 'leccion1',
    })
  })

  it('actualizarSegundosVistos should floor seconds', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await actualizarSegundosVistos('leccion1', 125.7)
    expect(mockRpc).toHaveBeenCalledWith('guardar_posicion', {
      p_leccion: 'leccion1',
      p_segundos: 125,
    })
  })

  it('inscribirse should throw if no session', async () => {
    await expect(inscribirse('curso1', null)).rejects.toThrow('No autenticado')
    await expect(inscribirse('curso1', {})).rejects.toThrow('No autenticado')
    await expect(inscribirse('curso1', { user: { id: '1' } })).rejects.toThrow('No autenticado')
  })

  it('inscribirse should call sbInsert with correct data', async () => {
    const session = { user: { id: 'user1' }, access_token: 'token123' }
    mockSbInsert.mockResolvedValue({ data: { id: '1' }, error: null })

    await inscribirse('curso1', session)

    expect(mockSbInsert).toHaveBeenCalledWith(
      'inscripciones',
      { user_id: 'user1', curso_id: 'curso1' },
      'token123'
    )
  })
})
