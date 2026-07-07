# Fase H2 — Reportes por Instructor + Análisis de Contenido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar reportes por instructor (dashboard, tabla de alumnos) y análisis de contenido por lección (métricas de engagement y consumo).

**Architecture:** 3 vistas SQL nuevas exponen métricas agregadas por instructor y lección. La Edge Function `analytics` extiende 3 endpoints. El frontend usa servicio `reportes.js` + composable `useReportes.js` + componentes Vue integrados en `InstructorPage.vue`.

**Tech Stack:** Vue 3 + Vite + Supabase (Postgres + Edge Functions) + Vitest. Sin nuevas dependencias.

---

## File Structure

### New Files

- `supabase/migrations/049_reportes_instructor.sql` — 3 vistas SQL + índices
- `src/components/InstructorReportPanel.vue` — Panel con tabs
- `src/components/InstructorAlumnosTable.vue` — Tabla de alumnos
- `src/components/LessonAnalyticsTable.vue` — Tabla de métricas por lección

### Modified Files

- `supabase/functions/analytics/index.ts` — 3 nuevos endpoints
- `src/services/reportes.js` — 3 nuevas funciones
- `src/services/__tests__/reportes.test.js` — Tests nuevos
- `src/composables/useReportes.js` — Estados y funciones nuevas
- `src/composables/__tests__/useReportes.test.js` — Tests nuevos
- `src/pages/InstructorPage.vue` — Tab "Reportes"

---

## Task 1: Schema — Migration SQL 049

**Files:**

- Create: `supabase/migrations/049_reportes_instructor.sql`

**Goal:** Crear 3 vistas SQL para instructor y análisis por lección.

- [ ] **Step 1: Escribir la migration completa**

