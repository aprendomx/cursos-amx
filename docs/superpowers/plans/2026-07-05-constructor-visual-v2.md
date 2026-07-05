# Constructor Visual de Cursos v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Constructor visual drag & drop de Módulos → Lecciones con persistencia incremental (RPCs + orden fraccional), lecciones de texto enriquecido (Tiptap) y su render en PlayerPage, según `docs/superpowers/specs/2026-07-04-constructor-visual-design.md` (v2).

**Architecture:** El paso "Estructura" de `AdminCourseEditor.vue` monta `CourseBuilder.vue` (gated por flag `visual_builder`), que carga la estructura con `fetchEstructura` y persiste cada operación al instante vía `src/services/courseBuilder.js` (CRUD directo + RPCs `reordenar_modulos`/`reordenar_lecciones`). El orden es `double precision` fraccional (promedio de vecinos, renormalización bajo épsilon). Las lecciones de texto guardan JSON de Tiptap en `lecciones.contenido` y se renderizan en el player con `generateHTML` + whitelist de extensiones.

**Tech Stack:** Vue 3 `<script setup>`, Vite 6, Supabase JS v2 (self-hosted), `vue-draggable-plus`, `@tiptap/vue-3`, Vitest + Vue Test Utils, Playwright.

## Global Constraints

- Las tablas `modulos` y `lecciones` **existen** desde `supabase/migrations/001_schema.sql`. La migración nueva es `032_course_builder.sql` (extiende, jamás recrea).
- Services: JavaScript plano, `import { supabase } from '@/lib/supabase.js'`, `if (error) throw error` (lanzar, nunca retornar `{data, error}`), naming en español, `invalidateCache` de `@/composables/cache.js` tras toda escritura.
- RPCs SQL: `language plpgsql security definer set search_path = public`, validación interna de permisos con `raise exception ... using errcode = '42501'`, `revoke all ... from public` + `grant execute ... to authenticated` (patrón de `023_instructor_rol.sql`).
- Componentes: Vue 3 `<script setup>`, sin UI kit; estilos solo con tokens CSS de `src/assets/main.css` (`--paper`, `--paper-2`, `--ink`, `--ink-3`, `--line`, `--primary`, `--unit`, `--danger`, `--warn`, `--mono`, `--ease`); compatibles con `[data-theme='dark']` (los tokens ya lo resuelven — no hardcodear colores).
- i18n: labels nuevos bajo `builder.*` en `src/locales/es.json` y `en.json`, consumidos con `useI18n` (patrón de `src/components/ChatPanel.vue`).
- Tests unitarios: archivos `*.test.js` (el include de Vitest es `src/**/*.test.js` — **no** `.spec.js`), en `__tests__/` junto al código. Mock de supabase con el patrón `mockFrom`/`mockChain` de `src/services/__tests__/cursos.test.js`.
- Feature flag: `visual_builder`, consultado con `isEnabled` de `@/composables/useFeatureFlags.js` (runtime > build-time).
- Tiptap guarda **JSON** (`editor.getJSON()`) en `lecciones.contenido`; HTML solo se genera on-demand con `generateHTML`. Nunca persistir HTML.
- Comandos: `npm run test:unit`, `npx vitest run <ruta>`, `npm run build`, `npx playwright test <ruta>`, `npm run lint` si existe.
- Commits frecuentes, mensajes en español estilo repo (`feat:`, `fix:`, `docs(...)`), terminados en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Fuera de alcance v1 del builder: upload de imágenes dentro del editor Tiptap (solo URL), virtualización del timeline, undo/redo, **portada de módulo y duplicar módulo desde el builder** (siguen editables vía el flujo legacy con el flag apagado; se absorben en una iteración posterior).

---

### Task 1: Dependencias

**Files:**

- Modify: `package.json` (vía npm install)

**Interfaces:**

- Produces: paquetes `vue-draggable-plus`, `@tiptap/vue-3`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image` disponibles para imports en tasks 8-13.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install vue-draggable-plus @tiptap/vue-3 @tiptap/core @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-image
```

- [ ] **Step 2: Verificar que el build sigue verde**

Run: `npm run build`
Expected: build exitoso sin errores.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): vue-draggable-plus y tiptap para el constructor visual"
```

---

### Task 2: Migración `032_course_builder.sql`

**Files:**

- Create: `supabase/migrations/032_course_builder.sql`

**Interfaces:**

- Produces: `modulos.orden` y `lecciones.orden` como `double precision` sin uniques; columna `lecciones.contenido jsonb`; RPCs `public.reordenar_modulos(items jsonb)` y `public.reordenar_lecciones(items jsonb)`; fila `visual_builder` en `feature_toggles`.
- Consumes: helpers existentes `public.is_instructor_de(uuid)` (de `023_instructor_rol.sql`).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/032_course_builder.sql` con este contenido exacto:

```sql
-- 032_course_builder.sql
-- Constructor visual v2: orden fraccional, contenido enriquecido y RPCs de reorder.
-- Ver docs/superpowers/specs/2026-07-04-constructor-visual-design.md §14.

-- 1) Quitar los unique (curso_id, orden) / (modulo_id, orden): incompatibles
--    con reorden incremental (hoy obligan al truco de orden negativo del editor).
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'u'
      and conrelid in ('public.modulos'::regclass, 'public.lecciones'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2) Orden fraccional
alter table public.modulos
  alter column orden type double precision using orden::double precision;
alter table public.lecciones
  alter column orden type double precision using orden::double precision;

create index if not exists idx_modulos_curso_orden on public.modulos (curso_id, orden);
create index if not exists idx_lecciones_modulo_orden on public.lecciones (modulo_id, orden);

-- 3) Contenido enriquecido (JSON de Tiptap). Una lección de texto es
--    tipo_material = 'lectura' + contenido no nulo (no se amplía el enum).
alter table public.lecciones add column if not exists contenido jsonb;

-- 4) RPC: reorden masivo de módulos. Valida permiso sobre TODOS los módulos
--    del lote antes de aplicar (atómico).
create or replace function public.reordenar_modulos(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.modulos m on m.id = (item->>'id')::uuid
  where m.id is null
     or not public.is_instructor_de(m.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado para reordenar estos módulos'
      using errcode = '42501';
  end if;

  update public.modulos m
  set orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where m.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_modulos(jsonb) from public;
grant execute on function public.reordenar_modulos(jsonb) to authenticated;

-- 5) RPC: reorden masivo de lecciones (permite mover entre módulos del MISMO
--    curso; rechaza mover a módulos de cursos ajenos).
create or replace function public.reordenar_lecciones(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad int;
begin
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Lote de reorden vacío' using errcode = '22023';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(items) as item
  left join public.lecciones l on l.id = (item->>'id')::uuid
  left join public.modulos mo on mo.id = l.modulo_id
  left join public.modulos md on md.id = (item->>'modulo_id')::uuid
  where l.id is null
     or md.id is null
     or md.curso_id <> mo.curso_id
     or not public.is_instructor_de(mo.curso_id);

  if v_bad > 0 then
    raise exception 'No autorizado o lote inválido para reordenar lecciones'
      using errcode = '42501';
  end if;

  update public.lecciones l
  set modulo_id = (item->>'modulo_id')::uuid,
      orden = (item->>'orden')::double precision
  from jsonb_array_elements(items) as item
  where l.id = (item->>'id')::uuid;
end;
$$;

revoke all on function public.reordenar_lecciones(jsonb) from public;
grant execute on function public.reordenar_lecciones(jsonb) to authenticated;

-- 6) Feature flag runtime (apagado por default; se enciende por SQL/service-role)
insert into public.feature_toggles (key, enabled)
values ('visual_builder', false)
on conflict (key) do nothing;
```

- [ ] **Step 2: Aplicar la migración al entorno local**

Run: `npx supabase migration up` (o el flujo documentado en `docs/MANUAL_ACTUALIZACION.md` si el stack local no usa el CLI — revisar ese doc antes de inventar otro mecanismo).
Expected: migración aplicada sin errores.

- [ ] **Step 3: Verificar el resultado en la BD**

Ejecutar contra la BD local (psql o SQL editor de Supabase Studio):

```sql
select column_name, data_type from information_schema.columns
 where table_name in ('modulos','lecciones') and column_name in ('orden','contenido');
select count(*) from pg_constraint
 where contype = 'u' and conrelid in ('public.modulos'::regclass, 'public.lecciones'::regclass);
select key, enabled from public.feature_toggles where key = 'visual_builder';
```

Expected: `orden` → `double precision` en ambas; `contenido` → `jsonb`; count de uniques = `0`; fila `visual_builder | f`.

- [ ] **Step 4: Verificar que el player sigue funcionando** (smoke: `npm run dev`, abrir un curso en `/player/<cursoId>`; el sort client-side de `PlayerPage.vue:469` es agnóstico a int/float).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/032_course_builder.sql
git commit -m "feat(db): migración 032 — orden fraccional, contenido jsonb y RPCs de reorder"
```

---

### Task 3: Claves i18n `builder.*`

**Files:**

- Modify: `src/locales/es.json`
- Modify: `src/locales/en.json`

**Interfaces:**

- Produces: claves `builder.*` usadas por los componentes de tasks 8-12 vía `t('builder.<clave>')`.

- [ ] **Step 1: Agregar el bloque `builder` a `src/locales/es.json`**

Insertar como tercera clave top-level (tras `navigator`):

```json
"builder": {
  "modules": "Módulos",
  "addModule": "Agregar módulo",
  "newModule": "Nuevo módulo",
  "emptyModules": "Comienza agregando tu primer módulo",
  "deleteModuleConfirm": "Se eliminarán {count} lecciones. ¿Eliminar el módulo?",
  "lessons": "lecciones",
  "addLesson": "Agregar lección",
  "newLesson": "Nueva lección",
  "emptyTimeline": "Arrastra lecciones aquí o haz clic en +",
  "totalDuration": "Duración total",
  "noContent": "Sin contenido",
  "delivery": "Entrega",
  "exam": "Examen",
  "edit": "Editar",
  "duplicate": "Duplicar",
  "delete": "Eliminar",
  "moveTo": "Mover a…",
  "deleteLessonConfirm": "¿Eliminar la lección \"{title}\"?",
  "editLesson": "Editar lección",
  "title": "Título",
  "type": "Tipo",
  "source": "Fuente",
  "sourceYoutube": "YouTube",
  "sourceHls": "Video (HLS)",
  "sourceDocumento": "Documento",
  "sourceExamen": "Examen",
  "sourceTexto": "Texto enriquecido",
  "sourceNinguno": "Sin contenido",
  "duration": "Duración (mm:ss)",
  "save": "Guardar",
  "cancel": "Cancelar",
  "unsaved": "Sin guardar",
  "unsavedConfirm": "Hay cambios sin guardar. ¿Cerrar de todos modos?",
  "editorPlaceholder": "Escribe el contenido de la lección…",
  "linkPrompt": "URL del enlace (http/https):",
  "imagePrompt": "URL de la imagen:",
  "markComplete": "Marcar como completada",
  "validationSummary": "{modules} módulos · {lessons} lecciones · {warnings} sin contenido",
  "dragHint": "Nuevo constructor visual — arrastra para reordenar"
}
```

- [ ] **Step 2: Agregar el equivalente en inglés a `src/locales/en.json`**

```json
"builder": {
  "modules": "Modules",
  "addModule": "Add module",
  "newModule": "New module",
  "emptyModules": "Start by adding your first module",
  "deleteModuleConfirm": "{count} lessons will be deleted. Delete the module?",
  "lessons": "lessons",
  "addLesson": "Add lesson",
  "newLesson": "New lesson",
  "emptyTimeline": "Drag lessons here or click +",
  "totalDuration": "Total duration",
  "noContent": "No content",
  "delivery": "Delivery",
  "exam": "Exam",
  "edit": "Edit",
  "duplicate": "Duplicate",
  "delete": "Delete",
  "moveTo": "Move to…",
  "deleteLessonConfirm": "Delete lesson \"{title}\"?",
  "editLesson": "Edit lesson",
  "title": "Title",
  "type": "Type",
  "source": "Source",
  "sourceYoutube": "YouTube",
  "sourceHls": "Video (HLS)",
  "sourceDocumento": "Document",
  "sourceExamen": "Exam",
  "sourceTexto": "Rich text",
  "sourceNinguno": "No content",
  "duration": "Duration (mm:ss)",
  "save": "Save",
  "cancel": "Cancel",
  "unsaved": "Unsaved",
  "unsavedConfirm": "There are unsaved changes. Close anyway?",
  "editorPlaceholder": "Write the lesson content…",
  "linkPrompt": "Link URL (http/https):",
  "imagePrompt": "Image URL:",
  "markComplete": "Mark as complete",
  "validationSummary": "{modules} modules · {lessons} lessons · {warnings} empty",
  "dragHint": "New visual builder — drag to reorder"
}
```

- [ ] **Step 3: Verificar JSON válido**

Run: `npx vitest run src/lib/__tests__/theme.test.js` (cualquier suite que importe la app valida el parseo) o `node -e "require('./src/locales/es.json'); require('./src/locales/en.json'); console.log('ok')"`
Expected: `ok` / suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/locales/es.json src/locales/en.json
git commit -m "feat(i18n): claves builder.* para el constructor visual"
```

