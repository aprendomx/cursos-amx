import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('landing page loads within budget', async ({ page }) => {
    const start = Date.now()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const totalMs = Date.now() - start

    const timing = await page.evaluate(() => {
      const t = performance.timing || {}
      const nav = performance.getEntriesByType('navigation')[0] || {}
      return {
        domContentLoaded: t.domContentLoadedEventEnd
          ? t.domContentLoadedEventEnd - t.navigationStart
          : nav.domContentLoadedEventEnd || 0,
        loadComplete: t.loadEventEnd ? t.loadEventEnd - t.navigationStart : nav.loadEventEnd || 0,
      }
    })

    console.log('Timing:', { ...timing, totalMs })

    expect(timing.domContentLoaded).toBeLessThan(2500)
    expect(timing.loadComplete).toBeLessThan(3500)
    expect(totalMs).toBeLessThan(4000)
  })

  test('auth page loads within budget', async ({ page }) => {
    const start = Date.now()
    await page.goto('/#/auth')
    await page.waitForLoadState('networkidle')
    const totalMs = Date.now() - start

    const timing = await page.evaluate(() => {
      const t = performance.timing || {}
      const nav = performance.getEntriesByType('navigation')[0] || {}
      return {
        domContentLoaded: t.domContentLoadedEventEnd
          ? t.domContentLoadedEventEnd - t.navigationStart
          : nav.domContentLoadedEventEnd || 0,
        loadComplete: t.loadEventEnd ? t.loadEventEnd - t.navigationStart : nav.loadEventEnd || 0,
      }
    })

    console.log('Auth timing:', { ...timing, totalMs })

    expect(timing.domContentLoaded).toBeLessThan(2500)
    expect(totalMs).toBeLessThan(4000)
  })
})
