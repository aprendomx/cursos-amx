import { describe, it, expect } from 'vitest'
import {
  ordenParaIndice,
  necesitaRenormalizar,
  renormalizar,
  EPSILON,
} from '@/composables/useCourseReorder.js'

const lista = (...ordenes) => ordenes.map((orden, i) => ({ id: `x${i}`, orden }))

describe('useCourseReorder', () => {
  it('lista vacía → 1', () => {
    expect(ordenParaIndice([], 0)).toBe(1)
  })
  it('insertar al inicio → min - 1', () => {
    expect(ordenParaIndice(lista(1, 2, 3), 0)).toBe(0)
  })
  it('insertar al final → max + 1', () => {
    expect(ordenParaIndice(lista(1, 2, 3), 3)).toBe(4)
  })
  it('insertar en medio → promedio de vecinos', () => {
    expect(ordenParaIndice(lista(1, 2), 1)).toBe(1.5)
    expect(ordenParaIndice(lista(1, 1.5, 2), 2)).toBe(1.75)
  })
  it('detecta agotamiento de precisión', () => {
    expect(necesitaRenormalizar(lista(1, 1 + EPSILON / 2, 2))).toBe(true)
    expect(necesitaRenormalizar(lista(1, 1.5, 2))).toBe(false)
    expect(necesitaRenormalizar([])).toBe(false)
  })
  it('renormaliza a 1..n sin mutar la entrada', () => {
    const entrada = lista(0.1, 0.100000000001, 7)
    const salida = renormalizar(entrada)
    expect(salida.map((x) => x.orden)).toEqual([1, 2, 3])
    expect(entrada[0].orden).toBe(0.1) // inmutable
    expect(salida[0].id).toBe('x0') // conserva el resto de campos
  })
})
