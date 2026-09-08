# Plan de trabajo — Diagnóstico FODA Cursos AMX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar las mejoras accionables del diagnóstico FODA (2026-08-28): higiene del repo, corrección documental, reducción de complejidad en hotspots, subida de cobertura y saneamiento de capas.

**Architecture:** Trabajo en 4 sprints sobre ramas `fix/`, `refactor/`, `test/` desde `main`. Cada sprint deja el repo verde (lint + type-check + tests). Los sprints 0–1 son tareas atómicas ejecutables ya; los sprints 2–3 son épicas que requieren su propio plan detallado al arrancar (scope check: subsistemas independientes).

**Tech Stack:** Vue 3, Vite 6, Vitest, vue-tsc, ESLint 9, Supabase (Deno Edge Functions), Playwright.

**Restricciones del diagnóstico que NO están en este plan** (fuera del alcance de un agente de código): bus factor / co-maintainers (D1/A5), difusión open source (O2), estrategia de nicho (O1). Son decisiones del maintainer.

**Verificado antes de planear (2026-08-28):**

- `cargarFavoritos`, `cargarProgramados`, `crearUrlVtt`, `editCurso` **SÍ se usan** (falsos positivos del grafo: las llamadas van por destructuring de composables). La auditoría de código muerto es de _verificación_, no de borrado masivo.
- La violación de capas `services → composables` son **3 archivos** que importan `cache.js`: `courseBuilder.js`, `cursos.js`, `progreso.js`.
- Drift README confirmado: línea 82 ("Novedades v0.18.0" con package.json en v0.21.0) y línea 515 ("migraciones 001–056", real: 001–007 consolidadas desde 076).
- `docs/propuesta/` (392K, runtime Vue compilado) y `docs/propuesta.zip` (44K, sin trackear) no están en `.gitignore`.

---

## Sprint 0 — Higiene del repo (bajo riesgo, mismo día)

### Task 0.1: Ignorar artefactos de propuesta

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Añadir entradas al final de `.gitignore`**

```gitignore
# Artefactos de propuesta comercial (no son código del producto)
docs/propuesta/
docs/propuesta.zip
```

- [ ] **Step 2: Verificar**

Run: `git check-ignore docs/propuesta.zip docs/propuesta/support.js`
Expected: ambas rutas impresas (ignoradas)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignorar artefactos de propuesta comercial"
```

### Task 0.2: Corregir drift del README

**Files:**

- Modify: `README.md:515` (estructura del repo)
- Modify: `README.md:82-99` (sección Novedades)

- [ ] **Step 1: Corregir línea de migraciones**

Reemplazar `Esquema versionado en SQL (001–056)` por `Esquema versionado en SQL (001–007; 001_base.sql consolida las antiguas 001–076)`.

- [ ] **Step 2: Recortar Novedades**

Dejar en README solo la novedad de la versión actual (v0.21.0, a redactar desde `CHANGELOG.md` sección `[Sin publicar]`) y mover v0.18.0 y anteriores al CHANGELOG si no están ya. Verificar con `grep -n 'v0.18.0' CHANGELOG.md` antes de borrar nada.

- [ ] **Step 3: Verificar**

Run: `npm run lint && grep -c 'Novedades v0' README.md`
Expected: lint verde; conteo ≤ 2

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: sincronizar README con v0.21 y migraciones consolidadas"
```

### Task 0.3: Auditoría verificada de código muerto

**Files:**

- Ninguno a priori (la auditoría decide)

- [ ] **Step 1: Listar candidatas grado-0 del grafo excluyendo tests y entry points**

Run (MCP): `search_graph(max_degree=0, exclude_entry_points=true, label="Function", limit=200)` y paginar con `offset` mientras `has_more`.

- [ ] **Step 2: Verificar cada candidata con grep real antes de tocar nada**

