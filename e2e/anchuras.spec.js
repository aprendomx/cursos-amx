import { test, expect } from '@playwright/test'

/**
 * Revisión por anchuras, modos y movimiento reducido.
 *
 * Esta comprobación estuvo tres tandas marcada como «bloqueada por
 * herramienta», tras dos intentos fallidos: redimensionar la ventana del
 * navegador informaba éxito sin cambiar el viewport, y un iframe sí evaluaba
 * las media queries contra su propio ancho pero la aplicación no montaba
 * dentro. Aquel «cero desbordamiento» era un falso positivo sobre un documento
 * vacío. `page.setViewportSize()` sí funciona, y aquí se exige además prueba de
 * que hay algo que medir antes de dar nada por bueno.
 */

const ANCHOS = [375, 768, 1024, 1440]

// Solo rutas cuyo contenido NO viene de la base: sin backend las demás salen
// vacías y medirlas no dice nada. /#/aviso-privacidad daba 30 nodos y 62
// caracteres — justo el falso positivo del intento anterior.
const RUTAS = ['/#/', '/#/login', '/#/registro']

async function exigirQueMontó(page) {
  await expect(page.locator('#app > *')).toHaveCount(1)
  const nodos = await page.locator('body *').count()
  const letras = (await page.locator('body').innerText()).trim().length
  expect(nodos, 'la página no montó: no hay nada que medir').toBeGreaterThan(40)
  expect(letras, 'la página montó vacía').toBeGreaterThan(150)
}

async function desbordamientos(page, ancho) {
  return page.evaluate((w) => {
    const culpables = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      const cs = getComputedStyle(el)
      // Un elemento fijo o con su propio desplazamiento horizontal puede
      // salirse a propósito: no es desbordamiento de la página.
      if (cs.position === 'fixed' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue
      if (b.right > w + 1 || b.left < -1) {
        culpables.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '—'} ` +
            `[${Math.round(b.left)}..${Math.round(b.right)}]`
        )
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, culpables: [...new Set(culpables)] }
  }, ancho)
}

for (const ancho of ANCHOS) {
  for (const modo of ['light', 'dark']) {
    test(`sin desplazamiento horizontal a ${ancho}px en modo ${modo}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 })
      for (const ruta of RUTAS) {
        await page.goto(ruta)
        await page.evaluate((m) => document.documentElement.setAttribute('data-theme', m), modo)
        await page.waitForTimeout(300)
        await exigirQueMontó(page)

        const r = await desbordamientos(page, ancho)
        expect(r.culpables, `${ruta} a ${ancho}px (${modo})`).toEqual([])
        expect(r.scrollWidth, `${ruta} desborda el viewport`).toBeLessThanOrEqual(ancho + 1)
      }
    })
  }
}

test('con movimiento reducido no hay animaciones que mareen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/#/')
  await exigirQueMontó(page)

  // La regla global pone 0.01ms. Se comprueba en elementos que SÍ declaran
  // transición, para no dar por bueno un cero que venía de no tener ninguna.
  const duraciones = await page.evaluate(() => {
    const vistos = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      const t = cs.transitionDuration
      const a = cs.animationDuration
      if (t && t !== '0s') vistos.push(`transition:${t}`)
      if (a && a !== '0s') vistos.push(`animation:${a}`)
    }
    return [...new Set(vistos)]
  })
  // 0.01ms se reporta como '0.00001s'; cualquier valor perceptible sería mayor.
  const perceptibles = duraciones.filter((d) => parseFloat(d.split(':')[1]) > 0.05)
  expect(perceptibles, 'quedan animaciones perceptibles con movimiento reducido').toEqual([])
})
