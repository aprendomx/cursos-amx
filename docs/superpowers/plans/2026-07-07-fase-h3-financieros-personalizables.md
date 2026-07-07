# Fase H3 — Financieros + Reportes Personalizables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar reportes financieros (costos, inscripciones) y reportes personalizables (favoritos, programados) para cerrar el módulo H.

**Architecture:** 3 tablas SQL nuevas (`reportes_favoritos`, `reportes_programados`, `reportes_historial`) + 3 vistas SQL. Edge Function `analytics` extiende 3 endpoints. Frontend usa servicio + composable + 5 componentes Vue, integrados en AdminReportes.vue.

**Tech Stack:** Vue 3 + Vite + Supabase (Postgres + Edge Functions) + Chart.js + Vitest.

---

## File Structure

### New Files

- `supabase/migrations/050_reportes_personalizables.sql` — Tablas + vistas
- `src/components/CostosDashboard.vue` — Métricas de costos
- `src/components/InscripcionesTimeline.vue` — Gráfico de inscripciones
- `src/components/ReporteFavoritosManager.vue` — Gestor de favoritos
- `src/components/ReporteProgramadoForm.vue` — Formulario programados
- `src/components/ReporteProgramadoList.vue` — Lista programados

### Modified Files

- `supabase/functions/analytics/index.ts` — 3 endpoints nuevos
- `src/services/reportes.js` — 6 funciones nuevas
- `src/services/__tests__/reportes.test.js` — Tests
- `src/composables/useReportes.js` — Estados y funciones
- `src/composables/__tests__/useReportes.test.js` — Tests
- `src/components/AdminReportes.vue` — Tabs nuevos
- `src/components/InstructorReportPanel.vue` — Botón guardar favorito

---

## Task 1: Schema — Migration SQL 050

**Files:**

- Create: `supabase/migrations/050_reportes_personalizables.sql`

**Goal:** Crear tablas de personalizables + vistas financieras.

- [ ] **Step 1: Escribir la migration**

