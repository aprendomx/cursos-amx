# Design Spec: Constructor Visual de Cursos (Panel Dual)

> Fecha: 2026-07-04 · v2: 2026-07-05
> Estado: Aprobado por usuario (v1 y v2)
> Alcance: Reemplazar el paso "Estructura" de `AdminCourseEditor.vue` con una interfaz visual drag & drop de módulos + timeline horizontal de lecciones.
>
> **v2 (2026-07-05):** incorpora del prompt externo `tmp/prompt-cursos-amx.md` las capacidades que no contemplaba v1: **persistencia incremental** (RPCs de reorder + orden fraccional, secciones 14-16), **lecciones de texto enriquecido con Tiptap** (sección 17) y su **render en PlayerPage** (sección 18). Donde v2 contradice a v1 (modelo de persistencia de §3 y §7), v2 manda. El resto del prompt externo se descartó por partir de supuestos incorrectos (proponía crear tablas `modulos`/`lecciones` que existen desde `001_schema.sql`).

---

## 1. Objetivo

El constructor actual de cursos en `AdminCourseEditor.vue` (step 1 — Estructura) presenta módulos y lecciones como campos de texto verticales con botones ↑/↓. Es funcional pero lento y poco intuitivo para cursos con más de 3 módulos o 10 lecciones.

Este spec define un **constructor visual dual** que permite:

- Reordenar módulos y lecciones vía **drag & drop**.
- Visualizar el **flujo del curso** como una línea de tiempo horizontal por módulo.
- Mover lecciones entre módulos arrastrando.
- Editar lecciones en un **slide-over** sin perder contexto visual.

---

## 2. Arquitectura de Componentes

### Nuevos componentes

| Componente              | Responsabilidad                                                                                                                                                 | Props principales                                                                 | Emits principales                                                                                                              |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `CourseBuilder.vue`     | Orquestador. Carga la estructura vía `fetchEstructura` y persiste incrementalmente (v2, §15-16). Integra `ModuleList` + `LessonTimeline` + `LessonEditorPanel`. | `cursoId: string`                                                                 | `structure-changed({ modulos, lecciones, advertencias })`                                                                      |
| `ModuleList.vue`        | Sidebar izquierda. Lista vertical de módulos. Drag & drop vertical. Añadir/eliminar/expandir.                                                                   | `modules: ModuleNode[]`, `activeIndex: number`                                    | `reorder(from, to)`, `add()`, `remove(index)`, `select(index)`, `update(index, patch)`                                         |
| `ModuleListItem.vue`    | Tarjeta individual de módulo en la lista. Handle de drag, portada miniatura, conteo de lecciones.                                                               | `module: ModuleNode`, `index: number`, `isActive: boolean`, `isDragging: boolean` | — (solo visual, eventos via slot o click bubbling)                                                                             |
| `LessonTimeline.vue`    | Timeline horizontal del módulo activo. Lecciones como tarjetas anchas. Drag & drop horizontal.                                                                  | `lessons: LessonNode[]`, `moduleTitle: string`                                    | `reorder(from, to)`, `move(lessonIndex, targetModuleIndex)`, `add()`, `remove(index)`, `select(index)`, `update(index, patch)` |
| `LessonCard.vue`        | Tarjeta de lección en timeline. Miniatura, título, duración, tipo, badges. Menú ⋯.                                                                              | `lesson: LessonNode`, `index: number`, `isDragging: boolean`                      | `edit()`, `duplicate()`, `delete()`, `dragstart()`, `dragend()`                                                                |
| `LessonEditorPanel.vue` | Slide-over derecho (~480px) para editar contenido de una lección. Reutiliza `VideoUploadField`, `DocumentoUploadField`, `EvaluacionEditor`.                     | `lesson: LessonNode \| null`                                                      | `save(patch: Partial<LessonNode>)`, `close()`                                                                                  |

### Componentes reutilizados (existentes)

