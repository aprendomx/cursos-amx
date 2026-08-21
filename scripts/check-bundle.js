#!/usr/bin/env node
// scripts/check-bundle.js — presupuesto de tamaño del bundle.
//
// El chunk `vendor` llegó a pesar 1.9 MB porque el manualChunks de
// vite.config.js mandaba ahí todo lo que no reconocía: TipTap, chart.js,
// html2pdf, qrcode, idb, tus-js-client… Se descargaba entero para ver la
// landing. Sin un tope que falle, eso vuelve a pasar en cuanto alguien añada
// una dependencia.
//
// Uso: node scripts/check-bundle.js   (después de `npm run build`)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')

// Presupuestos en kB comprimidos (gzip), que es lo que viaja por la red.
// Se fijan con holgura sobre lo medido: la idea es detectar un salto, no
// obligar a tocar el archivo en cada cambio pequeño.
const PRESUPUESTOS = {
  // Lo que descarga alguien que solo abre la landing.
  inicial: 180,
  // Chunks individuales que no deben crecer sin que nos enteremos.
  vendor: 95,
  // hls.js, y nada más: el chunk ES la librería. Subió de 175 a 185 kB cuando
  // dependabot la llevó de 1.6.16 a 1.7.0 —un salto de versión MENOR que
  // engordó 22 kB gzip, un 14 % de ese trozo—.
  //
  // Se sube el tope en vez de fijar la versión porque el chunk se carga de
  // forma diferida, solo al entrar al reproductor: no toca el arranque de nadie
  // que no vea un vídeo. Si vuelve a crecer así, conviene mirar si hls.js
  // permite una compilación más pequeña antes de subirlo otra vez.
  video: 185,
}

function gzipKb(ruta) {
  return gzipSync(readFileSync(ruta)).length / 1024
}

function buscar(prefijo) {
  const f = readdirSync(ASSETS).find((n) => n.startsWith(prefijo + '-') && n.endsWith('.js'))
  return f ? join(ASSETS, f) : null
}

try {
  statSync(DIST)
} catch {
  console.error('✘ No existe dist/. Corre `npm run build` antes.')
  process.exit(1)
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const referidos = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+)"/g)].map((m) => m[1])

let inicial = 0
for (const f of referidos) {
  try {
    inicial += gzipKb(join(ASSETS, f))
  } catch {
    /* referencia a un archivo que no está en assets/: se ignora */
  }
}

const medido = { inicial }
for (const nombre of ['vendor', 'video']) {
  const ruta = buscar(nombre)
  if (ruta) medido[nombre] = gzipKb(ruta)
}

let fallos = 0
console.log('Presupuesto de bundle (gzip):')
for (const [nombre, tope] of Object.entries(PRESUPUESTOS)) {
  const kb = medido[nombre]
  if (kb === undefined) {
    console.log(`  ?  ${nombre.padEnd(10)} no encontrado (¿cambió el nombre del chunk?)`)
    continue
  }
  const ok = kb <= tope
  if (!ok) fallos++
  console.log(
    `  ${ok ? '✔' : '✘'}  ${nombre.padEnd(10)} ${kb.toFixed(1).padStart(7)} kB / ${tope} kB`
  )
}

if (fallos > 0) {
  console.error(
    `\n✘ ${fallos} chunk(s) por encima del presupuesto.\n` +
      '  Si el crecimiento es intencional, sube el tope en este archivo y di por qué.\n' +
      '  Si no, revisa manualChunks en vite.config.js y si la ruta que lo usa es diferida.'
  )
  process.exit(1)
}
console.log('\n✔ Dentro del presupuesto.')