Para cada nombre: `grep -rn '<nombre>' src --include='*.vue' --include='*.js' --include='*.ts' | grep -v __tests__`. Regla: solo se borra si el único resultado es la propia definición. (Lección aprendida: el grafo no sigue destructuring de composables; `cargarFavoritos` parecía muerta y la usa `AdminReportes.vue`.)

- [ ] **Step 3: Borrar lo confirmado muerto, un commit por archivo**

```bash
npm run test:unit && npm run lint && npm run type-check
git commit -m "chore: eliminar <función> sin referencias"
```

Expected: suite completa verde tras cada borrado.

---

## Sprint 1 — Capas y tipos (bajo riesgo, 1–2 días)

### Task 1.1: Mover `cache` de composables a lib (rompe D5)

**Files:**

- Move: `src/composables/cache.ts` → `src/lib/cache.ts`
- Modify: `src/services/courseBuilder.js:2`, `src/services/cursos.js:2`, `src/services/progreso.js:3`
- Modify: todos los importadores en composables/components (encontrar con grep)

- [ ] **Step 1: Localizar todos los importadores**

Run: `grep -rln "composables/cache" src | grep -v __tests__`
Expected: lista completa de archivos a actualizar

- [ ] **Step 2: Mover el archivo y actualizar imports**

`git mv src/composables/cache.ts src/lib/cache.ts` y en cada importador cambiar `@/composables/cache.js` → `@/lib/cache.js`. Si `cache.ts` usa APIs de Vue (ref/reactive), extraer solo lo no-Vue a lib y dejar el wrapper en composables — verificar leyendo el archivo primero.

- [ ] **Step 3: Verificar capas y suite**