- `VideoUploadField.vue` — subida de video HLS.
- `DocumentoUploadField.vue` — subida de documento.
- `EvaluacionEditor.vue` — editor de preguntas de examen.
- `IconSet.vue` — íconos de tipo de lección.
- `PlaceholderImage.vue` — placeholder cuando no hay miniatura.
- `useErrorHandler.ts` — captura y toast de errores.

### Componente refactorizado

- `AdminCourseEditor.vue` — el step 1 (Estructura) se simplifica a un wrapper que monta `CourseBuilder` y recibe `update` para sincronizar `editingCurso`. Los steps 0 (Básico) y 2 (Revisar) no cambian.

---

## 3. Data Model y Estado

### Interfaces

```typescript
interface CourseBuilderState {
  id: string
  slug: string
  titulo: string
  descripcion: string
  nivel: string
  idioma: string
  imagen: string
  publicado: boolean
  modulos: ModuleNode[]
}

interface ModuleNode {
  id: string
  titulo: string
  descripcion: string
  imagen_portada: string
  requiere_previo: boolean
  lecciones: LessonNode[]
  // Campos UI-only (no se persisten)
  _expanded?: boolean
  _portadaUploading?: boolean
  _portadaProgress?: number
  _portadaError?: string
}

interface LessonNode {
  id: string
  titulo: string
  tipo: 'video' | 'lectura' | 'evaluación' | 'actividad'
  fuente: 'youtube' | 'hls' | 'documento' | 'examen' | 'texto' | 'ninguno' // v2: + 'texto'
  contenido: object | null // v2: JSON de Tiptap, solo fuente 'texto'
  youtube_url: string
  duracion: string // mm:ss
  video_id: string | null
  documento_path: string | null
  documento_tipo: string | null
  requiere_entrega: boolean
  entrega_tipos_csv: string
  entrega_max_mb: number
  eval_puntaje_minimo: number
  eval_max_intentos: number
  preguntas: any[]
  // Campos UI-only
  _dragging?: boolean
}
```

### Flujo de comunicación

```
AdminCourseEditor.vue (step 1)
  └── CourseBuilder.vue (state maestro)
        ├── ModuleList.vue  ←──→  reorder / add / remove / select / update
        │     └── ModuleListItem.vue (visual)
        ├── LessonTimeline.vue  ←──→  reorder / move / add / remove / select / update
        │     └── LessonCard.vue (visual)
        └── LessonEditorPanel.vue  ←──→  save / close
```

**Reglas de inmutabilidad:**

- `CourseBuilder.vue` produce nuevos arrays en cada operación (`map`, `filter`, `toSpliced`).
- Componentes hijos **nunca** mutan props. Emiten eventos al padre.
- Esto habilita **undo/redo futuro** vía stack de snapshots de `CourseBuilderState`.

### Normalización de datos

> **Sustituido en v2.** v1 mantenía todo el árbol en memoria y lo convertía al formato legacy de `editingCurso` para que `publishCurso()` hiciera un reconcile completo al final. En v2 el constructor **persiste incrementalmente** cada operación (ver secciones 14-16): `CourseBuilder.vue` carga la estructura con `fetchEstructura(cursoId)` al montarse y cada alta/edición/reorden se guarda al instante con actualización optimista. `editingCurso` solo conserva la metadata del curso (paso Básico/Revisar); la estructura ya no viaja por `publishCurso`.

---

## 4. UI/UX Detallada

### Layout del panel dual