```sql
-- =========================================================
-- Migration 049: Reportes por Instructor y Análisis de Lección (Fase H2)
-- =========================================================
--  * v_instructor_cursos: métricas agregadas por curso para un instructor
--  * v_instructor_alumnos: alumnos por curso del instructor con métricas
--  * v_leccion_analytics: métricas de engagement y consumo por lección
-- =========================================================

-- ---------- Vista: Cursos del instructor ----------
drop view if exists public.v_instructor_cursos;
create view public.v_instructor_cursos as
with instructor_cursos as (
  select ci.user_id as instructor_id, ci.curso_id
  from public.cursos_instructores ci
),
total_alumnos as (
  select i.curso_id, count(*) as n
  from public.inscripciones i
  group by i.curso_id
),
aprobados as (
  select ie.curso_id, count(distinct ie.user_id) as n
  from public.intentos_evaluacion ie
  where ie.aprobado and ie.calificacion >= 70
  group by ie.curso_id
),
promedio_calif as (
  select ie.curso_id, round(avg(ie.calificacion)::numeric, 2) as promedio
  from public.intentos_evaluacion ie
  where ie.calificacion is not null
  group by ie.curso_id
),
tiempo_completar as (
  select m.curso_id, round(avg(p.completado_en::date - i.inscrito_en::date)::numeric, 1) as promedio
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  join public.inscripciones i on i.user_id = p.user_id and i.curso_id = m.curso_id
  where p.completado and p.completado_en is not null
  group by m.curso_id
),
total_lecciones as (
  select m.curso_id, count(l.id) as n
  from public.lecciones l
  join public.modulos m on m.id = l.modulo_id
  group by m.curso_id
),
total_modulos as (
  select m.curso_id, count(*) as n
  from public.modulos m
  group by m.curso_id
)
select
  ic.instructor_id,
  ic.curso_id,
  c.titulo as curso_titulo,
  coalesce(ta.n, 0) as total_alumnos,
  coalesce(round(ap.n::numeric / nullif(ta.n, 0) * 100, 1), 0) as tasa_aprobacion,
  coalesce(pc.promedio, 0) as promedio_calificacion,
  coalesce(tc.promedio, 0) as tiempo_promedio_completar,
  coalesce(tl.n, 0) as total_lecciones,
  coalesce(tm.n, 0) as total_modulos
from instructor_cursos ic
join public.cursos c on c.id = ic.curso_id
left join total_alumnos ta on ta.curso_id = ic.curso_id
left join aprobados ap on ap.curso_id = ic.curso_id
left join promedio_calif pc on pc.curso_id = ic.curso_id
left join tiempo_completar tc on tc.curso_id = ic.curso_id
left join total_lecciones tl on tl.curso_id = ic.curso_id
left join total_modulos tm on tm.curso_id = ic.curso_id;

-- ---------- Vista: Alumnos por curso del instructor ----------
drop view if exists public.v_instructor_alumnos;
create view public.v_instructor_alumnos as
with progreso_alumno as (
  select
    p.user_id,
    m.curso_id,
    count(p.leccion_id) filter (where p.completado) as completadas,
    count(l.id) as total_lecciones,
    sum(p.segundos_vistos) as segundos_vistos
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  group by p.user_id, m.curso_id
),
calif_alumno as (
  select user_id, curso_id, round(avg(calificacion)::numeric, 2) as promedio
  from public.intentos_evaluacion
  where calificacion is not null
  group by user_id, curso_id
),
tiempo_activo as (
  select user_id, curso_id, segundos_activos
  from public.tiempo_curso
),
ultima_actividad as (
  select actor_id as user_id, max(timestamp) as ultimo
  from public.lrs_statements
  group by actor_id
),
foros_alumno as (
  select fh.creado_por as user_id, fo.curso_id, count(*) as n
  from public.foro_hilos fh
  join public.foros fo on fo.id = fh.foro_id
  group by fh.creado_por, fo.curso_id
),
respuestas_alumno as (
  select fr.creado_por as user_id, fo.curso_id, count(*) as n
  from public.foro_respuestas fr
  join public.foro_hilos fh on fh.id = fr.hilo_id
  join public.foros fo on fo.id = fh.foro_id
  group by fr.creado_por, fo.curso_id
),
entregas_alumno as (
  select el.user_id, el.curso_id, count(*) as n
  from public.entregas_leccion el
  group by el.user_id, el.curso_id
)
select
  i.user_id,
  p.nombres_completos,
  p.correo,
  i.curso_id,
  c.titulo as curso_titulo,
  coalesce(round(pa.completadas::numeric / nullif(pa.total_lecciones, 0) * 100, 1), 0) as pct_progreso,
  coalesce(ca.promedio, 0) as calificacion_promedio,
  coalesce(pa.segundos_vistos, 0) as tiempo_dedicado_segundos,
  coalesce(ta.segundos_activos, 0) as tiempo_activo_segundos,
  ua.ultimo as ultima_actividad,
  coalesce(fa.n, 0) + coalesce(ra.n, 0) as foros_posts,
  coalesce(ea.n, 0) as entregas_realizadas
from public.inscripciones i
join public.perfiles p on p.id = i.user_id
join public.cursos c on c.id = i.curso_id
left join progreso_alumno pa on pa.user_id = i.user_id and pa.curso_id = i.curso_id
left join calif_alumno ca on ca.user_id = i.user_id and ca.curso_id = i.curso_id
left join tiempo_activo ta on ta.user_id = i.user_id and ta.curso_id = i.curso_id
left join ultima_actividad ua on ua.user_id = i.user_id
left join foros_alumno fa on fa.user_id = i.user_id and fa.curso_id = i.curso_id
left join respuestas_alumno ra on ra.user_id = i.user_id and ra.curso_id = i.curso_id
left join entregas_alumno ea on ea.user_id = i.user_id and ea.curso_id = i.curso_id;

-- ---------- Vista: Analytics por lección ----------
drop view if exists public.v_leccion_analytics;
create view public.v_leccion_analytics as
with inscritos_curso as (
  select curso_id, count(*) as n
  from public.inscripciones
  group by curso_id
),
vieron as (
  select p.leccion_id, count(distinct p.user_id) as n
  from public.progreso p
  where p.segundos_vistos > 0
  group by p.leccion_id
),
completaron as (
  select p.leccion_id, count(*) as n
  from public.progreso p
  where p.completado
  group by p.leccion_id
),
tiempo_visto as (
  select p.leccion_id, round(avg(p.segundos_vistos)::numeric, 0) as promedio
  from public.progreso p
  group by p.leccion_id
),
comentarios as (
  select c.leccion_id, count(*) as n
  from public.comentarios c
  group by c.leccion_id
),
entregas as (
  select el.leccion_id, count(*) as n
  from public.entregas_leccion el
  group by el.leccion_id
),
foro_hilos as (
  select fh.leccion_id, count(*) as n
  from public.foro_hilos fh
  group by fh.leccion_id
),
evaluaciones as (
  select ie.leccion_id, count(*) as n, round(avg(ie.calificacion)::numeric, 2) as promedio
  from public.intentos_evaluacion ie
  where ie.calificacion is not null
  group by ie.leccion_id
)
select
  l.id as leccion_id,
  l.titulo as leccion_titulo,
  m.titulo as modulo_titulo,
  m.curso_id,
  coalesce(v.n, 0) as total_alumnos_vieron,
  coalesce(c.n, 0) as total_completaron,
  coalesce(round(c.n::numeric / nullif(ic.n, 0) * 100, 1), 0) as tasa_completitud,
  coalesce(tv.promedio, 0) as tiempo_promedio_visto_segundos,
  coalesce(cm.n, 0) as total_comentarios,
  coalesce(e.n, 0) as total_entregas,
  coalesce(fh.n, 0) as total_foro_hilos,
  coalesce(ev.n, 0) as total_evaluaciones,
  coalesce(ev.promedio, 0) as calificacion_promedio
from public.lecciones l
join public.modulos m on m.id = l.modulo_id
left join inscritos_curso ic on ic.curso_id = m.curso_id
left join vieron v on v.leccion_id = l.id
left join completaron c on c.leccion_id = l.id
left join tiempo_visto tv on tv.leccion_id = l.id
left join comentarios cm on cm.leccion_id = l.id
left join entregas e on e.leccion_id = l.id
left join foro_hilos fh on fh.leccion_id = l.id
left join evaluaciones ev on ev.leccion_id = l.id;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/049_reportes_instructor.sql
git commit -m "feat(schema): migration 049 — vistas instructor y analytics por lección"
```