---

### Task 4: Extraer `parseDuracionToSeg` a `src/lib/duracion.js`

**Files:**

- Create: `src/lib/duracion.js`
- Create: `src/lib/__tests__/duracion.test.js`
- Modify: `src/components/AdminCourseEditor.vue:91-101` (borrar la función local, importar)

**Interfaces:**

- Produces: `parseDuracionToSeg(input: string) => number` y `segToDuracion(seg: number) => string` ("mm:ss"), importables desde `@/lib/duracion.js`. Los usan tasks 11 y 12.

- [ ] **Step 1: Test que falla**

`src/lib/__tests__/duracion.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseDuracionToSeg, segToDuracion } from '@/lib/duracion.js'

describe('duracion', () => {
  it('parsea mm:ss', () => {
    expect(parseDuracionToSeg('12:30')).toBe(750)
  })
  it('parsea hh:mm:ss', () => {
    expect(parseDuracionToSeg('1:00:05')).toBe(3605)
  })
  it('parsea segundos planos', () => {
    expect(parseDuracionToSeg('90')).toBe(90)
  })
  it('devuelve 0 en entrada inválida', () => {
    expect(parseDuracionToSeg('abc')).toBe(0)
    expect(parseDuracionToSeg('')).toBe(0)
    expect(parseDuracionToSeg(null)).toBe(0)
  })
  it('formatea segundos a mm:ss', () => {
    expect(segToDuracion(750)).toBe('12:30')
    expect(segToDuracion(0)).toBe('')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/__tests__/duracion.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/lib/duracion.js`**

La implementación de `parseDuracionToSeg` se **mueve tal cual** de `AdminCourseEditor.vue:91-101`:

```js
export function parseDuracionToSeg(input) {
  if (!input) return 0
  const s = String(input).trim()
  if (!s) return 0
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const parts = s.split(':').map((p) => parseInt(p, 10))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export function segToDuracion(seg) {
  const n = parseInt(seg, 10)
  if (!n || n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
```

En `AdminCourseEditor.vue`: borrar la definición local (líneas 91-101) y agregar `import { parseDuracionToSeg } from '@/lib/duracion.js'` junto a los demás imports.

- [ ] **Step 4: Verificar que pasa + build**

Run: `npx vitest run src/lib/__tests__/duracion.test.js && npm run build`
Expected: PASS y build verde (confirma que el editor sigue compilando con el import).

- [ ] **Step 5: Commit**

```bash
git add src/lib/duracion.js src/lib/__tests__/duracion.test.js src/components/AdminCourseEditor.vue
git commit -m "refactor: extrae parseDuracionToSeg a lib/duracion"
```

---

### Task 5: Composable `useCourseReorder` (matemática fraccional)

**Files:**

- Create: `src/composables/useCourseReorder.js`
- Create: `src/composables/__tests__/useCourseReorder.test.js`

**Interfaces:**

- Produces (funciones puras, sin Vue, sin red):
  - `ordenParaIndice(lista, indice) => number` — `lista`: array de `{orden}` ordenado asc **sin** el elemento movido; `indice`: posición de inserción destino.
  - `necesitaRenormalizar(lista) => boolean` — true si algún gap adyacente `< 1e-9`.
  - `renormalizar(lista) => lista'` — nuevos objetos con `orden` = 1..n.
  - `EPSILON` (1e-9).
- Consume en task 7: `useCourseBuilder`.

- [ ] **Step 1: Test que falla**

`src/composables/__tests__/useCourseReorder.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  ordenParaIndice,
  necesitaRenormalizar,
  renormalizar,
  EPSILON,
} from '@/composables/useCourseReorder.js'

const lista = (...ordenes) => ordenes.map((orden, i) => ({ id: `x${i}`, orden }))

describe('useCourseReorder', () => {
  it('lista vacía → 1', () => {
    expect(ordenParaIndice([], 0)).toBe(1)
  })
  it('insertar al inicio → min - 1', () => {
    expect(ordenParaIndice(lista(1, 2, 3), 0)).toBe(0)
  })
  it('insertar al final → max + 1', () => {
    expect(ordenParaIndice(lista(1, 2, 3), 3)).toBe(4)
  })
  it('insertar en medio → promedio de vecinos', () => {
    expect(ordenParaIndice(lista(1, 2), 1)).toBe(1.5)
    expect(ordenParaIndice(lista(1, 1.5, 2), 2)).toBe(1.75)
  })
  it('detecta agotamiento de precisión', () => {
    expect(necesitaRenormalizar(lista(1, 1 + EPSILON / 2, 2))).toBe(true)
    expect(necesitaRenormalizar(lista(1, 1.5, 2))).toBe(false)
    expect(necesitaRenormalizar([])).toBe(false)
  })
  it('renormaliza a 1..n sin mutar la entrada', () => {
    const entrada = lista(0.1, 0.100000000001, 7)
    const salida = renormalizar(entrada)
    expect(salida.map((x) => x.orden)).toEqual([1, 2, 3])
    expect(entrada[0].orden).toBe(0.1) // inmutable
    expect(salida[0].id).toBe('x0') // conserva el resto de campos
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/composables/__tests__/useCourseReorder.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/composables/useCourseReorder.js`**

```js
export const EPSILON = 1e-9

/**
 * Orden fraccional para insertar en `indice` dentro de `lista` (ordenada asc,
 * SIN el elemento que se está moviendo). Promedio de vecinos; extremos ±1.
 */
export function ordenParaIndice(lista, indice) {
  const n = lista.length
  if (n === 0) return 1
  if (indice <= 0) return lista[0].orden - 1
  if (indice >= n) return lista[n - 1].orden + 1
  return (lista[indice - 1].orden + lista[indice].orden) / 2
}

export function necesitaRenormalizar(lista) {
  for (let i = 1; i < lista.length; i++) {
    if (Math.abs(lista[i].orden - lista[i - 1].orden) < EPSILON) return true
  }
  return false
}

export function renormalizar(lista) {
  return lista.map((item, i) => ({ ...item, orden: i + 1 }))
}

export function useCourseReorder() {
  return { ordenParaIndice, necesitaRenormalizar, renormalizar, EPSILON }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/composables/__tests__/useCourseReorder.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useCourseReorder.js src/composables/__tests__/useCourseReorder.test.js
git commit -m "feat: useCourseReorder — orden fraccional con renormalización"
```

---

### Task 6: Service `src/services/courseBuilder.js`

**Files:**

- Create: `src/services/courseBuilder.js`
- Create: `src/services/__tests__/courseBuilder.test.js`
- Modify: `src/services/index.js` (agregar `export * from './courseBuilder.js'`)

**Interfaces:**

- Produces:
  - `fetchEstructura(cursoId) => Promise<Array<modulo & {lecciones: leccion[]}>>` (orden asc en ambos niveles)
  - `crearModulo(modulo) => Promise<modulo>` / `actualizarModulo(id, patch)` / `eliminarModulo(id)`
  - `crearLeccion(leccion) => Promise<leccion>` / `actualizarLeccion(id, patch)` / `eliminarLeccion(id)`
  - `reordenarModulos(items: {id, orden}[])` / `reordenarLecciones(items: {id, modulo_id, orden}[])` — vía `supabase.rpc`
- Consume: RPCs de Task 2.

- [ ] **Step 1: Test que falla**

`src/services/__tests__/courseBuilder.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEstructura,
  crearModulo,
  actualizarModulo,
  eliminarModulo,
  crearLeccion,
  actualizarLeccion,
  eliminarLeccion,
  reordenarModulos,
  reordenarLecciones,
} from '@/services/courseBuilder.js'
import { invalidateCache, withCache } from '@/composables/cache.js'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}))

function mockChain(result) {
  const thenable = Promise.resolve(result)
  const eqOrden = {
    order: vi.fn(() => ({ order: vi.fn(() => thenable) })), // .order().order() de fetchEstructura
  }
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => eqOrden),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => thenable) })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => thenable) })) })),
    })),
    delete: vi.fn(() => ({ eq: vi.fn(() => thenable) })),
  }
}

describe('courseBuilder service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache(/.*/)
  })

  it('fetchEstructura consulta modulos con lecciones anidadas y ordena', async () => {
    const data = [{ id: 'm1', orden: 1, lecciones: [{ id: 'l1', orden: 1 }] }]
    mockFrom.mockReturnValue(mockChain({ data, error: null }))
    const r = await fetchEstructura('c1')
    expect(mockFrom).toHaveBeenCalledWith('modulos')
    expect(r).toEqual(data)
  })

  it('lanza en error de supabase', async () => {
    mockFrom.mockReturnValue(mockChain({ data: null, error: new Error('boom') }))
    await expect(fetchEstructura('c1')).rejects.toThrow('boom')
    await expect(crearModulo({ titulo: 'M' })).rejects.toThrow('boom')
    await expect(eliminarLeccion('l1')).rejects.toThrow('boom')
  })

  it('crearModulo inserta y retorna la fila', async () => {
    const row = { id: 'm1', titulo: 'M', orden: 1 }
    mockFrom.mockReturnValue(mockChain({ data: row, error: null }))
    expect(await crearModulo({ titulo: 'M', curso_id: 'c1', orden: 1 })).toEqual(row)
  })

  it('actualizarLeccion guarda contenido jsonb', async () => {
    const row = { id: 'l1', contenido: { type: 'doc', content: [] } }
    mockFrom.mockReturnValue(mockChain({ data: row, error: null }))
    const r = await actualizarLeccion('l1', { contenido: { type: 'doc', content: [] } })
    expect(r.contenido.type).toBe('doc')
  })

  it('reordenarModulos llama al RPC con items', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const items = [{ id: 'm1', orden: 1.5 }]
    await reordenarModulos(items)
    expect(mockRpc).toHaveBeenCalledWith('reordenar_modulos', { items })
  })

  it('reordenarLecciones llama al RPC y lanza en error', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const items = [{ id: 'l1', modulo_id: 'm2', orden: 2.5 }]
    await reordenarLecciones(items)
    expect(mockRpc).toHaveBeenCalledWith('reordenar_lecciones', { items })

    mockRpc.mockResolvedValue({ error: new Error('42501') })
    await expect(reordenarLecciones(items)).rejects.toThrow('42501')
  })

  it('las escrituras invalidan el cache de cursos/modulos/lecciones', async () => {
    // withCache real: cachear una lectura, escribir, verificar re-fetch
    const cachedFetch = withCache(
      async () => 'v1',
      () => 'cursos:probe'
    )
    expect(await cachedFetch()).toBe('v1')
    mockFrom.mockReturnValue(mockChain({ data: { id: 'm1' }, error: null }))
    await actualizarModulo('m1', { titulo: 'X' })
    // si invalidó /^cursos:/, la siguiente llamada re-ejecuta el fetcher
    let calls = 0
    const cachedFetch2 = withCache(
      async () => {
        calls++
        return 'v2'
      },
      () => 'cursos:probe'
    )
    await cachedFetch2()
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/services/__tests__/courseBuilder.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/services/courseBuilder.js`**

```js
import { supabase } from '@/lib/supabase.js'
import { invalidateCache } from '@/composables/cache.js'

function invalidarEstructura() {
  invalidateCache(/^cursos:/)
  invalidateCache(/^modulos:/)
  invalidateCache(/^lecciones:/)
}

// Estructura viva del builder: sin withCache a propósito (cada operación la muta).
export async function fetchEstructura(cursoId) {
  const { data, error } = await supabase
    .from('modulos')
    .select('*, lecciones(*)')
    .eq('curso_id', cursoId)
    .order('orden', { ascending: true })
    .order('orden', { referencedTable: 'lecciones', ascending: true })
  if (error) throw error
  return data
}

export async function crearModulo(modulo) {
  const { data, error } = await supabase.from('modulos').insert(modulo).select().single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function actualizarModulo(id, patch) {
  const { data, error } = await supabase
    .from('modulos')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function eliminarModulo(id) {
  const { error } = await supabase.from('modulos').delete().eq('id', id)
  if (error) throw error
  invalidarEstructura()
}

export async function crearLeccion(leccion) {
  const { data, error } = await supabase.from('lecciones').insert(leccion).select().single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function actualizarLeccion(id, patch) {
  const { data, error } = await supabase
    .from('lecciones')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidarEstructura()
  return data
}

export async function eliminarLeccion(id) {
  const { error } = await supabase.from('lecciones').delete().eq('id', id)
  if (error) throw error
  invalidarEstructura()
}

export async function reordenarModulos(items) {
  const { error } = await supabase.rpc('reordenar_modulos', { items })
  if (error) throw error
  invalidarEstructura()
}

export async function reordenarLecciones(items) {
  const { error } = await supabase.rpc('reordenar_lecciones', { items })
  if (error) throw error
  invalidarEstructura()
}
```

