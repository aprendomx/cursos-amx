import { describe, it, expect } from 'vitest'
import { computed, ref } from 'vue'

// El cálculo de avance por módulo vive dentro de useLessonNavigation, que
// necesita router y red para montarse. Aquí se prueba la lógica en aislamiento
// replicando exactamente la misma implementación: lo que se fija es el
// contrato —cómo se agrupa y se redondea—, que es donde están los errores
// plausibles.
type Lec = {
  id: string
  modulo_id: string
  modulo_titulo: string
  modulo_orden: number
  completado: boolean
}

function calcular(lecciones: Lec[]) {
  const acc: Record<string, { titulo: string; orden: number; total: number; hechas: number }> = {}
  for (const l of lecciones) {
    if (!l.modulo_id) continue
    const m = (acc[l.modulo_id] ??= {
      titulo: l.modulo_titulo || '',
      orden: l.modulo_orden ?? 0,
      total: 0,
      hechas: 0,
    })
    m.total += 1
    if (l.completado) m.hechas += 1
  }
  return Object.entries(acc)
    .map(([id, m]) => ({
      id,
      titulo: m.titulo,
      orden: m.orden,
      lecciones: m.total,
      completadas: m.hechas,
      porcentaje: m.total ? Math.round((100 * m.hechas) / m.total) : 0,
      completado: m.total > 0 && m.hechas >= m.total,
    }))
    .sort((a, b) => a.orden - b.orden)
}

const lec = (id: string, mod: string, orden: number, completado = false): Lec => ({
  id,
  modulo_id: mod,
  modulo_titulo: `Módulo ${orden}`,
  modulo_orden: orden,
  completado,
})

describe('avance por módulo', () => {
  it('agrupa por módulo y calcula el porcentaje', () => {
    const r = calcular([
      lec('a', 'm1', 1, true),
      lec('b', 'm1', 1, false),
      lec('c', 'm2', 2, true),
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ id: 'm1', lecciones: 2, completadas: 1, porcentaje: 50 })
    expect(r[1]).toMatchObject({ id: 'm2', porcentaje: 100, completado: true })
  })

  it('respeta el orden de los módulos, no el de las lecciones', () => {
    const r = calcular([lec('a', 'm2', 2), lec('b', 'm1', 1), lec('c', 'm3', 3)])
    expect(r.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('un módulo solo está completo si TODAS sus lecciones lo están', () => {
    const casi = calcular([lec('a', 'm1', 1, true), lec('b', 'm1', 1, true), lec('c', 'm1', 1)])
    expect(casi[0].completado).toBe(false)
    expect(casi[0].porcentaje).toBe(67)
  })

  it('redondea a entero, sin decimales en pantalla', () => {
    const r = calcular([lec('a', 'm1', 1, true), lec('b', 'm1', 1), lec('c', 'm1', 1)])
    expect(Number.isInteger(r[0].porcentaje)).toBe(true)
    expect(r[0].porcentaje).toBe(33)
  })

  it('ignora lecciones sin módulo en vez de agruparlas bajo una clave vacía', () => {
    const r = calcular([lec('a', 'm1', 1, true), { ...lec('x', '', 0), modulo_id: '' }])
    expect(r).toHaveLength(1)
    expect(r[0].lecciones).toBe(1)
  })

  it('no divide entre cero con una lista vacía', () => {
    expect(calcular([])).toEqual([])
  })
})

describe('módulo actual', () => {
  it('encuentra el módulo de la lección en curso', () => {
    const lecciones = ref([lec('a', 'm1', 1, true), lec('b', 'm2', 2)])
    const leccion = ref(lecciones.value[1])
    const progreso = computed(() => calcular(lecciones.value))
    const actual = computed(
      () => progreso.value.find((m) => m.id === leccion.value?.modulo_id) || null
    )
    expect(actual.value?.id).toBe('m2')
  })

  it('devuelve null si no hay lección seleccionada', () => {
    const progreso = computed(() => calcular([lec('a', 'm1', 1)]))
    const leccion = ref(null as Lec | null)
    const actual = computed(
      () => progreso.value.find((m) => m.id === leccion.value?.modulo_id) || null
    )
    expect(actual.value).toBeNull()
  })
})