---

## Task 2: Edge Function — Extender analytics/index.ts

**Files:**

- Modify: `supabase/functions/analytics/index.ts`

**Goal:** Agregar 3 endpoints nuevos a la Edge Function existente.

- [ ] **Step 1: Agregar handlers para instructor_dashboard, instructor_alumnos, leccion_analytics**

Agregar dentro del `switch(action)` después del case `comparativa`:

```typescript
case 'instructor_dashboard': {
  const { instructor_id } = body
  const { data, error } = await supabase
    .from('v_instructor_cursos')
    .select('*')
    .eq('instructor_id', instructor_id)
    .order('total_alumnos', { ascending: false })

  if (error) throw error
  return new Response(JSON.stringify({ cursos: data || [] }), { headers })
}

case 'instructor_alumnos': {
  const { curso_id } = body
  const { data, error } = await supabase
    .from('v_instructor_alumnos')
    .select('*')
    .eq('curso_id', curso_id)
    .order('pct_progreso', { ascending: false })

  if (error) throw error
  return new Response(JSON.stringify({ alumnos: data || [] }), { headers })
}

case 'leccion_analytics': {
  const { curso_id } = body
  const { data, error } = await supabase
    .from('v_leccion_analytics')
    .select('*')
    .eq('curso_id', curso_id)
    .order('tasa_completitud', { ascending: false })

  if (error) throw error
  return new Response(JSON.stringify({ lecciones: data || [] }), { headers })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/analytics/index.ts
git commit -m "feat(analytics): endpoints instructor_dashboard, instructor_alumnos, leccion_analytics"
```

---

## Task 3: Servicio — Extender reportes.js

**Files:**

- Modify: `src/services/reportes.js`

**Goal:** Agregar 3 funciones nuevas.

- [ ] **Step 1: Agregar funciones al final del archivo**

```javascript
/**
 * Obtiene el dashboard de cursos para un instructor.
 *
 * @param {string} instructorId
 */
export async function obtenerInstructorDashboard(instructorId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'instructor_dashboard', instructor_id: instructorId },
  })
  if (error) throw error
  return data.cursos || []
}

/**
 * Obtiene los alumnos de un curso (vista del instructor).
 *
 * @param {string} cursoId
 */
export async function obtenerInstructorAlumnos(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'instructor_alumnos', curso_id: cursoId },
  })
  if (error) throw error
  return data.alumnos || []
}

/**
 * Obtiene analytics por lección de un curso.
 *
 * @param {string} cursoId
 */
export async function obtenerLeccionAnalytics(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'leccion_analytics', curso_id: cursoId },
  })
  if (error) throw error
  return data.lecciones || []
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/reportes.js
git commit -m "feat(reportes): funciones instructor dashboard, alumnos y leccion analytics"
```

---

## Task 4: Tests del Servicio

**Files:**