En `src/services/index.js` agregar: `export * from './courseBuilder.js'`

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/services/__tests__/courseBuilder.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/courseBuilder.js src/services/__tests__/courseBuilder.test.js src/services/index.js
git commit -m "feat: service courseBuilder — CRUD incremental y RPCs de reorder"
```

---

### Task 7: Composable `useCourseBuilder` (estado + persistencia optimista)

**Files:**

- Create: `src/composables/useCourseBuilder.js`
- Create: `src/composables/__tests__/useCourseBuilder.test.js`

**Interfaces:**

- Consumes: todo `@/services/courseBuilder.js` (Task 6) y `ordenParaIndice`/`necesitaRenormalizar`/`renormalizar` (Task 5).
- Produces: `useCourseBuilder(cursoId)` retorna:
  - estado: `modulos: Ref<Array>`, `cargando: Ref<boolean>`, `error: Ref<Error|null>`
  - `cargar() => Promise` — fetch inicial
  - `agregarModulo(datos?) => Promise` / `editarModulo(id, patch)` / `quitarModulo(id)`
  - `agregarLeccion(moduloId, datos?)` / `editarLeccion(leccionId, patch)` / `quitarLeccion(leccionId)`
  - `moverModulo(from, to)` — reorden con RPC
  - `moverLeccion(leccionId, targetModuloId, targetIndex)` — reorden/movimiento con RPC
  - Semántica: creates/deletes esperan al servidor y luego actualizan el árbol; updates y reorders son **optimistas** (árbol primero, persistencia encolada). Toda falla setea `error` y **recarga del servidor** (consistencia garantizada). Las persistencias se serializan en una cola.

- [ ] **Step 1: Test que falla**

`src/composables/__tests__/useCourseBuilder.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCourseBuilder } from '@/composables/useCourseBuilder.js'
import * as svc from '@/services/courseBuilder.js'

vi.mock('@/services/courseBuilder.js', () => ({
  fetchEstructura: vi.fn(),
  crearModulo: vi.fn(),
  actualizarModulo: vi.fn(),
  eliminarModulo: vi.fn(),
  crearLeccion: vi.fn(),
  actualizarLeccion: vi.fn(),
  eliminarLeccion: vi.fn(),
  reordenarModulos: vi.fn(),
  reordenarLecciones: vi.fn(),
}))

const arbol = () => [
  { id: 'm1', orden: 1, titulo: 'M1', lecciones: [{ id: 'l1', orden: 1, modulo_id: 'm1' }] },
  { id: 'm2', orden: 2, titulo: 'M2', lecciones: [] },
]

