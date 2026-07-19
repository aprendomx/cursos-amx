# Activar `strict: true` en TypeScript — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar de `strict: false` a `strict: true` en `tsconfig.json`, arreglando los únicos 2 archivos que generan errores (50 errores totales: 44 en `usePlayerPage.ts`, 6 en `useCourseEditorModel.ts`).

**Architecture:** Enfoque mínimo e invasivo — solo tipar lo que `vue-tsc` exige bajo `strict`. No refactorizar lógica ni extraer composables; solo añadir anotaciones de tipo, early returns para null checks, y alinear la interfaz `PlayerLesson` con `Leccion`. Los cambios deben ser 100% compatibles con consumidores JS existentes.

**Tech Stack:** Vue 3, Vite 6, TypeScript 6, `vue-tsc --noEmit`, Vitest.

---

## File Structure

Archivos a modificar (4):

- `src/types/database.ts` — Permitir `null` en campos opcionales que la BD almacena como NULL (`video_id`, `documento_path`, `documento_tipo`)
- `src/composables/usePlayerPage.ts` — Tipar refs sin tipo (`videoEl`, `comentarios`, `instructorIds`), variables implícitas (`playInterval`, `saveTimer`, `pollComentarios`, `comentariosAbort`), parámetros de funciones, catch handlers, y `LECCION_CARGANDO`
- `src/composables/useCourseEditorModel.ts` — Early return null-check en funciones de estructura
- `tsconfig.json` — `"strict": true`

---

## Task 1: Alinear `database.ts` con NULLs reales de BD

**Files:**

- Modify: `src/types/database.ts`

**Rationale:** `Leccion.video_id` en la BD es `uuid` (nullable), así que el tipo debe ser `string | null | undefined`, no solo `string | undefined`. `PlayerLesson` lo declara como `string | null`, lo cual es asignable a `string | null | undefined` pero no a `string | undefined`.

- [ ] **Step 1: Editar `database.ts`**

Reemplazar las líneas 61-63:

```typescript
  video_id?: string
  documento_path?: string
  documento_tipo?: string
```

Por:

```typescript
  video_id?: string | null
  documento_path?: string | null
  documento_tipo?: string | null
```

- [ ] **Step 2: Verificar que no rompe compilación actual**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vue-tsc --noEmit`
Expected: 0 errores (estado actual sin `strict`)

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "types: permitir null en video_id, documento_path, documento_tipo de Leccion"
```

---

## Task 2: Tipar `usePlayerPage.ts`

**Files:**

- Modify: `src/composables/usePlayerPage.ts`

**Rationale:** El composable tiene 44 errores bajo `strict`, todos de categorías predecibles:

1. `ref()` sin tipo genérico → `never[]`, `null`, `Set<unknown>`
2. `let x = null` sin tipo → `any`
3. Parámetros de funciones sin anotación → `implicitly has 'any' type`
4. `catch (e)` donde `e` se usa como `Error` → `Property 'name' does not exist on type '{}'`
5. `LECCION_CARGANDO as PlayerLesson` no satisface todos los campos obligatorios

- [ ] **Step 2.1: Tipar refs y variables**

Reemplazar en las líneas 57-70:

```typescript
const comentarios = ref([])
const instructorIds = ref(new Set())
```

Por:

```typescript
type ComentarioItem = {
  id: number
  user: string
  dep: string
  t: string
  texto: string
  own?: boolean
  esInstructor?: boolean
  destacado?: boolean
}

const comentarios = ref<ComentarioItem[]>([])
const instructorIds = ref(new Set<string>())
```

Reemplazar la línea 67:

```typescript
const videoEl = ref(null)
```

Por:

```typescript
const videoEl = ref<HTMLVideoElement | null>(null)
```

Reemplazar la línea 172:

```typescript
let playInterval = null
```

Por:

```typescript
let playInterval: ReturnType<typeof setInterval> | null = null
```

Reemplazar la línea 249:

```typescript
let saveTimer = null
```

Por:

```typescript
let saveTimer: ReturnType<typeof setTimeout> | null = null
```

Reemplazar las líneas 421-422:

```typescript
let pollComentarios = null
let comentariosAbort = null
```

Por:

```typescript
let pollComentarios: ReturnType<typeof setInterval> | null = null
let comentariosAbort: AbortController | null = null
```

- [ ] **Step 2.2: Tipar parámetros de funciones**

Reemplazar la línea 133:

```typescript
  function fmtTime(s) {
```

Por:

```typescript
  function fmtTime(s: number) {
```

Reemplazar la línea 139:

```typescript
  function extractYoutubeId(url) {
```

Por:

```typescript
  function extractYoutubeId(url: string) {
```

Reemplazar la línea 167:

```typescript
  function setVariant(v) {
```

Por:

```typescript
  function setVariant(v: string) {
```

Reemplazar la línea 219:

```typescript
  async function loadHlsForVideo(videoId) {
```

Por:

```typescript
  async function loadHlsForVideo(videoId: string) {
```

Reemplazar la línea 250:

```typescript
  function scheduleSave(leccionId, segundos) {
```

Por:

```typescript
  function scheduleSave(leccionId: string, segundos: number) {
```

Reemplazar la línea 256:

```typescript
  function flushSave(leccionId, segundos) {
```

Por:

```typescript
  function flushSave(leccionId: string, segundos: number) {
```

Reemplazar la línea 366:

```typescript
  function handleSeek(ratio) {
```

Por:

```typescript
  function handleSeek(ratio: number) {
```

Reemplazar la línea 385:

```typescript
  function selectLesson(id) {
```

Por:

```typescript
  function selectLesson(id: string) {
```

Reemplazar la línea 398:

```typescript
  function seekProgress(e) {
```

Por:

```typescript
  function seekProgress(e: MouseEvent) {
```

Reemplazar la línea 424:

```typescript
  async function loadComentarios(leccionId, token) {
```

Por:

```typescript
  async function loadComentarios(leccionId: string, token?: string) {
```

- [ ] **Step 2.3: Tipar callbacks de watch y catch handlers**

Reemplazar la línea 212:

```typescript
  watch(playing, (v) => {
```

Por:

```typescript
  watch(playing, (v: boolean) => {
```

Reemplazar la línea 301:

```typescript
    (newId, oldId) => {
```

Por:

```typescript
    (newId: string | undefined, oldId: string | undefined) => {
```

Reemplazar la línea 551:

```typescript
  watch(currentLeccion, async (id) => {
```

Por:

```typescript
  watch(currentLeccion, async (id: string) => {
```

Reemplazar la línea 201 (catch de `video.play()`):

```typescript
p.catch((err) => console.error('[player] video.play() rejected:', err))
```

Por:

```typescript
p.catch((err: unknown) => console.error('[player] video.play() rejected:', err))
```

Reemplazar la línea 244 (callback de useHlsPlayer):

```typescript
  useHlsPlayer(videoEl, hlsMasterUrl, (err) => {
```

Por:

```typescript
  useHlsPlayer(videoEl, hlsMasterUrl, (err: { type: string } | null) => {
```

Reemplazar la línea 446 (catch de loadComentarios):

```typescript
    } catch (e) {
      if (e?.name === 'AbortError') return
      if (e instanceof TypeError && e.message === 'Failed to fetch') return
```

Por:

```typescript
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      if (e instanceof TypeError && e.message === 'Failed to fetch') return
```

- [ ] **Step 2.4: Arreglar `LECCION_CARGANDO`**

Reemplazar las líneas 80-86:

```typescript
const LECCION_CARGANDO = {
  id: '',
  titulo: 'Cargando...',
  orden: 1,
  duracion_seg: 735,
  tipo: 'video',
} as PlayerLesson
```

Por:

```typescript
const LECCION_CARGANDO: PlayerLesson = {
  id: '',
  modulo_id: '',
  orden: 1,
  titulo: 'Cargando...',
  tipo_material: 'video',
  duracion: '12:15',
  duracion_seg: 735,
  youtube_url: '',
  video_id: null,
  documento_path: null,
  documento_tipo: null,
  contenido: null,
  tipo: 'video',
  completado: false,
  modulo_titulo: '',
  modulo_orden: 1,
  requiere_entrega: false,
  entrega_tipos: null,
  entrega_max_mb: 10,
}
```