```sql
-- =========================================================
-- Migration 050: Reportes Personalizables y Financieros (Fase H3)
-- =========================================================
--  * Tablas: reportes_favoritos, reportes_programados, reportes_historial
--  * Vistas: v_costos_infraestructura, v_inscripciones_tiempo, v_cursos_populares
-- =========================================================

-- ---------- Tabla: Favoritos ----------
create table if not exists public.reportes_favoritos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo_reporte text not null check (tipo_reporte in ('funnel','retencion','comparativa','instructor_dashboard','instructor_alumnos','leccion_analytics','costos','inscripciones_tiempo','cursos_populares')),
  filtros jsonb default '{}',
  creado_en timestamptz default now()
);

create index if not exists reportes_favoritos_usuario_idx on public.reportes_favoritos(usuario_id);

alter table public.reportes_favoritos enable row level security;

drop policy if exists "favoritos: propio" on public.reportes_favoritos;
create policy "favoritos: propio"
  on public.reportes_favoritos for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ---------- Tabla: Programados ----------
create table if not exists public.reportes_programados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo_reporte text not null,
  filtros jsonb default '{}',
  frecuencia text not null check (frecuencia in ('diario','semanal','mensual')),
  ultima_ejecucion timestamptz,
  activo boolean default true,
  creado_en timestamptz default now()
);

create index if not exists reportes_programados_usuario_idx on public.reportes_programados(usuario_id);

alter table public.reportes_programados enable row level security;

drop policy if exists "programados: propio" on public.reportes_programados;
create policy "programados: propio"
  on public.reportes_programados for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ---------- Tabla: Historial ----------
create table if not exists public.reportes_historial (
  id uuid primary key default gen_random_uuid(),
  programado_id uuid references public.reportes_programados(id) on delete cascade,
  estado text not null check (estado in ('exitoso','error')),
  resultado_resumen jsonb default '{}',
  ejecutado_en timestamptz default now()
);

create index if not exists reportes_historial_programado_idx on public.reportes_historial(programado_id);

alter table public.reportes_historial enable row level security;

drop policy if exists "historial: propio" on public.reportes_historial;
create policy "historial: propio"
  on public.reportes_historial for select to authenticated
  using (programado_id in (select id from public.reportes_programados where usuario_id = auth.uid()));

-- ---------- Vista: Costos de infraestructura ----------
drop view if exists public.v_costos_infraestructura;
create view public.v_costos_infraestructura as
with video_stats as (
  select
    count(*) as total_videos,
    coalesce(sum(tamanio_bytes), 0) as total_bytes
  from public.videos
  where estado = 'listo'
),
doc_stats as (
  select
    count(*) as total_documentos,
    coalesce(sum(tamanio_bytes), 0) as total_bytes
  from public.documentos
),
ia_stats as (
  select
    count(*) as total_llamadas,
    coalesce(sum(tokens_total), 0) as total_tokens,
    coalesce(sum(costo_estimado_usd), 0) as costo_total_usd
  from public.ai_usage_logs
)
select
  vs.total_videos,
  round(vs.total_bytes::numeric / 1024 / 1024 / 1024, 2) as almacenamiento_videos_gb,
  ds.total_documentos,
  round(ds.total_bytes::numeric / 1024 / 1024 / 1024, 2) as almacenamiento_docs_gb,
  ia.total_llamadas,
  ia.total_tokens,
  round(ia.costo_total_usd, 2) as costo_ia_usd,
  round(
    (vs.total_bytes::numeric / 1024 / 1024 / 1024 * 0.023) +
    (ds.total_bytes::numeric / 1024 / 1024 / 1024 * 0.023) +
    ia.costo_total_usd,
    2
  ) as costo_total_estimado_usd
from video_stats vs, doc_stats ds, ia_stats ia;

-- ---------- Vista: Inscripciones por tiempo ----------
drop view if exists public.v_inscripciones_tiempo;
create view public.v_inscripciones_tiempo as
select
  date(inscrito_en) as fecha,
  count(*) as total_inscripciones,
  count(distinct curso_id) as cursos_distintos
from public.inscripciones
group by date(inscrito_en)
order by fecha desc;

-- ---------- Vista: Cursos populares ----------
drop view if exists public.v_cursos_populares;
create view public.v_cursos_populares as
with inscritos as (
  select curso_id, count(*) as n from public.inscripciones group by curso_id
),
completados as (
  select m.curso_id, count(distinct p.user_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by m.curso_id
),
engagement as (
  select i.curso_id, count(distinct ls.id) as n
  from public.inscripciones i
  left join public.lrs_statements ls on ls.actor_id = i.user_id
  group by i.curso_id
)
select
  c.id as curso_id,
  c.titulo,
  coalesce(ins.n, 0) as total_inscripciones,
  coalesce(comp.n, 0) as total_completados,
  coalesce(eng.n, 0) as total_eventos,
  round(coalesce(comp.n, 0)::numeric / nullif(ins.n, 0) * 100, 1) as tasa_finalizacion
from public.cursos c
left join inscritos ins on ins.curso_id = c.id
left join completados comp on comp.curso_id = c.id
left join engagement eng on eng.curso_id = c.id
order by total_inscripciones desc;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/050_reportes_personalizables.sql
git commit -m "feat(schema): migration 050 — tablas favoritos/programados y vistas financieras"
```

---

## Task 2: Edge Function — Extender analytics/index.ts

**Files:**

- Modify: `supabase/functions/analytics/index.ts`

**Goal:** Agregar 3 endpoints.

- [ ] **Step 1: Agregar cases**

