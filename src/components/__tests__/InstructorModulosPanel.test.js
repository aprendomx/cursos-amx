import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// vi.mock se iza al inicio del archivo, así que el doble tiene que crearse
// con vi.hoisted para existir cuando la fábrica corra.
const { fetchProgresoModulos } = vi.hoisted(() => ({ fetchProgresoModulos: vi.fn() }))
vi.mock('@/services/instructores.ts', async () => {
  const real = await vi.importActual('@/services/instructores.ts')
  return { agregarPorModulo: real.agregarPorModulo, fetchProgresoModulos }
})

import InstructorModulosPanel from '@/components/InstructorModulosPanel.vue'

const fila = (user, modulo, orden, lecciones, completadas) => ({
  user_id: user,
  curso_id: 'c1',
  modulo_id: modulo,
  modulo: `Módulo ${orden}`,
  modulo_orden: orden,
  lecciones,
  completadas,
  porcentaje: Math.round((100 * completadas) / lecciones),
  ultima_actividad: null,
})

async function montar(filas) {
  fetchProgresoModulos.mockResolvedValue(filas)
  const w = mount(InstructorModulosPanel, { props: { cursoId: 'c1' } })
  await flushPromises()
  return w
}

beforeEach(() => {
  fetchProgresoModulos.mockReset()
})

describe('InstructorModulosPanel', () => {
  it('pide el avance del curso que recibe', async () => {
    await montar([])
    expect(fetchProgresoModulos).toHaveBeenCalledWith('c1')
  })

  it('cuenta a las personas inscritas una sola vez aunque tengan varios módulos', async () => {
    const w = await montar([
      fila('u1', 'm1', 1, 2, 2),
      fila('u1', 'm2', 2, 2, 0),
      fila('u2', 'm1', 1, 2, 1),
      fila('u2', 'm2', 2, 2, 0),
    ])
    const filas = w.findAll('tbody tr')
    // Módulo 1: ambas iniciaron, solo u1 terminó
    expect(filas[0].text()).toContain('2 / 2')
    expect(filas[0].text()).toContain('1 / 2')
  })

  it('promedia el avance del grupo y lo expone a lectores de pantalla', async () => {
    const w = await montar([
      fila('u1', 'm1', 1, 4, 4), // 100 %
      fila('u2', 'm1', 1, 4, 0), // 0 %
      fila('u3', 'm1', 1, 4, 0), // 0 %
    ])
    const barra = w.find('[role="progressbar"]')
    expect(barra.attributes('aria-valuenow')).toBe('33')
    expect(barra.attributes('aria-valuemax')).toBe('100')
  })

  it('distingue grupo-a-medias de medio-grupo-sin-empezar', async () => {
    // Ambos casos promedian 50 %; lo que los separa es cuántas personas
    // iniciaron y cuántas terminaron.
    const aMedias = await montar([fila('u1', 'm1', 1, 2, 1), fila('u2', 'm1', 1, 2, 1)])
    expect(aMedias.find('tbody tr').text()).toContain('2 / 2') // iniciaron
    expect(aMedias.find('tbody tr').text()).toContain('0 / 2') // terminaron

    const mitad = await montar([fila('u1', 'm1', 1, 2, 2), fila('u2', 'm1', 1, 2, 0)])
    expect(mitad.find('tbody tr').text()).toContain('1 / 2') // iniciaron
  })

  it('ordena los módulos por su orden', async () => {
    const w = await montar([fila('u1', 'm2', 2, 1, 0), fila('u1', 'm1', 1, 1, 0)])
    const nombres = w.findAll('tbody th[scope="row"]').map((n) => n.text())
    expect(nombres).toEqual(['Módulo 1', 'Módulo 2'])
  })

  it('muestra nombres en el detalle, no identificadores', async () => {
    fetchProgresoModulos.mockResolvedValue([fila('u1', 'm1', 1, 2, 1)])
    const w = mount(InstructorModulosPanel, {
      props: {
        cursoId: 'c1',
        alumnos: [
          {
            user_id: 'u1',
            perfiles: { nombres: 'Ana', apellido_paterno: 'Ruiz', apellido_materno: 'Soto' },
          },
        ],
      },
    })
    await flushPromises()
    await w.find('.mod-toggle').trigger('click')
    expect(w.find('.mod-detalle').text()).toContain('Ana Ruiz Soto')
    expect(w.find('.mod-detalle').text()).not.toContain('u1')
  })

  it('despliega el detalle por persona solo al pedirlo', async () => {
    const w = await montar([fila('u1', 'm1', 1, 2, 1), fila('u2', 'm1', 1, 2, 2)])
    expect(w.find('.mod-detalle').exists()).toBe(false)
    await w.find('.mod-toggle').trigger('click')
    const detalle = w.find('.mod-detalle')
    expect(detalle.exists()).toBe(true)
    expect(detalle.findAll('li')).toHaveLength(2)
    // Ordenado de mayor a menor avance
    expect(detalle.findAll('li')[0].text()).toContain('2 de 2')
  })

  it('muestra el error en vez de una tabla vacía cuando la consulta falla', async () => {
    fetchProgresoModulos.mockRejectedValue(new Error('permission denied'))
    const w = mount(InstructorModulosPanel, { props: { cursoId: 'c1' } })
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toContain('permission denied')
    expect(w.find('table').exists()).toBe(false)
  })

  it('recarga al cambiar de curso', async () => {
    const w = await montar([])
    await w.setProps({ cursoId: 'c2' })
    await flushPromises()
    expect(fetchProgresoModulos).toHaveBeenLastCalledWith('c2')
  })
})