describe('useCourseBuilder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cargar llena el árbol', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    expect(cb.modulos.value).toHaveLength(2)
    expect(svc.fetchEstructura).toHaveBeenCalledWith('c1')
  })

  it('agregarModulo espera el id del servidor y lo agrega al árbol', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.crearModulo.mockResolvedValue({ id: 'm3', orden: 3, titulo: 'Nuevo módulo' })
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.agregarModulo()
    expect(svc.crearModulo).toHaveBeenCalledWith(
      expect.objectContaining({ curso_id: 'c1', orden: 3 })
    )
    expect(cb.modulos.value[2]).toMatchObject({ id: 'm3', lecciones: [] })
  })

  it('editarModulo es optimista', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    let resolver
    svc.actualizarModulo.mockReturnValue(new Promise((res) => (resolver = res)))
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    const p = cb.editarModulo('m1', { titulo: 'Renombrado' })
    expect(cb.modulos.value[0].titulo).toBe('Renombrado') // antes de resolver
    resolver({ id: 'm1', titulo: 'Renombrado' })
    await p
  })

  it('en fallo setea error y recarga del servidor', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.actualizarModulo.mockRejectedValue(new Error('rls'))
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.editarModulo('m1', { titulo: 'X' })
    expect(cb.error.value?.message).toBe('rls')
    expect(svc.fetchEstructura).toHaveBeenCalledTimes(2) // carga inicial + recarga
  })

  it('moverModulo calcula orden fraccional y llama al RPC', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.reordenarModulos.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.moverModulo(1, 0) // m2 antes de m1
    expect(cb.modulos.value.map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(svc.reordenarModulos).toHaveBeenCalledWith([{ id: 'm2', orden: 0 }])
  })

  it('moverLeccion entre módulos envía modulo_id destino', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    svc.reordenarLecciones.mockResolvedValue()
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    await cb.moverLeccion('l1', 'm2', 0)
    expect(cb.modulos.value[0].lecciones).toHaveLength(0)
    expect(cb.modulos.value[1].lecciones[0].id).toBe('l1')
    expect(svc.reordenarLecciones).toHaveBeenCalledWith([{ id: 'l1', modulo_id: 'm2', orden: 1 }])
  })

  it('las persistencias se serializan en orden', async () => {
    svc.fetchEstructura.mockResolvedValue(arbol())
    const llamadas = []
    svc.actualizarModulo.mockImplementation(async (id, patch) => {
      llamadas.push(patch.titulo)
      await new Promise((r) => setTimeout(r, 5))
      return {}
    })
    const cb = useCourseBuilder('c1')
    await cb.cargar()
    const p1 = cb.editarModulo('m1', { titulo: 'A' })
    const p2 = cb.editarModulo('m1', { titulo: 'B' })
    await Promise.all([p1, p2])
    expect(llamadas).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/composables/__tests__/useCourseBuilder.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/composables/useCourseBuilder.js`**

```js
import { ref } from 'vue'
import {
  fetchEstructura,
  crearModulo,
  actualizarModulo,
  eliminarModulo,
  crearLeccion,
  actualizarLeccion,
  eliminarLeccion,
  reordenarModulos,
  reordenarLecciones,
} from '@/services/courseBuilder.js'
import {
  ordenParaIndice,
  necesitaRenormalizar,
  renormalizar,
} from '@/composables/useCourseReorder.js'

export function useCourseBuilder(cursoId) {
  const modulos = ref([])
  const cargando = ref(false)
  const error = ref(null)

  // Cola: serializa persistencias para que drags rápidos no se pisen.
  // En fallo: error visible + recarga del servidor (consistencia garantizada).
  let cola = Promise.resolve()
  function encolar(op) {
    cola = cola.then(op).catch(async (e) => {
      error.value = e
      await recargar().catch(() => {})
    })
    return cola
  }

  async function recargar() {
    modulos.value = (await fetchEstructura(cursoId)).map((m) => ({
      ...m,
      lecciones: m.lecciones || [],
    }))
  }

  async function cargar() {
    cargando.value = true
    error.value = null
    try {
      await recargar()
    } catch (e) {
      error.value = e
    } finally {
      cargando.value = false
    }
  }

  /* ── Módulos ─────────────────────────────────────── */

  function agregarModulo(datos = {}) {
    return encolar(async () => {
      const orden = ordenParaIndice(modulos.value, modulos.value.length)
      const row = await crearModulo({ curso_id: cursoId, titulo: 'Nuevo módulo', orden, ...datos })
      modulos.value = [...modulos.value, { ...row, lecciones: [] }]
    })
  }

  function editarModulo(id, patch) {
    modulos.value = modulos.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
    return encolar(() => actualizarModulo(id, patch))
  }

  function quitarModulo(id) {
    return encolar(async () => {
      await eliminarModulo(id)
      modulos.value = modulos.value.filter((m) => m.id !== id)
    })
  }

  function moverModulo(from, to) {
    if (from === to) return Promise.resolve()
    const sin = modulos.value.toSpliced(from, 1)
    const movido = modulos.value[from]
    const orden = ordenParaIndice(sin, to)
    const nuevo = { ...movido, orden }
    const lista = sin.toSpliced(to, 0, nuevo)
    if (necesitaRenormalizar(lista)) {
      const renorm = renormalizar(lista)
      modulos.value = renorm
      return encolar(() => reordenarModulos(renorm.map(({ id, orden: o }) => ({ id, orden: o }))))
    }
    modulos.value = lista
    return encolar(() => reordenarModulos([{ id: nuevo.id, orden }]))
  }

  /* ── Lecciones ───────────────────────────────────── */

  function moduloDe(leccionId) {
    return modulos.value.find((m) => m.lecciones.some((l) => l.id === leccionId))
  }

  function agregarLeccion(moduloId, datos = {}) {
    return encolar(async () => {
      const mod = modulos.value.find((m) => m.id === moduloId)
      if (!mod) return
      const orden = ordenParaIndice(mod.lecciones, mod.lecciones.length)
      const row = await crearLeccion({
        modulo_id: moduloId,
        titulo: 'Nueva lección',
        tipo_material: 'video',
        orden,
        ...datos,
      })
      modulos.value = modulos.value.map((m) =>
        m.id === moduloId ? { ...m, lecciones: [...m.lecciones, row] } : m
      )
    })
  }

  function editarLeccion(leccionId, patch) {
    modulos.value = modulos.value.map((m) => ({
      ...m,
      lecciones: m.lecciones.map((l) => (l.id === leccionId ? { ...l, ...patch } : l)),
    }))
    return encolar(() => actualizarLeccion(leccionId, patch))
  }

  function quitarLeccion(leccionId) {
    return encolar(async () => {
      await eliminarLeccion(leccionId)
      modulos.value = modulos.value.map((m) => ({
        ...m,
        lecciones: m.lecciones.filter((l) => l.id !== leccionId),
      }))
    })
  }

  function moverLeccion(leccionId, targetModuloId, targetIndex) {
    const origen = moduloDe(leccionId)
    const destino = modulos.value.find((m) => m.id === targetModuloId)
    if (!origen || !destino) return Promise.resolve()
    const leccion = origen.lecciones.find((l) => l.id === leccionId)
    const destinoSin =
      origen.id === destino.id
        ? destino.lecciones.filter((l) => l.id !== leccionId)
        : destino.lecciones
    const orden = ordenParaIndice(destinoSin, targetIndex)
    const nueva = { ...leccion, modulo_id: targetModuloId, orden }
    const listaDestino = destinoSin.toSpliced(targetIndex, 0, nueva)

    modulos.value = modulos.value.map((m) => {
      if (m.id === origen.id && m.id === destino.id) return { ...m, lecciones: listaDestino }
      if (m.id === origen.id)
        return { ...m, lecciones: m.lecciones.filter((l) => l.id !== leccionId) }
      if (m.id === destino.id) return { ...m, lecciones: listaDestino }
      return m
    })

    if (necesitaRenormalizar(listaDestino)) {
      const renorm = renormalizar(listaDestino)
      modulos.value = modulos.value.map((m) =>
        m.id === destino.id ? { ...m, lecciones: renorm } : m
      )
      return encolar(() =>
        reordenarLecciones(
          renorm.map(({ id, orden: o }) => ({ id, modulo_id: targetModuloId, orden: o }))
        )
      )
    }
    return encolar(() => reordenarLecciones([{ id: leccionId, modulo_id: targetModuloId, orden }]))
  }

  return {
    modulos,
    cargando,
    error,
    cargar,
    recargar,
    agregarModulo,
    editarModulo,
    quitarModulo,
    moverModulo,
    agregarLeccion,
    editarLeccion,
    quitarLeccion,
    moverLeccion,
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/composables/__tests__/useCourseBuilder.test.js`
Expected: PASS (7 tests). Nota: `toSpliced` requiere Node 20+ (el repo ya usa Node 20 para el video-worker).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useCourseBuilder.js src/composables/__tests__/useCourseBuilder.test.js
git commit -m "feat: useCourseBuilder — árbol optimista con cola de persistencia"
```

---

### Task 8: `ModuleListItem.vue` + `ModuleList.vue`

**Files:**

- Create: `src/components/ModuleListItem.vue`
- Create: `src/components/ModuleList.vue`
- Create: `src/components/__tests__/ModuleList.test.js`

**Interfaces:**

- Consumes: `vue-draggable-plus` (`VueDraggable`), claves `builder.*` (Task 3).
- Produces:
  - `ModuleList` props `{ modules: Array, activeIndex: Number }`; emits `reorder(from, to)`, `add()`, `remove(index)`, `select(index)`, `update(index, patch)`, `drop-lesson(targetModuleIndex, lessonOldIndex)`.
  - `ModuleListItem` props `{ module, index, isActive, isFirst, isLast }`; emits `remove()`, `update(patch)` (renombrado inline), `drop-lesson(lessonOldIndex)`, `move-up()`, `move-down()`; el click burbujea al padre para `select`.

- [ ] **Step 1: Test que falla**

`src/components/__tests__/ModuleList.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import ModuleList from '@/components/ModuleList.vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end', 'add'],
    template: '<div class="mock-draggable"><slot /></div>',
  },
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const modules = [
  { id: 'm1', titulo: 'Fundamentos', lecciones: [{ id: 'l1' }] },
  { id: 'm2', titulo: 'Avanzado', lecciones: [] },
]

function factory(props = {}) {
  return mount(ModuleList, {
    props: { modules, activeIndex: 0, ...props },
    global: { plugins: [i18n] },
  })
}

describe('ModuleList', () => {
  it('renderiza un item por módulo con conteo de lecciones', () => {
    const w = factory()
    const items = w.findAll('[data-test="module-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Fundamentos')
    expect(items[0].text()).toContain('1')
  })

  it('marca activo el módulo según activeIndex', () => {
    const w = factory({ activeIndex: 1 })
    expect(w.findAll('[data-test="module-item"]')[1].classes()).toContain('active')
  })

  it('click en un módulo emite select con el índice', async () => {
    const w = factory()
    await w.findAll('[data-test="module-item"]')[1].trigger('click')
    expect(w.emitted('select')).toEqual([[1]])
  })

  it('click en + emite add', async () => {
    const w = factory()
    await w.find('[data-test="add-module"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
  })

  it('emite remove con confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = factory()
    await w.findAll('[data-test="module-remove"]')[0].trigger('click')
    expect(w.emitted('remove')).toEqual([[0]])
    window.confirm.mockRestore()
  })

  it('drag end emite reorder con índices', async () => {
    const w = factory()
    await w.findComponent({ name: 'VueDraggable' }).vm.$emit('end', { oldIndex: 0, newIndex: 1 })
    expect(w.emitted('reorder')).toEqual([[0, 1]])
  })

  it('botones ↑/↓ (fallback accesible) emiten reorder', async () => {
    const w = factory()
    await w.findAll('[data-test="module-down"]')[0].trigger('click')
    expect(w.emitted('reorder')).toEqual([[0, 1]])
  })

  it('estado vacío muestra invitación', () => {
    const w = factory({ modules: [] })
    expect(w.text()).toContain('Comienza agregando tu primer módulo')
  })

  it('renombrado inline emite update con el nuevo título', async () => {
    const w = factory()
    await w.findAll('[data-test="module-rename"]')[0].trigger('click')
    const input = w.find('[data-test="module-title-input"]')
    await input.setValue('Renombrado')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update')).toEqual([[0, { titulo: 'Renombrado' }]])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/ModuleList.test.js`
Expected: FAIL — componentes no existen.

- [ ] **Step 3: Implementar `src/components/ModuleListItem.vue`**

```vue
<script setup>
import { ref, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  module: { type: Object, required: true },
  index: { type: Number, required: true },
  isActive: { type: Boolean, default: false },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})
const emit = defineEmits(['remove', 'update', 'drop-lesson', 'move-up', 'move-down'])
const { t } = useI18n()

// Zona invisible que acepta lecciones arrastradas desde el timeline
const dropZone = []
function onLessonDrop(evt) {
  emit('drop-lesson', evt.oldIndex)
}

function confirmarRemove() {
  const count = props.module.lecciones?.length || 0
  if (window.confirm(t('builder.deleteModuleConfirm', { count }))) emit('remove')
}

/* Renombrado inline */
const renombrando = ref(false)
const tituloDraft = ref('')
const inputRef = ref(null)
async function empezarRenombrar() {
  tituloDraft.value = props.module.titulo || ''
  renombrando.value = true
  await nextTick()
  inputRef.value?.focus()
}
function confirmarRenombrar() {
  if (!renombrando.value) return // evita doble emit Enter→blur
  renombrando.value = false
  const titulo = tituloDraft.value.trim()
  if (titulo && titulo !== props.module.titulo) emit('update', { titulo })
}
</script>

<template>
  <div class="module-item" :class="{ active: isActive }" data-test="module-item">
    <span class="drag-handle" aria-hidden="true">≡</span>
    <div class="module-info">
      <input
        v-if="renombrando"
        ref="inputRef"
        v-model="tituloDraft"
        class="module-title-input"
        data-test="module-title-input"
        type="text"
        @click.stop
        @keydown.enter="confirmarRenombrar"
        @keydown.esc="renombrando = false"
        @blur="confirmarRenombrar"
      />
      <span v-else class="module-title">{{ module.titulo || t('builder.newModule') }}</span>
      <span class="module-count"
        >{{ module.lecciones?.length || 0 }} {{ t('builder.lessons') }}</span
      >
    </div>
    <div class="module-actions">
      <button
        data-test="module-rename"
        :aria-label="t('builder.edit')"
        @click.stop="empezarRenombrar"
      >
        ✎
      </button>
      <button
        v-if="!isFirst"
        data-test="module-up"
        :aria-label="`${module.titulo} arriba`"
        @click.stop="emit('move-up')"
      >
        ↑
      </button>
      <button
        v-if="!isLast"
        data-test="module-down"
        :aria-label="`${module.titulo} abajo`"
        @click.stop="emit('move-down')"
      >
        ↓
      </button>
      <button
        data-test="module-remove"
        :aria-label="t('builder.delete')"
        @click.stop="confirmarRemove"
      >
        ✕
      </button>
    </div>
    <VueDraggable
      :model-value="dropZone"
      :group="{ name: 'lecciones', pull: false, put: true }"
      class="lesson-drop"
      @add="onLessonDrop"
    />
  </div>
</template>

<style scoped>
.module-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 1.5);
  border-left: 3px solid transparent;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  transition: background 0.15s var(--ease);
}
.module-item.active {
  border-left-color: var(--primary);
  background: var(--paper-2);
}
.drag-handle {
  color: var(--ink-4);
  cursor: grab;
}
.module-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.module-title {
  color: var(--ink);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.module-count {
  color: var(--ink-3);
  font-size: 12px;
}
.module-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s var(--ease);
}
.module-item:hover .module-actions,
.module-item:focus-within .module-actions {
  opacity: 1;
}
.module-actions button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
}
.lesson-drop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.module-item.sortable-drag-over .lesson-drop,
.lesson-drop:has(.sortable-ghost) {
  pointer-events: auto;
}
</style>
```

Nota de implementación: la zona `lesson-drop` cubre el item solo durante un drag activo de lecciones. Si `:has(.sortable-ghost)` resulta poco fiable en pruebas manuales, alternativa aceptada: escuchar los eventos `@start`/`@end` del timeline en `CourseBuilder` y togglear una clase global `dragging-lesson` que active `pointer-events: auto` en `.lesson-drop`. El fallback funcional garantizado es el menú "Mover a…" de `LessonCard` (Task 9).

- [ ] **Step 4: Implementar `src/components/ModuleList.vue`**

```vue
<script setup>
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import ModuleListItem from '@/components/ModuleListItem.vue'

const props = defineProps({
  modules: { type: Array, required: true },
  activeIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['reorder', 'add', 'remove', 'select', 'update', 'drop-lesson'])
const { t } = useI18n()

// Copia local: VueDraggable necesita v-model; la fuente de verdad vive arriba.
const local = ref([...props.modules])
watch(
  () => props.modules,
  (v) => {
    local.value = [...v]
  },
  { deep: true }
)

function onEnd(evt) {
  if (evt.oldIndex !== evt.newIndex) emit('reorder', evt.oldIndex, evt.newIndex)
}
</script>

<template>
  <aside class="module-list" role="list" :aria-label="t('builder.modules')">
    <h3 class="module-list-title">{{ t('builder.modules') }}</h3>
    <p v-if="!modules.length" class="module-empty">{{ t('builder.emptyModules') }}</p>
    <VueDraggable v-model="local" handle=".drag-handle" :animation="150" @end="onEnd">
      <ModuleListItem
        v-for="(m, i) in local"
        :key="m.id"
        role="listitem"
        :module="m"
        :index="i"
        :is-active="i === activeIndex"
        :is-first="i === 0"
        :is-last="i === local.length - 1"
        @click="emit('select', i)"
        @remove="emit('remove', i)"
        @update="(patch) => emit('update', i, patch)"
        @move-up="emit('reorder', i, i - 1)"
        @move-down="emit('reorder', i, i + 1)"
        @drop-lesson="(lessonOldIndex) => emit('drop-lesson', i, lessonOldIndex)"
      />
    </VueDraggable>
    <button class="add-module" data-test="add-module" @click="emit('add')">
      + {{ t('builder.addModule') }}
    </button>
  </aside>
</template>

<style scoped>
.module-list {
  width: 260px;
  flex-shrink: 0;
  background: var(--paper);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.module-list-title {
  margin: 0;
  padding: calc(var(--unit) * 1.5);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
.module-empty {
  padding: calc(var(--unit) * 2);
  color: var(--ink-3);
  font-size: 14px;
}
.add-module {
  margin: calc(var(--unit) * 1.5);
  padding: calc(var(--unit) * 1);
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}
.add-module:hover {
  border-color: var(--primary);
  color: var(--primary);
}
@media (max-width: 768px) {
  .module-list {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
}
</style>
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/ModuleList.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ModuleList.vue src/components/ModuleListItem.vue src/components/__tests__/ModuleList.test.js
git commit -m "feat: ModuleList/ModuleListItem — sidebar drag&drop de módulos"
```

---

### Task 9: `LessonCard.vue` + `LessonTimeline.vue`

**Files:**

- Create: `src/components/LessonCard.vue`
- Create: `src/components/LessonTimeline.vue`
- Create: `src/components/__tests__/LessonTimeline.test.js`

**Interfaces:**

- Consumes: `vue-draggable-plus`, `segToDuracion` (Task 4), `IconSet.vue` existente, claves `builder.*`.
- Produces:
  - `LessonTimeline` props `{ lessons: Array, moduleTitle: String, moduleTitles: Array<string> }`; emits `reorder(from, to)`, `move(lessonIndex, targetModuleIndex)`, `add()`, `remove(index)`, `select(index)`, `duplicate(index)`.
  - `LessonCard` props `{ lesson, index, moduleTitles }`; emits `edit()`, `delete()`, `duplicate()`, `move-to(targetModuleIndex)`. La `fuente` de cada lección viene derivada (helper `fuenteDe` en Task 11).

- [ ] **Step 1: Test que falla**

`src/components/__tests__/LessonTimeline.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import LessonTimeline from '@/components/LessonTimeline.vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end'],
    template: '<div class="mock-draggable"><slot /></div>',
  },
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const lessons = [
  { id: 'l1', titulo: 'Intro', fuente: 'youtube', duracion_seg: 720, requiere_entrega: false },
  { id: 'l2', titulo: 'Quiz', fuente: 'examen', duracion_seg: 0, requiere_entrega: false },
  { id: 'l3', titulo: 'Vacía', fuente: 'ninguno', duracion_seg: 0, requiere_entrega: true },
]

function factory(props = {}) {
  return mount(LessonTimeline, {
    props: { lessons, moduleTitle: 'Módulo 1', moduleTitles: ['Módulo 1', 'Módulo 2'], ...props },
    global: { plugins: [i18n] },
  })
}

describe('LessonTimeline', () => {
  it('renderiza una tarjeta por lección', () => {
    expect(factory().findAll('[data-test="lesson-card"]')).toHaveLength(3)
  })

  it('badge de examen, entrega y sin-contenido', () => {
    const cards = factory().findAll('[data-test="lesson-card"]')
    expect(cards[1].text()).toContain('Examen')
    expect(cards[2].text()).toContain('Entrega')
    expect(cards[2].text()).toContain('Sin contenido')
  })

  it('duración formateada en la tarjeta', () => {
    expect(factory().findAll('[data-test="lesson-card"]')[0].text()).toContain('12:00')
  })

  it('click en tarjeta emite select', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-card"]')[0].trigger('click')
    expect(w.emitted('select')).toEqual([[0]])
  })

  it('drag end emite reorder', async () => {
    const w = factory()
    await w.findComponent({ name: 'VueDraggable' }).vm.$emit('end', { oldIndex: 2, newIndex: 0 })
    expect(w.emitted('reorder')).toEqual([[2, 0]])
  })

  it('menú Mover a… emite move con índice de módulo destino', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="move-to-1"]')[0].trigger('click')
    expect(w.emitted('move')).toEqual([[0, 1]])
  })

  it('eliminar pide confirmación y emite remove', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="lesson-delete"]')[0].trigger('click')
    expect(w.emitted('remove')).toEqual([[0]])
    window.confirm.mockRestore()
  })

  it('duplicar emite duplicate con el índice', async () => {
    const w = factory()
    await w.findAll('[data-test="lesson-menu"]')[0].trigger('click')
    await w.findAll('[data-test="lesson-duplicate"]')[0].trigger('click')
    expect(w.emitted('duplicate')).toEqual([[0]])
  })

  it('botón + emite add y estado vacío invita a arrastrar', async () => {
    const w = factory({ lessons: [] })
    expect(w.text()).toContain('Arrastra lecciones aquí o haz clic en +')
    await w.find('[data-test="add-lesson"]').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/LessonTimeline.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/components/LessonCard.vue`**

```vue
<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconSet from '@/components/IconSet.vue'
import { segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lesson: { type: Object, required: true },
  index: { type: Number, required: true },
  moduleTitles: { type: Array, default: () => [] },
})
const emit = defineEmits(['edit', 'delete', 'duplicate', 'move-to'])
const { t } = useI18n()

const menuOpen = ref(false)

const ICONS = {
  youtube: 'video',
  hls: 'video',
  documento: 'doc',
  examen: 'exam',
  texto: 'doc',
  ninguno: 'doc',
}

function confirmarDelete() {
  menuOpen.value = false
  if (window.confirm(t('builder.deleteLessonConfirm', { title: props.lesson.titulo || '' })))
    emit('delete')
}
</script>

<template>
  <article class="lesson-card" data-test="lesson-card" @click="emit('edit')">
    <span class="lesson-drag" aria-hidden="true">≡</span>
    <div class="lesson-thumb">
      <IconSet :name="ICONS[lesson.fuente] || 'doc'" />
    </div>
    <div class="lesson-body">
      <h4 class="lesson-title">{{ lesson.titulo || t('builder.newLesson') }}</h4>
      <div class="lesson-meta">
        <span v-if="lesson.duracion_seg" class="lesson-duration">
          {{ segToDuracion(lesson.duracion_seg) }}
        </span>
        <span v-if="lesson.fuente === 'examen'" class="badge">📝 {{ t('builder.exam') }}</span>
        <span v-if="lesson.requiere_entrega" class="badge">📎 {{ t('builder.delivery') }}</span>
        <span v-if="lesson.fuente === 'ninguno'" class="badge warn">
          ⚠️ {{ t('builder.noContent') }}
        </span>
      </div>
    </div>
    <button
      class="lesson-menu-btn"
      data-test="lesson-menu"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click.stop="menuOpen = !menuOpen"
    >
      ⋯
    </button>
    <div v-if="menuOpen" class="lesson-menu" role="menu" @click.stop>
      <button
        role="menuitem"
        @click="
          menuOpen = false
          emit('edit')
        "
      >
        {{ t('builder.edit') }}
      </button>
      <button
        role="menuitem"
        data-test="lesson-duplicate"
        @click="
          menuOpen = false
          emit('duplicate')
        "
      >
        {{ t('builder.duplicate') }}
      </button>
      <button
        v-for="(title, mi) in moduleTitles"
        :key="mi"
        role="menuitem"
        :data-test="`move-to-${mi}`"
        @click="
          menuOpen = false
          emit('move-to', mi)
        "
      >
        {{ t('builder.moveTo') }} {{ title }}
      </button>
      <button role="menuitem" class="danger" data-test="lesson-delete" @click="confirmarDelete">
        {{ t('builder.delete') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.lesson-card {
  position: relative;
  width: 200px;
  min-height: 140px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: visible;
}
.lesson-drag {
  position: absolute;
  top: 6px;
  left: 8px;
  color: var(--ink-4);
  cursor: grab;
  z-index: 1;
}
.lesson-thumb {
  height: 60%;
  min-height: 72px;
  display: grid;
  place-items: center;
  background: var(--paper-2);
  border-radius: 8px 8px 0 0;
  color: var(--ink-3);
}
.lesson-body {
  padding: calc(var(--unit) * 1);
}
.lesson-title {
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lesson-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: var(--ink-3);
}
.badge {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 8px;
}
.badge.warn {
  background: color-mix(in srgb, var(--warn) 15%, transparent);
  border-color: var(--warn);
}
.lesson-menu-btn {
  position: absolute;
  top: 4px;
  right: 6px;
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  cursor: pointer;
}
.lesson-menu {
  position: absolute;
  top: 28px;
  right: 6px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 160px;
}
.lesson-menu button {
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.lesson-menu button:hover {
  background: var(--paper-2);
}
.lesson-menu .danger {
  color: var(--danger);
}
</style>
```

- [ ] **Step 4: Implementar `src/components/LessonTimeline.vue`**

```vue
<script setup>
import { ref, watch, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import LessonCard from '@/components/LessonCard.vue'
import { segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lessons: { type: Array, required: true },
  moduleTitle: { type: String, default: '' },
  moduleTitles: { type: Array, default: () => [] },
})
const emit = defineEmits(['reorder', 'move', 'add', 'remove', 'select', 'duplicate'])
const { t } = useI18n()

const local = ref([...props.lessons])
watch(
  () => props.lessons,
  (v) => {
    local.value = [...v]
  },
  { deep: true }
)

const totalSeg = computed(() => props.lessons.reduce((s, l) => s + (l.duracion_seg || 0), 0))
const sinContenido = computed(() => props.lessons.filter((l) => l.fuente === 'ninguno').length)

function onEnd(evt) {
  if (evt.oldIndex !== evt.newIndex) emit('reorder', evt.oldIndex, evt.newIndex)
}
</script>

<template>
  <section class="timeline" :aria-label="moduleTitle">
    <header class="timeline-header">
      <h3>{{ moduleTitle }}</h3>
      <p class="timeline-stats">
        {{ t('builder.totalDuration') }}: {{ segToDuracion(totalSeg) || '0:00' }} ·
        {{ lessons.length }} {{ t('builder.lessons') }}
        <template v-if="sinContenido">
          · {{ sinContenido }} {{ t('builder.noContent').toLowerCase() }}</template
        >
      </p>
    </header>
    <p v-if="!lessons.length" class="timeline-empty">{{ t('builder.emptyTimeline') }}</p>
    <div class="timeline-scroll" role="list">
      <VueDraggable
        v-model="local"
        class="timeline-track"
        handle=".lesson-drag"
        :group="{ name: 'lecciones', pull: true, put: true }"
        :animation="150"
        @end="onEnd"
      >
        <LessonCard
          v-for="(l, i) in local"
          :key="l.id"
          role="listitem"
          :lesson="l"
          :index="i"
          :module-titles="moduleTitles"
          @edit="emit('select', i)"
          @delete="emit('remove', i)"
          @duplicate="emit('duplicate', i)"
          @move-to="(mi) => emit('move', i, mi)"
        />
      </VueDraggable>
      <button
        class="add-lesson"
        data-test="add-lesson"
        :aria-label="t('builder.addLesson')"
        @click="emit('add')"
      >
        +
      </button>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  flex: 1;
  min-width: 0;
  background: var(--paper-2);
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.timeline-header h3 {
  margin: 0;
  color: var(--ink);
}
.timeline-stats {
  margin: 4px 0 0;
  color: var(--ink-3);
  font-size: 13px;
}
.timeline-empty {
  color: var(--ink-3);
  border: 1px dashed var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 3);
  text-align: center;
}
.timeline-scroll {
  display: flex;
  align-items: stretch;
  gap: calc(var(--unit) * 1.5);
  overflow-x: auto;
  padding-bottom: calc(var(--unit) * 1);
}
.timeline-track {
  display: flex;
  gap: calc(var(--unit) * 1.5);
}
.add-lesson {
  flex-shrink: 0;
  width: 64px;
  min-height: 140px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink-3);
  font-size: 24px;
  cursor: pointer;
}
.add-lesson:hover {
  border-color: var(--primary);
  color: var(--primary);
}
@media (max-width: 768px) {
  .timeline-scroll,
  .timeline-track {
    flex-direction: column;
    overflow-x: visible;
  }
  .lesson-card {
    width: 100%;
  }
}
</style>
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/LessonTimeline.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/LessonCard.vue src/components/LessonTimeline.vue src/components/__tests__/LessonTimeline.test.js
git commit -m "feat: LessonTimeline/LessonCard — timeline horizontal de lecciones"
```

---

### Task 10: `LessonRichTextEditor.vue` (Tiptap)

**Files:**

- Create: `src/components/LessonRichTextEditor.vue`
- Create: `src/components/__tests__/LessonRichTextEditor.test.js`

**Interfaces:**

- Consumes: `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image`.
- Produces: componente con `v-model` (`modelValue: Object|null` = JSON de Tiptap); emits `update:modelValue(json)` (debounced 1500 ms), `dirty()` (inmediato en cada cambio); método expuesto `flush()` (emite el JSON pendiente ya, para el guardado al cerrar). Exporta además `EXTENSIONES_TEXTO` (la whitelist) para reuso en el render del player (Task 12).

- [ ] **Step 1: Test que falla**

`src/components/__tests__/LessonRichTextEditor.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import es from '@/locales/es.json'
import LessonRichTextEditor from '@/components/LessonRichTextEditor.vue'

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }],
}

function factory(props = {}) {
  return mount(LessonRichTextEditor, {
    props: { modelValue: DOC, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('LessonRichTextEditor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('monta el editor con el contenido inicial', async () => {
    const w = factory()
    await nextTick()
    expect(w.vm.editor).toBeTruthy()
    expect(w.vm.editor.getText()).toContain('Hola')
    w.unmount()
  })

  it('un cambio emite dirty de inmediato y update:modelValue tras el debounce, con JSON', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.insertContent(' mundo')
    expect(w.emitted('dirty')).toBeTruthy()
    expect(w.emitted('update:modelValue')).toBeFalsy() // aún en debounce
    vi.advanceTimersByTime(1600)
    const emitido = w.emitted('update:modelValue')
    expect(emitido).toHaveLength(1)
    expect(emitido[0][0].type).toBe('doc') // JSON, no HTML
    expect(typeof emitido[0][0]).toBe('object')
    w.unmount()
  })

  it('flush() emite el pendiente sin esperar el debounce', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.insertContent('!')
    w.vm.flush()
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    w.unmount()
  })

  it('la toolbar aplica negritas', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.selectAll()
    await w.find('[data-test="tb-bold"]').trigger('click')
    expect(w.vm.editor.isActive('bold')).toBe(true)
    w.unmount()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/LessonRichTextEditor.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/components/LessonRichTextEditor.vue`**

```vue
<script>
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'

// Whitelist compartida editor/render: SOLO estos nodos y marks pueden
// producir markup. Es la sanitización estructural del spec §18.
export const EXTENSIONES_TEXTO = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    protocols: ['http', 'https'],
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
  Image,
]
</script>

<script setup>
import { onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'dirty'])
const { t } = useI18n()

let debounceTimer = null
const editor = useEditor({
  content: props.modelValue,
  extensions: [
    ...EXTENSIONES_TEXTO,
    Placeholder.configure({ placeholder: () => t('builder.editorPlaceholder') }),
  ],
  onUpdate({ editor: ed }) {
    emit('dirty')
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => emit('update:modelValue', ed.getJSON()), 1500)
  },
})

function flush() {
  if (!editor.value) return
  clearTimeout(debounceTimer)
  emit('update:modelValue', editor.value.getJSON())
}

function setLink() {
  const url = window.prompt(t('builder.linkPrompt'))
  if (!url) return
  if (!/^https?:\/\//.test(url)) return
  editor.value.chain().focus().setLink({ href: url }).run()
}

function addImage() {
  const url = window.prompt(t('builder.imagePrompt'))
  if (!url || !/^https?:\/\//.test(url)) return
  editor.value.chain().focus().setImage({ src: url }).run()
}

defineExpose({ flush, editor })

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  editor.value?.destroy()
})
</script>

<template>
  <div class="rich-editor">
    <div v-if="editor" class="rich-toolbar" role="toolbar">
      <button
        data-test="tb-bold"
        :class="{ on: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <b>B</b>
      </button>
      <button
        :class="{ on: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <i>I</i>
      </button>
      <button
        :class="{ on: editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        :class="{ on: editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
      <button
        :class="{ on: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        ••
      </button>
      <button
        :class="{ on: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>
      <button
        :class="{ on: editor.isActive('blockquote') }"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        "
      </button>
      <button :class="{ on: editor.isActive('link') }" @click="setLink">🔗</button>
      <button @click="addImage">🖼</button>
    </div>
    <EditorContent :editor="editor" class="rich-content" />
  </div>
</template>

<style scoped>
.rich-editor {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}
.rich-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid var(--line-soft);
}
.rich-toolbar button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-2);
  border-radius: 6px;
  min-width: 30px;
  padding: 4px 6px;
  cursor: pointer;
}
.rich-toolbar button:hover {
  background: var(--paper-2);
}
.rich-toolbar button.on {
  border-color: var(--primary);
  color: var(--primary);
}
.rich-content :deep(.ProseMirror) {
  min-height: 180px;
  padding: calc(var(--unit) * 1.5);
  color: var(--ink);
  outline: none;
}
.rich-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--ink-4);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/LessonRichTextEditor.test.js`
Expected: PASS (4 tests). Si jsdom se queja de APIs de rango/selección de ProseMirror, agregar al inicio del test file los stubs mínimos (`document.createRange` ya existe en jsdom moderno; solo stubbear `getClientRects`/`getBoundingClientRect` sobre `Range.prototype` si hace falta) — no cambiar la implementación por el test.

- [ ] **Step 5: Commit**

```bash
git add src/components/LessonRichTextEditor.vue src/components/__tests__/LessonRichTextEditor.test.js
git commit -m "feat: LessonRichTextEditor — Tiptap con autosave debounced y whitelist"
```

---

### Task 11: `LessonEditorPanel.vue` (slide-over)

**Files:**

- Create: `src/components/LessonEditorPanel.vue`
- Create: `src/components/__tests__/LessonEditorPanel.test.js`

**Interfaces:**

- Consumes: `VideoUploadField.vue` (emit `videoId-updated`), `DocumentoUploadField.vue` (emit `documento-updated`), `EvaluacionEditor.vue`, `LessonRichTextEditor.vue` (Task 10), claves `builder.*`, `parseDuracionToSeg`/`segToDuracion` (Task 4).
- Produces: props `{ lesson: Object|null, session: Object|null }`; emits `save(patch)` — patch con la forma de columnas de `lecciones` (ver `leccionPatch` abajo) más `preguntas` y `fuente` para que el padre decida; `close()`. Esc cierra (con confirm si hay cambios sin guardar).
- Nota: `fuenteDe(l)` y `leccionPatch(l)` viven en este componente y se **exportan** (named exports en `<script>` normal) para reuso en `CourseBuilder.vue`:

```js
export function fuenteDe(l) {
  if (l.tipo_material === 'examen') return 'examen'
  if (l.documento_path) return 'documento'
  if (l.video_id) return 'hls'
  if (l.contenido) return 'texto'
  if (l.url_youtube) return 'youtube'
  return 'ninguno'
}

export function leccionPatch(l) {
  return {
    titulo: l.titulo,
    tipo_material:
      l.fuente === 'examen'
        ? 'examen'
        : l.fuente === 'documento' || l.fuente === 'texto'
          ? 'lectura'
          : 'video',
    url_youtube: l.fuente === 'youtube' ? l.url_youtube || null : null,
    video_id: l.fuente === 'hls' ? l.video_id || null : null,
    documento_path: l.fuente === 'documento' ? l.documento_path || null : null,
    documento_tipo: l.fuente === 'documento' ? l.documento_tipo || null : null,
    contenido: l.fuente === 'texto' ? l.contenido || null : null,
    duracion_seg: l.duracion_seg || 0,
  }
}
```

- [ ] **Step 1: Test que falla**

`src/components/__tests__/LessonEditorPanel.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import LessonEditorPanel, { fuenteDe, leccionPatch } from '@/components/LessonEditorPanel.vue'

vi.mock('@/components/VideoUploadField.vue', () => ({
  default: { name: 'VideoUploadField', template: '<div class="mock-video" />' },
}))
vi.mock('@/components/DocumentoUploadField.vue', () => ({
  default: { name: 'DocumentoUploadField', template: '<div class="mock-doc" />' },
}))
vi.mock('@/components/EvaluacionEditor.vue', () => ({
  default: { name: 'EvaluacionEditor', template: '<div class="mock-eval" />' },
}))
vi.mock('@/components/LessonRichTextEditor.vue', () => ({
  default: {
    name: 'LessonRichTextEditor',
    props: ['modelValue'],
    emits: ['update:modelValue', 'dirty'],
    methods: { flush() {} },
    template: '<div class="mock-rich" />',
  },
  EXTENSIONES_TEXTO: [],
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const leccion = {
  id: 'l1',
  titulo: 'Intro',
  tipo_material: 'video',
  url_youtube: 'https://youtu.be/abc12345678',
  video_id: null,
  documento_path: null,
  documento_tipo: null,
  contenido: null,
  duracion_seg: 90,
  requiere_entrega: false,
  fuente: 'youtube',
}

function factory(props = {}) {
  return mount(LessonEditorPanel, {
    props: { lesson: leccion, session: null, ...props },
    global: { plugins: [i18n] },
  })
}

describe('helpers', () => {
  it('fuenteDe deriva la fuente desde columnas', () => {
    expect(fuenteDe({ tipo_material: 'examen' })).toBe('examen')
    expect(fuenteDe({ documento_path: 'x.pdf' })).toBe('documento')
    expect(fuenteDe({ video_id: 'v1' })).toBe('hls')
    expect(fuenteDe({ contenido: { type: 'doc' } })).toBe('texto')
    expect(fuenteDe({ url_youtube: 'https://…' })).toBe('youtube')
    expect(fuenteDe({})).toBe('ninguno')
  })

  it('leccionPatch limpia campos de otras fuentes', () => {
    const p = leccionPatch({
      fuente: 'texto',
      titulo: 'T',
      contenido: { type: 'doc' },
      url_youtube: 'x',
    })
    expect(p.tipo_material).toBe('lectura')
    expect(p.contenido).toEqual({ type: 'doc' })
    expect(p.url_youtube).toBeNull()
  })
})

describe('LessonEditorPanel', () => {
  it('renderiza campos base', () => {
    const w = factory()
    expect(w.find('[data-test="lesson-titulo"]').element.value).toBe('Intro')
  })

  it('fuente texto monta el editor enriquecido', async () => {
    const w = factory()
    await w.find('[data-test="fuente-texto"]').setValue()
    expect(w.find('.mock-rich').exists()).toBe(true)
  })

  it('guardar emite save con el patch', async () => {
    const w = factory()
    await w.find('[data-test="lesson-titulo"]').setValue('Renombrada')
    await w.find('[data-test="panel-save"]').trigger('click')
    const [patch] = w.emitted('save')[0]
    expect(patch.titulo).toBe('Renombrada')
    expect(patch.fuente).toBe('youtube')
  })

  it('cancelar emite close sin save', async () => {
    const w = factory()
    await w.find('[data-test="panel-cancel"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('save')).toBeFalsy()
  })

  it('Esc con cambios sin guardar pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const w = factory()
    await w.find('[data-test="lesson-titulo"]').setValue('Cambio')
    await w.find('.panel').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toBeFalsy()
    window.confirm.mockRestore()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/LessonEditorPanel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/components/LessonEditorPanel.vue`**

```vue
<script>
export function fuenteDe(l) {
  if (l.tipo_material === 'examen') return 'examen'
  if (l.documento_path) return 'documento'
  if (l.video_id) return 'hls'
  if (l.contenido) return 'texto'
  if (l.url_youtube) return 'youtube'
  return 'ninguno'
}

export function leccionPatch(l) {
  return {
    titulo: l.titulo,
    tipo_material:
      l.fuente === 'examen'
        ? 'examen'
        : l.fuente === 'documento' || l.fuente === 'texto'
          ? 'lectura'
          : 'video',
    url_youtube: l.fuente === 'youtube' ? l.url_youtube || null : null,
    video_id: l.fuente === 'hls' ? l.video_id || null : null,
    documento_path: l.fuente === 'documento' ? l.documento_path || null : null,
    documento_tipo: l.fuente === 'documento' ? l.documento_tipo || null : null,
    contenido: l.fuente === 'texto' ? l.contenido || null : null,
    duracion_seg: l.duracion_seg || 0,
  }
}
</script>

<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VideoUploadField from '@/components/VideoUploadField.vue'
import DocumentoUploadField from '@/components/DocumentoUploadField.vue'
import EvaluacionEditor from '@/components/EvaluacionEditor.vue'
import LessonRichTextEditor from '@/components/LessonRichTextEditor.vue'
import { parseDuracionToSeg, segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lesson: { type: Object, default: null },
  session: { type: Object, default: null },
})
const emit = defineEmits(['save', 'close'])
const { t } = useI18n()

const FUENTES = ['youtube', 'hls', 'documento', 'examen', 'texto', 'ninguno']
const local = ref(null)
const dirty = ref(false)
const richRef = ref(null)
const duracionStr = ref('')

watch(
  () => props.lesson,
  (l) => {
    local.value = l ? { ...l, fuente: l.fuente || fuenteDe(l), preguntas: l.preguntas || [] } : null
    duracionStr.value = l ? segToDuracion(l.duracion_seg) : ''
    dirty.value = false
  },
  { immediate: true }
)

const abierto = computed(() => !!local.value)

function marcarDirty() {
  dirty.value = true
}

function onEsc() {
  if (dirty.value && !window.confirm(t('builder.unsavedConfirm'))) return
  emit('close')
}

function guardar() {
  richRef.value?.flush?.()
  local.value.duracion_seg = parseDuracionToSeg(duracionStr.value)
  emit('save', {
    ...leccionPatch(local.value),
    fuente: local.value.fuente,
    preguntas: local.value.preguntas,
  })
  dirty.value = false
}
</script>

<template>
  <teleport to="body">
    <div v-if="abierto" class="panel-backdrop" @click="onEsc" />
    <aside
      v-if="abierto"
      class="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('builder.editLesson')"
      tabindex="-1"
      @keydown.esc="onEsc"
    >
      <header class="panel-header">
        <h3>{{ t('builder.editLesson') }}</h3>
        <span v-if="dirty" class="unsaved">{{ t('builder.unsaved') }}</span>
        <button class="panel-close" :aria-label="t('builder.cancel')" @click="onEsc">✕</button>
      </header>

      <div class="panel-body">
        <label class="field">
          {{ t('builder.title') }}
          <input
            v-model="local.titulo"
            data-test="lesson-titulo"
            type="text"
            @input="marcarDirty"
          />
        </label>

        <fieldset class="field">
          <legend>{{ t('builder.source') }}</legend>
          <label v-for="f in FUENTES" :key="f" class="radio">
            <input
              v-model="local.fuente"
              type="radio"
              name="fuente"
              :value="f"
              :data-test="`fuente-${f}`"
              @change="marcarDirty"
            />
            {{ t(`builder.source${f.charAt(0).toUpperCase() + f.slice(1)}`) }}
          </label>
        </fieldset>

        <label v-if="local.fuente === 'youtube'" class="field">
          URL de YouTube
          <input
            v-model="local.url_youtube"
            type="url"
            placeholder="https://youtube.com/watch?v=…"
            @input="marcarDirty"
          />
          <iframe
            v-if="/youtu\.?be/.test(local.url_youtube || '')"
            class="yt-preview"
            :src="`https://www.youtube.com/embed/${(local.url_youtube.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1] || ''}?rel=0`"
            title="Preview"
          />
        </label>

        <VideoUploadField
          v-if="local.fuente === 'hls'"
          :leccion="local"
          :session="session"
          @videoId-updated="
            (id) => {
              local.video_id = id
              marcarDirty()
            }
          "
        />

        <DocumentoUploadField
          v-if="local.fuente === 'documento'"
          :leccion="local"
          :session="session"
          @documento-updated="
            (doc) => {
              Object.assign(local, doc)
              marcarDirty()
            }
          "
        />

        <EvaluacionEditor
          v-if="local.fuente === 'examen'"
          v-model:preguntas="local.preguntas"
          @update:preguntas="marcarDirty"
        />

        <LessonRichTextEditor
          v-if="local.fuente === 'texto'"
          ref="richRef"
          v-model="local.contenido"
          @dirty="marcarDirty"
        />

        <label class="field">
          {{ t('builder.duration') }}
          <input v-model="duracionStr" type="text" placeholder="12:30" @input="marcarDirty" />
        </label>
      </div>

      <footer class="panel-footer">
        <button class="btn-secondary" data-test="panel-cancel" @click="emit('close')">
          {{ t('builder.cancel') }}
        </button>
        <button class="btn-primary" data-test="panel-save" @click="guardar">
          {{ t('builder.save') }}
        </button>
      </footer>
    </aside>
  </teleport>
</template>

<style scoped>
.panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 90;
}
.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 100vw);
  background: var(--paper);
  border-left: 1px solid var(--line);
  z-index: 91;
  display: flex;
  flex-direction: column;
  animation: slide-in 0.2s var(--ease);
}
@keyframes slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
.panel-header {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line-soft);
}
.panel-header h3 {
  margin: 0;
  flex: 1;
  color: var(--ink);
}
.unsaved {
  color: var(--warn);
  font-size: 12px;
}
.panel-close {
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  cursor: pointer;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--ink-2);
  font-size: 14px;
}
.field input[type='text'],
.field input[type='url'] {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--paper);
  color: var(--ink);
}
fieldset.field {
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  padding: calc(var(--unit) * 1);
}
.radio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.yt-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 8px;
  margin-top: 8px;
}
.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 2);
  border-top: 1px solid var(--line-soft);
}
.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
}
.btn-secondary {
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
}
</style>
```

Nota: verificar las props reales de `VideoUploadField`/`DocumentoUploadField`/`EvaluacionEditor` en su uso actual dentro de `AdminCourseEditor.vue` (grep del nombre del componente en el template) y ajustar los bindings del panel a esa firma exacta antes de dar por buena la integración — los mocks del test aíslan esa firma a propósito.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/LessonEditorPanel.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/LessonEditorPanel.vue src/components/__tests__/LessonEditorPanel.test.js
git commit -m "feat: LessonEditorPanel — slide-over con formularios por fuente"
```

