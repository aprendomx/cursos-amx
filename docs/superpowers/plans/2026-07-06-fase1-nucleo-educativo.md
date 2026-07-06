# Fase 1: Núcleo Educativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el núcleo educativo que permite a Cursos AMX manejar evaluaciones avanzadas, calificación con rúbricas, importación masiva de usuarios y cohortes.

**Architecture:** Extender el sistema de evaluaciones existente (3 tipos de pregunta) a 5+ tipos con un motor de calificación server-side. Agregar tablas de rúbricas vinculadas a entregas. Implementar upload CSV con preview para usuarios. Crear sistema de cohortes que agrupa alumnos por curso con foros separados.

**Tech Stack:** Vue 3 + Vite + Supabase + TypeScript (progresivo)

---

## Task 1: Extender tipos de pregunta (emparejamiento + rellenar huecos + ensayo)

**Files:**
- Modify: `supabase/migrations/029_evaluaciones.sql` — extender tipo enum o usar string libre
- Modify: `src/components/EvaluacionEditor.vue` — UI para nuevos tipos
- Modify: `src/services/evaluaciones.js` — guardar/cargar nuevos tipos
- Modify: `src/components/EvaluacionPanel.vue` — renderizar nuevos tipos al alumno
- Modify: `supabase/migrations/029_evaluaciones.sql` — RPC `calificar_evaluacion` actualizada
- Test: `src/services/__tests__/evaluaciones.test.js`

**Nuevos tipos:**
- `emparejamiento`: pares izquierda/derecha, el alumno arrastra/selectiona matches
- `rellenar_huecos`: enunciado con `____` placeholders, respuesta como array de strings
- `ensayo`: respuesta libre de texto, calificación manual por instructor

---

## Task 2: Sistema de rúbricas

**Files:**
- Create: `supabase/migrations/033_rubricas.sql`
- Create: `src/components/RubricaEditor.vue`
- Create: `src/components/RubricaCalificador.vue`
- Create: `src/services/rubricas.js`
- Modify: `src/components/EvaluacionPanel.vue` / entregas para mostrar rúbrica

**Tablas:**
- `rubricas` (id, nombre, criterios_json)
- `rubrica_criterios` (id, rubrica_id, nombre, descripcion, niveles_json, puntos_max)
- `calificaciones_rubrica` (id, entrega_id/intento_id, calificador_id, puntos_json, total, feedback)

---

## Task 3: Importación masiva de usuarios (CSV)

**Files:**
- Create: `src/components/AdminBulkImport.vue`
- Create: `src/composables/useCsvImport.js`
- Create: `src/services/bulkImport.js`
- Modify: `src/components/AdminUserManager.vue` — agregar botón de importación

**Funcionalidad:**
- Upload CSV con columnas: nombre, apellido_paterno, apellido_materno, email, dependencia, cargo, rol
- Preview de las primeras 10 filas con validación (email duplicado, formato inválido)
- Confirmación antes de insertar
- Invitación por email vía Supabase Auth invite
- Reporte de éxito/errores por fila

---

## Task 4: Cohortes (grupos por curso)

**Files:**
- Create: `supabase/migrations/034_cohortes.sql`
- Create: `src/components/AdminCohortManager.vue`
- Create: `src/services/cohortes.js`
- Modify: `src/components/ForosPanel.vue` — filtrar por cohorte
- Modify: `src/pages/CursoDetalle.vue` — mostrar selector de cohorte

**Tablas:**
- `cohortes` (id, curso_id, nombre, fecha_inicio, fecha_fin, cupo_max, instructor_id)
- `inscripciones` — agregar columna `cohorte_id`
- `foros` — agregar columna `cohorte_id` (null = foro global)

---

## Task 5: Feature flags y i18n

**Files:**
- Modify: `src/locales/es.json` y `en.json`
- Modify: `supabase/migrations/030_feature_flags.sql` — insertar flags nuevos

**Flags:**
- `advanced_quizzes`
- `rubrics`
- `bulk_user_import`
- `cohorts`

---

## Verification

- `npm run build` exitoso
- `npm run test:unit` — todos los tests pasan
- `npm run lint` — 0 problems
- Feature flags funcionan en runtime