```typescript
case 'costos': {
  const { data, error } = await supabase
    .from('v_costos_infraestructura')
    .select('*')
    .single()
  if (error) throw error
  return new Response(JSON.stringify(data || {}), { headers })
}

case 'inscripciones_tiempo': {
  const { desde, hasta, agrupacion = 'dia' } = body
  let query = supabase.from('v_inscripciones_tiempo').select('*')
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  const { data, error } = await query.order('fecha', { ascending: true })
  if (error) throw error
  return new Response(JSON.stringify({ puntos: data || [] }), { headers })
}

case 'cursos_populares': {
  const { limite = 10 } = body
  const { data, error } = await supabase
    .from('v_cursos_populares')
    .select('*')
    .limit(limite)
  if (error) throw error
  return new Response(JSON.stringify({ cursos: data || [] }), { headers })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/analytics/index.ts
git commit -m "feat(analytics): endpoints costos, inscripciones_tiempo, cursos_populares"
```

---

## Task 3: Servicio — Extender reportes.js

**Files:**

- Modify: `src/services/reportes.js`

**Goal:** Agregar 6 funciones.

- [ ] **Step 1: Agregar funciones**

```javascript
export async function obtenerCostos() {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'costos' },
  })
  if (error) throw error
  return data
}

export async function obtenerInscripcionesTiempo(desde, hasta, agrupacion) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'inscripciones_tiempo', desde, hasta, agrupacion },
  })
  if (error) throw error
  return data.puntos || []
}

export async function obtenerCursosPopulares(limite = 10) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'cursos_populares', limite },
  })
  if (error) throw error
  return data.cursos || []
}

export async function guardarFavorito(nombre, tipoReporte, filtros) {
  const { data, error } = await supabase
    .from('reportes_favoritos')
    .insert({ nombre, tipo_reporte: tipoReporte, filtros })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cargarFavoritos() {
  const { data, error } = await supabase
    .from('reportes_favoritos')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function eliminarFavorito(id) {
  const { error } = await supabase.from('reportes_favoritos').delete().eq('id', id)
  if (error) throw error
}

export async function programarReporte(nombre, tipoReporte, filtros, frecuencia) {
  const { data, error } = await supabase
    .from('reportes_programados')
    .insert({ nombre, tipo_reporte: tipoReporte, filtros, frecuencia })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cargarProgramados() {
  const { data, error } = await supabase
    .from('reportes_programados')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/reportes.js
git commit -m "feat(reportes): funciones costos, inscripciones, favoritos y programados"
```

---

## Task 4: Tests del Servicio

**Files:**

- Modify: `src/services/__tests__/reportes.test.js`

**Goal:** Tests para 6 nuevas funciones.

- [ ] **Step 1: Agregar tests**

```javascript
describe('obtenerCostos', () => {
  it('retorna datos de costos', async () => {
    mockInvoke.mockResolvedValue({
      data: { almacenamiento_videos_gb: 10, costo_total_estimado_usd: 5 },
    })
    const result = await obtenerCostos()
    expect(result.costo_total_estimado_usd).toBe(5)
  })
})

describe('obtenerInscripcionesTiempo', () => {
  it('retorna serie temporal', async () => {
    mockInvoke.mockResolvedValue({
      data: { puntos: [{ fecha: '2026-01-01', total_inscripciones: 10 }] },
    })
    const result = await obtenerInscripcionesTiempo('2026-01-01', '2026-01-31')
    expect(result).toHaveLength(1)
  })
})

describe('guardarFavorito', () => {
  it('inserta favorito en supabase', async () => {
    // Mock supabase.from insert
    const result = await guardarFavorito('Mi funnel', 'funnel', { curso_id: 'c1' })
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit -- src/services/__tests__/reportes.test.js
```

Expected: 10 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/__tests__/reportes.test.js
git commit -m "test(reportes): tests para costos, inscripciones, favoritos"
```

---

## Task 5: Composable — Extender useReportes.js

**Files:**

- Modify: `src/composables/useReportes.js`

**Goal:** Estados y funciones para financieros y personalizables.

- [ ] **Step 1: Agregar estados y funciones**

```javascript
const costos = ref(null)
const inscripcionesTiempo = ref([])
const cursosPopulares = ref([])
const favoritos = ref([])
const programados = ref([])