Run: `grep -rn 'from.*composables' src/services/*.js src/services/*.ts | grep -v __tests__` → Expected: vacío
Run: `npm run test:unit && npm run type-check && npm run lint` → Expected: verde

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: mover cache a lib; services ya no importan de composables"
```

### Task 1.2: Tipar `src/services` restantes (D4, parcial)

**Files:**

- Modify: los `src/services/*.js` aún no migrados (lista en `docs/migracion-typescript.md`)

- [ ] **Step 1: Leer `docs/migracion-typescript.md` y tomar el siguiente servicio de la cola** (uno por PR, siguiendo el patrón ya usado en `tiempo`/`analytics`/`instructores`: interfaces de dominio + genéricos `sbSelect<T>` de `lib/sbRest`).
- [ ] **Step 2: `npm run type-check` verde sin `any` nuevos; `npm run test:unit` verde.**
- [ ] **Step 3: Commit `refactor(ts): migrar services/<x> a TypeScript`.**

---

## Sprint 2 — Hotspot `useCursoPersistence` (D2, riesgo medio, 3–5 días)

> Épica. Requiere plan detallado propio al arrancar (patrón del refactor previo de `AdminCourseEditor` 1507→487 líneas). Criterios de entrada: Sprint 0 y 1 mergeados.

**Files:**

- Modify: `src/composables/useCursoPersistence.js` (cognitiva 121, 304 líneas) y `publishCurso` (cognitiva 90, 193 líneas)
- Test: `src/composables/__tests__/useCursoPersistence.test.js` (crear/ampliar)

- [ ] **Step 1: Tests de caracterización primero (TDD inverso).** Escribir tests que fijen el comportamiento actual de `publishCurso` y `loadCurso`: guardado por paso, validaciones, manejo de errores de red, estados dirty/saving. Mínimo 15 tests antes de tocar implementación.
- [ ] **Step 2: Extraer unidades puras** a `src/lib/cursoPersistence/`: validación por paso, serialización del payload, diff de cambios. Funciones puras, sin Vue — testeables en aislamiento.
- [ ] **Step 3: Recomponer el composable** como orquestador de las unidades extraídas. Objetivo medible: complejidad cognitiva de `useCursoPersistence` < 40 y de `publishCurso` < 30 (verificar re-indexando el grafo: `query_graph` con `f.cognitive`).
- [ ] **Step 4: Suite verde + commit por extracción** (`refactor(editor): extraer <unidad> de useCursoPersistence`).

## Sprint 3 — Cobertura de components (D3, continuo)

> Épica de fondo. Mecanismo ya existente: el trinquete de `vite.config.js` (statements 39 / branches 31 / functions 35).

- [ ] **Step 1: Medir baseline:** `npm run test:unit:cov` y anotar % de `src/components` (hoy 34.8%).
- [ ] **Step 2: Priorizar por riesgo:** componentes de admin sin tests (`Admin*.vue` con lógica de guardado) antes que componentes de presentación.
- [ ] **Step 3: Subir el trinquete** en `vite.config.js` cada vez que una tanda mueva el número (política ya documentada en el comentario del config). Meta del sprint: components ≥ 45%.
- [ ] **Step 4 (opcional, esfuerzo alto):** E2E con backend real en CI — levantar `docker compose` de Supabase como service container en el job `test-e2e` para que `critical-flow.spec.js` deje de saltarse. Evaluar coste de minutos de CI antes de comprometerlo.

---

## Self-Review

**1. Cobertura del diagnóstico:**

- Corto plazo 1 (propuesta) → Task 0.1 ✅
- Corto plazo 2 (README) → Task 0.2 ✅
- Corto plazo 3 (código muerto) → Task 0.3 ✅ (corregido: verificación, no borrado ciego)
- Mediano 4 (useCursoPersistence) → Sprint 2 ✅
- Mediano 5 (cobertura) → Sprint 3 ✅
- Mediano 6 (capas) → Task 1.1 ✅ (acotado a 3 archivos reales)
- Mediano 7 (TS) → Task 1.2 ✅
- Estratégico 8 (bus factor), 9 (E2E backend), 10 (instalación mínima) → 8 fuera de alcance (declarado arriba); 9 queda como Step opcional en Sprint 3; 10 es documentación de despliegue, candidata a plan propio.

**2. Placeholders:** Tasks 1.2, Sprint 2 y 3 son épicas con criterios de entrada y métricas objetivo, no pasos atómicos — decisión deliberada de scope (cada una merece su plan detallado con código completo al ejecutarse, siguiendo el scope check de la skill).

**3. Consistencia:** rutas verificadas contra el repo (`src/composables/cache.ts`, `docs/migracion-typescript.md`, `vite.config.js` trinquete, umbrales 39/31/35 confirmados).

---

## Registro de ejecución — Sprint 0 (rama `chore/sprint-0-higiene`, 2026-08-28)

**Desviaciones y hallazgos:**

1. **Task 0.1:** `docs/propuesta/` SÍ estaba trackeada (5 archivos); se sacó del índice con `git rm -r --cached` además del `.gitignore`. La raíz `docs/propuesta-visual-aprendo.md` sigue trackeada (referenciada por CHANGELOG y migración 002) — las referencias a las maquetas `.dc.html` dentro de ella quedan colgadas para clones frescos (trade-off aceptado).
2. **Task 0.2:** el plan pedía dejar la novedad de v0.21.0 en el README; el implementador dejó solo punteros (CHANGELOG + nuevo `docs/NOVEDADES.md`). Se acepta como solución superior: cualquier versión fija en el README reintroduce el drift que se elimina. Pendiente menor: NOVEDADES.md no enlaza de vuelta a CHANGELOG para v0.19+.
3. **Task 3 (auditoría):** 33 de 38 candidatas resultaron VIVAS (falsos positivos del grafo confirmados: dispatch maps, callbacks tus, destructuring). Eliminadas 7 funciones/módulos reales: `reportMessage`, `useErrorReporter` (módulo completo), `onOffline`, `useData.js` (147 líneas), `listPending`, wrapper `useCourseReorder()`, y los exports muertos de `network-status.ts` (133→15 líneas). Hallazgo: la detección de red estaba inerte desde su creación (nunca se cableó `initNetworkStatus`); se documentó en el propio archivo (commit 0ef1c13) y es candidata a issue de seguimiento.
