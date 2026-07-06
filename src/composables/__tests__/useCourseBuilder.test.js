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

  it('agregarLeccion resuelve con el row del servidor', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    const mockRow = {
      id: 'l-new',
      orden: 2,
      titulo: 'Nueva lección',
      tipo_material: 'video',
      modulo_id: 'm1',
    }
    svc.crearLeccion.mockResolvedValue(mockRow)
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    const row = await cb.agregarLeccion('m1')
    expect(row).toMatchObject({ id: 'l-new' })
    expect(cb.modulos.value[0].lecciones).toHaveLength(2)
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
    // Fix 7.1: error is cleared after a successful deferred reload, so it's null here.
    expect(cb.error.value).toBeNull()
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

  it('cola se recupera tras un fallo y el reload es diferido', async () => {
    // actualizarModulo falla; reordenarModulos (op encolada detrás) debe
    // ejecutarse antes del reload para no perder el cambio local ya aplicado.
    const callLog = []
    svc.fetchEstructura.mockImplementation(async () => {
      callLog.push('fetchEstructura')
      return arbol()
    })
    svc.actualizarModulo.mockImplementation(async () => {
      callLog.push('actualizarModulo')
      throw new Error('net')
    })
    svc.reordenarModulos.mockImplementation(async () => {
      callLog.push('reordenarModulos')
    })

    const cb = useCourseBuilder('c1')
    await cb.cargar()
    callLog.length = 0 // borrar la llamada inicial a fetchEstructura

    // Encolar las dos ops sin await intermedio
    const p1 = cb.editarModulo('m1', { titulo: 'X' })
    const p2 = cb.moverModulo(1, 0)
    await Promise.all([p1, p2])

    expect(svc.reordenarModulos).toHaveBeenCalled() // cola no envenenada
    // Fix 7.1: error cleared after successful deferred reload
    expect(cb.error.value).toBeNull()
    // El reload ocurre DESPUÉS de que reordenarModulos persiste
    expect(callLog).toEqual(['actualizarModulo', 'reordenarModulos', 'fetchEstructura'])
  })

  it('moverLeccion mismo módulo recalcula orden correcto', async () => {
    // Árbol con dos lecciones en m1: l1(orden 1) y l2(orden 2)
    // Mover l1 al índice 1 → destinoSin=[l2(2)], ordenParaIndice max+1 = 3
    svc.fetchEstructura.mockResolvedValue([
      {
        id: 'm1',
        orden: 1,
        titulo: 'M1',
        lecciones: [
          { id: 'l1', orden: 1, modulo_id: 'm1' },
          { id: 'l2', orden: 2, modulo_id: 'm1' },
        ],
      },
      { id: 'm2', orden: 2, titulo: 'M2', lecciones: [] },
    ])
    svc.reordenarLecciones.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()

    await cb.moverLeccion('l1', 'm1', 1)

    const m1 = cb.modulos.value[0]
    expect(m1.lecciones.map((l) => l.id)).toEqual(['l2', 'l1'])
    // destinoSin=[l2(orden 2)], index=1 >= n=1 → max+1 = 3
    expect(svc.reordenarLecciones).toHaveBeenCalledWith([{ id: 'l1', modulo_id: 'm1', orden: 3 }])
  })

  it('moverLeccion dispara renormalización cuando gap < EPSILON', async () => {
    // m1 ya tiene dos lecciones con gap=1e-10 < EPSILON(1e-9).
    // Al insertar l3 (de m2) en índice 1 de m1, la lista intermedia tiene
    // gap=5e-11 → necesitaRenormalizar → reordenarLecciones recibe batch completo.
    svc.fetchEstructura.mockResolvedValue([
      {
        id: 'm1',
        orden: 1,
        titulo: 'M1',
        lecciones: [
          { id: 'l1', orden: 1, modulo_id: 'm1' },
          { id: 'l2', orden: 1 + 1e-10, modulo_id: 'm1' },
        ],
      },
      {
        id: 'm2',
        orden: 2,
        titulo: 'M2',
        lecciones: [{ id: 'l3', orden: 1, modulo_id: 'm2' }],
      },
    ])
    svc.reordenarLecciones.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()

    // Insertar l3 entre l1 y l2 en m1:
    // destinoSin=[l1(1),l2(1+1e-10)], orden=promedio=(1+1+1e-10)/2=1+5e-11
    // listaDestino=[l1(1), l3(1+5e-11), l2(1+1e-10)] → gap=5e-11 < EPSILON → renorm
    // renorm: l1→1, l3→2, l2→3
    await cb.moverLeccion('l3', 'm1', 1)

    const m1 = cb.modulos.value[0]
    expect(m1.lecciones.map((l) => l.id)).toEqual(['l1', 'l3', 'l2'])
    expect(m1.lecciones.map((l) => l.orden)).toEqual([1, 2, 3])
    expect(svc.reordenarLecciones).toHaveBeenCalledWith([
      { id: 'l1', modulo_id: 'm1', orden: 1 },
      { id: 'l3', modulo_id: 'm1', orden: 2 },
      { id: 'l2', modulo_id: 'm1', orden: 3 },
    ])
  })
})
