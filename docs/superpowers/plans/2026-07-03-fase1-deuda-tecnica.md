# Fase 1: Deuda Técnica Crítica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar las páginas monolíticas (AdminPage ~1600 líneas, PlayerPage ~2100 líneas), estandarizar manejo de errores, y añadir tests unitarios para la lógica extraída.

**Architecture:** Extraer sub-componentes Vue con responsabilidad única, composables reutilizables para lógica compartida, y un sistema de errores unificado. Sin cambios funcionales visibles para el usuario.

**Tech Stack:** Vue 3 Composition API, Vite, Vitest, Pinia, Supabase.

---

## File Structure

Nuevos archivos a crear:

- `src/lib/errors.js` — Clases de error de aplicación
- `src/composables/useErrorHandler.js` — Composable para manejo de errores
- `src/composables/useAdminDashboard.js` — Lógica del dashboard admin
- `src/composables/useAdminCourseWizard.js` — Lógica del wizard de cursos
- `src/components/AdminDashboard.vue` — Panel de métricas y gráficas
- `src/components/AdminCourseList.vue` — Tabla de cursos
- `src/components/AdminCourseEditor.vue` — Wizard de 3 pasos (envuelve sub-pasos)
- `src/components/AdminUserManager.vue` — Tabla de usuarios + paginación + modal reset
- `src/components/AdminReportViewer.vue` — Selector de reportes + tabla CSV
- `src/components/PlayerVideoSurface.vue` — Reproductor (youtube/hls/documento/examen)
- `src/components/PlayerChatPane.vue` — Panel de comentarios/chat
- `src/components/PlayerLessonNavigator.vue` — Lista de lecciones (reutilizable para 3 variantes)

Archivos a modificar:

- `src/pages/AdminPage.vue` — Reducir a < 300 líneas, usar componentes extraídos
- `src/pages/PlayerPage.vue` — Reducir a < 300 líneas, usar componentes extraídos
- `src/services/cursos.js` — Usar `AppError` en lugar de throws genéricos
- `src/services/videos.js` — Usar `AppError` + estandarizar mensajes
- `src/services/progreso.js` — Usar `AppError`

---

## Task 1: Sistema de errores unificado

**Files:**

- Create: `src/lib/errors.js`
- Create: `src/composables/useErrorHandler.js`
- Test: `src/composables/__tests__/useErrorHandler.test.js`

### Step 1: Write the error classes

```javascript
// src/lib/errors.js
export class AppError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 500, details = null } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Error de conexión', details = null) {
    super(message, { code: 'NETWORK_ERROR', status: 0, details })
    this.name = 'NetworkError'
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Permisos insuficientes', details = null) {
    super(message, { code: 'PERMISSION_DENIED', status: 403, details })
    this.name = 'PermissionError'
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', details = null) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details })
    this.name = 'ValidationError'
  }
}

export function mapSupabaseError(error) {
  const msg = String(error?.message || error || '')
  if (/network|fetch|timeout/i.test(msg)) return new NetworkError(msg, error)
  if (/unauthorized|jwt|auth/i.test(msg))
    return new PermissionError('Sesión expirada. Vuelve a iniciar sesión.', error)
  if (/forbidden|rls/i.test(msg)) return new PermissionError(msg, error)
  if (/duplicate|23505/i.test(msg)) return new ValidationError('Registro duplicado.', error)
  if (/not.*found|404/i.test(msg))
    return new AppError('No encontrado.', { code: 'NOT_FOUND', status: 404, details: error })
  return new AppError(msg, { code: 'SUPABASE_ERROR', status: error?.status || 500, details: error })
}
```

### Step 2: Write the composable

```javascript
// src/composables/useErrorHandler.js
import { ref } from 'vue'
import { AppError, mapSupabaseError } from '@/lib/errors.js'

export function useErrorHandler() {
  const error = ref(null)
  const loading = ref(false)

  function clear() {
    error.value = null
  }

  async function run(asyncFn, opts = {}) {
    const { onError, fallback = null, map = mapSupabaseError } = opts
    loading.value = true
    error.value = null
    try {
      return await asyncFn()
    } catch (e) {
      const mapped = e instanceof AppError ? e : map(e)
      error.value = mapped
      if (onError) onError(mapped)
      return fallback
    } finally {
      loading.value = false
    }
  }

  return { error, loading, run, clear }
}
```

### Step 3: Write tests