```
┌─────────────────────────────────────────────────────────────┐
│  ← Básico    [ Estructura ]    Revisar →                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────┐ │
│  │  MÓDULOS      │  │  TIMELINE: Módulo 2 — Finanzas     │ │
│  │               │  │                                     │ │
│  │  ≡ M1 Fund.  │  │  [≡]  [≡]  [≡]  [≡]  [≡]  [ + ]  │ │
│  │  ≡ M2 Fin.   │◄─┤  Vid   Doc   Exam  Vid   Act      │ │
│  │  ≡ M3 Av.    │  │  12m   PDF   70%   8m    —         │ │
│  │               │  │  Título de cada lección...          │ │
│  │  + Agregar    │  │                                     │ │
│  │    módulo     │  │  ◄────── scroll horizontal ──────► │ │
│  │               │  │                                     │ │
│  │  (hover para  │  │  Duración total: 2h 34m             │ │
│  │   ver menú    │  │  5 lecciones · 2 sin contenido      │ │
│  │   de acciones)│  └─────────────────────────────────────┘ │
│  └──────────────┘                                           │
│                                                             │
│  Barra de validación: ✓ 5 módulos · 23 lecciones · 1 vacía │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar de módulos (`ModuleList.vue`)

- **Ancho:** 260px fijo.
- **Fondo:** `var(--paper)` con borde derecho `var(--line)`.
- **Módulo activo:** Borde izquierdo 3px `var(--primary)`, fondo `var(--paper-2)`.
- **Módulo inactivo:** Borde izquierdo transparente.
- **Handle de drag:** `≡` a la izquierda del título, color `var(--ink-4)`, cursor `grab`.
- **Ghost element al arrastrar:** Opacity 0.6, sombra suave, escala 1.02.
- **Drop indicator:** Línea horizontal punteada 2px `var(--primary)` entre módulos.
- **Acciones por módulo (hover):** menú `⋯` con "Editar nombre/descripción", "Subir portada", "Duplicar", "Eliminar".
- **Estado vacío:** Ilustración + "Comienza agregando tu primer módulo".

### Timeline de lecciones (`LessonTimeline.vue`)

- **Orientación:** Horizontal con scroll (`overflow-x: auto`).
- **Fondo:** `var(--paper-2)`.
- **Header:** Título del módulo activo + duración total + conteo de lecciones.
- **Tarjetas de lección:** Ancho fijo 200px, altura 140px, borde 1px `var(--line)`, border-radius 8px.
- **Contenido de tarjeta:**
  - Área superior (60%): miniatura o ícono de tipo (`video`, `doc`, `exam`, `activity`).
  - Área inferior (40%): título truncado a 2 líneas, chip de tipo, duración.
  - Esquina superior derecha: menú `⋯`.
- **Badges:**
  - "📎 Entrega" si `requiere_entrega`.
  - "📝 Examen" si `fuente === 'examen'`.
  - "⚠️ Sin contenido" si fuente es `'ninguno'` (fondo amarillo sutil).
- **Nueva lección:** Botón `+` al final del timeline como tarjeta dashed outline.
- **Drag entre timelines:** Al arrastrar una lección fuera de su timeline hacia la sidebar, el módulo target se resalta. Al soltar, se emite `move(lessonIndex, targetModuleIndex)`.
- **Estado vacío:** "Arrastra lecciones aquí o haz clic en +".

### Slide-over de edición (`LessonEditorPanel.vue`)

- **Posición:** Fixed, right 0, top 0, bottom 0. Width 480px.
- **Backdrop:** Overlay semitransparente (`rgba(0,0,0,0.15)`) que cierra al click.
- **Animación:** Slide desde derecha (transform translateX), 200ms ease.
- **Contenido:**
  - Header: título de lección + botón cerrar.
  - Campos: título, tipo, fuente (radio group), inputs condicionales por fuente (YouTube URL, video upload, documento upload, examen editor).
  - Entrega: checkbox + tipos + max MB.
  - Evaluación: puntaje mínimo, intentos máximos (solo si examen).
- **Acciones:** "Guardar" (cierra panel, emite `save`), "Cancelar" (descarta, cierra).
- **Error inline:** Si `EvaluacionEditor` o upload fallan, mensaje rojo en panel sin cerrar.

### Barra de validación (inferior)

- Resumen en tiempo real: número de módulos, lecciones, advertencias (vacías).
- Se integra con el `validationChecks` existente de `AdminCourseEditor`.

---

## 5. Librería de Drag & Drop

**Elegida:** `vue-draggable-plus` (wrapper de SortableJS para Vue 3).

**Motivos:**

- SortableJS es maduro, estable, sin dependencias pesadas.
- Soporta listas anidadas (módulos en sidebar, lecciones en timeline) y drag entre listas (`group` option).
- Accessible: soporta fallback de teclado nativo.
- Ghost elements y animaciones fluidas sin configuración compleja.
- Compatible con Vue 3 reactivity (no requiere hacks de DOM).

**Alternativas descartadas:**

- `@vueuse/gesture`: más enfocado a gestos táctiles generales, menos robusto para sortable lists.
- `vuedraggable` (legacy): solo Vue 2, no Vue 3.
- HTML5 Drag & Drop API nativa: inconsistente entre navegadores, requiere mucho boilerplate.

---

## 6. Feature Flag

- Nombre: `visual_builder`.
- Comportamiento: si `featureEnabled('visual_builder')` es `true`, el step 1 de `AdminCourseEditor` monta `CourseBuilder.vue`. Si es `false`, se usa el layout de formularios actual como fallback.
- Permite deploy progresivo y rollback inmediato sin cambiar código.

---

## 7. Integración con `AdminCourseEditor.vue` (revisado en v2)

1. **Importar:** `import CourseBuilder from '@/components/CourseBuilder.vue'`.
2. **Auto-borrador (v2):** al avanzar del paso Básico (step 0) al paso Estructura (step 1) en un curso **nuevo** con el flag activo, se inserta el curso con `publicado: false` (metadata del paso Básico) y se obtiene su `cursoId`. Desde ahí toda la estructura persiste incrementalmente contra ese id. Si el insert falla, no se avanza de paso y se muestra el error.
3. **Condicional en step 1:**
   ```vue
   <div v-else-if="editorStep === 1" class="editor-panel fade-in">
     <CourseBuilder
       v-if="featureEnabled('visual_builder')"
       :curso-id="editingCurso.id"
       @structure-changed="onStructureChanged"
     />
     <template v-else>
       <!-- layout actual de formularios (preservado como fallback) -->
     </template>
   </div>
   ```
   `structure-changed` emite conteos (módulos, lecciones, advertencias) para la barra de validación y `validationChecks`; ya no emite el árbol completo.
4. **`publishCurso` (v2):** con flag activo se simplifica a: patch de metadata de `cursos` + `publicado: true`. **Con flag apagado, el flujo legacy queda intacto** (formulario + reconcile completo con `rawInsert`/`rawPatch`/`rawDelete`) — ese es el mecanismo de rollback de §6. El reconcile legacy sigue funcionando con `orden` float (escribe `li + 1`); sin los `unique` constraints, su truco de orden negativo en dos pasadas se vuelve inofensivo y podrá retirarse cuando el flag gradúe.

---

## 8. Error Handling

| Escenario                                                              | Comportamiento                                                                                                                                  |
| :--------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| Error de upload de portada (módulo)                                    | Toast en esquina inferior derecha vía `useErrorHandler`. Portada vuelve a estado anterior.                                                      |
| Error de upload de video/documento (lección)                           | Toast. Lección conserva `video_id`/`documento_path` anterior.                                                                                   |
| Error al guardar evaluación                                            | Panel de edición **no se cierra**. Mensaje inline en rojo. Usuario puede reintentar.                                                            |
| Drag & drop falla (suelta fuera de zona)                               | Lección/módulo vuelve a posición original automáticamente. Sin toast.                                                                           |
| Falla la persistencia de una operación (RPC/insert/update/delete) — v2 | Rollback optimista: el árbol vuelve al snapshot previo a la operación + toast vía `useErrorHandler`. Error `42501` → mensaje de permisos.       |
| Falla el auto-borrador al entrar a Estructura — v2                     | No se avanza de paso; error inline en el wizard.                                                                                                |
| Falla el autosave del editor Tiptap — v2                               | Indicador "Sin guardar" en el panel; reintento al siguiente cambio o al cerrar. El panel no se cierra con cambios sin guardar sin confirmación. |
| Eliminar módulo con lecciones                                          | Confirmación `confirm()` con conteo de lecciones que se perderán.                                                                               |
| Eliminar lección tipo examen con intentos de alumnos                   | Bloqueado (misma lógica actual de `AdminCourseEditor`).                                                                                         |

---

## 9. Testing

### Tests unitarios (Vue Test Utils)

| Suite                                 | Casos                                                                                                                                                                                                                                      |
| :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CourseBuilder.spec.js`               | 1. Renderiza módulos y timeline. 2. Emite `update` tras reordenar módulo. 3. Emite `update` tras mover lección entre módulos. 4. Abre/closes `LessonEditorPanel`.                                                                          |
| `ModuleList.spec.js`                  | 1. Renderiza lista de módulos. 2. Click activa módulo. 3. Emite `reorder` con índices correctos. 4. Emite `add` al click en "+". 5. Emite `remove` con confirmación.                                                                       |
| `LessonTimeline.spec.js`              | 1. Renderiza tarjetas de lección. 2. Emite `reorder` con índices. 3. Emite `move` con lessonIndex y targetModuleIndex. 4. Click en tarjeta emite `select`.                                                                                 |
| `LessonEditorPanel.spec.js`           | 1. Renderiza campos de lección. 2. Editar título emite `save` con patch. 3. Click cancelar emite `close` sin `save`. 4. Error de `EvaluacionEditor` se muestra inline.                                                                     |
| `LessonCard.spec.js`                  | 1. Muestra badge correcto por tipo de fuente. 2. Muestra "Sin contenido" si fuente es `'ninguno'`. 3. Menú ⋯ emite `edit`/`duplicate`/`delete`.                                                                                            |
| `useCourseReorder.spec.js` (v2)       | 1. Insertar entre vecinos = promedio. 2. Al inicio = `min − 1`; al final = `max + 1`. 3. Gap < épsilon dispara renormalización `1..n`. 4. Mover entre módulos produce `{id, modulo_id, orden}` correcto.                                   |
| `courseBuilder.test.js` (service, v2) | Patrón `mockChain` de `src/services/__tests__/cursos.test.js`: 1. `fetchEstructura` anida y ordena. 2. Escrituras lanzan en error. 3. `reordenar*` llaman `supabase.rpc` con payload correcto. 4. Escrituras invalidan cache `/^cursos:/`. |
| `useCourseBuilder.spec.js` (v2)       | 1. Operación exitosa persiste y actualiza árbol. 2. Operación fallida hace rollback al snapshot. 3. Operaciones concurrentes se serializan en orden.                                                                                       |
| `LessonRichTextEditor.spec.js` (v2)   | 1. Monta Tiptap con contenido inicial. 2. Autosave debounced emite JSON (`getJSON()`), no HTML. 3. Cambios sin guardar bloquean cierre sin confirmar.                                                                                      |