- Modify: `src/services/__tests__/reportes.test.js`

**Goal:** Tests para las 3 nuevas funciones.

- [ ] **Step 1: Agregar tests al final del archivo**

```javascript
describe('obtenerInstructorDashboard', () => {
  it('retorna cursos del instructor', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cursos: [
          { curso_id: 'c1', curso_titulo: 'Curso A', total_alumnos: 50, tasa_aprobacion: 80 },
        ],
      },
    })
    const result = await obtenerInstructorDashboard('inst-1')
    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'instructor_dashboard', instructor_id: 'inst-1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].curso_titulo).toBe('Curso A')
  })
})

describe('obtenerInstructorAlumnos', () => {
  it('retorna alumnos del curso', async () => {
    mockInvoke.mockResolvedValue({
      data: { alumnos: [{ user_id: 'u1', nombres_completos: 'Ana', pct_progreso: 75 }] },
    })
    const result = await obtenerInstructorAlumnos('c1')
    expect(result).toHaveLength(1)
    expect(result[0].nombres_completos).toBe('Ana')
  })
})

describe('obtenerLeccionAnalytics', () => {
  it('retorna analytics por lección', async () => {
    mockInvoke.mockResolvedValue({
      data: { lecciones: [{ leccion_id: 'l1', leccion_titulo: 'Intro', tasa_completitud: 90 }] },
    })
    const result = await obtenerLeccionAnalytics('c1')
    expect(result).toHaveLength(1)
    expect(result[0].leccion_titulo).toBe('Intro')
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit -- src/services/__tests__/reportes.test.js
```

Expected: 7 tests PASS (4 existentes + 3 nuevos)

- [ ] **Step 3: Commit**

```bash
git add src/services/__tests__/reportes.test.js
git commit -m "test(reportes): tests para instructor dashboard, alumnos y leccion analytics"
```

---

## Task 5: Composable — Extender useReportes.js

**Files:**

- Modify: `src/composables/useReportes.js`

**Goal:** Agregar estados y funciones para instructor y lección.

- [ ] **Step 1: Agregar estados y funciones**

```javascript
// Dentro de useReportes(), agregar después de las refs existentes:
const instructorDashboard = ref([])
const instructorAlumnos = ref([])
const leccionAnalytics = ref([])

// Agregar funciones de carga:
async function cargarInstructorDashboard(instructorId) {
  loading.value.instructorDashboard = true
  error.value.instructorDashboard = null
  try {
    instructorDashboard.value = await obtenerInstructorDashboard(instructorId)
  } catch (e) {
    error.value.instructorDashboard = e?.message || 'Error al cargar dashboard'
  } finally {
    loading.value.instructorDashboard = false
  }
}

async function cargarInstructorAlumnos(cursoId) {
  loading.value.instructorAlumnos = true
  error.value.instructorAlumnos = null
  try {
    instructorAlumnos.value = await obtenerInstructorAlumnos(cursoId)
  } catch (e) {
    error.value.instructorAlumnos = e?.message || 'Error al cargar alumnos'
  } finally {
    loading.value.instructorAlumnos = false
  }
}

async function cargarLeccionAnalytics(cursoId) {
  loading.value.leccionAnalytics = true
  error.value.leccionAnalytics = null
  try {
    leccionAnalytics.value = await obtenerLeccionAnalytics(cursoId)
  } catch (e) {
    error.value.leccionAnalytics = e?.message || 'Error al cargar analytics'
  } finally {
    loading.value.leccionAnalytics = false
  }
}
```

Y actualizar el return:

```javascript
return {
  funnel,
  retencion,
  comparativa,
  instructorDashboard,
  instructorAlumnos,
  leccionAnalytics,
  loading,
  error,
  cargarFunnel,
  cargarRetencion,
  cargarComparativa,
  cargarTodo,
  cargarInstructorDashboard,
  cargarInstructorAlumnos,
  cargarLeccionAnalytics,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useReportes.js
git commit -m "feat(reportes): extiende useReportes con instructor y leccion analytics"
```

---

## Task 6: Tests del Composable

**Files:**

- Modify: `src/composables/__tests__/useReportes.test.js`

**Goal:** Tests para las nuevas funciones.

- [ ] **Step 1: Agregar tests**

