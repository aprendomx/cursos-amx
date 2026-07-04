// Genera los webp neutros del tema (fondo/pleca/preview de constancia).
// Uso: node scripts/generate-theme-images.js
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('public/theme', { recursive: true })

const svg = (w, h, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)

await sharp(svg(1600, 1131, '<rect width="100%" height="100%" fill="#fbfaf7"/>'))
  .webp({ quality: 80 })
  .toFile('public/theme/constancia-fondo.webp')

await sharp(
  svg(
    1600,
    120,
    '<rect width="100%" height="100%" fill="#1e3a8a"/><rect y="112" width="100%" height="8" fill="#b45309"/>'
  )
)
  .webp({ quality: 80 })
  .toFile('public/theme/constancia-pleca.webp')

await sharp(
  svg(
    1200,
    848,
    '<rect width="100%" height="100%" fill="#fbfaf7"/><rect y="0" width="100%" height="90" fill="#1e3a8a"/><text x="600" y="440" font-family="Georgia" font-size="54" fill="#1e3a8a" text-anchor="middle">Constancia de ejemplo</text>'
  )
)
  .webp({ quality: 80 })
  .toFile('public/theme/constancia-preview.webp')

console.log('✔ Imágenes de tema generadas en public/theme/')
