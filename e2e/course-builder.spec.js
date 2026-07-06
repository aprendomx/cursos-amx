import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD

// Requiere: Supabase local corriendo, flag visual_builder = true, admin seedeado.
test.describe('Constructor visual de cursos', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Definir E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // LoginPage.vue: email input id="login-correo" type="email" (line 55-63)
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
    // LoginPage.vue: password input id="login-pass" type="password" (line 69-75)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    // LoginPage.vue: submit button is type="button" (NOT type="submit") with class auth-submit (line 83-91)
    // Brief used: form button[type="submit"] — adjusted to button.auth-submit
    await page.locator('button.auth-submit').click()
    await page.waitForURL(/\/(admin|perfil|$)/)
  })

  test('crear curso → auto-borrador → estructura persiste → texto en player', async ({ page }) => {
    const stamp = Date.now()
    await page.goto('/admin')

    // Paso Básico
    // AdminPage.vue navItems: { key: 'nuevo', label: '+ Nuevo curso', primary: true } (line 205)
    // Rendered as <button class="admin-nav-btn ... primary">+ Nuevo curso</button>
    // Brief used same getByRole — text "+ Nuevo curso" matches /nuevo curso/i
    await page
      .getByRole('button', { name: /nuevo curso|crear curso/i })
      .first()
      .click()

    // AdminCourseEditor.vue: título input placeholder "Ej. Transparencia y Rendición de Cuentas" (line 879)
    await page.getByPlaceholder(/transparencia/i).fill(`E2E Builder ${stamp}`)

    // Avanzar a Estructura → auto-borrador
    // AdminCourseEditor.vue step buttons: ['Básico', 'Estructura', 'Revisar'] (line 860)
    await page.getByRole('button', { name: /estructura/i }).click()
    // CourseBuilder.vue: <div class="course-builder"> (line 89)
    await expect(page.locator('.course-builder')).toBeVisible()

    // Agregar módulo y lección
    // ModuleList.vue: <button class="add-module" data-test="add-module"> (line 55)
    await page.getByTestId('add-module').click()
    // ModuleListItem.vue: <div class="module-item" data-test="module-item"> (line 46)
    await expect(page.getByTestId('module-item')).toHaveCount(1)
    // LessonTimeline.vue: <button class="add-lesson" data-test="add-lesson"> (line 71)
    await page.getByTestId('add-lesson').click()
    // LessonCard.vue: <article class="lesson-card" data-test="lesson-card"> (line 62)
    await expect(page.getByTestId('lesson-card')).toHaveCount(1)

    // Segundo módulo + reorder con fallback accesible (↑/↓)
    await page.getByTestId('add-module').click()
    // ModuleListItem.vue: module-actions opacity visible on hover (.module-item:hover .module-actions)
    await page.getByTestId('module-item').first().hover()
    // ModuleListItem.vue: <button data-test="module-down"> shown with v-if="!isLast" (line 82-88)
    await page.getByTestId('module-down').first().click()

    // Persistencia: recargar y verificar que el orden sobrevive
    await page.reload()
    await page.getByRole('button', { name: /estructura/i }).click()
    await expect(page.getByTestId('module-item')).toHaveCount(2)
    // El módulo activo (index 0) es el que era el segundo (sin lecciones)
    await expect(page.getByTestId('lesson-card')).toHaveCount(0)
    await page.getByTestId('module-item').nth(1).click()
    await expect(page.getByTestId('lesson-card')).toHaveCount(1)

    // Lección de texto enriquecido
    // LessonCard.vue: @click triggers 'edit' event → abrirLeccion → leccionAbierta
    await page.getByTestId('lesson-card').first().click()
    // LessonEditorPanel.vue: radio input :data-test="`fuente-${f}`" for f='texto' → data-test="fuente-texto" (line 145-146)
    await page.getByTestId('fuente-texto').check()
    // LessonRichTextEditor.vue: <EditorContent class="rich-content" /> renders .ProseMirror inside (line 142)
    await page.locator('.rich-content .ProseMirror').fill('Contenido E2E de texto enriquecido')
    // LessonEditorPanel.vue: <button data-test="panel-save"> (line 217)
    await page.getByTestId('panel-save').click()

    // Verificación mínima: la lección quedó con fuente=texto, badge "Sin contenido" NO visible
    // LessonCard.vue: badge warn rendered only when lesson.fuente === 'ninguno' (line 77-79)
    await expect(page.getByTestId('lesson-card').first()).not.toContainText('Sin contenido')
  })
})
