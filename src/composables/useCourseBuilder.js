import { ref } from 'vue'
import {
  fetchEstructura,
  crearModulo,
  actualizarModulo,
  eliminarModulo,
  crearLeccion,
  actualizarLeccion,
  eliminarLeccion,
  reordenarModulos,
  reordenarLecciones,
} from '@/services/courseBuilder.js'
import {
  ordenParaIndice,
  necesitaRenormalizar,
  renormalizar,
} from '@/composables/useCourseReorder.js'

export function useCourseBuilder(cursoId) {
  const modulos = ref([])
  const cargando = ref(false)
  const error = ref(null)

  // Cola: serializa persistencias para que drags rápidos no se pisen.
  // En fallo: error visible + recarga del servidor (consistencia garantizada).
  let cola = Promise.resolve()
  function encolar(op) {
    cola = cola.then(op).catch(async (e) => {
      error.value = e
      await recargar().catch(() => {})
    })
    return cola
  }

  async function recargar() {
    modulos.value = (await fetchEstructura(cursoId)).map((m) => ({
      ...m,
      lecciones: m.lecciones || [],
    }))
  }

  async function cargar() {
    cargando.value = true
    error.value = null
    try {
      await recargar()
    } catch (e) {
      error.value = e
    } finally {
      cargando.value = false
    }
  }

  /* ── Módulos ─────────────────────────────────────── */

  function agregarModulo(datos = {}) {
    return encolar(async () => {
      const orden = ordenParaIndice(modulos.value, modulos.value.length)
      const row = await crearModulo({ curso_id: cursoId, titulo: 'Nuevo módulo', orden, ...datos })
      modulos.value = [...modulos.value, { ...row, lecciones: [] }]
    })
  }

  function editarModulo(id, patch) {
    modulos.value = modulos.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
    return encolar(() => actualizarModulo(id, patch))
  }

  function quitarModulo(id) {
    return encolar(async () => {
      await eliminarModulo(id)
      modulos.value = modulos.value.filter((m) => m.id !== id)
    })
  }

  function moverModulo(from, to) {
    if (from === to) return Promise.resolve()
    const sin = modulos.value.toSpliced(from, 1)
    const movido = modulos.value[from]
    const orden = ordenParaIndice(sin, to)
    const nuevo = { ...movido, orden }
    const lista = sin.toSpliced(to, 0, nuevo)
    if (necesitaRenormalizar(lista)) {
      const renorm = renormalizar(lista)
      modulos.value = renorm
      return encolar(() => reordenarModulos(renorm.map(({ id, orden: o }) => ({ id, orden: o }))))
    }
    modulos.value = lista
    return encolar(() => reordenarModulos([{ id: nuevo.id, orden }]))
  }

  /* ── Lecciones ───────────────────────────────────── */

  function moduloDe(leccionId) {
    return modulos.value.find((m) => m.lecciones.some((l) => l.id === leccionId))
  }

  function agregarLeccion(moduloId, datos = {}) {
    return encolar(async () => {
      const mod = modulos.value.find((m) => m.id === moduloId)
      if (!mod) return
      const orden = ordenParaIndice(mod.lecciones, mod.lecciones.length)
      const row = await crearLeccion({
        modulo_id: moduloId,
        titulo: 'Nueva lección',
        tipo_material: 'video',
        orden,
        ...datos,
      })
      modulos.value = modulos.value.map((m) =>
        m.id === moduloId ? { ...m, lecciones: [...m.lecciones, row] } : m
      )
    })
  }

  function editarLeccion(leccionId, patch) {
    modulos.value = modulos.value.map((m) => ({
      ...m,
      lecciones: m.lecciones.map((l) => (l.id === leccionId ? { ...l, ...patch } : l)),
    }))
    return encolar(() => actualizarLeccion(leccionId, patch))
  }

  function quitarLeccion(leccionId) {
    return encolar(async () => {
      await eliminarLeccion(leccionId)
      modulos.value = modulos.value.map((m) => ({
        ...m,
        lecciones: m.lecciones.filter((l) => l.id !== leccionId),
      }))
    })
  }

  function moverLeccion(leccionId, targetModuloId, targetIndex) {
    const origen = moduloDe(leccionId)
    const destino = modulos.value.find((m) => m.id === targetModuloId)
    if (!origen || !destino) return Promise.resolve()
    const leccion = origen.lecciones.find((l) => l.id === leccionId)
    const destinoSin =
      origen.id === destino.id
        ? destino.lecciones.filter((l) => l.id !== leccionId)
        : destino.lecciones
    const orden = ordenParaIndice(destinoSin, targetIndex)
    const nueva = { ...leccion, modulo_id: targetModuloId, orden }
    const listaDestino = destinoSin.toSpliced(targetIndex, 0, nueva)

    modulos.value = modulos.value.map((m) => {
      if (m.id === origen.id && m.id === destino.id) return { ...m, lecciones: listaDestino }
      if (m.id === origen.id)
        return { ...m, lecciones: m.lecciones.filter((l) => l.id !== leccionId) }
      if (m.id === destino.id) return { ...m, lecciones: listaDestino }
      return m
    })

    if (necesitaRenormalizar(listaDestino)) {
      const renorm = renormalizar(listaDestino)
      modulos.value = modulos.value.map((m) =>
        m.id === destino.id ? { ...m, lecciones: renorm } : m
      )
      return encolar(() =>
        reordenarLecciones(
          renorm.map(({ id, orden: o }) => ({ id, modulo_id: targetModuloId, orden: o }))
        )
      )
    }
    return encolar(() => reordenarLecciones([{ id: leccionId, modulo_id: targetModuloId, orden }]))
  }

  return {
    modulos,
    cargando,
    error,
    cargar,
    recargar,
    agregarModulo,
    editarModulo,
    quitarModulo,
    moverModulo,
    agregarLeccion,
    editarLeccion,
    quitarLeccion,
    moverLeccion,
  }
}
