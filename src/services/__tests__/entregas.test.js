import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  crearTarea,
  actualizarTarea,
  eliminarTarea,
  listarTareasPorCurso,
  crearEntrega,
  nuevaVersion,
  obtenerEntrega,
  listarEntregasPorTarea,
  calificarEntrega,
  devolverEntrega,
  subirArchivo,
} from '@/services/entregas'

const mockFrom = vi.fn()
const mockStorageFrom = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    storage: {
      from: (...args) => mockStorageFrom(...args),
    },
  },
}))

describe('Entregas Service (Fase K)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('crearTarea', () => {
    it('inserts and returns data', async () => {
      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { id: 't1', titulo: 'Tarea 1' }, error: null })
          ),
        })),
      }))
      mockFrom.mockReturnValueOnce({ insert: insertMock })

      const result = await crearTarea({ titulo: 'Tarea 1', curso_id: 'c1' })

      expect(mockFrom).toHaveBeenCalledWith('tareas')
      expect(insertMock).toHaveBeenCalledWith({ titulo: 'Tarea 1', curso_id: 'c1' })
      expect(result).toEqual({ id: 't1', titulo: 'Tarea 1' })
    })
  })

  describe('actualizarTarea', () => {
    it('updates and returns data', async () => {
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: { id: 't1', titulo: 'Actualizada' }, error: null })
            ),
          })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ update: updateMock })

      const result = await actualizarTarea('t1', { titulo: 'Actualizada' })

      expect(mockFrom).toHaveBeenCalledWith('tareas')
      expect(result).toEqual({ id: 't1', titulo: 'Actualizada' })
    })
  })

  describe('eliminarTarea', () => {
    it('deletes by id', async () => {
      const deleteMock = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }))
      mockFrom.mockReturnValueOnce({ delete: deleteMock })

      await eliminarTarea('t1')

      expect(mockFrom).toHaveBeenCalledWith('tareas')
      expect(deleteMock).toHaveBeenCalled()
    })
  })

  describe('listarTareasPorCurso', () => {
    it('returns tasks ordered by creado_en desc', async () => {
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [{ id: 't1' }, { id: 't2' }], error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarTareasPorCurso('c1')

      expect(mockFrom).toHaveBeenCalledWith('tareas')
      expect(result).toHaveLength(2)
    })
  })

  describe('crearEntrega', () => {
    it('inserts entrega + version, sets estado=entregada', async () => {
      const entregaData = {
        id: 'e1',
        tarea_id: 't1',
        user_id: 'u1',
        estado: 'entregada',
        version_actual: 1,
      }
      const insertEntrega = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: entregaData, error: null })),
        })),
      }))
      const insertVersion = vi.fn(() => Promise.resolve({ error: null }))

      mockFrom
        .mockReturnValueOnce({ insert: insertEntrega })
        .mockReturnValueOnce({ insert: insertVersion })

      const result = await crearEntrega('t1', 'u1', {
        texto: 'Mi respuesta',
        archivos: ['a.pdf'],
        comentario: 'Hola',
      })

      expect(mockFrom).toHaveBeenCalledWith('entregas')
      expect(result).toEqual(entregaData)
      expect(result.estado).toBe('entregada')
      expect(result.version_actual).toBe(1)

      expect(insertVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          entrega_id: 'e1',
          numero_version: 1,
          texto: 'Mi respuesta',
          archivos: ['a.pdf'],
          comentario_alumno: 'Hola',
        })
      )
    })
  })

  describe('nuevaVersion', () => {
    it('increments version, inserts new version and updates entrega', async () => {
      const entregaData = { id: 'e1', version_actual: 2, estado: 'entregada' }
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { version_actual: 1 }, error: null })),
        })),
      }))
      const insertVersion = vi.fn(() => Promise.resolve({ error: null }))
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: entregaData, error: null })),
          })),
        })),
      }))

      mockFrom
        .mockReturnValueOnce({ select: selectMock })
        .mockReturnValueOnce({ insert: insertVersion })
        .mockReturnValueOnce({ update: updateMock })

      const result = await nuevaVersion('e1', {
        texto: 'V2',
        archivos: ['b.pdf'],
        comentario: 'Corrección',
      })

      expect(result.version_actual).toBe(2)
      expect(result.estado).toBe('entregada')
      expect(insertVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          entrega_id: 'e1',
          numero_version: 2,
          texto: 'V2',
          archivos: ['b.pdf'],
          comentario_alumno: 'Corrección',
        })
      )
    })
  })

  describe('obtenerEntrega', () => {
    it('returns entrega with nested versiones and calificaciones', async () => {
      const mockData = {
        id: 'e1',
        estado: 'entregada',
        entrega_versiones: [{ id: 'v1', numero_version: 1 }],
        calificaciones: [{ id: 'c1', puntaje: 85 }],
      }
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
          })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await obtenerEntrega('t1', 'u1')

      expect(mockFrom).toHaveBeenCalledWith('entregas')
      expect(result.entrega_versiones).toHaveLength(1)
      expect(result.calificaciones).toHaveLength(1)
    })
  })

  describe('listarEntregasPorTarea', () => {
    it('returns entregas with perfiles and versiones', async () => {
      const mockData = [
        {
          id: 'e1',
          perfiles: { nombres: 'Ana', apellido_paterno: 'López', correo: 'ana@test.com' },
        },
      ]
      const selectMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ select: selectMock })

      const result = await listarEntregasPorTarea('t1')

      expect(mockFrom).toHaveBeenCalledWith('entregas')
      expect(result).toHaveLength(1)
      expect(result[0].perfiles.nombres).toBe('Ana')
    })
  })

  describe('calificarEntrega', () => {
    it('upserts calificaciones and updates estado to calificada', async () => {
      const entregaData = { id: 'e1', estado: 'calificada', puntaje_final: 90 }
      const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: entregaData, error: null })),
          })),
        })),
      }))

      mockFrom
        .mockReturnValueOnce({ upsert: upsertMock })
        .mockReturnValueOnce({ update: updateMock })

      const result = await calificarEntrega('e1', {
        calificaciones: [{ criterio_id: 'c1', puntaje: 90 }],
        comentario: 'Buen trabajo',
        puntajeFinal: 90,
      })

      expect(mockFrom).toHaveBeenCalledWith('calificaciones')
      expect(result.estado).toBe('calificada')
      expect(result.puntaje_final).toBe(90)
      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entrega_id: 'e1', criterio_id: 'c1', puntaje: 90 }),
        ])
      )
    })
  })

  describe('devolverEntrega', () => {
    it('updates estado to devuelta', async () => {
      const entregaData = { id: 'e1', estado: 'devuelta', comentario_instructor: 'Revisa esto' }
      const updateMock = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: entregaData, error: null })),
          })),
        })),
      }))
      mockFrom.mockReturnValueOnce({ update: updateMock })

      const result = await devolverEntrega('e1', 'Revisa esto')

      expect(mockFrom).toHaveBeenCalledWith('entregas')
      expect(result.estado).toBe('devuelta')
      expect(result.comentario_instructor).toBe('Revisa esto')
    })
  })

  describe('subirArchivo', () => {
    it('uploads to entregas bucket and returns path', async () => {
      const uploadMock = vi.fn(() =>
        Promise.resolve({ error: null, data: { path: 'entregas/t1/u1/v1/file.pdf' } })
      )
      mockStorageFrom.mockReturnValue({ upload: uploadMock })

      const file = { name: 'file.pdf', type: 'application/pdf', size: 1024 }
      const result = await subirArchivo('t1', 'u1', 1, file)

      expect(mockStorageFrom).toHaveBeenCalledWith('entregas')
      expect(uploadMock).toHaveBeenCalledWith(
        expect.stringContaining('entregas/t1/u1/v1/file.pdf'),
        file,
        expect.objectContaining({ contentType: 'application/pdf' })
      )
      expect(result).toContain('entregas/t1/u1/v1/file.pdf')
    })
  })
})