### E2E (Playwright, v2)

`e2e/course-builder.spec.js`: login admin → crear curso (paso Básico) → avanzar a Estructura (verifica auto-borrador en BD) → agregar 2 módulos y 3 lecciones → drag & drop de reorden → **recargar la página y verificar que el orden persistió** → crear lección de texto con Tiptap → abrir el curso en PlayerPage y verificar el render del contenido.

### Mock de SortableJS

En tests unitarios, `vue-draggable-plus` se mockea para evitar dependencia de DOM real:

- Simular eventos de drag vía props de control (SortableJS permite `options.onStart/onEnd/onAdd/onRemove`).
- O usar `fireEvent` de Testing Library para simular interacciones.

---

## 10. Reutilización de infraestructura existente

| Base v0.2.1                | Uso en constructor visual                                                         |
| :------------------------- | :-------------------------------------------------------------------------------- |
| `useFeatureFlags.js`       | Flag `visual_builder` para activar/desactivar.                                    |
| `useErrorHandler.ts`       | Toasts de error en uploads y operaciones.                                         |
| `i18n` (`vue-i18n`)        | Traducir labels del constructor ("Módulos", "Timeline", "Agregar lección", etc.). |
| `ui.ts` (dark mode)        | `LessonCard`, `ModuleListItem`, `LessonEditorPanel` respetan tema oscuro.         |
| `VideoUploadField.vue`     | Reutilizado en panel de edición de lección.                                       |
| `DocumentoUploadField.vue` | Reutilizado en panel de edición.                                                  |
| `EvaluacionEditor.vue`     | Reutilizado en panel de edición para exámenes.                                    |
| `IconSet.vue`              | Íconos de tipo de lección y acciones.                                             |
| `PlaceholderImage.vue`     | Miniaturas vacías en tarjetas.                                                    |

