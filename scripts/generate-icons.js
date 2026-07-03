import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

try {
  mkdirSync(publicDir, { recursive: true })
} catch {}

const color = '#611232'

async function generateIcon(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${color}"/></svg>`
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, `icon-${size}x${size}.png`))
  console.log(`Generated icon-${size}x${size}.png`)
}

await generateIcon(192)
await generateIcon(512)
console.log('Done')
