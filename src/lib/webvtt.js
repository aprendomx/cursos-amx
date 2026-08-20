// Conversión de segmentos de transcripción a WebVTT.
//
// El reproductor no tenía pista de subtítulos: ningún <video> llevaba <track>,
// lo que incumple WCAG 2.1 §1.2.2 (Subtítulos, prerrabados) en nivel A — un
// requisito duro para el sector público. El dato ya se producía: el servicio
// de transcripción guarda `sesiones_transcripciones.segmentos` como
// [{ start, end, text }]. Solo faltaba el último tramo.

/** Segundos → `HH:MM:SS.mmm`, el formato de tiempo de WebVTT. */
export function formatearTiempo(segundos) {
  const s = Math.max(0, Number(segundos) || 0)
  const horas = Math.floor(s / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  const seg = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  const dos = (n) => String(n).padStart(2, '0')
  return `${dos(horas)}:${dos(minutos)}:${dos(seg)}.${String(ms).padStart(3, '0')}`
}

/**
 * Segmentos → texto WebVTT.
 * Devuelve '' si no hay nada utilizable, para que quien llame pueda decidir
 * no montar la pista en vez de montar una vacía.
 */
export function segmentosAVtt(segmentos) {
  if (!Array.isArray(segmentos) || segmentos.length === 0) return ''

  const cues = []
  let n = 0

  for (const seg of segmentos) {
    const texto = String(seg?.text ?? '').trim()
    if (!texto) continue

    const inicio = Number(seg?.start)
    let fin = Number(seg?.end)
    if (!Number.isFinite(inicio)) continue
    // Un cue sin fin, o con fin anterior al inicio, rompe el parser del
    // navegador y tira la pista entera. Se le da una duración mínima.
    if (!Number.isFinite(fin) || fin <= inicio) fin = inicio + 1

    n += 1
    cues.push(`${n}\n${formatearTiempo(inicio)} --> ${formatearTiempo(fin)}\n${texto}`)
  }

  if (cues.length === 0) return ''
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

/** ¿Es un WebVTT que un navegador aceptaría? Comprobación mínima. */
export function esVttValido(texto) {
  if (typeof texto !== 'string') return false
  const limpio = texto.replace(/^﻿/, '').trimStart()
  if (!limpio.startsWith('WEBVTT')) return false
  return /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(limpio)
}

/**
 * Blob URL para alimentar a <track src>. Quien llame debe revocarla al
 * desmontar: si no, cada cambio de lección filtra memoria.
 */
export function crearUrlVtt(textoVtt) {
  if (!textoVtt) return null
  return URL.createObjectURL(new Blob([textoVtt], { type: 'text/vtt' }))
}
