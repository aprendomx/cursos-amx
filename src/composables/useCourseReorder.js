export const EPSILON = 1e-9

/**
 * Orden fraccional para insertar en `indice` dentro de `lista` (ordenada asc,
 * SIN el elemento que se está moviendo). Promedio de vecinos; extremos ±1.
 */
export function ordenParaIndice(lista, indice) {
  const n = lista.length
  if (n === 0) return 1
  if (indice <= 0) return lista[0].orden - 1
  if (indice >= n) return lista[n - 1].orden + 1
  return (lista[indice - 1].orden + lista[indice].orden) / 2
}

export function necesitaRenormalizar(lista) {
  for (let i = 1; i < lista.length; i++) {
    if (Math.abs(lista[i].orden - lista[i - 1].orden) < EPSILON) return true
  }
  return false
}

export function renormalizar(lista) {
  return lista.map((item, i) => ({ ...item, orden: i + 1 }))
}

export function useCourseReorder() {
  return { ordenParaIndice, necesitaRenormalizar, renormalizar, EPSILON }
}