---

## 11. Accesibilidad

- **Drag & drop secundario:** Siempre disponen botones ↑/↓ y "Mover a..." como fallback.
- **Atajos de teclado:**
  - `Ctrl+N`: nueva lección en módulo activo.
  - `Ctrl+M`: nuevo módulo.
  - `Delete`: eliminar lección/módulo seleccionado.
  - `Esc`: cerrar `LessonEditorPanel`.
- **ARIA:**
  - `role="list"` / `role="listitem"` en módulos y lecciones.
  - `aria-grabbed`, `aria-dropeffect` en handles de drag.
  - `aria-expanded` en módulos colapsables (si aplica).
- **Focus management:** Al abrir `LessonEditorPanel`, focus va al primer campo. Al cerrar, focus vuelve a la tarjeta de lección que lo abrió.

---

## 12. Riesgos y Mitigaciones

| Riesgo                                                                                                                          | Mitigación                                                                                                                                                                                                 |
| :------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SortableJS + Vue 3 reactivity produce glitches                                                                                  | Usar `vue-draggable-plus` (wrapper oficialmente mantenido). Testear reordenamiento en Chrome, Firefox, Safari.                                                                                             |
| Performance con 50+ lecciones                                                                                                   | Virtualización del timeline si se detecta >30 lecciones (renderizado lazy con Intersection Observer).                                                                                                      |
| Mobile: drag & drop no funciona bien                                                                                            | En viewports <768px, `CourseBuilder` cambia a layout vertical apilado (lista de lecciones dentro de módulo, sin timeline horizontal). Drag deshabilitado, botones de reorder visibles.                     |
| Estado complejo desincronizado                                                                                                  | Inmutabilidad estricta. Cada operación produce nuevo state. Undo/redo futuro valida consistencia.                                                                                                          |
| Usuarios acostumbrados al formulario actual                                                                                     | Feature flag permite rollback inmediato. Documentación breve en-panel (tooltip "Nuevo constructor visual — arrastra para reordenar").                                                                      |
| Dos escritores de estructura conviven mientras el flag esté activo a medias (builder incremental vs `publishCurso` legacy) — v2 | El flag gobierna por sesión de edición completa: un curso se edita con uno u otro flujo, nunca mezclados. El reconcile legacy es compatible con `orden` float. Al graduar el flag, se retira el reconcile. |
| Drags rápidos consecutivos generan carreras de persistencia — v2                                                                | Cola serializada en `useCourseBuilder` (§16); cada operación espera a la anterior.                                                                                                                         |
| Agotamiento de precisión del orden fraccional — v2                                                                              | Renormalización automática a `1..n` cuando el gap entre vecinos < 1e-9 (§16).                                                                                                                              |

