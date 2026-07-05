import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCourseBuilder } from '@/composables/useCourseBuilder.js'
import * as svc from '@/services/courseBuilder.js'

vi.mock('@/services/courseBuilder.js', () => ({
  fetchEstructura: vi.fn(),
  crearModulo: vi.fn(),
  actualizarModulo: vi.fn(),
  eliminarModulo: vi.fn(),
  crearLeccion: vi.fn(),
  actualizarLeccion: vi.fn(),
  eliminarLeccion: vi.fn(),
  reordenarModulos: vi.fn(),
  reordenarLecciones: vi.fn(),
}))

const arbol = () => [
  { id: 'm1', orden: 1, titulo: 'M1', lecciones: [{ id: 'l1', orden: 1, modulo_id: 'm1' }] },
  { id: 'm2', orden: 2, titulo: 'M2', lecciones: [] },
]

describe('useCourseBuilder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cargar llena el árbol', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    expect(cb.modulos.value).toHaveLength(2)
    expect(svc.fetchEstructura).toHaveBeenCalledWith('c1')
  })

  it('agregarModulo espera el id del servidor y lo agrega al árbol', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.crearModulo.mockResolvedValue({ id: 'm3', orden: 3, titulo: 'Nuevo módulo' })
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.agregarModulo()
    expect(svc.crearModulo).toHaveBeenCalledWith(
      expect.objectContaining({ curso_id: 'c1', orden: 3 })
    )
    expect(cb.modulos.value[2]).toMatchObject({ id: 'm3', lecciones: [] })
  })

  it('editarModulo es optimista', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    let resolver
    svc.actualizarModulo.mockReturnValue(new Promise((res) => (resolver = res)))
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    const p = cb.editarModulo('m1', { titulo: 'Renombrado' })
    expect(cb.modulos.value[0].titulo).toBe('Renombrado') // antes de resolver
    resolver({ id: 'm1', titulo: 'Renombrado' })
    await p
  })

  it('en fallo setea error y recarga del servidor', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.actualizarModulo.mockRejectedValue(new Error('rls'))
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.editarModulo('m1', { titulo: 'X' })
    expect(cb.error.value?.message).toBe('rls')
    expect(svc.fetchEstructura).toHaveBeenCalledTimes(2) // carga inicial + recarga
  })

  it('moverModulo calcula orden fraccional y llama al RPC', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.reordenarModulos.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.moverModulo(1, 0) // m2 antes de m1
    expect(cb.modulos.value.map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(svc.reordenarModulos).toHaveBeenCalledWith([{ id: 'm2', orden: 0 }])
  })

  it('moverLeccion entre módulos envía modulo_id destino', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.reordenarLecciones.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.moverLeccion('l1', 'm2', 0)
    expect(cb.modulos.value[0].lecciones).toHaveLength(0)
    expect(cb.modulos.value[1].lecciones[0].id).toBe('l1')
    expect(svc.reordenarLecciones).toHaveBeenCalledWith([{ id: 'l1', modulo_id: 'm2', orden: 1 }])
  })

  it('las persistencias se serializan en orden', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    const llamadas = []
    svc.actualizarModulo.mockImplementation(async (id, patch) => {
      llamadas.push(patch.titulo)
      await new Promise((r) => setTimeout(r, 5))
      return {}
    })
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    const p1 = cb.editarModulo('m1', { titulo: 'A' })
    const p2 = cb.editarModulo('m1', { titulo: 'B' })
    await Promise.all([p1, p2])
    expect(llamadas).toEqual(['A', 'B'])
  })
})
