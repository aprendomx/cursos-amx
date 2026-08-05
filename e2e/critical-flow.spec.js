import { test, expect } from '@playwright/test'

/**
 * Flujo crítico end-to-end:
 * Registro → Login → Inscripción a curso → Player → Constancia
 *
 * Nota: Este spec requiere que el stack de Supabase esté corriendo
 * (ver docs/MANUAL_ACTUALIZACION.md). Sin backend, los tests de
 * autenticación y progreso fallarán.
 */

test.describe('Critical Flow', () => {
  const testUser = {
    email: `e2e-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    nombres: 'Usuario',
    apellidoPaterno: 'E2E',
    apellidoMaterno: 'Test',
    telefono: '5512345678',
  }

  test('should register a new user', async ({ page }) => {
    await page.goto('/#/registro')
    await expect(page.locator('text=Paso 1 de 4')).toBeVisible()

    // Paso 1: identidad
    await page.fill('#r-nombres', testUser.nombres)
    await page.fill('#r-ap1', testUser.apellidoPaterno)
    await page.fill('#r-ap2', testUser.apellidoMaterno)
    await page.fill('#r-password', testUser.password)
    await page.click('button:has-text("Siguiente")')

    // Paso 2: contacto
    await page.fill('#r-correo', testUser.email)
    await page.fill('#r-tel', testUser.telefono)
    await page.click('button:has-text("Siguiente")')

    // Paso 3: dependencia
    await page.selectOption('#r-dep', { index: 1 })
    await page.fill('#r-cargo', 'Pruebas E2E')
    await page.click('button:has-text("Siguiente")')

    // Paso 4: confirmar y enviar
    await page.check('.registro-accept input[type="checkbox"]')
    await page.click('button:has-text("Crear cuenta")')

    // After successful registration, should redirect to home or show confirmation
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })
  })

  test('should login with registered user', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.locator('text=Accede a tu plataforma')).toBeVisible()

    await page.fill('input[type="email"]', testUser.email)
    await page.fill('input[type="password"]', testUser.password)
    await page.click('button:has-text("Entrar")')

    // Should redirect to home and show user avatar or name
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })
    await expect(page.locator('.user-avatar, [data-test="user-menu"]')).toBeVisible()
  })

  test('should navigate to a course and enter player', async ({ page }) => {
    // Login first
    await page.goto('/#/login')
    await page.fill('input[type="email"]', testUser.email)
    await page.fill('input[type="password"]', testUser.password)
    await page.click('button:has-text("Entrar")')
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })

    // Click on first course
    await page.click('.course-card, [data-test="course-card"]')
    await expect(page).toHaveURL(/.*curso/)

    // Click "Iniciar curso" or "Continuar"
    await page.click('text=Iniciar, text=Continuar, text=Entrar')
    await expect(page).toHaveURL(/.*player/)

    // Player page should show lesson title and video surface
    await expect(page.locator('.player-topbar')).toBeVisible()
    await expect(page.locator('.video-surface, .player-page')).toBeVisible()
  })

  test('should complete a lesson and verify constancia', async ({ page }) => {
    // Login
    await page.goto('/#/login')
    await page.fill('input[type="email"]', testUser.email)
    await page.fill('input[type="password"]', testUser.password)
    await page.click('button:has-text("Entrar")')
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })

    // Navigate to player (assumes previous test enrolled)
    await page.goto('/#/player/test-curso-id/test-leccion-id')

    // Wait for player to load
    await expect(page.locator('.player-topbar')).toBeVisible()

    // Mark lesson as complete (this depends on the lesson type)
    const completeButton = page.locator('text=Marcar como completada')
    if (await completeButton.isVisible().catch(() => false)) {
      await completeButton.click()
    }

    // If all lessons complete, constancia should be available
    // Navigate to constancia verification
    await page.goto('/#/constancia')
    await expect(page.locator('text=Constancia')).toBeVisible()
  })
})