```javascript
describe('useReportes - instructor', () => {
  it('carga dashboard del instructor', async () => {
    const { obtenerInstructorDashboard } = await import('@/services/reportes.js')
    obtenerInstructorDashboard.mockResolvedValue([{ curso_id: 'c1', total_alumnos: 50 }])

    const r = useReportes()
    await r.cargarInstructorDashboard('inst-1')

    expect(r.instructorDashboard.value).toHaveLength(1)
    expect(r.instructorDashboard.value[0].total_alumnos).toBe(50)
  })

  it('carga alumnos del curso', async () => {
    const { obtenerInstructorAlumnos } = await import('@/services/reportes.js')
    obtenerInstructorAlumnos.mockResolvedValue([{ user_id: 'u1', pct_progreso: 75 }])

    const r = useReportes()
    await r.cargarInstructorAlumnos('c1')

    expect(r.instructorAlumnos.value).toHaveLength(1)
    expect(r.instructorAlumnos.value[0].pct_progreso).toBe(75)
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit -- src/composables/__tests__/useReportes.test.js
```

Expected: 4 tests PASS (2 existentes + 2 nuevos)

- [ ] **Step 3: Commit**

```bash
git add src/composables/__tests__/useReportes.test.js
git commit -m "test(reportes): tests para useReportes instructor y leccion"
```

---

## Task 7: Componente InstructorAlumnosTable.vue

**Files:**

- Create: `src/components/InstructorAlumnosTable.vue`

**Goal:** Tabla de alumnos con progreso, calificaciones y tiempo.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const sortKey = ref('pct_progreso')
const sortAsc = ref(false)

const columns = [
  { key: 'nombres_completos', label: 'Alumno' },
  { key: 'pct_progreso', label: 'Progreso %' },
  { key: 'calificacion_promedio', label: 'Calificación' },
  { key: 'tiempo_dedicado_segundos', label: 'Tiempo visto' },
  { key: 'tiempo_activo_segundos', label: 'Tiempo activo' },
  { key: 'ultima_actividad', label: 'Última actividad' },
  { key: 'foros_posts', label: 'Foros' },
  { key: 'entregas_realizadas', label: 'Entregas' },
]

function sortBy(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = false
  }
}

const sorted = computed(() => {
  return [...props.data].sort((a, b) => {
    const av = a[sortKey.value] || 0
    const bv = b[sortKey.value] || 0
    return sortAsc.value ? av - bv : bv - av
  })
})