async function cargarCostos() {
  loading.value.costos = true
  error.value.costos = null
  try {
    costos.value = await obtenerCostos()
  } catch (e) {
    error.value.costos = e?.message || 'Error'
  } finally {
    loading.value.costos = false
  }
}

async function cargarInscripcionesTiempo(desde, hasta) {
  loading.value.inscripcionesTiempo = true
  error.value.inscripcionesTiempo = null
  try {
    inscripcionesTiempo.value = await obtenerInscripcionesTiempo(desde, hasta)
  } catch (e) {
    error.value.inscripcionesTiempo = e?.message || 'Error'
  } finally {
    loading.value.inscripcionesTiempo = false
  }
}

async function cargarCursosPopulares(limite) {
  loading.value.cursosPopulares = true
  error.value.cursosPopulares = null
  try {
    cursosPopulares.value = await obtenerCursosPopulares(limite)
  } catch (e) {
    error.value.cursosPopulares = e?.message || 'Error'
  } finally {
    loading.value.cursosPopulares = false
  }
}

async function cargarFavoritos() {
  try {
    favoritos.value = await cargarFavoritosService()
  } catch (e) {
    // silent
  }
}

async function cargarProgramados() {
  try {
    programados.value = await cargarProgramadosService()
  } catch (e) {
    // silent
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useReportes.js
git commit -m "feat(reportes): extiende useReportes con costos, favoritos y programados"
```

---

## Task 6: Tests del Composable

**Files:**

- Modify: `src/composables/__tests__/useReportes.test.js`

**Goal:** Tests para nuevas funciones.

- [ ] **Step 1: Agregar tests**

```javascript
it('carga costos', async () => {
  const { obtenerCostos } = await import('@/services/reportes.js')
  obtenerCostos.mockResolvedValue({ almacenamiento_videos_gb: 10 })
  const r = useReportes()
  await r.cargarCostos()
  expect(r.costos.value.almacenamiento_videos_gb).toBe(10)
})
```

- [ ] **Step 2: Ejecutar y commit**

```bash
npm run test:unit -- src/composables/__tests__/useReportes.test.js
git add src/composables/__tests__/useReportes.test.js
git commit -m "test(reportes): tests para useReportes H3"
```

---

## Task 7: Componente CostosDashboard.vue

**Files:**

- Create: `src/components/CostosDashboard.vue`

**Goal:** Cards con métricas de costos.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      almacenamiento_videos_gb: 0,
      almacenamiento_docs_gb: 0,
      total_tokens: 0,
      costo_total_estimado_usd: 0,
    }),
  },
})

function formatUSD(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}
</script>

<template>
  <div class="costos-dashboard">
    <div class="cards-grid">
      <div class="card">
        <p class="eyebrow">Almacenamiento videos</p>
        <p class="h4">{{ data.almacenamiento_videos_gb }} GB</p>
      </div>
      <div class="card">
        <p class="eyebrow">Almacenamiento documentos</p>
        <p class="h4">{{ data.almacenamiento_docs_gb }} GB</p>
      </div>
      <div class="card">
        <p class="eyebrow">Tokens IA consumidos</p>
        <p class="h4">{{ data.total_tokens?.toLocaleString() || 0 }}</p>
      </div>
      <div class="card">
        <p class="eyebrow">Costo estimado total</p>
        <p class="h4">{{ formatUSD(data.costo_total_estimado_usd) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: calc(var(--unit) * 2);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CostosDashboard.vue
git commit -m "feat(reportes): componente CostosDashboard"
```

---

## Task 8: Componente InscripcionesTimeline.vue

**Files:**

- Create: `src/components/InscripcionesTimeline.vue`

**Goal:** Gráfico de líneas con Chart.js.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const labels = computed(() => props.data.map((d) => d.fecha))
const values = computed(() => props.data.map((d) => d.total_inscripciones))

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Inscripciones',
      data: values.value,
      borderColor: 'var(--primary)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.3,
    },
  ],
}))
</script>