```javascript
// src/composables/__tests__/useErrorHandler.test.js
import { describe, it, expect, vi } from 'vitest'
import { useErrorHandler } from '../useErrorHandler.js'
import { AppError, NetworkError } from '@/lib/errors.js'

describe('useErrorHandler', () => {
  it('runs async fn and returns result', async () => {
    const { run, error, loading } = useErrorHandler()
    const result = await run(async () => 42)
    expect(result).toBe(42)
    expect(error.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('maps error and returns fallback', async () => {
    const { run, error, loading } = useErrorHandler()
    const result = await run(
      async () => {
        throw new Error('fail')
      },
      { fallback: 'default' }
    )
    expect(result).toBe('default')
    expect(error.value).toBeInstanceOf(AppError)
    expect(loading.value).toBe(false)
  })

  it('calls onError callback', async () => {
    const onError = vi.fn()
    const { run } = useErrorHandler()
    await run(
      async () => {
        throw new Error('x')
      },
      { onError }
    )
    expect(onError).toHaveBeenCalledOnce()
  })
})
```

Run: `npm run test:unit -- src/composables/__tests__/useErrorHandler.test.js`
Expected: PASS

---

## Task 2: Refactor AdminPage.vue — Dashboard

**Files:**

- Create: `src/components/AdminDashboard.vue`
- Create: `src/composables/useAdminDashboard.js`
- Modify: `src/pages/AdminPage.vue` (remove dashboard template + logic)

### Step 1: Extract dashboard composable

Move `metrics`, `barData`, `topCourses`, `recentActivity`, `loadDashboard` into `useAdminDashboard.js`.

### Step 2: Extract AdminDashboard.vue component

Template: metric cards, bar chart, top courses table, recent activity list.
Props: `metrics`, `barData`, `topCourses`, `recentActivity`
Emits: `createCourse`

### Step 3: Replace in AdminPage.vue

Replace `<template v-if="activeSection === 'resumen'">` with `<AdminDashboard ... />`.

---

## Task 3: Refactor AdminPage.vue — Course Editor

**Files:**

- Create: `src/components/AdminCourseEditor.vue`
- Create: `src/composables/useAdminCourseWizard.js`
- Modify: `src/pages/AdminPage.vue`

### Step 1: Extract wizard composable

Move `editingCurso`, `editorStep`, `validationChecks`, `publishCurso`, `createBlankCurso`, `autoSlug`, etc. into `useAdminCourseWizard.js`.

### Step 2: Extract AdminCourseEditor.vue

Template: step indicator + 3 panels (básico, estructura, revisar) + publish button.
Props: `session`, `initialCurso` (optional)
Emits: `published`, `cancel`

### Step 3: Replace in AdminPage.vue

Replace course editor template with `<AdminCourseEditor v-if="editingCurso" ... />`.

---

## Task 4: Refactor AdminPage.vue — User Manager

**Files:**

- Create: `src/components/AdminUserManager.vue`
- Modify: `src/pages/AdminPage.vue`

Extract user table, pagination, search, and password reset modal into `AdminUserManager.vue`.
Props: `session`

---

## Task 5: Refactor PlayerPage.vue — Video Surface

**Files:**

- Create: `src/components/PlayerVideoSurface.vue`
- Modify: `src/pages/PlayerPage.vue`

Extract iframe/video/documento/examen rendering, controls, overlays, badges.
Props: `source`, `leccion`, `videoEl`, `hlsPoster`, `playing`, `completada`, etc.
Emits: `togglePlay`, `seek`, `timeUpdate`, `loadedMetadata`, `ended`, `finLectura`, `evalAprobada`

---

## Task 6: Refactor PlayerPage.vue — Chat Pane

**Files:**

- Create: `src/components/PlayerChatPane.vue`
- Modify: `src/pages/PlayerPage.vue`

Extract chat header, messages list, input bar.
Props: `comentarios`, `draft`, `chatContainer`
Emits: `send`, `update:draft`

---

## Task 7: Refactor PlayerPage.vue — Lesson Navigator

**Files:**

- Create: `src/components/PlayerLessonNavigator.vue`
- Modify: `src/pages/PlayerPage.vue`

Extract lesson list (ul/li) used in split, stacked, and focus variants.
Props: `lecciones`, `currentLeccionId`, `completedCount`, `progressFraction`, `progressPct`, `variant`
Emits: `select`

---

## Task 8: Update services to use error classes

**Files:**

- Modify: `src/services/cursos.js`
- Modify: `src/services/videos.js`
- Modify: `src/services/progreso.js`

Wrap `supabase` calls with `mapSupabaseError` in catch blocks. Example:

```javascript
import { mapSupabaseError } from '@/lib/errors.js'

export async function fetchCursos() {
  const { data, error } = await supabase.from('cursos').select('*')
  if (error) throw mapSupabaseError(error)
  return data
}
```

---

## Task 9: E2E smoke test after refactor

**Command:** `npm run build`
**Expected:** No errores de build, no regresiones.

**Command:** `npm run test:unit`
**Expected:** Todos los tests existentes + nuevos pasan.

---

## Verification

- `AdminPage.vue` < 300 líneas
- `PlayerPage.vue` < 300 líneas
- `npm run build` exitoso
- `npm run test:unit` exitoso
