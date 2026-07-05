import { describe, it, expect } from 'vitest'
import { parseDuracionToSeg, segToDuracion } from '@/lib/duracion.js'

describe('duracion', () => {
  it('parsea mm:ss', () => {
    expect(parseDuracionToSeg('12:30')).toBe(750)
  })
  it('parsea hh:mm:ss', () => {
    expect(parseDuracionToSeg('1:00:05')).toBe(3605)
  })
  it('parsea segundos planos', () => {
    expect(parseDuracionToSeg('90')).toBe(90)
  })
  it('devuelve 0 en entrada inválida', () => {
    expect(parseDuracionToSeg('abc')).toBe(0)
    expect(parseDuracionToSeg('')).toBe(0)
    expect(parseDuracionToSeg(null)).toBe(0)
  })
  it('formatea segundos a mm:ss', () => {
    expect(segToDuracion(750)).toBe('12:30')
    expect(segToDuracion(0)).toBe('')
  })
})