---

## 13. Métricas de Éxito

- Un administrador puede crear un curso de 5 módulos y 20 lecciones en **menos de 5 minutos** (vs. ~15 minutos actuales estimados).
- Reordenar 10 lecciones toma **<10 segundos** con drag & drop (vs. 30+ clicks actuales).
- **0 reportes** de pérdida de datos por drag & drop en las primeras 2 semanas post-deploy.
- Lighthouse accessibility score **≥90** en la vista de constructor.

---

## 14. Migración `032_course_builder.sql` (v2)

Las tablas `modulos` y `lecciones` existen desde `001_schema.sql` — esta migración las **extiende**, no las recrea. El siguiente número libre es `032` (`031_worker_scaling.sql` está ocupado).

1. **Orden fraccional:**
   - `alter table public.modulos alter column orden type double precision;` (ídem `lecciones`).
   - Eliminar los constraints `unique (curso_id, orden)` y `unique (modulo_id, orden)` (verificar nombre real con `\d` o `pg_constraint`; por defecto `modulos_curso_id_orden_key` / `lecciones_modulo_id_orden_key`). Son incompatibles con reorden incremental y hoy obligan al truco de orden negativo de `publishCurso`.
   - `create index idx_modulos_curso_orden on public.modulos (curso_id, orden);` e ídem `idx_lecciones_modulo_orden on public.lecciones (modulo_id, orden)`.
   - `PlayerPage` no se afecta: ordena client-side por `modulos.orden || lecciones.orden` (`PlayerPage.vue:469`), igual de válido con floats.