function formatTime(segundos) {
  if (!segundos) return '0 min'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function formatDate(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-MX')
}
</script>

<template>
  <div class="instructor-alumnos-table">
    <table v-if="data.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" class="sortable" @click="sortBy(col.key)">
            {{ col.label }}
            <span v-if="sortKey === col.key">{{ sortAsc ? '▲' : '▼' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sorted" :key="row.user_id">
          <td>
            <strong>{{ row.nombres_completos }}</strong>
            <br />
            <span class="caption">{{ row.correo }}</span>
          </td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: row.pct_progreso + '%' }"></div>
              <span>{{ row.pct_progreso }}%</span>
            </div>
          </td>
          <td>{{ row.calificacion_promedio }}</td>
          <td>{{ formatTime(row.tiempo_dedicado_segundos) }}</td>
          <td>{{ formatTime(row.tiempo_activo_segundos) }}</td>
          <td>{{ formatDate(row.ultima_actividad) }}</td>
          <td>{{ row.foros_posts }}</td>
          <td>{{ row.entregas_realizadas }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="caption">Sin alumnos en este curso.</p>
  </div>
</template>

<style scoped>
.sortable {
  cursor: pointer;
  user-select: none;
}
.sortable:hover {
  text-decoration: underline;
}
.progress-bar {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
  background: var(--surface);
  border-radius: 4px;
  padding: 2px calc(var(--unit));
  min-width: 80px;
}
.progress-fill {
  height: 8px;
  background: var(--success);
  border-radius: 4px;
  transition: width 0.3s ease;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InstructorAlumnosTable.vue
git commit -m "feat(reportes): componente InstructorAlumnosTable con progreso y sorting"
```

---

## Task 8: Componente LessonAnalyticsTable.vue

**Files:**

- Create: `src/components/LessonAnalyticsTable.vue`

**Goal:** Tabla de métricas por lección con destacado de baja completitud.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const sortKey = ref('tasa_completitud')
const sortAsc = ref(false)

const columns = [
  { key: 'leccion_titulo', label: 'Lección' },
  { key: 'modulo_titulo', label: 'Módulo' },
  { key: 'total_alumnos_vieron', label: 'Vieron' },
  { key: 'tasa_completitud', label: 'Completaron %' },
  { key: 'tiempo_promedio_visto_segundos', label: 'Tiempo promedio' },
  { key: 'total_comentarios', label: 'Comentarios' },
  { key: 'total_entregas', label: 'Entregas' },
  { key: 'total_foro_hilos', label: 'Foros' },
  { key: 'total_evaluaciones', label: 'Evaluaciones' },
  { key: 'calificacion_promedio', label: 'Calificación' },
]

function sortBy(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = false
  }
}

const sorted = computed(() => {
  return [...props.data].sort((a, b) => {
    const av = a[sortKey.value] || 0
    const bv = b[sortKey.value] || 0
    return sortAsc.value ? av - bv : bv - av
  })
})

function formatTime(segundos) {
  if (!segundos) return '0 min'
  const m = Math.floor(segundos / 60)
  return `${m} min`
}

function rowClass(row) {
  if (row.tasa_completitud < 50) return 'row-warning'
  return ''
}
</script>

<template>
  <div class="lesson-analytics-table">
    <table v-if="data.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" class="sortable" @click="sortBy(col.key)">
            {{ col.label }}
            <span v-if="sortKey === col.key">{{ sortAsc ? '▲' : '▼' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sorted" :key="row.leccion_id" :class="rowClass(row)">
          <td>
            <strong>{{ row.leccion_titulo }}</strong>
          </td>
          <td>{{ row.modulo_titulo }}</td>
          <td>{{ row.total_alumnos_vieron }}</td>
          <td>{{ row.tasa_completitud }}%</td>
          <td>{{ formatTime(row.tiempo_promedio_visto_segundos) }}</td>
          <td>{{ row.total_comentarios }}</td>
          <td>{{ row.total_entregas }}</td>
          <td>{{ row.total_foro_hilos }}</td>
          <td>{{ row.total_evaluaciones }}</td>
          <td>{{ row.calificacion_promedio }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="caption">Sin datos de lecciones.</p>
  </div>
</template>

<style scoped>
.sortable {
  cursor: pointer;
  user-select: none;
}
.sortable:hover {
  text-decoration: underline;
}
.row-warning {
  background: rgba(239, 68, 68, 0.1);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LessonAnalyticsTable.vue
git commit -m "feat(reportes): componente LessonAnalyticsTable con heatmap de completitud"
```

---

## Task 9: Componente InstructorReportPanel.vue

**Files:**

- Create: `src/components/InstructorReportPanel.vue`

**Goal:** Panel con tabs que orquesta los reportes.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
import { ref, watch } from 'vue'
import { useReportes } from '@/composables/useReportes.js'
import InstructorAlumnosTable from './InstructorAlumnosTable.vue'
import LessonAnalyticsTable from './LessonAnalyticsTable.vue'

const props = defineProps({
  instructorId: { type: String, required: true },
})

const activeTab = ref('cursos')
const tabs = [
  { key: 'cursos', label: 'Mis cursos' },
  { key: 'alumnos', label: 'Alumnos' },
  { key: 'lecciones', label: 'Análisis por lección' },
]

const selectedCurso = ref('')

const {
  instructorDashboard,
  instructorAlumnos,
  leccionAnalytics,
  loading,
  error,
  cargarInstructorDashboard,
  cargarInstructorAlumnos,
  cargarLeccionAnalytics,
} = useReportes()

// Cargar dashboard al montar
watch(
  () => props.instructorId,
  (id) => {
    if (id) cargarInstructorDashboard(id)
  },
  { immediate: true }
)

// Cargar alumnos/lecciones cuando se selecciona curso
watch(selectedCurso, (cursoId) => {
  if (!cursoId) return
  if (activeTab.value === 'alumnos') cargarInstructorAlumnos(cursoId)
  if (activeTab.value === 'lecciones') cargarLeccionAnalytics(cursoId)
})

// Recargar al cambiar de tab
watch(activeTab, (tab) => {
  if (!selectedCurso.value) return
  if (tab === 'alumnos') cargarInstructorAlumnos(selectedCurso.value)
  if (tab === 'lecciones') cargarLeccionAnalytics(selectedCurso.value)
})
</script>

<template>
  <div class="instructor-report-panel">
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="btn btn-sm"
        :class="{ 'btn-primary': activeTab === tab.key, 'btn-secondary': activeTab !== tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab: Mis cursos -->
    <div v-if="activeTab === 'cursos'" class="tab-content">
      <p class="eyebrow">Resumen de tus cursos</p>
      <div v-if="loading.instructorDashboard" class="skeleton">Cargando...</div>
      <div v-else-if="error.instructorDashboard" class="error">{{ error.instructorDashboard }}</div>
      <div v-else-if="instructorDashboard.length" class="cards-grid">
        <div v-for="curso in instructorDashboard" :key="curso.curso_id" class="card">
          <p class="h4">{{ curso.curso_titulo }}</p>
          <div class="metrics">
            <div>
              <strong>{{ curso.total_alumnos }}</strong> alumnos
            </div>
            <div>
              <strong>{{ curso.tasa_aprobacion }}%</strong> aprobación
            </div>
            <div>
              <strong>{{ curso.promedio_calificacion }}</strong> calif. promedio
            </div>
            <div>
              <strong>{{ curso.total_lecciones }}</strong> lecciones
            </div>
          </div>
        </div>
      </div>
      <p v-else class="caption">No tienes cursos asignados.</p>
    </div>

    <!-- Tab: Alumnos -->
    <div v-else-if="activeTab === 'alumnos'" class="tab-content">
      <p class="eyebrow">Alumnos por curso</p>
      <select v-model="selectedCurso" class="field">
        <option value="">Selecciona un curso</option>
        <option v-for="c in instructorDashboard" :key="c.curso_id" :value="c.curso_id">
          {{ c.curso_titulo }}
        </option>
      </select>
      <div v-if="loading.instructorAlumnos" class="skeleton">Cargando...</div>
      <div v-else-if="error.instructorAlumnos" class="error">{{ error.instructorAlumnos }}</div>
      <InstructorAlumnosTable v-else-if="instructorAlumnos.length" :data="instructorAlumnos" />
      <p v-else-if="selectedCurso" class="caption">Sin alumnos en este curso.</p>
    </div>

    <!-- Tab: Análisis por lección -->
    <div v-else-if="activeTab === 'lecciones'" class="tab-content">
      <p class="eyebrow">Análisis por lección</p>
      <select v-model="selectedCurso" class="field">
        <option value="">Selecciona un curso</option>
        <option v-for="c in instructorDashboard" :key="c.curso_id" :value="c.curso_id">
          {{ c.curso_titulo }}
        </option>
      </select>
      <div v-if="loading.leccionAnalytics" class="skeleton">Cargando...</div>
      <div v-else-if="error.leccionAnalytics" class="error">{{ error.leccionAnalytics }}</div>
      <LessonAnalyticsTable v-else-if="leccionAnalytics.length" :data="leccionAnalytics" />
      <p v-else-if="selectedCurso" class="caption">Sin datos de lecciones.</p>
    </div>
  </div>
</template>

<style scoped>
.instructor-report-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}
.tabs {
  display: flex;
  gap: calc(var(--unit));
}
.tab-content {
  min-height: 200px;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: calc(var(--unit) * 2);
}
.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--unit));
  margin-top: calc(var(--unit) * 2);
}
.skeleton {
  color: var(--text-secondary);
  font-style: italic;
}
.error {
  color: var(--error);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InstructorReportPanel.vue
git commit -m "feat(reportes): componente InstructorReportPanel con tabs"
```

---

## Task 10: Tests de Componentes

**Files:**

- Create: `src/components/__tests__/InstructorAlumnosTable.test.js`
- Create: `src/components/__tests__/LessonAnalyticsTable.test.js`

**Goal:** Tests para las 2 nuevas tablas.

- [ ] **Step 1: Crear tests de InstructorAlumnosTable**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import InstructorAlumnosTable from '../InstructorAlumnosTable.vue'

describe('InstructorAlumnosTable', () => {
  it('renderiza tabla con progreso y sorting', () => {
    const wrapper = mount(InstructorAlumnosTable, {
      props: {
        data: [
          {
            user_id: 'u1',
            nombres_completos: 'Ana',
            pct_progreso: 75,
            calificacion_promedio: 85,
            tiempo_dedicado_segundos: 3600,
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('75%')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Crear tests de LessonAnalyticsTable**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LessonAnalyticsTable from '../LessonAnalyticsTable.vue'

describe('LessonAnalyticsTable', () => {
  it('renderiza tabla y destaca baja completitud', () => {
    const wrapper = mount(LessonAnalyticsTable, {
      props: {
        data: [
          { leccion_id: 'l1', leccion_titulo: 'Intro', tasa_completitud: 40 },
          { leccion_id: 'l2', leccion_titulo: 'Avanzado', tasa_completitud: 90 },
        ],
      },
    })
    expect(wrapper.text()).toContain('Intro')
    expect(wrapper.find('.row-warning').exists()).toBe(true)
  })
})
```

- [ ] **Step 3: Ejecutar tests**

```bash
npm run test:unit -- src/components/__tests__/InstructorAlumnosTable.test.js src/components/__tests__/LessonAnalyticsTable.test.js
```

Expected: 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/__tests__
git commit -m "test(reportes): tests para InstructorAlumnosTable y LessonAnalyticsTable"
```

---

## Task 11: Integración en InstructorPage.vue

**Files:**

- Modify: `src/pages/InstructorPage.vue`

**Goal:** Agregar tab "Reportes" con el panel.

- [ ] **Step 1: Leer InstructorPage.vue**

```bash
cat src/pages/InstructorPage.vue | head -50
```

- [ ] **Step 2: Agregar import y tab**

```vue
<script setup>
// ... imports existentes
import InstructorReportPanel from '@/components/InstructorReportPanel.vue'
import { featureEnabled } from '@/lib/featureFlags.js'

// ... código existente

const tabs = [
  { key: 'evaluaciones', label: 'Evaluaciones' },
  { key: 'sesiones', label: 'Sesiones' },
  { key: 'entregas', label: 'Entregas' },
  ...(featureEnabled('reportes_avanzados') ? [{ key: 'reportes', label: 'Reportes' }] : []),
]
</script>
```

Y en el template, agregar después del último tab content:

```vue
<InstructorReportPanel v-else-if="activeTab === 'reportes'" :instructor-id="session?.user?.id" />
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/InstructorPage.vue
git commit -m "feat(reportes): integra InstructorReportPanel en InstructorPage"
```

---

## Task 12: Verificación Final

- [ ] **Step 1: Ejecutar linter**

```bash
npm run lint
```

Expected: 0 errores (warnings existentes de otras partes OK)

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit
```

Expected: Todos pasan (>= 232 + nuevos)

- [ ] **Step 3: Ejecutar build**

```bash
npm run build
```

Expected: Build exitoso

- [ ] **Step 4: Commit si hay fixes**

```bash
git add -A
git commit -m "fix(reportes): correcciones post-verificación H2"
```

---

## Task 13: Merge y Release v0.11.0

- [ ] **Step 1: Merge a main**

```bash
git checkout main
git merge fase-h2-reportes-instructor --no-edit
```

- [ ] **Step 2: Tag y push**

```bash
git tag -a v0.11.0 -m "Release v0.11.0 — Reportes por Instructor + Análisis de Contenido"
git push origin main
git push origin v0.11.0
```

- [ ] **Step 3: GitHub Release**

```bash
gh release create v0.11.0 --title "Release v0.11.0 — Reportes por Instructor + Análisis de Contenido" --notes "## Release v0.11.0

### Features
- Dashboard de instructor: métricas resumidas de cursos asignados
- Tabla de alumnos por curso: progreso, calificaciones, tiempo dedicado
- Análisis por lección: completitud, tiempo visto, engagement
- Vistas SQL: v_instructor_cursos, v_instructor_alumnos, v_leccion_analytics
- Componentes: InstructorReportPanel, InstructorAlumnosTable, LessonAnalyticsTable
- Integración en InstructorPage.vue

### Métricas
- Tests: <N> pasando
- Build: ✅"
```

---

## Spec Coverage Checklist

| Spec Requirement                  | Task    |
| --------------------------------- | ------- |
| Vistas SQL (3)                    | Task 1  |
| Edge Function endpoints (3)       | Task 2  |
| Servicio reportes.js extendido    | Task 3  |
| Tests servicio                    | Task 4  |
| Composable useReportes extendido  | Task 5  |
| Tests composable                  | Task 6  |
| Componente InstructorAlumnosTable | Task 7  |
| Componente LessonAnalyticsTable   | Task 8  |
| Componente InstructorReportPanel  | Task 9  |
| Tests componentes                 | Task 10 |
| Integración InstructorPage.vue    | Task 11 |
| Verificación build/tests/lint     | Task 12 |
| Release v0.11.0                   | Task 13 |
