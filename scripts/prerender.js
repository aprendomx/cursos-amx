import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'dist')

const routes = [
  { path: '/', file: 'index.html' },
  { path: '/login', file: 'login.html' },
  { path: '/registro', file: 'registro.html' },
]

async function prerender() {
  // Ensure dist exists
  await mkdir(outDir, { recursive: true })

  // Start Vite preview server on a random port
  const server = await createServer({
    root,
    build: { outDir },
    server: { port: 0, strictPort: false },
  })
  await server.listen()
  const port = server.config.server.port
  const baseUrl = `http://localhost:${port}`

  const browser = await chromium.launch()
  const context = await browser.newContext()

  for (const route of routes) {
    const page = await context.newPage()
    const url = `${baseUrl}${route.path}`
    console.log(`[prerender] ${url}`)

    await page.goto(url, { waitUntil: 'networkidle' })

    // Wait for Vue to hydrate and render content
    await page.waitForSelector('#app', { state: 'attached' })
    // Give a bit more time for async data (landing stats, courses)
    await page.waitForTimeout(2000)

    const html = await page.content()
    const outFile = join(outDir, route.file)
    await writeFile(outFile, html)
    console.log(`[prerender] written ${outFile}`)
    await page.close()
  }

  await browser.close()
  await server.close()
  console.log('[prerender] done')
}

prerender().catch((err) => {
  console.error(err)
  process.exit(1)
})