<template>
  <div class="inscripciones-timeline">
    <canvas v-if="data.length" ref="canvas"></canvas>
    <p v-else class="caption">Sin datos de inscripciones.</p>
  </div>
</template>
```

**Note:** Chart.js integration can be done with vue-chartjs or raw Chart.js. Use existing project patterns.

- [ ] **Step 2: Commit**

```bash
git add src/components/InscripcionesTimeline.vue
git commit -m "feat(reportes): componente InscripcionesTimeline"
```

---

## Task 9: Componentes de Personalizables

**Files:**

- Create: `src/components/ReporteFavoritosManager.vue`
- Create: `src/components/ReporteProgramadoForm.vue`
- Create: `src/components/ReporteProgramadoList.vue`

**Goal:** Gestión de favoritos y programados.

- [ ] **Step 1: Crear ReporteFavoritosManager**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { cargarFavoritos, eliminarFavorito } from '@/services/reportes.js'

const favoritos = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  favoritos.value = await cargarFavoritos()
  loading.value = false
})

async function eliminar(id) {
  await eliminarFavorito(id)
  favoritos.value = favoritos.value.filter((f) => f.id !== id)
}
</script>

<template>
  <div class="favoritos-manager">
    <p class="eyebrow">Mis reportes guardados</p>
    <div v-if="loading" class="skeleton">Cargando...</div>
    <div v-else-if="favoritos.length" class="favoritos-list">
      <div v-for="f in favoritos" :key="f.id" class="favorito-item">
        <span>{{ f.nombre }}</span>
        <span class="caption">{{ f.tipo_reporte }}</span>
        <button class="btn btn-sm btn-secondary" @click="eliminar(f.id)">Eliminar</button>
      </div>
    </div>
    <p v-else class="caption">No tienes reportes guardados.</p>
  </div>
</template>
```

- [ ] **Step 2: Crear ReporteProgramadoForm**

```vue
<script setup>
import { ref } from 'vue'
import { programarReporte } from '@/services/reportes.js'

const emit = defineEmits(['guardado'])

const nombre = ref('')
const tipoReporte = ref('funnel')
const frecuencia = ref('semanal')
const guardando = ref(false)

async function guardar() {
  guardando.value = true
  await programarReporte(nombre.value, tipoReporte.value, {}, frecuencia.value)
  guardando.value = false
  emit('guardado')
}
</script>

<template>
  <form @submit.prevent="guardar" class="programado-form">
    <input v-model="nombre" placeholder="Nombre del reporte" class="field" required />
    <select v-model="tipoReporte" class="field">
      <option value="funnel">Funnel</option>
      <option value="retencion">Retención</option>
      <option value="costos">Costos</option>
    </select>
    <select v-model="frecuencia" class="field">
      <option value="diario">Diario</option>
      <option value="semanal">Semanal</option>
      <option value="mensual">Mensual</option>
    </select>
    <button type="submit" class="btn btn-primary" :disabled="guardando">Programar</button>
  </form>
</template>
```

- [ ] **Step 3: Crear ReporteProgramadoList**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { cargarProgramados } from '@/services/reportes.js'

const programados = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  programados.value = await cargarProgramados()
  loading.value = false
})
</script>