2. **Texto enriquecido:** `alter table public.lecciones add column contenido jsonb;` Una lección de texto es `tipo_material = 'lectura'` + `contenido` no nulo. **No** se amplía el enum `tipo_material` (`alter type ... add value` es problemático dentro de la transacción de la migración y `'lectura'` ya es semánticamente correcto).

3. **RPCs de reorder** — convención del repo (`language plpgsql security definer set search_path = public`, validación interna con `raise exception ... using errcode = '42501'`, `revoke all from public` + `grant execute to authenticated`, como `moderar_comentario` en `023`):
   - `reordenar_modulos(items jsonb)` — `items = [{id, orden}]`. Antes de aplicar, valida que **todos** los módulos del batch pertenezcan a cursos donde `public.is_instructor_de(curso_id)`; si alguno falla → `42501` y no se aplica nada (atómico).
   - `reordenar_lecciones(items jsonb)` — `items = [{id, modulo_id, orden}]` (permite mover entre módulos). Valida permiso sobre cada lección **y** que el `modulo_id` destino pertenezca al **mismo curso** que el módulo origen (impide fugas de lecciones a cursos ajenos).

4. **Feature flag runtime:** `insert into public.feature_toggles (key, enabled) values ('visual_builder', false) on conflict (key) do nothing;` El frontend lo consume vía `useFeatureFlags` (runtime > build-time, con fallback a `VITE_FEATURE_*`).

---

## 15. Capa de datos: `src/services/courseBuilder.js` (v2)

Patrón exacto de `cursos.js`: JavaScript, `import { supabase } from '@/lib/supabase.js'`, `if (error) throw error` (lanza, no retorna `{data, error}`), naming en español, `invalidateCache(/^cursos:/)` tras toda escritura (player y catálogo cachean estructura).

```js
export async function fetchEstructura(cursoId)        // modulos + lecciones anidadas, orden asc
export async function crearModulo(cursoId, datos)     // orden = max + 1
export async function actualizarModulo(id, datos)
export async function eliminarModulo(id)              // cascade borra lecciones
export async function crearLeccion(moduloId, datos)   // orden = max + 1
export async function actualizarLeccion(id, datos)    // incluye contenido jsonb (Tiptap)
export async function eliminarLeccion(id)
export async function reordenarModulos(items)         // supabase.rpc('reordenar_modulos', { items })
export async function reordenarLecciones(items)       // supabase.rpc('reordenar_lecciones', { items })
```