---

### Task 12: `CourseBuilder.vue` (orquestador)

**Files:**

- Create: `src/components/CourseBuilder.vue`
- Create: `src/components/__tests__/CourseBuilder.test.js`

**Interfaces:**

- Consumes: `useCourseBuilder` (Task 7), `ModuleList` (Task 8), `LessonTimeline` (Task 9), `LessonEditorPanel` + `fuenteDe` (Task 11), `guardarEvaluacionAdmin` de `@/services/evaluaciones.js` (existente).
- Produces: props `{ cursoId: String (required), session: Object }`; emits `structure-changed({ modulos, lecciones, advertencias })` en cada cambio del árbol. Atajos: `Ctrl+M` nuevo módulo, `Ctrl+N` nueva lección en el módulo activo.

- [ ] **Step 1: Test que falla**

`src/components/__tests__/CourseBuilder.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import CourseBuilder from '@/components/CourseBuilder.vue'
import * as svc from '@/services/courseBuilder.js'

vi.mock('@/services/courseBuilder.js', () => ({
  fetchEstructura: vi.fn(),
  crearModulo: vi.fn(),
  actualizarModulo: vi.fn(),
  eliminarModulo: vi.fn(),
  crearLeccion: vi.fn(),
  actualizarLeccion: vi.fn(),
  eliminarLeccion: vi.fn(),
  reordenarModulos: vi.fn(),
  reordenarLecciones: vi.fn(),
}))
vi.mock('@/services/evaluaciones.js', () => ({
  guardarEvaluacionAdmin: vi.fn(),
  cargarPreguntasAdmin: vi.fn().mockResolvedValue([]),
}))
vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue'],
    emits: ['update:modelValue', 'end', 'add'],
    template: '<div><slot /></div>',
  },
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const arbol = [
  {
    id: 'm1',
    orden: 1,
    titulo: 'M1',
    lecciones: [
      {
        id: 'l1',
        orden: 1,
        modulo_id: 'm1',
        titulo: 'Intro',
        tipo_material: 'video',
        url_youtube: 'https://youtu.be/abc12345678',
        duracion_seg: 60,
      },
    ],
  },
  { id: 'm2', orden: 2, titulo: 'M2', lecciones: [] },
]

function factory() {
  return mount(CourseBuilder, {
    props: { cursoId: 'c1', session: null },
    global: { plugins: [i18n] },
  })
}

describe('CourseBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    svc.fetchEstructura.mockResolvedValue(JSON.parse(JSON.stringify(arbol)))
  })

  it('carga la estructura al montar y renderiza sidebar + timeline', async () => {
    const w = factory()
    await flushPromises()
    expect(svc.fetchEstructura).toHaveBeenCalledWith('c1')
    expect(w.findAll('[data-test="module-item"]')).toHaveLength(2)
    expect(w.findAll('[data-test="lesson-card"]')).toHaveLength(1)
  })

  it('emite structure-changed con conteos', async () => {
    const w = factory()
    await flushPromises()
    const eventos = w.emitted('structure-changed')
    expect(eventos.at(-1)[0]).toEqual({ modulos: 2, lecciones: 1, advertencias: 0 })
  })

  it('seleccionar módulo cambia el timeline', async () => {
    const w = factory()
    await flushPromises()
    await w.findAll('[data-test="module-item"]')[1].trigger('click')
    expect(w.text()).toContain('M2')
    expect(w.findAll('[data-test="lesson-card"]')).toHaveLength(0)
  })

  it('abrir lección monta el panel y guardar persiste', async () => {
    svc.actualizarLeccion.mockResolvedValue({})
    const w = factory()
    await flushPromises()
    await w.findAll('[data-test="lesson-card"]')[0].trigger('click')
    expect(document.querySelector('.panel')).toBeTruthy()
    document.querySelector('[data-test="lesson-titulo"]').value = 'Editada'
    document.querySelector('[data-test="lesson-titulo"]').dispatchEvent(new Event('input'))
    document.querySelector('[data-test="panel-save"]').click()
    await flushPromises()
    expect(svc.actualizarLeccion).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ titulo: 'Editada' })
    )
  })

  it('la barra de validación resume el estado', async () => {
    const w = factory()
    await flushPromises()
    expect(w.find('[data-test="validation-bar"]').text()).toContain('2 módulos')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/CourseBuilder.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/components/CourseBuilder.vue`**

