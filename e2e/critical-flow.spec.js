import { test, expect } from '@playwright/test'

/**
 * Flujo crítico end-to-end:
 * Registro → Login → Inscripción a curso → Player → Constancia
 *
 * Dos clases de prueba conviven aquí, y la distinción importa:
 *
 * - El asistente de registro se RENDERIZA sin backend, así que su recorrido
 *   por los cuatro pasos se comprueba siempre.
 * - Iniciar sesión, entrar al player y completar una lección necesitan un
 *   Supabase vivo con datos. Sin credenciales se SALTAN, no se dan por
 *   fallidos: un job en rojo permanente deja de ser una señal, y esconde
 *   justo la regresión que tendría que delatar.
 *
 * Para correrlos de verdad hace falta el stack (ver docs/MANUAL_ACTUALIZACION.md)
 * y exportar E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */

const HAY_BACKEND = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)

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

    // Paso 4: confirmar
    await expect(page.locator('text=Paso 4 de 4')).toBeVisible()
    await page.check('.registro-accept input[type="checkbox"]')

    const enviar = page.locator('button:has-text("Crear cuenta")')
    await expect(enviar).toBeEnabled()

    // Hasta aquí llega lo que se puede afirmar sin backend: que el asistente
    // recorre sus cuatro pasos, acepta el aviso y habilita el envío.
    //
    // La comprobación anterior era `toHaveURL(/.*\/#\//)` DESPUÉS de enviar, y
    // casa con CUALQUIER ruta hash —incluida quedarse en /#/registro—, así que
    // daba verde también cuando el registro fallaba: no demostraba nada.
    if (!HAY_BACKEND) return

    await enviar.click()
    // Con backend sí se puede exigir que el alta prospere: el asistente deja
    // de mostrarse y la sesión queda iniciada.
    await expect(page.locator('text=Paso 4 de 4')).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator('.nav-avatar')).toBeVisible()
  })

  test('should login with registered user', async ({ page }) => {
    test.skip(!HAY_BACKEND, 'necesita Supabase vivo y E2E_ADMIN_EMAIL/PASSWORD')
    await page.goto('/#/login')
    await expect(page.locator('text=Accede a tu plataforma')).toBeVisible()

    await page.fill('input[type="email"]', testUser.email)
    await page.fill('input[type="password"]', testUser.password)
    await page.click('button:has-text("Entrar")')

    // Should redirect to home and show user avatar or name
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })
    await expect(page.locator('.nav-avatar')).toBeVisible()
  })

  test('should navigate to a course and enter player', async ({ page }) => {
    test.skip(!HAY_BACKEND, 'necesita Supabase vivo con al menos un curso publicado')
    // Login first
    await page.goto('/#/login')
    await page.fill('input[type="email"]', testUser.email)
    await page.fill('input[type="password"]', testUser.password)
    await page.click('button:has-text("Entrar")')
    await expect(page).toHaveURL(/.*\/#\//, { timeout: 10000 })

    // Click on first course
    await page.click('.curso-bloque .curso-cover')
    await expect(page).toHaveURL(/.*curso/)

    // Click "Iniciar curso" or "Continuar"
    await page.click('text=Iniciar, text=Continuar, text=Entrar')
    await expect(page).toHaveURL(/.*player/)

    // Player page should show lesson title and video surface
    await expect(page.locator('.player-topbar')).toBeVisible()
    await expect(page.locator('.video-surface, .player-page')).toBeVisible()
  })

  test('should complete a lesson and verify constancia', async ({ page }) => {
    test.skip(!HAY_BACKEND, 'necesita Supabase vivo, inscripción y progreso')
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
