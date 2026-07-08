import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EntregasInstructorTable from '../EntregasInstructorTable.vue'

describe('EntregasInstructorTable', () => {
  const entregas = [
    {
      id: 'e1',
      perfiles: { nombres: 'Ana', apellido_paterno: 'López' },
      estado: 'pendiente',
      version: 1,
      creado_en: '2024-01-15T10:00:00Z',
      puntaje: null,
      dias_retraso: 0,
    },
    {
      id: 'e2',
      perfiles: { nombres: 'Luis', apellido_paterno: 'García' },
      estado: 'calificada',
      version: 2,
      creado_en: '2024-01-14T09:00:00Z',
      puntaje: 85,
      dias_retraso: 1,
    },
    {
      id: 'e3',
      perfiles: { nombres: 'María', apellido_paterno: 'Ruiz' },
      estado: 'devuelta',
      version: 1,
      creado_en: '2024-01-13T08:00:00Z',
      puntaje: null,
      dias_retraso: 2,
    },
  ]

  it('renderiza filas de tabla para cada entrega', () => {
    const wrapper = mount(EntregasInstructorTable, {
      props: { entregas },
    })
    expect(wrapper.find('table').exists()).toBe(true)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('López')
    expect(wrapper.text()).toContain('Luis')
    expect(wrapper.text()).toContain('García')
  })

  it('filtra por estado', async () => {
    const wrapper = mount(EntregasInstructorTable, {
      props: { entregas },
    })
    const select = wrapper.find('select')
    await select.setValue('calificada')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Luis')
    expect(rows[0].text()).toContain('Calificada')
  })

  it('busca por nombre de alumno', async () => {
    const wrapper = mount(EntregasInstructorTable, {
      props: { entregas },
    })
    const input = wrapper.find('input[type="text"]')
    await input.setValue('maría')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('María')
  })

  it('muestra estado vacío cuando no hay entregas', () => {
    const wrapper = mount(EntregasInstructorTable, {
      props: { entregas: [] },
    })
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sin entregas registradas.')
  })
})
