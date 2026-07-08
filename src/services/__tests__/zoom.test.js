import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  crearReunionZoom,
  eliminarReunionZoom,
  guardarConfiguracionZoom,
  obtenerConfiguracionZoom,
} from '@/services/zoom.js'

const mockFrom = vi.fn()
const mockInvoke = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}))

describe('Zoom Service (Fase L)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crearReunionZoom', () => {
    it('invokes zoom-meeting edge function and returns meeting data', async () => {
      mockInvoke.mockResolvedValue({
        data: { meeting_id: '123', join_url: 'https://zoom.us/j/123', password: 'abc' },
        error: null,
      })

      const result = await crearReunionZoom(
        'Mi Reunión',
        '2025-01-01T10:00:00Z',
        '2025-01-01T11:00:00Z',
        'Desc'
      )

      expect(mockInvoke).toHaveBeenCalledWith('zoom-meeting', {
        body: {
          titulo: 'Mi Reunión',
          inicio: '2025-01-01T10:00:00Z',
          fin: '2025-01-01T11:00:00Z',
          descripcion: 'Desc',
        },
      })
      expect(result.meeting_id).toBe('123')
    })

    it('throws on edge function error', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Zoom fail') })

      await expect(crearReunionZoom('T', '2025-01-01T10:00:00Z')).rejects.toThrow('Zoom fail')
    })
  })

  describe('eliminarReunionZoom', () => {
    it('invokes zoom-meeting with DELETE method', async () => {
      mockInvoke.mockResolvedValue({ error: null })

      await eliminarReunionZoom('123')

      expect(mockInvoke).toHaveBeenCalledWith('zoom-meeting', {
        method: 'DELETE',
        body: { meeting_id: '123' },
      })
    })
  })

  describe('guardarConfiguracionZoom', () => {
    it('upserts config into zoom_configuracion', async () => {
      const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
      mockFrom.mockReturnValueOnce({ upsert: upsertMock })

      await guardarConfiguracionZoom({
        client_id: 'id',
        client_secret: 'secret',
        account_id: 'acc',
      })

      expect(mockFrom).toHaveBeenCalledWith('zoom_configuracion')
      expect(upsertMock).toHaveBeenCalledWith(
        { client_id: 'id', client_secret: 'secret', account_id: 'acc' },
        { onConflict: 'id' }
      )
    })
  })

  describe('obtenerConfiguracionZoom', () => {
    it('returns config when found', async () => {
      const selectMock = vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { client_id: 'id' }, error: null })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerConfiguracionZoom()

      expect(result.client_id).toBe('id')
    })

    it('returns null when no rows (PGRST116)', async () => {
      const selectMock = vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } })
        ),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerConfiguracionZoom()

      expect(result).toBeNull()
    })

    it('throws on other errors', async () => {
      const selectMock = vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({ data: null, error: { code: 'OTHER', message: 'DB error' } })
        ),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      await expect(obtenerConfiguracionZoom()).rejects.toThrow('DB error')
    })
  })
})
