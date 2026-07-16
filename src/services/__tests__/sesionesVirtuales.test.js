import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchSesionesCurso,
  crearSesion,
  crearSesionZoom,
  eliminarSesion,
  iniciarSesion,
  terminarSesion,
  confirmarRSVP,
  cancelarRSVP,
  listarRSVP,
  marcarAsistencia,
  listarEventosCalendario,
  exportarCalendarioICS,
} from '@/services/sesionesVirtuales'

const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
    auth: { getSession: (...args) => mockGetSession(...args) },
  },
}))

describe('SesionesVirtuales Service (Fase L)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
  })

  describe('fetchSesionesCurso', () => {
    it('returns sessions ordered by programada_en desc', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve({ data: [{ id: 's1' }, { id: 's2' }], error: null })
            ),
          })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await fetchSesionesCurso('c1')

      expect(mockFrom).toHaveBeenCalledWith('sesiones_virtuales')
      expect(result).toHaveLength(2)
    })
  })

  describe('crearSesion', () => {
    it('inserts Jitsi session with defaults', async () => {
      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { id: 's1', plataforma: 'jitsi' }, error: null })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ insert: insertMock })

      const result = await crearSesion({
        cursoId: 'c1',
        titulo: 'Sesión 1',
        programadaEn: '2025-01-01T10:00:00Z',
      })

      expect(mockFrom).toHaveBeenCalledWith('sesiones_virtuales')
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          curso_id: 'c1',
          titulo: 'Sesión 1',
          plataforma: 'jitsi',
          instructor_id: 'u1',
        })
      )
      expect(result.plataforma).toBe('jitsi')
    })

    it('accepts optional fields', async () => {
      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 's1' }, error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ insert: insertMock })

      await crearSesion({
        cursoId: 'c1',
        titulo: 'Zoom Session',
        programadaEn: '2025-01-01T10:00:00Z',
        descripcion: 'Desc',
        fin: '2025-01-01T11:00:00Z',
        plataforma: 'zoom',
        moduloId: 'm1',
      })

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: 'Desc',
          fin: '2025-01-01T11:00:00Z',
          plataforma: 'zoom',
          modulo_id: 'm1',
        })
      )
    })
  })

  describe('crearSesionZoom', () => {
    it('inserts Zoom session with meeting IDs', async () => {
      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: 's1', plataforma: 'zoom', zoom_meeting_id: '123' },
              error: null,
            })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ insert: insertMock })

      const result = await crearSesionZoom({
        cursoId: 'c1',
        titulo: 'Zoom',
        programadaEn: '2025-01-01T10:00:00Z',
        zoomMeetingId: '123',
        zoomJoinUrl: 'https://zoom.us/j/123',
      })

      expect(result.plataforma).toBe('zoom')
      expect(result.zoom_meeting_id).toBe('123')
    })
  })

  describe('eliminarSesion', () => {
    it('deletes by id', async () => {
      const deleteMock = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }))
      mockFrom.mockReturnValueOnce({ delete: deleteMock })

      await eliminarSesion('s1')

      expect(mockFrom).toHaveBeenCalledWith('sesiones_virtuales')
    })
  })

  describe('iniciarSesion', () => {
    it('calls RPC iniciar_sesion_virtual', async () => {
      mockRpc.mockResolvedValue({ data: { id: 's1', estado: 'en_vivo' }, error: null })

      const result = await iniciarSesion('s1')

      expect(mockRpc).toHaveBeenCalledWith('iniciar_sesion_virtual', { p_sesion: 's1' })
      expect(result.estado).toBe('en_vivo')
    })
  })

  describe('terminarSesion', () => {
    it('calls RPC terminar_sesion_virtual with optional grabacion_url', async () => {
      mockRpc.mockResolvedValue({ data: { id: 's1', estado: 'terminada' }, error: null })

      const result = await terminarSesion('s1', 'https://rec.mp4')

      expect(mockRpc).toHaveBeenCalledWith('terminar_sesion_virtual', {
        p_sesion: 's1',
        p_grabacion_url: 'https://rec.mp4',
      })
      expect(result.estado).toBe('terminada')
    })
  })

  describe('RSVP', () => {
    it('confirmarRSVP upserts confirmado', async () => {
      const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
      mockFrom.mockReturnValueOnce({ upsert: upsertMock })

      await confirmarRSVP('s1', 'u1')

      expect(mockFrom).toHaveBeenCalledWith('sesiones_rsvp')
      expect(upsertMock).toHaveBeenCalledWith(
        { sesion_id: 's1', user_id: 'u1', estado: 'confirmado' },
        { onConflict: 'sesion_id,user_id' }
      )
    })

    it('cancelarRSVP upserts cancelado', async () => {
      const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
      mockFrom.mockReturnValueOnce({ upsert: upsertMock })

      await cancelarRSVP('s1', 'u1')

      expect(upsertMock).toHaveBeenCalledWith(
        { sesion_id: 's1', user_id: 'u1', estado: 'cancelado' },
        { onConflict: 'sesion_id,user_id' }
      )
    })

    it('listarRSVP returns RSVPs with perfiles', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() =>
          Promise.resolve({ data: [{ id: 'r1', estado: 'confirmado' }], error: null })
        ),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarRSVP('s1')

      expect(result).toHaveLength(1)
      expect(result[0].estado).toBe('confirmado')
    })

    it('marcarAsistencia updates estado and asistio_en', async () => {
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ update: updateMock })

      await marcarAsistencia('s1', 'u1', true)

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'asistio', asistio_en: expect.any(String) })
      )
    })
  })

  describe('Calendario', () => {
    it('listarEventosCalendario returns unified events', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({ data: [{ tipo: 'sesion', titulo: 'S1' }], error: null })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarEventosCalendario('c1')

      expect(mockFrom).toHaveBeenCalledWith('v_calendario_curso')
      expect(result[0].tipo).toBe('sesion')
    })

    it('exportarCalendarioICS generates valid iCalendar', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  tipo: 'sesion',
                  titulo: 'S1',
                  fecha: '2025-01-01T10:00:00.000Z',
                  fin: '2025-01-01T11:00:00.000Z',
                },
              ],
              error: null,
            })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const ics = await exportarCalendarioICS('c1')

      expect(ics).toContain('BEGIN:VCALENDAR')
      expect(ics).toContain('SUMMARY:S1')
      expect(ics).toContain('DTSTART:20250101T100000Z')
      expect(ics).toContain('DTEND:20250101T110000Z')
      expect(ics).toContain('END:VCALENDAR')
    })
  })
})
