import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEntregas } from '@/composables/useEntregas.js'
import * as entregasService from '@/services/entregas'
import * as rubricasService from '@/services/rubricas.js'
import { supabase } from '@/lib/supabase.js'

vi.mock('@/services/entregas', () => ({
  obtenerEntrega: vi.fn(),
  crearEntrega: vi.fn(),
  nuevaVersion: vi.fn(),
}))

vi.mock('@/services/rubricas.js', () => ({
  obtenerRubrica: vi.fn(),
}))

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}))

describe('useEntregas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('estado computed returns correct value', () => {
    const u = useEntregas('t1', 'u1')
    expect(u.estado.value).toBe('pendiente')

    u.entrega.value = { estado: 'entregada' }
    expect(u.estado.value).toBe('entregada')

    u.entrega.value = { estado: 'calificada' }
    expect(u.estado.value).toBe('calificada')
  })

  it('puedeEntregar returns true when in date', () => {
    const u = useEntregas('t1', 'u1')
    u.tarea.value = {
      fecha_apertura: '2000-01-01',
      fecha_limite: '2099-12-31',
      permitir_retraso: false,
    }
    expect(u.puedeEntregar.value).toBe(true)
  })

  it('puedeEntregar returns false when fecha_apertura is in the future', () => {
    const u = useEntregas('t1', 'u1')
    u.tarea.value = {
      fecha_apertura: '2099-01-01',
      fecha_limite: '2099-12-31',
      permitir_retraso: false,
    }
    expect(u.puedeEntregar.value).toBe(false)
  })

  it('puedeEntregar returns false when estado is calificada', () => {
    const u = useEntregas('t1', 'u1')
    u.tarea.value = {
      fecha_apertura: '2000-01-01',
      fecha_limite: '2099-12-31',
      permitir_retraso: false,
    }
    u.entrega.value = { estado: 'calificada' }
    expect(u.puedeEntregar.value).toBe(false)
  })

  it('puedeEntregar returns false when past due and permitir_retraso is false', () => {
    const u = useEntregas('t1', 'u1')
    u.tarea.value = {
      fecha_apertura: '2000-01-01',
      fecha_limite: '2000-01-02',
      permitir_retraso: false,
    }
    expect(u.puedeEntregar.value).toBe(false)
  })

  it('puedeEntregar returns true when past due but permitir_retraso is true', () => {
    const u = useEntregas('t1', 'u1')
    u.tarea.value = {
      fecha_apertura: '2000-01-01',
      fecha_limite: '2000-01-02',
      permitir_retraso: true,
    }
    expect(u.puedeEntregar.value).toBe(true)
  })

  it('diasRestantes computes correctly', () => {
    const u = useEntregas('t1', 'u1')
    expect(u.diasRestantes.value).toBeNull()

    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    u.tarea.value = { fecha_limite: future }
    expect(u.diasRestantes.value).toBeGreaterThanOrEqual(2)
    expect(u.diasRestantes.value).toBeLessThanOrEqual(4)
  })

  it('diasRetraso computes correctly', () => {
    const u = useEntregas('t1', 'u1')
    expect(u.diasRetraso.value).toBe(0)

    // Use noon UTC to avoid timezone boundary issues
    const base = new Date('2026-07-01T12:00:00Z')
    const past = new Date(base.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    u.tarea.value = { fecha_limite: past }
    u.entrega.value = { entregado_en: base.toISOString() }
    expect(u.diasRetraso.value).toBe(2)
  })

  it('diasRetraso returns 0 when entregado_en is before fecha_limite', () => {
    const u = useEntregas('t1', 'u1')
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    u.tarea.value = { fecha_limite: future }
    u.entrega.value = { entregado_en: new Date().toISOString() }
    expect(u.diasRetraso.value).toBe(0)
  })

  it('subirVersion calls crearEntrega when no entrega exists', async () => {
    const mockTarea = { id: 't1', titulo: 'Tarea' }
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockTarea, error: null }),
    })
    entregasService.obtenerEntrega
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue({ id: 'e1', estado: 'entregada', version_actual: 1 })
    rubricasService.obtenerRubrica.mockResolvedValue(null)
    entregasService.crearEntrega.mockResolvedValue({
      id: 'e1',
      estado: 'entregada',
      version_actual: 1,
    })

    const u = useEntregas('t1', 'u1')
    await u.cargar()

    const payload = { texto: 'Hola', archivos: [], comentario: '' }
    await u.subirVersion(payload)

    expect(entregasService.crearEntrega).toHaveBeenCalledWith('t1', 'u1', payload)
    expect(entregasService.nuevaVersion).not.toHaveBeenCalled()
    expect(u.entrega.value.id).toBe('e1')
  })

  it('subirVersion calls nuevaVersion when entrega exists', async () => {
    const mockTarea = { id: 't1', titulo: 'Tarea' }
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockTarea, error: null }),
    })
    entregasService.obtenerEntrega
      .mockResolvedValueOnce({ id: 'e1', estado: 'entregada', version_actual: 1 })
      .mockResolvedValue({ id: 'e1', estado: 'entregada', version_actual: 2 })
    rubricasService.obtenerRubrica.mockResolvedValue(null)
    entregasService.nuevaVersion.mockResolvedValue({
      id: 'e1',
      estado: 'entregada',
      version_actual: 2,
    })

    const u = useEntregas('t1', 'u1')
    await u.cargar()

    const payload = { texto: 'Hola', archivos: [], comentario: '' }
    await u.subirVersion(payload)

    expect(entregasService.nuevaVersion).toHaveBeenCalledWith('e1', payload)
    expect(entregasService.crearEntrega).not.toHaveBeenCalled()
    expect(u.entrega.value.version_actual).toBe(2)
  })
})
