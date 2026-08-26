import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AvanceSemanal from '@/components/AvanceSemanal.vue'

// Miércoles 2026-08-26 a mediodía local: la semana en curso es 24–30.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 26, 12, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('AvanceSemanal', () => {
  it('la racha es el titular y hoy-sin-actividad se dice', () => {
    const w = mount(AvanceSemanal, {
      props: { racha: { racha_actual: 4, mejor_racha: 9, activo_hoy: false }, diasActivos: [] },
    })
    expect(w.get('[data-test="racha-actual"]').text()).toBe('4')
    expect(w.text()).toContain('días de racha')
    expect(w.text()).toContain('Hoy aún no cuenta')
    expect(w.text()).toContain('Mejor racha: 9 días')
  })

  it('pinta la semana lunes–domingo y marca los días activos', () => {
    const w = mount(AvanceSemanal, {
      props: {
        racha: { racha_actual: 2, mejor_racha: 2, activo_hoy: true },
        diasActivos: ['2026-08-24', '2026-08-26', '2026-08-10'],
      },
    })
    const barras = w.findAll('.avance-dia-barra')
    expect(barras).toHaveLength(7)
    // Lunes 24 y miércoles 26 activos; el día fuera de la semana no cuenta.
    expect(barras[0].classes()).toContain('is-activo')
    expect(barras[2].classes()).toContain('is-activo')
    expect(barras.filter((b) => b.classes().includes('is-activo'))).toHaveLength(2)
    // Jueves en adelante es futuro.
    expect(barras[3].classes()).toContain('is-futuro')
    expect(w.get('[data-test="meta-semanal"]').text()).toContain('2 de 5')
  })

  it('celebra la meta semanal cumplida', () => {
    const w = mount(AvanceSemanal, {
      props: {
        racha: { racha_actual: 5, mejor_racha: 5, activo_hoy: true },
        diasActivos: ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'],
      },
    })
    expect(w.get('[data-test="meta-semanal"]').text()).toContain('Meta semanal cumplida')
  })
})
