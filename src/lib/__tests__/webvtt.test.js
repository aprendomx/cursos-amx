import { describe, it, expect } from 'vitest'
import { formatearTiempo, segmentosAVtt, esVttValido } from '../webvtt.js'

describe('formatearTiempo', () => {
  it('formatea al formato de WebVTT', () => {
    expect(formatearTiempo(0)).toBe('00:00:00.000')
    expect(formatearTiempo(1.5)).toBe('00:00:01.500')
    expect(formatearTiempo(61)).toBe('00:01:01.000')
    expect(formatearTiempo(3661.25)).toBe('01:01:01.250')
  })

  it('no produce tiempos negativos ni NaN', () => {
    expect(formatearTiempo(-5)).toBe('00:00:00.000')
    expect(formatearTiempo(undefined)).toBe('00:00:00.000')
    expect(formatearTiempo('abc')).toBe('00:00:00.000')
  })
})

describe('segmentosAVtt', () => {
  it('produce un WebVTT válido', () => {
    const vtt = segmentosAVtt([
      { start: 0, end: 2.5, text: 'Hola a todos' },
      { start: 2.5, end: 5, text: 'Bienvenidos al curso' },
    ])
    expect(vtt).toContain('WEBVTT')
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.500')
    expect(vtt).toContain('Hola a todos')
    expect(esVttValido(vtt)).toBe(true)
  })

  it('devuelve cadena vacía si no hay nada utilizable', () => {
    expect(segmentosAVtt(null)).toBe('')
    expect(segmentosAVtt([])).toBe('')
    expect(segmentosAVtt([{ start: 0, end: 1, text: '   ' }])).toBe('')
  })

  // Un cue con fin ausente o anterior al inicio hace que el navegador
  // descarte la pista COMPLETA, no solo ese cue.
  it('repara los cues sin fin válido en vez de descartar la pista', () => {
    const vtt = segmentosAVtt([
      { start: 10, text: 'Sin fin' },
      { start: 20, end: 15, text: 'Fin anterior al inicio' },
    ])
    expect(vtt).toContain('00:00:10.000 --> 00:00:11.000')
    expect(vtt).toContain('00:00:20.000 --> 00:00:21.000')
    expect(esVttValido(vtt)).toBe(true)
  })

  it('descarta segmentos sin inicio numérico', () => {
    const vtt = segmentosAVtt([
      { start: 'x', end: 2, text: 'Inválido' },
      { start: 0, end: 1, text: 'Válido' },
    ])
    expect(vtt).not.toContain('Inválido')
    expect(vtt).toContain('Válido')
  })

  it('numera los cues consecutivamente aunque se descarten algunos', () => {
    const vtt = segmentosAVtt([
      { start: 0, end: 1, text: 'uno' },
      { start: 1, end: 2, text: '' },
      { start: 2, end: 3, text: 'dos' },
    ])
    expect(vtt).toMatch(/\n1\n/)
    expect(vtt).toMatch(/\n2\n/)
    expect(vtt).not.toMatch(/\n3\n/)
  })
})

describe('esVttValido', () => {
  it('acepta un WebVTT bien formado, incluso con BOM', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHola\n'
    expect(esVttValido(vtt)).toBe(true)
    expect(esVttValido('﻿' + vtt)).toBe(true)
  })

  it('rechaza lo que no lo es', () => {
    expect(esVttValido('')).toBe(false)
    expect(esVttValido(null)).toBe(false)
    expect(esVttValido('1\n00:00:00,000 --> 00:00:01,000\nHola')).toBe(false) // SRT
    expect(esVttValido('WEBVTT')).toBe(false) // sin cues
  })
})