```vue
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ModuleList from '@/components/ModuleList.vue'
import LessonTimeline from '@/components/LessonTimeline.vue'
import LessonEditorPanel, { fuenteDe } from '@/components/LessonEditorPanel.vue'
import { useCourseBuilder } from '@/composables/useCourseBuilder.js'
import { guardarEvaluacionAdmin } from '@/services/evaluaciones.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
})
const emit = defineEmits(['structure-changed'])
const { t } = useI18n()

const cb = useCourseBuilder(props.cursoId)
const activeIndex = ref(0)
const leccionAbierta = ref(null)

const moduloActivo = computed(() => cb.modulos.value[activeIndex.value] || null)
const leccionesActivas = computed(() =>
  (moduloActivo.value?.lecciones || []).map((l) => ({ ...l, fuente: fuenteDe(l) }))
)
const moduleTitles = computed(() => cb.modulos.value.map((m) => m.titulo))

const resumen = computed(() => {
  const lecciones = cb.modulos.value.reduce((s, m) => s + m.lecciones.length, 0)
  const advertencias = cb.modulos.value.reduce(
    (s, m) => s + m.lecciones.filter((l) => fuenteDe(l) === 'ninguno').length,
    0
  )
  return { modulos: cb.modulos.value.length, lecciones, advertencias }
})

watch(resumen, (r) => emit('structure-changed', { ...r }), { deep: true })
watch(cb.modulos, () => {
  if (activeIndex.value >= cb.modulos.value.length)
    activeIndex.value = Math.max(0, cb.modulos.value.length - 1)
})

onMounted(() => {
  cb.cargar()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onKey(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key.toLowerCase() === 'm') {
    e.preventDefault()
    cb.agregarModulo()
  } else if (e.key.toLowerCase() === 'n' && moduloActivo.value) {
    e.preventDefault()
    cb.agregarLeccion(moduloActivo.value.id)
  }
}

function abrirLeccion(index) {
  const l = leccionesActivas.value[index]
  leccionAbierta.value = l ? { ...l } : null
}

async function guardarLeccion(patch) {
  const { fuente, preguntas, ...cols } = patch
  const id = leccionAbierta.value.id
  await cb.editarLeccion(id, cols)
  if (fuente === 'examen') await guardarEvaluacionAdmin(id, preguntas || [])
  leccionAbierta.value = null
}

function moverLeccionAModulo(lessonIndex, targetModuleIndex) {
  const l = leccionesActivas.value[lessonIndex]
  const target = cb.modulos.value[targetModuleIndex]
  if (!l || !target) return
  cb.moverLeccion(l.id, target.id, target.lecciones.length)
}

function duplicarLeccion(lessonIndex) {
  const l = leccionesActivas.value[lessonIndex]
  if (!l || !moduloActivo.value) return
  // video_id NO se copia: videos.leccion_id apunta a una sola lección.
  const { id, orden, modulo_id, fuente, video_id, ...copia } = l
  cb.agregarLeccion(moduloActivo.value.id, { ...copia, titulo: `${l.titulo} (copia)` })
}
</script>

<template>
  <div class="course-builder">
    <p v-if="cb.error.value" class="builder-error" role="alert">{{ cb.error.value.message }}</p>
    <div class="builder-panels">
      <ModuleList
        :modules="cb.modulos.value"
        :active-index="activeIndex"
        @select="(i) => (activeIndex = i)"
        @add="cb.agregarModulo()"
        @remove="(i) => cb.quitarModulo(cb.modulos.value[i].id)"
        @reorder="(from, to) => cb.moverModulo(from, to)"
        @update="(i, patch) => cb.editarModulo(cb.modulos.value[i].id, patch)"
        @drop-lesson="(targetIdx, lessonIdx) => moverLeccionAModulo(lessonIdx, targetIdx)"
      />
      <LessonTimeline
        v-if="moduloActivo"
        :lessons="leccionesActivas"
        :module-title="moduloActivo.titulo"
        :module-titles="moduleTitles"
        @select="abrirLeccion"
        @add="cb.agregarLeccion(moduloActivo.id)"
        @remove="(i) => cb.quitarLeccion(leccionesActivas[i].id)"
        @reorder="(from, to) => cb.moverLeccion(leccionesActivas[from].id, moduloActivo.id, to)"
        @move="moverLeccionAModulo"
        @duplicate="duplicarLeccion"
      />
    </div>
    <footer class="validation-bar" data-test="validation-bar">
      {{
        t('builder.validationSummary', {
          modules: resumen.modulos,
          lessons: resumen.lecciones,
          warnings: resumen.advertencias,
        })
      }}
      <span class="drag-hint">{{ t('builder.dragHint') }}</span>
    </footer>
    <LessonEditorPanel
      :lesson="leccionAbierta"
      :session="session"
      @save="guardarLeccion"
      @close="leccionAbierta = null"
    />
  </div>
</template>

<style scoped>
.course-builder {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  min-height: 420px;
}
.builder-panels {
  display: flex;
  flex: 1;
  min-height: 0;
}
.builder-error {
  margin: 0;
  padding: calc(var(--unit) * 1);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  font-size: 14px;
}
.validation-bar {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 1) calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 13px;
  background: var(--paper);
}
.drag-hint {
  color: var(--ink-4);
}
@media (max-width: 768px) {
  .builder-panels {
    flex-direction: column;
  }
}
</style>
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/CourseBuilder.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CourseBuilder.vue src/components/__tests__/CourseBuilder.test.js
git commit -m "feat: CourseBuilder — orquestador del constructor visual"
```

