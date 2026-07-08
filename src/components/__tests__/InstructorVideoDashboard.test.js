import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import InstructorVideoDashboard from '../InstructorVideoDashboard.vue'

const mockStats = vi.hoisted(() => ({
  cargarStatsCurso: vi.fn().mockResolvedValue([
    {
      leccion_id: 'l1',
      leccion_titulo: 'Introducción',
      total_vistas_unicas: 120,
      total_segundos_vistos: 21600,
      tasa_completitud_pct: 85.5,
      tasa_abandono_pct: 12.0,
    },
    {
      leccion_id: 'l2',
      leccion_titulo: 'Conceptos avanzados',
      total_vistas_unicas: 95,
      total_segundos_vistos: 28500,
      tasa_completitud_pct: 60.0,
      tasa_abandono_pct: 28.5,
    },
  ]),
}))

vi.mock('@/services/videoAnalytics.js', () => ({
  cargarStatsCurso: mockStats.cargarStatsCurso,
}))

describe('InstructorVideoDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows course selector with options', async () => {
    const wrapper = mount(InstructorVideoDashboard)
    await nextTick()

    const select = wrapper.find('[data-test="course-select"]')
    expect(select.exists()).toBe(true)

    const options = select.findAll('option')
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(wrapper.text()).toContain('Curso Ejemplo 1')
    expect(wrapper.text()).toContain('Curso Ejemplo 2')
  })

  it('shows loading state', async () => {
    // Delay the mock so loading stays visible
    mockStats.cargarStatsCurso.mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(InstructorVideoDashboard)
    await nextTick()

    // Trigger selection to start loading
    const select = wrapper.find('[data-test="course-select"]')
    await select.setValue('c1')
    await nextTick()

    expect(wrapper.find('[data-test="loading-state"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cargando datos')
  })
})
