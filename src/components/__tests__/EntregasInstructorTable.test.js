import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EntregasInstructorTable from '@/components/EntregasInstructorTable.vue'

describe('EntregasInstructorTable', () => {
  const entregasMock = [
    {
      id: 'e1',
      estado: 'entregada',
      version_actual: 1,
      entregado_en: '2026-07-01',
      puntaje_final: null,
      perfiles: { nombres: 'Ana', apellido_paterno: 'López' },
    },
    {
      id: 'e2',
      estado: 'calificada',
      version_actual: 2,
      entregado_en: '2026-07-02',
      puntaje_final: 85,
      perfiles: { nombres: 'Luis', apellido_paterno: 'Pérez' },
    },
  ]

  it('renders table rows for each entrega', () => {
    const wrapper = mount(EntregasInstructorTable, { props: { entregas: entregasMock } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('Ana')
    expect(rows[1].text()).toContain('Luis')
  })

  it('filters by estado', async () => {
    const wrapper = mount(EntregasInstructorTable, { props: { entregas: entregasMock } })
    await wrapper.find('select').setValue('calificada')
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('Luis')
  })
})