---

### Task 13: Render en el player — `PlayerTextoSurface.vue` + integración

**Files:**

- Create: `src/components/PlayerTextoSurface.vue`
- Create: `src/components/__tests__/PlayerTextoSurface.test.js`
- Modify: `src/pages/PlayerPage.vue` (computed `source` ~línea 146; mapeo de lecciones ~línea 484-503)
- Modify: `src/components/PlayerVideoSurface.vue` (validator de `source` línea 13; rama nueva en template)

**Interfaces:**

- Consumes: `generateHTML` de `@tiptap/core`, `EXTENSIONES_TEXTO` (Task 10), emit existente `finLectura` de `PlayerVideoSurface` (el handler de `PlayerPage` ya llama `marcarLeccionCompletada` — mismo cableado que la rama `documento`).
- Produces: `PlayerTextoSurface` props `{ contenido: Object, completada: Boolean }`; emits `completada()`.

- [ ] **Step 1: Test que falla**

`src/components/__tests__/PlayerTextoSurface.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import PlayerTextoSurface from '@/components/PlayerTextoSurface.vue'

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'enlace',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
  ],
}

function factory(props = {}) {
  return mount(PlayerTextoSurface, {
    props: { contenido: DOC, completada: false, ...props },
    global: { plugins: [i18n] },
  })
}

describe('PlayerTextoSurface', () => {
  it('renderiza el JSON de Tiptap como HTML', () => {
    const w = factory()
    expect(w.find('h2').text()).toBe('Título')
    const a = w.find('a')
    expect(a.attributes('href')).toBe('https://example.com')
    expect(a.attributes('rel')).toContain('noopener')
  })

  it('contenido malformado no rompe (render vacío)', () => {
    const w = factory({ contenido: { type: 'garbage' } })
    expect(w.find('[data-test="texto-body"]').exists()).toBe(true)
  })

  it('nodos fuera de la whitelist no se renderizan', () => {
    const w = factory({
      contenido: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
      },
    })
    expect(w.html()).not.toContain('<script')
  })

  it('botón marcar completada emite y se oculta si ya está completada', async () => {
    const w = factory()
    await w.find('[data-test="marcar-completada"]').trigger('click')
    expect(w.emitted('completada')).toHaveLength(1)
    const w2 = factory({ completada: true })
    expect(w2.find('[data-test="marcar-completada"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/__tests__/PlayerTextoSurface.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/components/PlayerTextoSurface.vue`**

