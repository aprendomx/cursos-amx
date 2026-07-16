import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCalendario } from '@/composables/useCalendario.js'

vi.mock('@/services/sesionesVirtuales', () => ({
  listarEventosCalendario: vi.fn(),
  exportarCalendarioICS: vi.fn(),
}))

import { listarEventosCalendario, exportarCalendarioICS } from '@/services/sesionesVirtuales'

describe('useCalendario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carga eventos y los agrupa por mes', async () => {
    listarEventosCalendario.mockResolvedValue([
      { tipo: 'sesion', titulo: 'S1', fecha: '2025-03-15T10:00:00Z' },
      { tipo: 'tarea_deadline', titulo: 'T1', fecha: '2025-03-20T23:59:00Z' },
      { tipo: 'sesion', titulo: 'S2', fecha: '2025-04-01T10:00:00Z' },
    ])

    const { eventos, eventosPorMes, cargar, loading } = useCalendario('c1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(eventos.value).toHaveLength(3)
    expect(eventosPorMes.value.get('2025-03')).toHaveLength(2)
    expect(eventosPorMes.value.get('2025-04')).toHaveLength(1)
  })

  it('agrupa eventos por día', async () => {
    listarEventosCalendario.mockResolvedValue([
      { tipo: 'sesion', titulo: 'S1', fecha: '2025-03-15T10:00:00Z' },
      { tipo: 'sesion', titulo: 'S2', fecha: '2025-03-15T14:00:00Z' },
    ])

    const { eventosPorDia, cargar } = useCalendario('c1')
    await cargar()

    expect(eventosPorDia.value.get('2025-03-15')).toHaveLength(2)
  })

  it('maneja error al cargar', async () => {
    listarEventosCalendario.mockRejectedValue(new Error('DB error'))

    const { error, cargar, loading } = useCalendario('c1')
    await cargar()

    expect(loading.value).toBe(false)
    expect(error.value).toBe('DB error')
  })

  it('exporta ICS', async () => {
    exportarCalendarioICS.mockResolvedValue('BEGIN:VCALENDAR\nEND:VCALENDAR')

    const { exportarICS } = useCalendario('c1')
    const ics = await exportarICS()

    expect(ics).toContain('BEGIN:VCALENDAR')
  })

  it('maneja error al exportar ICS', async () => {
    exportarCalendarioICS.mockRejectedValue(new Error('Export fail'))

    const { exportarICS, error } = useCalendario('c1')
    const ics = await exportarICS()

    expect(ics).toBeNull()
    expect(error.value).toBe('Export fail')
  })
})
