import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('should load the landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/CONASAMA|Plataforma/)
  })

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Iniciar sesión')
    await expect(page).toHaveURL(/.*login/)
    await expect(page.locator('text=Accede a tu plataforma')).toBeVisible()
  })

  test('should navigate to registro page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Registro')
    await expect(page).toHaveURL(/.*registro/)
    await expect(page.locator('text=Crear cuenta')).toBeVisible()
  })
})

test.describe('Auth Flow', () => {
  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/#/login')
    await page.fill('input[type="email"]', 'invalid@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button:has-text("Entrar")')

    // Should show error or redirect
    await expect(page.locator('body')).toContainText(/Error|Incorrectos|Invalid/)
  })
})