Sin `withCache` en `fetchEstructura`: es estado vivo del builder; cachearlo produciría lecturas obsoletas tras cada operación.

---

## 16. Composables de persistencia (v2)

**`src/composables/useCourseReorder.js`** — matemática fraccional pura (testeable sin DOM ni red):

- Insertar entre vecinos: `orden = (prev + next) / 2`.
- Al inicio: `min − 1`. Al final: `max + 1`. Lista vacía: `1`.
- Si `next − prev < 1e-9`: renormalizar la lista completa a `1..n` y enviar el batch entero al RPC.
- Expone `calcularOrden(lista, indiceDestino)` y `necesitaRenormalizar(lista)`.

**`src/composables/useCourseBuilder.js`** — estado del árbol (`ModuleNode[]`) + operaciones optimistas:

1. Snapshot del árbol → 2. mutación optimista de la UI → 3. llamada al service → 4. si falla: rollback al snapshot + toast (`useErrorHandler`).

- Las operaciones se **serializan en una cola** (promesa encadenada) para que drags rápidos consecutivos no se pisen.
- Mantiene las reglas de inmutabilidad de §3 (nuevos arrays por operación).

---

## 17. Lecciones de texto enriquecido — Tiptap (v2)

- **Dependencias nuevas:** `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image` (inserción por URL únicamente; upload de imágenes dentro del editor queda fuera de v1). También `vue-draggable-plus` (§5).
- **`LessonRichTextEditor.vue`**: montado dentro de `LessonEditorPanel` cuando `fuente === 'texto'`. Headless, estilizado solo con tokens CSS del proyecto (`--ink`, `--paper`, `--line`, `--display`, `--ui`), compatible con `[data-theme='dark']`.
- **Persistencia:** guarda `editor.getJSON()` (nunca HTML) en `lecciones.contenido` vía `actualizarLeccion`, con autosave debounced (~1.5 s) + guardado al cerrar el panel. HTML solo se genera on-demand al renderizar (`generateHTML`), jamás se guarda duplicado.
- **i18n:** labels del editor y del builder en `locales/es.json` / `en.json` con `useI18n` (patrón de `ChatPanel.vue`), bajo la clave raíz `builder.*`.

---

## 18. Render en PlayerPage (v2)

- El computed `source` (`PlayerPage.vue:146`) gana una rama: tras `documento_path` y `video_id`, y antes de `youtube` → `if (leccion.contenido) return { kind: 'texto', leccionId }`.
- **`PlayerTextoSurface.vue`**: renderiza `generateHTML(contenido, extensionesPermitidas)`. La whitelist de extensiones (las mismas 4 del editor) actúa como sanitización estructural: solo nodos/marks conocidos pueden producir markup. Además: hrefs restringidos a `http/https` y links con `rel="noopener noreferrer" target="_blank"`.
- **Completado:** botón "Marcar como completada" reutilizando el patrón existente de lecciones tipo documento (`marcar_leccion_completada`).
- La query de lecciones del player (`select=*`) ya incluye `contenido` sin cambios.

---

## 19. Relación con el prompt externo (v2)

`tmp/prompt-cursos-amx.md` aportó a v2: persistencia incremental con RPCs + orden fraccional, Tiptap con `contenido` jsonb, y el service `courseBuilder.js`. Se descartó de ese prompt: crear tablas `modulos`/`lecciones` (existen desde `001`), migración numerada `031` (ocupada), `vuedraggable@next` (v1 eligió `vue-draggable-plus`), flag `course_builder` (v1 eligió `visual_builder`), columna `duracion_estimada` (existe `duracion_seg`) y `metadata jsonb` (YAGNI; `contenido` cubre el caso real).

---

_Con mucho cariño, para mi usuaria favorita 🌅_