- [ ] **Step 2.5: Verificar errores restantes con strict**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vue-tsc --noEmit --strict 2>&1 | grep usePlayerPage.ts | wc -l`
Expected: 0 (o solo errores de `useCourseEditorModel.ts`)

- [ ] **Step 2.6: Commit**

```bash
git add src/composables/usePlayerPage.ts src/types/database.ts
git commit -m "types: tipar strict usePlayerPage.ts y alinear PlayerLesson con Leccion"
```

---

## Task 3: Null-checks en `useCourseEditorModel.ts`

**Files:**

- Modify: `src/composables/useCourseEditorModel.ts`

**Rationale:** Las funciones de estructura (`addModule`, `removeModule`, `moveModule`, `addLesson`, `removeLesson`) acceden a `editingCurso.value.modulos` sin verificar que `editingCurso.value` no sea `null`. Bajo `strictNullChecks`, TS lo marca como error.

- [ ] **Step 3.1: Early returns en funciones de estructura**

Reemplazar la línea 164:

```typescript
function addModule() {
  const c = editingCurso.value
  const idx = c.modulos.length + 1
  c.modulos.push(createBlankModulo(`m-${idx}`, { requierePrevio: true, leccionId: `l-${idx}-1` }))
}
```

Por:

```typescript
function addModule() {
  const c = editingCurso.value
  if (!c) return
  const idx = c.modulos.length + 1
  c.modulos.push(createBlankModulo(`m-${idx}`, { requierePrevio: true, leccionId: `l-${idx}-1` }))
}
```

Reemplazar la línea 170:

```typescript
function removeModule(mi: number) {
  editingCurso.value.modulos.splice(mi, 1)
}
```

Por:

```typescript
function removeModule(mi: number) {
  const c = editingCurso.value
  if (!c) return
  c.modulos.splice(mi, 1)
}
```

Reemplazar la línea 174:

```typescript
  function moveModule(mi: number, dir: number) {
    const mods = editingCurso.value.modulos
```

Por:

```typescript
  function moveModule(mi: number, dir: number) {
    const c = editingCurso.value
    if (!c) return
    const mods = c.modulos
```

Reemplazar la línea 183:

```typescript
  function addLesson(mi: number) {
    const mod = editingCurso.value.modulos[mi]
```

Por:

```typescript
  function addLesson(mi: number) {
    const c = editingCurso.value
    if (!c) return
    const mod = c.modulos[mi]
```

Reemplazar la línea 189:

```typescript
function removeLesson(mi: number, li: number) {
  editingCurso.value.modulos[mi].lecciones.splice(li, 1)
}
```

Por:

```typescript
function removeLesson(mi: number, li: number) {
  const c = editingCurso.value
  if (!c) return
  c.modulos[mi].lecciones.splice(li, 1)
}
```

- [ ] **Step 3.2: Verificar errores restantes**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vue-tsc --noEmit --strict 2>&1 | grep useCourseEditorModel.ts | wc -l`
Expected: 0

- [ ] **Step 3.3: Commit**

```bash
git add src/composables/useCourseEditorModel.ts
git commit -m "types: null-checks strict en useCourseEditorModel.ts"
```

---

## Task 4: Activar `strict: true`

**Files:**

- Modify: `tsconfig.json`

- [ ] **Step 4.1: Cambiar strict**

Reemplazar la línea 12 de `tsconfig.json`:

```json
    "strict": false,
```

Por:

```json
    "strict": true,
```

- [ ] **Step 4.2: Verificar compilación**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vue-tsc --noEmit`
Expected: 0 errores, 0 warnings

- [ ] **Step 4.3: Commit**

```bash
git add tsconfig.json
git commit -m "types: activar strict: true en tsconfig.json"
```

---

## Task 5: Verificación de regresión

**Files:** Ninguno nuevo.

- [ ] **Step 5.1: Tests unitarios**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run test:unit`
Expected: Todos los tests pasan (426+).

- [ ] **Step 5.2: Build de producción**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run build`
Expected: Build exitoso sin errores.

- [ ] **Step 5.3: Lint**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run lint`
Expected: Sin errores de ESLint.

- [ ] **Step 5.4: Edge Function tests (sanity)**

Run: `cd /Users/jadrians/aprendo/cursos-amx && deno test --allow-all --node-modules-dir=none supabase/functions/_shared/auth.test.ts`
Expected: PASS.

- [ ] **Step 5.5: Commit final**

```bash
git commit --allow-empty -m "chore: verificación post-strict exitosa"
```

---

## Self-Review

**Spec coverage:** Todos los errores detectados por `vue-tsc --strict` están cubiertos:

- `database.ts` (3 campos) → Task 1
- `usePlayerPage.ts` (44 errores: refs, vars, params, catch, LECCION_CARGANDO) → Task 2
- `useCourseEditorModel.ts` (6 errores: null checks) → Task 3
- `tsconfig.json` → Task 4
- Verificación → Task 5

**Placeholder scan:** Sin TBD, TODO, ni "implement later". Cada step tiene el código exacto.

**Type consistency:**

- `video_id` ahora es `string | null | undefined` en toda la jerarquía
- `PlayerLesson` extiende `Leccion` sin incompatibilidades
- `ComentarioItem` usa los mismos nombres de propiedades que el consumidor (`user`, `dep`, `t`, `texto`, `esInstructor`, `destacado`, `own`)
- `videoEl` es `Ref<HTMLVideoElement | null>`, compatible con `useHlsPlayer` que espera `Ref<HTMLVideoElement | null>`

**No se rompe JS:** Todos los cambios son anotaciones de tipo o early returns seguros. Los consumidores JS no ven diferencia en runtime.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-16-strict-typescript.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach do you prefer?**