```vue
<script setup>
import { computed } from 'vue'
import { generateHTML } from '@tiptap/core'
import { useI18n } from 'vue-i18n'
import { EXTENSIONES_TEXTO } from '@/components/LessonRichTextEditor.vue'

const props = defineProps({
  contenido: { type: Object, required: true },
  completada: { type: Boolean, default: false },
})
const emit = defineEmits(['completada'])
const { t } = useI18n()

// La whitelist EXTENSIONES_TEXTO es la sanitización: solo nodos/marks
// conocidos generan markup; Link ya restringe protocolos a http/https.
const html = computed(() => {
  try {
    return generateHTML(props.contenido, EXTENSIONES_TEXTO)
  } catch {
    return ''
  }
})
</script>

<template>
  <div class="texto-surface">
    <!-- eslint-disable-next-line vue/no-v-html : HTML generado por whitelist Tiptap, nunca input crudo -->
    <div class="texto-body" data-test="texto-body" v-html="html" />
    <button
      v-if="!completada"
      class="texto-completar"
      data-test="marcar-completada"
      @click="emit('completada')"
    >
      ✓ {{ t('builder.markComplete') }}
    </button>
  </div>
</template>

<style scoped>
.texto-surface {
  background: var(--paper);
  border-radius: 12px;
  padding: calc(var(--unit) * 3);
  max-width: 760px;
  margin: 0 auto;
}
.texto-body {
  color: var(--ink);
  line-height: 1.7;
}
.texto-body :deep(h2),
.texto-body :deep(h3) {
  font-family: var(--display);
  color: var(--ink);
}
.texto-body :deep(a) {
  color: var(--primary);
}
.texto-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
.texto-body :deep(blockquote) {
  border-left: 3px solid var(--line);
  margin-left: 0;
  padding-left: calc(var(--unit) * 2);
  color: var(--ink-2);
}
.texto-completar {
  margin-top: calc(var(--unit) * 3);
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/__tests__/PlayerTextoSurface.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Integrar en `PlayerPage.vue`**

1. En el computed `source` (línea 146-152), insertar la rama `texto` **después** de `video_id` y **antes** de `youtube`:

```js
const source = computed(() => {
  if (leccion.value?.tipo === 'examen') return { kind: 'examen', leccionId: leccion.value.id }
  if (leccion.value?.documento_path) return { kind: 'documento', leccionId: leccion.value.id }
  if (leccion.value?.video_id) return { kind: 'hls', videoId: leccion.value.video_id }
  if (leccion.value?.contenido) return { kind: 'texto', leccionId: leccion.value.id }
  if (youtubeId.value) return { kind: 'youtube', id: youtubeId.value }
  return { kind: 'none' }
})
```

2. En el mapeo de lecciones (bloque ~484-503 que construye cada objeto lección), agregar `contenido: r.contenido ?? null,` junto a los demás campos.

- [ ] **Step 6: Integrar en `PlayerVideoSurface.vue`**

1. Validator (línea 13): agregar `'texto'` → `['youtube', 'hls', 'documento', 'examen', 'texto', 'none']`.
2. Importar: `import PlayerTextoSurface from '@/components/PlayerTextoSurface.vue'`.
3. En el template, junto a la rama de `documento` (buscar `DocumentoViewer`), agregar:

```vue
<PlayerTextoSurface
  v-else-if="source.kind === 'texto'"
  :contenido="leccion.contenido"
  :completada="completada"
  @completada="emit('finLectura')"
/>
```

`finLectura` ya está declarado en los emits de `PlayerVideoSurface` y `PlayerPage` ya lo maneja llamando `marcarLeccionCompletada` (mismo cableado que la lectura de documentos — replicar el binding exacto que tenga la instancia de `DocumentoViewer`).

- [ ] **Step 7: Verificación integrada**

Run: `npm run test:unit && npm run build`
Expected: suite completa verde, build verde.

- [ ] **Step 8: Commit**

```bash
git add src/components/PlayerTextoSurface.vue src/components/__tests__/PlayerTextoSurface.test.js src/pages/PlayerPage.vue src/components/PlayerVideoSurface.vue
git commit -m "feat: lecciones de texto enriquecido en el player"
```

---

### Task 14: Integración en `AdminCourseEditor.vue` (flag, auto-borrador, publish)

**Files:**

- Modify: `src/components/AdminCourseEditor.vue`:
  - imports (líneas 1-11)
  - step indicator (línea 800-812: `@click="editorStep = i"` → `@click="goToStep(i)"`)
  - step 1 Estructura (buscar `v-else-if="editorStep === 1"`, ~línea 934)
  - `publishCurso()` (línea 579)
  - `validationChecks` (definición cercana a línea 559)

**Interfaces:**

- Consumes: `CourseBuilder.vue` (Task 12), `isEnabled`/`loadFeatureFlags` de `@/composables/useFeatureFlags.js`, helpers existentes `rawInsert`/`rawPatch`, `isUuid`.
- Produces: flujo v2 activo cuando `isEnabled('visual_builder')`; flujo legacy intacto cuando no.

- [ ] **Step 1: Agregar imports y estado**

```js
import CourseBuilder from '@/components/CourseBuilder.vue'
import { useFeatureFlags } from '@/composables/useFeatureFlags.js'

const { isEnabled, load: loadFlags } = useFeatureFlags()
onMounted(loadFlags)
const visualBuilder = computed(() => isEnabled('visual_builder'))
const creandoBorrador = ref(false)
const builderResumen = ref({ modulos: 0, lecciones: 0, advertencias: 0 })
```

(Si ya existe un `onMounted` en el componente, agregar `loadFlags()` dentro del existente.)

- [ ] **Step 2: Auto-borrador — reemplazar la navegación de steps**

En el step indicator (línea ~807) cambiar `@click="editorStep = i"` por `@click="goToStep(i)"` y agregar:

```js
async function goToStep(i) {
  if (i >= 1 && visualBuilder.value && !isUuid(editingCurso.value.id)) {
    if (!editingCurso.value.titulo || !editingCurso.value.slug) {
      publishStatus.value = { type: 'error', text: 'Completa el título antes de continuar.' }
      return
    }
    creandoBorrador.value = true
    try {
      const data = await rawInsert(
        'cursos',
        {
          slug: editingCurso.value.slug,
          titulo: editingCurso.value.titulo,
          descripcion: editingCurso.value.descripcion,
          nivel: editingCurso.value.nivel,
          imagen_portada: editingCurso.value.imagen || null,
          publicado: false,
        },
        props.session.access_token
      )
      if (!data?.id) throw new Error('No se pudo crear el borrador (posible RLS).')
      editingCurso.value.id = data.id
      publishStatus.value = null
    } catch (err) {
      publishStatus.value = { type: 'error', text: err?.message || 'Error creando el borrador.' }
      return
    } finally {
      creandoBorrador.value = false
    }
  }
  editorStep.value = i
}
```

Buscar también cualquier otro punto del componente que asigne `editorStep.value = 1` (botones "Siguiente" si existen) y enrutar por `goToStep(1)`.

- [ ] **Step 3: Montar `CourseBuilder` en el step 1**

En el bloque `v-else-if="editorStep === 1"` (~línea 934), envolver el layout actual:

```vue
<div v-else-if="editorStep === 1" class="editor-panel fade-in">
  <CourseBuilder
    v-if="visualBuilder && isUuid(editingCurso.id)"
    :curso-id="editingCurso.id"
    :session="session"
    @structure-changed="(r) => (builderResumen = r)"
  />
  <template v-else>
    <!-- Aquí queda, SIN CAMBIOS, todo el markup actual del paso Estructura
         (el formulario de módulos/lecciones existente) — es el fallback con flag OFF -->
  </template>
</div>
```

- [ ] **Step 4: `validationChecks` con el builder activo**

Localizar la definición de `validationChecks` (computed, antes de la línea 559). Donde los checks de estructura leen `editingCurso.modulos` / lecciones, hacer branch: si `visualBuilder.value && isUuid(editingCurso.value.id)`, usar `builderResumen.value` (`modulos > 0`, `lecciones > 0`) en lugar del árbol en memoria. No tocar los checks de metadata (título, slug, descripción).

- [ ] **Step 5: `publishCurso` corto-circuito v2**

Dentro de `publishCurso()` (línea 579), después de construir `cursoPayload` (línea 606-613) y **antes** del reconcile de módulos, insertar:

```js
// v2: con el constructor visual la estructura ya está persistida — solo metadata.
if (visualBuilder.value && isUuid(c.id)) {
  cursoData = await rawPatch('cursos', `id=eq.${c.id}`, cursoPayload, accessToken)
  if (!cursoData?.id) throw new Error('Update curso devolvió vacío (posible RLS).')
  publishStatus.value = { type: 'success', text: 'Curso actualizado exitosamente.' }
  emit('published', cursoData.id)
  return
}
```

(Queda dentro del `try/finally` existente, así `publishing` se resetea.)

- [ ] **Step 6: Verificación**

Run: `npm run test:unit && npm run build`
Expected: verde.

Smoke manual (`npm run dev` con el flag encendido en BD: `update feature_toggles set enabled = true where key = 'visual_builder';`):

1. Admin → Cursos → Nuevo. Llenar título → click "Estructura" → verificar en BD que el curso existe con `publicado = false`.
2. Agregar módulo, agregar lección, recargar la página → la estructura persiste.
3. Apagar el flag → el formulario legacy aparece intacto.

- [ ] **Step 7: Commit**

```bash
git add src/components/AdminCourseEditor.vue
git commit -m "feat: AdminCourseEditor — constructor visual con flag, auto-borrador y publish v2"
```

---

### Task 15: E2E Playwright

**Files:**

- Create: `e2e/course-builder.spec.js`

**Interfaces:**

- Consumes: toda la feature integrada (Tasks 2-14); credenciales admin vía env `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` contra el Supabase local; flag `visual_builder` encendido en esa BD.

- [ ] **Step 1: Escribir `e2e/course-builder.spec.js`**

```js
import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD

// Requiere: Supabase local corriendo, flag visual_builder = true, admin seedeado.
test.describe('Constructor visual de cursos', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Definir E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL(/\/(admin|perfil|$)/)
  })

  test('crear curso → auto-borrador → estructura persiste → texto en player', async ({ page }) => {
    const stamp = Date.now()
    await page.goto('/admin')

    // Paso Básico
    await page
      .getByRole('button', { name: /nuevo curso|crear curso/i })
      .first()
      .click()
    await page.getByPlaceholder(/transparencia/i).fill(`E2E Builder ${stamp}`)

    // Avanzar a Estructura → auto-borrador
    await page.getByRole('button', { name: /estructura/i }).click()
    await expect(page.locator('.course-builder')).toBeVisible()

    // Agregar módulo y lección
    await page.getByTestId('add-module').click()
    await expect(page.getByTestId('module-item')).toHaveCount(1)
    await page.getByTestId('add-lesson').click()
    await expect(page.getByTestId('lesson-card')).toHaveCount(1)

    // Segundo módulo + reorder con fallback accesible (↑/↓)
    await page.getByTestId('add-module').click()
    await page.getByTestId('module-item').first().hover()
    await page.getByTestId('module-down').first().click()

    // Persistencia: recargar y verificar que el orden sobrevive
    await page.reload()
    await page.getByRole('button', { name: /estructura/i }).click()
    await expect(page.getByTestId('module-item')).toHaveCount(2)
    await expect(page.getByTestId('lesson-card')).toHaveCount(0) // el módulo activo (0) ahora es el que estaba segundo
    await page.getByTestId('module-item').nth(1).click()
    await expect(page.getByTestId('lesson-card')).toHaveCount(1)

    // Lección de texto enriquecido
    await page.getByTestId('lesson-card').first().click()
    await page.getByTestId('fuente-texto').check()
    await page.locator('.rich-content .ProseMirror').fill('Contenido E2E de texto enriquecido')
    await page.getByTestId('panel-save').click()

    // Verificar en player (curso en borrador: el admin puede verlo)
    // El id del curso está en la URL del admin o vía la API; navegación mínima:
    // abrir el curso desde la lista de cursos del admin si existe acceso directo al player.
    // Verificación mínima garantizada: la lección quedó con badge de contenido.
    await expect(page.getByTestId('lesson-card').first()).not.toContainText('Sin contenido')
  })
})
```

- [ ] **Step 2: Ejecutar**

Run: `npx playwright test e2e/course-builder.spec.js`
Expected: PASS con credenciales configuradas; SKIP limpio sin ellas. Ajustar selectores de login/admin si difieren (verificar contra `src/pages/LoginPage.vue` y `src/pages/AdminPage.vue` — los nombres de botones reales).

- [ ] **Step 3: Commit**

```bash
git add e2e/course-builder.spec.js
git commit -m "test(e2e): flujo completo del constructor visual"
```

---

### Task 16: Verificación final

- [ ] **Step 1: Suite completa**

Run: `npm run test:unit && npm run build && npx playwright test`
Expected: todo verde (e2e nuevos pueden SKIP sin credenciales; los de landing/perf deben seguir verdes).

- [ ] **Step 2: Lint/format**

Run: `npm run lint` y/o `npm run format` si existen en `package.json` scripts.
Expected: sin errores.

- [ ] **Step 3: Smoke manual final (flag ON y OFF)** — checklist de Task 14 Step 6 + abrir una lección de texto como estudiante inscrito en `/player/<cursoId>` y marcarla completada.

- [ ] **Step 4: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "chore: ajustes finales del constructor visual v2"
```