<template>
  <div class="programados-list">
    <p class="eyebrow">Reportes programados</p>
    <table v-if="programados.length" class="admin-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Tipo</th>
          <th>Frecuencia</th>
          <th>Activo</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in programados" :key="p.id">
          <td>{{ p.nombre }}</td>
          <td>{{ p.tipo_reporte }}</td>
          <td>{{ p.frecuencia }}</td>
          <td>{{ p.activo ? 'Sí' : 'No' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="caption">Sin reportes programados.</p>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ReporteFavoritosManager.vue src/components/ReporteProgramadoForm.vue src/components/ReporteProgramadoList.vue
git commit -m "feat(reportes): componentes favoritos y programados"
```

---

## Task 10: Integración en AdminReportes.vue

**Files:**

- Modify: `src/components/AdminReportes.vue`

**Goal:** Agregar tabs "Financieros" y "Personalizados".

- [ ] **Step 1: Agregar imports y tabs**

```vue
<script setup>
import CostosDashboard from './CostosDashboard.vue'
import InscripcionesTimeline from './InscripcionesTimeline.vue'
import ReporteFavoritosManager from './ReporteFavoritosManager.vue'
import ReporteProgramadoForm from './ReporteProgramadoForm.vue'
import ReporteProgramadoList from './ReporteProgramadoList.vue'

const tabs = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'retencion', label: 'Retención' },
  { key: 'comparativa', label: 'Comparativa' },
  { key: 'financieros', label: 'Financieros' },
  { key: 'personalizados', label: 'Personalizados' },
]
</script>
```

- [ ] **Step 2: Agregar contenido de tabs**

```vue
<!-- Dentro del template -->
<div v-else-if="activeTab === 'financieros'" class="tab-content">
  <p class="eyebrow">Costos de infraestructura</p>
  <CostosDashboard :data="costos" />
  <p class="eyebrow">Inscripciones por tiempo</p>
  <InscripcionesTimeline :data="inscripcionesTiempo" />
</div>

<div v-else-if="activeTab === 'personalizados'" class="tab-content">
  <ReporteFavoritosManager />
  <ReporteProgramadoList />
  <ReporteProgramadoForm @guardado="recargarProgramados" />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminReportes.vue
git commit -m "feat(reportes): integra tabs financieros y personalizados en AdminReportes"
```

---

## Task 11: Verificación Final

- [ ] **Step 1: Tests**

```bash
npm run test:unit
```

Expected: Todos pasan

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Éxito

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(reportes): correcciones post-verificación H3"
```

---

## Task 12: Merge y Release v0.12.0

- [ ] **Step 1: Merge**

```bash
git checkout main
git merge fase-h3-financieros-personalizables --no-edit
```

- [ ] **Step 2: Tag y push**

```bash
git tag -a v0.12.0 -m "Release v0.12.0 — Financieros + Reportes Personalizables"
git push origin main
git push origin v0.12.0
```

- [ ] **Step 3: GitHub Release**

```bash
gh release create v0.12.0 --title "Release v0.12.0 — Financieros + Reportes Personalizables" --notes "## Release v0.12.0

### Features
- Dashboard de costos: almacenamiento videos/documentos, tokens IA, costo estimado
- Gráfico de inscripciones por tiempo
- Ranking de cursos populares
- Reportes favoritos: guardar configuraciones de reportes
- Reportes programados: ejecución automática diaria/semanal/mensual
- Historial de ejecuciones
- Release v0.12.0"
```

---

## Spec Coverage Checklist

| Spec Requirement                      | Task    |
| ------------------------------------- | ------- |
| Tablas SQL (3)                        | Task 1  |
| Vistas SQL (3)                        | Task 1  |
| Edge Function endpoints (3)           | Task 2  |
| Servicio reportes.js (6 funciones)    | Task 3  |
| Tests servicio                        | Task 4  |
| Composable useReportes                | Task 5  |
| Tests composable                      | Task 6  |
| CostosDashboard.vue                   | Task 7  |
| InscripcionesTimeline.vue             | Task 8  |
| Favoritos/Programados (3 componentes) | Task 9  |
| Integración AdminReportes.vue         | Task 10 |
| Verificación                          | Task 11 |
| Release v0.12.0                       | Task 12 |
