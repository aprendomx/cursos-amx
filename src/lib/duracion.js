export function parseDuracionToSeg(input) {
  if (!input) return 0
  const s = String(input).trim()
  if (!s) return 0
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const parts = s.split(':').map((p) => parseInt(p, 10))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export function segToDuracion(seg) {
  const n = parseInt(seg, 10)
  if (!n || n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
