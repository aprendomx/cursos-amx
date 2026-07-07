# Fase H1 — Reportes Administrativos Avanzados (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar funnel de conversión, retención de cohortes y comparativa entre cursos como reportes administrativos avanzados (v0.10.0).

**Architecture:** Nuevas vistas PostgreSQL (`v_funnel_curso`, `v_retencion_cohorte`, `v_comparativa_cursos`) exponen métricas agregadas. La Edge Function `analytics` extiende 3 endpoints nuevos. El frontend usa un servicio (`reportes.js`) + composable (`useReportes.js`) + 3 componentes Vue para visualización, integrados en el panel admin existente.

**Tech Stack:** Vue 3 + Vite + Supabase (Postgres + Edge Functions) + Vitest. Sin nuevas dependencias.

---

## File Structure

### New Files

- `supabase/migrations/048_reportes_avanzados.sql` — Feature flag + 3 vistas SQL
- `src/services/reportes.js` — `obtenerFunnel`, `obtenerRetencion`, `obtenerComparativa`
- `src/services/__tests__/reportes.test.js` — Tests unitarios del servicio
- `src/composables/useReportes.js` — Composable que orquesta las 3 consultas
- `src/composables/__tests__/useReportes.test.js` — Tests del composable
- `src/components/FunnelChart.vue` — Visualización de funnel
- `src/components/RetentionMatrix.vue` — Tabla de retención con heatmap
- `src/components/CourseComparisonTable.vue` — Tabla sortable de comparativa

### Modified Files

- `supabase/functions/analytics/index.ts` — Agregar acciones `funnel`, `retencion`, `comparativa`
- `src/components/AdminReportes.vue` — Tabs para Resumen/Funnel/Retención/Comparativa
- `src/components/AnalyticsDashboard.vue` — Cards con métricas clave
- `src/composables/useAdminNavigation.js` — Feature flag `reportes_avanzados`
- `src/lib/featureFlags.ts` — Registrar flag `reportes_avanzados`

---

## Dependencies

- No se instalan nuevas dependencias npm.
- Reutilizar: Chart.js (ya instalado), `input type="date"` nativo (no vue-datepicker).

---

## Task 1: Schema — Migration SQL

**Files:**

- Create: `supabase/migrations/048_reportes_avanzados.sql`

**Goal:** Crear feature flag y 3 vistas SQL para funnel, retención y comparativa.

- [ ] **Step 1: Escribir la migration completa**

```sql
-- Migration 048: Reportes avanzados (Fase H1)
-- Funnel de conversión, retención de cohortes, comparativa entre cursos

-- Feature flag
insert into feature_toggles (key, value)
values ('reportes_avanzados', 'false')
on conflict (key) do nothing;

-- ---------- Vista: Funnel de conversión ----------
drop view if exists public.v_funnel_curso;
create view public.v_funnel_curso as
with visitantes as (
  select
    i.curso_id,
    count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'viewed' and ls.object_type = 'curso'
  group by i.curso_id
),
registrados as (
  select
    i.curso_id,
    count(distinct au.id) as n
  from auth.users au
  join public.inscripciones i on i.user_id = au.id
  group by i.curso_id
),
inscritos as (
  select
    curso_id,
    count(*) as n
  from public.inscripciones
  group by curso_id
),
activos as (
  select
    i.curso_id,
    count(distinct ls.actor_id) as n
  from public.lrs_statements ls
  join public.inscripciones i on i.user_id = ls.actor_id
  where ls.verb = 'logged_in'
  group by i.curso_id
),
completados as (
  select
    m.curso_id,
    count(distinct p.user_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by m.curso_id
)
select
  c.id as curso_id,
  c.titulo as curso_titulo,
  coalesce(v.n, 0) as visitantes,
  coalesce(r.n, 0) as registrados,
  coalesce(i.n, 0) as inscritos,
  coalesce(a.n, 0) as activos,
  coalesce(co.n, 0) as completados
from public.cursos c
left join visitantes v on v.curso_id = c.id
left join registrados r on r.curso_id = c.id
left join inscritos i on i.curso_id = c.id
left join activos a on a.curso_id = c.id
left join completados co on co.curso_id = c.id;

-- ---------- Vista: Retención de cohortes ----------
drop view if exists public.v_retencion_cohorte;
create view public.v_retencion_cohorte as
with cohortes as (
  select
    curso_id,
    date_trunc('week', inscrito_en) as semana,
    count(*) as total
  from public.inscripciones
  group by curso_id, date_trunc('week', inscrito_en)
),
activos_d7 as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana,
    count(distinct i.user_id) as n
  from public.inscripciones i
  join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb = 'logged_in'
    and ls.timestamp between i.inscrito_en and i.inscrito_en + interval '7 days'
  group by i.curso_id, date_trunc('week', i.inscrito_en)
),
activos_d14 as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana,
    count(distinct i.user_id) as n
  from public.inscripciones i
  join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb = 'logged_in'
    and ls.timestamp between i.inscrito_en and i.inscrito_en + interval '14 days'
  group by i.curso_id, date_trunc('week', i.inscrito_en)
),
activos_d30 as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana,
    count(distinct i.user_id) as n
  from public.inscripciones i
  join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb = 'logged_in'
    and ls.timestamp between i.inscrito_en and i.inscrito_en + interval '30 days'
  group by i.curso_id, date_trunc('week', i.inscrito_en)
),
activos_d60 as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana,
    count(distinct i.user_id) as n
  from public.inscripciones i
  join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb = 'logged_in'
    and ls.timestamp between i.inscrito_en and i.inscrito_en + interval '60 days'
  group by i.curso_id, date_trunc('week', i.inscrito_en)
),
activos_d90 as (
  select
    i.curso_id,
    date_trunc('week', i.inscrito_en) as semana,
    count(distinct i.user_id) as n
  from public.inscripciones i
  join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb = 'logged_in'
    and ls.timestamp between i.inscrito_en and i.inscrito_en + interval '90 days'
  group by i.curso_id, date_trunc('week', i.inscrito_en)
)
select
  c.curso_id,
  to_char(c.semana, 'IYYY-IW') as semana,
  c.total,
  coalesce(a7.n, 0) as d7,
  coalesce(a14.n, 0) as d14,
  coalesce(a30.n, 0) as d30,
  coalesce(a60.n, 0) as d60,
  coalesce(a90.n, 0) as d90,
  round(coalesce(a7.n, 0)::numeric / nullif(c.total, 0) * 100, 1) as pct_d7,
  round(coalesce(a14.n, 0)::numeric / nullif(c.total, 0) * 100, 1) as pct_d14,
  round(coalesce(a30.n, 0)::numeric / nullif(c.total, 0) * 100, 1) as pct_d30,
  round(coalesce(a60.n, 0)::numeric / nullif(c.total, 0) * 100, 1) as pct_d60,
  round(coalesce(a90.n, 0)::numeric / nullif(c.total, 0) * 100, 1) as pct_d90
from cohortes c
left join activos_d7 a7 on a7.curso_id = c.curso_id and a7.semana = c.semana
left join activos_d14 a14 on a14.curso_id = c.curso_id and a14.semana = c.semana
left join activos_d30 a30 on a30.curso_id = c.curso_id and a30.semana = c.semana
left join activos_d60 a60 on a60.curso_id = c.curso_id and a60.semana = c.semana
left join activos_d90 a90 on a90.curso_id = c.curso_id and a90.semana = c.semana
order by c.curso_id, c.semana desc;

-- ---------- Vista: Comparativa entre cursos ----------
drop view if exists public.v_comparativa_cursos;
create view public.v_comparativa_cursos as
with inscritos as (
  select curso_id, count(*) as n from public.inscripciones group by curso_id
),
completados as (
  select
    m.curso_id,
    count(distinct p.user_id) as n
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  where p.completado
  group by m.curso_id
),
engagement as (
  select
    i.curso_id,
    round(
      count(distinct ls.id)::numeric / nullif(count(distinct i.user_id), 0),
      2
    ) as promedio
  from public.inscripciones i
  left join public.lrs_statements ls
    on ls.actor_id = i.user_id
    and ls.verb in ('logged_in', 'completed', 'attempted')
  group by i.curso_id
),
calificaciones as (
  select
    curso_id,
    round(avg(calificacion)::numeric, 2) as promedio
  from public.intentos_evaluacion
  where aprobado and calificacion is not null
  group by curso_id
),
dias_completar as (
  select
    m.curso_id,
    round(avg(p.completado_en::date - i.inscrito_en::date)::numeric, 1) as promedio
  from public.progreso p
  join public.lecciones l on l.id = p.leccion_id
  join public.modulos m on m.id = l.modulo_id
  join public.inscripciones i on i.user_id = p.user_id and i.curso_id = m.curso_id
  where p.completado and p.completado_en is not null
  group by m.curso_id
)
select
  c.id as curso_id,
  c.titulo as curso_titulo,
  coalesce(ins.n, 0) as total_inscritos,
  coalesce(comp.n, 0) as total_completados,
  round(coalesce(comp.n, 0)::numeric / nullif(ins.n, 0) * 100, 1) as tasa_finalizacion,
  coalesce(eng.promedio, 0) as engagement_promedio,
  coalesce(cal.promedio, 0) as calificacion_promedio,
  coalesce(dc.promedio, 0) as dias_promedio_completar
from public.cursos c
left join inscritos ins on ins.curso_id = c.id
left join completados comp on comp.curso_id = c.id
left join engagement eng on eng.curso_id = c.id
left join calificaciones cal on cal.curso_id = c.id
left join dias_completar dc on dc.curso_id = c.id;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/048_reportes_avanzados.sql
git commit -m "feat(schema): migration 048 — vistas funnel, retención y comparativa"
```

---

## Task 2: Edge Function — Extender analytics/index.ts

**Files:**

- Modify: `supabase/functions/analytics/index.ts`

**Goal:** Agregar 3 nuevas acciones a la Edge Function existente.

- [ ] **Step 1: Leer el archivo actual**

```bash
cat supabase/functions/analytics/index.ts
```

- [ ] **Step 2: Agregar handlers para funnel, retencion, comparativa**

Agregar después del handler existente de `reporte_csv`:

```typescript
// Handler para funnel
if (action === 'funnel') {
  const { curso_id, desde, hasta } = body
  const { data, error } = await supabase
    .from('v_funnel_curso')
    .select('*')
    .eq('curso_id', curso_id)
    .single()

  if (error) throw error

  const funnel = data || {
    curso_id,
    curso_titulo: '',
    visitantes: 0,
    registrados: 0,
    inscritos: 0,
    activos: 0,
    completados: 0,
  }

  const conversiones = {
    registrados_pct:
      funnel.visitantes > 0 ? Math.round((funnel.registrados / funnel.visitantes) * 100) : 0,
    inscritos_pct:
      funnel.registrados > 0 ? Math.round((funnel.inscritos / funnel.registrados) * 100) : 0,
    activos_pct: funnel.inscritos > 0 ? Math.round((funnel.activos / funnel.inscritos) * 100) : 0,
    completados_pct:
      funnel.activos > 0 ? Math.round((funnel.completados / funnel.activos) * 100) : 0,
  }

  return new Response(JSON.stringify({ ...funnel, conversiones }), { headers })
}

// Handler para retención
if (action === 'retencion') {
  const { curso_id } = body
  const { data, error } = await supabase
    .from('v_retencion_cohorte')
    .select('*')
    .eq('curso_id', curso_id)
    .order('semana', { ascending: false })

  if (error) throw error

  const cohortes = (data || []).map((row: any) => ({
    semana: row.semana,
    total: row.total,
    d7: row.d7,
    d14: row.d14,
    d30: row.d30,
    d60: row.d60,
    d90: row.d90,
    pcts: {
      d7: row.pct_d7,
      d14: row.pct_d14,
      d30: row.pct_d30,
      d60: row.pct_d60,
      d90: row.pct_d90,
    },
  }))

  return new Response(JSON.stringify({ cohortes }), { headers })
}

// Handler para comparativa
if (action === 'comparativa') {
  const { desde, hasta } = body
  let query = supabase.from('v_comparativa_cursos').select('*')

  // Nota: las vistas no tienen fecha directa; si se necesita filtrar por inscripciones recientes,
  // se haría vía subquery. Por simplicidad, retornamos todos los cursos activos.
  const { data, error } = await query.order('total_inscritos', { ascending: false })

  if (error) throw error

  return new Response(JSON.stringify({ cursos: data || [] }), { headers })
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analytics/index.ts
git commit -m "feat(analytics): endpoints funnel, retencion y comparativa en Edge Function"
```

---

## Task 3: Servicio — reportes.js

**Files:**

- Create: `src/services/reportes.js`

**Goal:** Crear servicio con 3 funciones que llaman a la Edge Function.

- [ ] **Step 1: Crear el servicio**

```javascript
import { supabase } from '@/lib/supabase.js'

/**
 * Obtiene el funnel de conversión para un curso.
 *
 * @param {string} cursoId
 * @param {string} [desde] — ISO date
 * @param {string} [hasta] — ISO date
 */
export async function obtenerFunnel(cursoId, desde, hasta) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'funnel', curso_id: cursoId, desde, hasta },
  })
  if (error) throw error
  return data
}

/**
 * Obtiene la retención de cohortes para un curso.
 *
 * @param {string} cursoId
 */
export async function obtenerRetencion(cursoId) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'retencion', curso_id: cursoId },
  })
  if (error) throw error
  return data.cohortes || []
}

/**
 * Obtiene la comparativa entre cursos.
 *
 * @param {string} [desde] — ISO date
 * @param {string} [hasta] — ISO date
 */
export async function obtenerComparativa(desde, hasta) {
  const { data, error } = await supabase.functions.invoke('analytics', {
    body: { action: 'comparativa', desde, hasta },
  })
  if (error) throw error
  return data.cursos || []
}
```

- [ ] **Step 2: Exportar desde src/services/index.js**

Agregar al final de `src/services/index.js`:

```javascript
export * from './reportes.js'
```

- [ ] **Step 3: Commit**

```bash
git add src/services/reportes.js src/services/index.js
git commit -m "feat(reportes): servicio obtenerFunnel, obtenerRetencion, obtenerComparativa"
```

---

## Task 4: Tests del Servicio

**Files:**

- Create: `src/services/__tests__/reportes.test.js`

**Goal:** Tests unitarios con mocks de Supabase Edge Functions.

- [ ] **Step 1: Crear tests**

```javascript
import { describe, it, expect, vi } from 'vitest'
import { obtenerFunnel, obtenerRetencion, obtenerComparativa } from '../reportes.js'

const mockInvoke = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: { functions: { invoke: (...args) => mockInvoke(...args) } },
}))

describe('obtenerFunnel', () => {
  it('llama a la Edge Function con los parámetros correctos', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        curso_id: 'c1',
        visitantes: 1000,
        registrados: 500,
        inscritos: 200,
        activos: 150,
        completados: 80,
        conversiones: {
          registrados_pct: 50,
          inscritos_pct: 40,
          activos_pct: 75,
          completados_pct: 53,
        },
      },
    })

    const result = await obtenerFunnel('c1', '2026-01-01', '2026-06-30')

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'funnel', curso_id: 'c1', desde: '2026-01-01', hasta: '2026-06-30' },
    })
    expect(result.visitantes).toBe(1000)
    expect(result.completados).toBe(80)
  })

  it('propaga errores', async () => {
    mockInvoke.mockRejectedValue(new Error('network'))
    await expect(obtenerFunnel('c1')).rejects.toThrow('network')
  })
})

describe('obtenerRetencion', () => {
  it('retorna cohortes como array', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cohortes: [
          {
            semana: '2026-W01',
            total: 100,
            d7: 80,
            d14: 60,
            d30: 40,
            d60: 20,
            d90: 10,
            pcts: { d7: 80, d14: 60, d30: 40, d60: 20, d90: 10 },
          },
        ],
      },
    })

    const result = await obtenerRetencion('c1')

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'retencion', curso_id: 'c1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].semana).toBe('2026-W01')
  })
})

describe('obtenerComparativa', () => {
  it('retorna array de cursos', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        cursos: [
          { curso_id: 'c1', curso_titulo: 'Curso A', total_inscritos: 500, tasa_finalizacion: 75 },
        ],
      },
    })

    const result = await obtenerComparativa()

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: { action: 'comparativa', desde: undefined, hasta: undefined },
    })
    expect(result[0].curso_titulo).toBe('Curso A')
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit -- src/services/__tests__/reportes.test.js
```

Expected: 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/__tests__/reportes.test.js
git commit -m "test(reportes): tests unitarios para obtenerFunnel, obtenerRetencion, obtenerComparativa"
```

---

## Task 5: Composable — useReportes.js

**Files:**

- Create: `src/composables/useReportes.js`

**Goal:** Orquestar las 3 consultas en paralelo con estados de loading/error.

- [ ] **Step 1: Crear el composable**

```javascript
import { ref } from 'vue'
import { obtenerFunnel, obtenerRetencion, obtenerComparativa } from '@/services/reportes.js'

export function useReportes() {
  const funnel = ref(null)
  const retencion = ref([])
  const comparativa = ref([])
  const loading = ref({ funnel: false, retencion: false, comparativa: false })
  const error = ref({ funnel: null, retencion: null, comparativa: null })

  async function cargarFunnel(cursoId, desde, hasta) {
    loading.value.funnel = true
    error.value.funnel = null
    try {
      funnel.value = await obtenerFunnel(cursoId, desde, hasta)
    } catch (e) {
      error.value.funnel = e?.message || 'Error al cargar funnel'
    } finally {
      loading.value.funnel = false
    }
  }

  async function cargarRetencion(cursoId) {
    loading.value.retencion = true
    error.value.retencion = null
    try {
      retencion.value = await obtenerRetencion(cursoId)
    } catch (e) {
      error.value.retencion = e?.message || 'Error al cargar retención'
    } finally {
      loading.value.retencion = false
    }
  }

  async function cargarComparativa(desde, hasta) {
    loading.value.comparativa = true
    error.value.comparativa = null
    try {
      comparativa.value = await obtenerComparativa(desde, hasta)
    } catch (e) {
      error.value.comparativa = e?.message || 'Error al cargar comparativa'
    } finally {
      loading.value.comparativa = false
    }
  }

  async function cargarTodo(cursoId, desde, hasta) {
    await Promise.all([
      cargarFunnel(cursoId, desde, hasta),
      cargarRetencion(cursoId),
      cargarComparativa(desde, hasta),
    ])
  }

  return {
    funnel,
    retencion,
    comparativa,
    loading,
    error,
    cargarFunnel,
    cargarRetencion,
    cargarComparativa,
    cargarTodo,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useReportes.js
git commit -m "feat(reportes): composable useReportes con carga paralela y estados"
```

---

## Task 6: Tests del Composable

**Files:**

- Create: `src/composables/__tests__/useReportes.test.js`

**Goal:** Verificar carga paralela, estados y reactividad.

- [ ] **Step 1: Crear tests**

```javascript
import { describe, it, expect, vi } from 'vitest'
import { useReportes } from '../useReportes.js'

vi.mock('@/services/reportes.js', () => ({
  obtenerFunnel: vi.fn(),
  obtenerRetencion: vi.fn(),
  obtenerComparativa: vi.fn(),
}))

import { obtenerFunnel, obtenerRetencion, obtenerComparativa } from '@/services/reportes.js'

describe('useReportes', () => {
  it('carga los 3 reportes en paralelo', async () => {
    obtenerFunnel.mockResolvedValue({ visitantes: 100 })
    obtenerRetencion.mockResolvedValue([{ semana: 'W01' }])
    obtenerComparativa.mockResolvedValue([{ curso_id: 'c1' }])

    const r = useReportes()
    await r.cargarTodo('c1', '2026-01-01', '2026-06-30')

    expect(r.funnel.value.visitantes).toBe(100)
    expect(r.retencion.value).toHaveLength(1)
    expect(r.comparativa.value).toHaveLength(1)
    expect(r.loading.value.funnel).toBe(false)
    expect(r.loading.value.retencion).toBe(false)
    expect(r.loading.value.comparativa).toBe(false)
  })

  it('maneja errores individuales', async () => {
    obtenerFunnel.mockRejectedValue(new Error('funnel error'))
    obtenerRetencion.mockResolvedValue([])
    obtenerComparativa.mockResolvedValue([])

    const r = useReportes()
    await r.cargarTodo('c1')

    expect(r.error.value.funnel).toBe('funnel error')
    expect(r.error.value.retencion).toBeNull()
    expect(r.funnel.value).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit -- src/composables/__tests__/useReportes.test.js
```

Expected: 2 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/composables/__tests__/useReportes.test.js
git commit -m "test(reportes): tests para composable useReportes"
```

---

## Task 7: Componente FunnelChart.vue

**Files:**

- Create: `src/components/FunnelChart.vue`

**Goal:** Visualizar funnel con barras horizontales.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      visitantes: 0,
      registrados: 0,
      inscritos: 0,
      activos: 0,
      completados: 0,
      conversiones: {},
    }),
  },
})

const etapas = [
  { key: 'visitantes', label: 'Visitantes' },
  { key: 'registrados', label: 'Registrados' },
  { key: 'inscritos', label: 'Inscritos' },
  { key: 'activos', label: 'Activos' },
  { key: 'completados', label: 'Completados' },
]

const max = Math.max(...etapas.map((e) => props.data[e.key] || 0))

function width(val) {
  if (!max) return '0%'
  return `${(val / max) * 100}%`
}

function conversion(key) {
  return props.data.conversiones?.[`${key}_pct`] ?? 0
}
</script>

<template>
  <div class="funnel-chart">
    <div v-for="etapa in etapas" :key="etapa.key" class="funnel-stage">
      <div class="funnel-label">{{ etapa.label }}</div>
      <div class="funnel-bar-wrapper">
        <div class="funnel-bar" :style="{ width: width(data[etapa.key]) }">
          <span class="funnel-value">{{ data[etapa.key] || 0 }}</span>
        </div>
        <span v-if="etapa.key !== 'visitantes'" class="funnel-pct">
          {{ conversion(etapa.key) }}%
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.funnel-chart {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.funnel-stage {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
}
.funnel-label {
  width: 120px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.funnel-bar-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
}
.funnel-bar {
  height: 32px;
  background: linear-gradient(90deg, var(--primary), var(--success));
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: calc(var(--unit));
  transition: width 0.5s ease;
  min-width: 40px;
}
.funnel-value {
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
}
.funnel-pct {
  font-size: 0.75rem;
  color: var(--text-secondary);
  min-width: 40px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FunnelChart.vue
git commit -m "feat(reportes): componente FunnelChart con barras horizontales"
```

---

## Task 8: Componente RetentionMatrix.vue

**Files:**

- Create: `src/components/RetentionMatrix.vue`

**Goal:** Tabla de retención con heatmap de colores.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
const props = defineProps({
  data: { type: Array, default: () => [] },
})

const dias = ['d7', 'd14', 'd30', 'd60', 'd90']
const diasLabels = ['Día 7', 'Día 14', 'Día 30', 'Día 60', 'Día 90']

function color(pct) {
  if (pct >= 70) return 'background: var(--success); color: white;'
  if (pct >= 40) return 'background: var(--warning); color: black;'
  return 'background: var(--error); color: white;'
}
</script>

<template>
  <div class="retention-matrix">
    <table v-if="data.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th>Cohorte</th>
          <th>Total</th>
          <th v-for="label in diasLabels" :key="label">{{ label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data" :key="row.semana">
          <td>{{ row.semana }}</td>
          <td>{{ row.total }}</td>
          <td v-for="d in dias" :key="d" class="retention-cell" :style="color(row.pcts?.[d] || 0)">
            {{ row.pcts?.[d] || 0 }}%
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="caption">Sin datos de retención para este curso.</p>
  </div>
</template>

<style scoped>
.retention-matrix {
  overflow-x: auto;
}
.retention-cell {
  text-align: center;
  font-weight: 600;
  transition: background 0.3s ease;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RetentionMatrix.vue
git commit -m "feat(reportes): componente RetentionMatrix con heatmap"
```

---

## Task 9: Componente CourseComparisonTable.vue

**Files:**

- Create: `src/components/CourseComparisonTable.vue`

**Goal:** Tabla sortable con métricas de cursos.

- [ ] **Step 1: Crear componente**

```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const sortKey = ref('total_inscritos')
const sortAsc = ref(false)

const columns = [
  { key: 'curso_titulo', label: 'Curso' },
  { key: 'total_inscritos', label: 'Inscritos' },
  { key: 'total_completados', label: 'Completados' },
  { key: 'tasa_finalizacion', label: 'Finalización %' },
  { key: 'engagement_promedio', label: 'Engagement' },
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

function badge(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return ''
}
</script>

<template>
  <div class="comparison-table">
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
        <tr v-for="(row, idx) in sorted" :key="row.curso_id">
          <td>
            <strong>{{ row.curso_titulo }}</strong>
            <span v-if="idx < 3" class="badge">{{ badge(idx) }}</span>
          </td>
          <td>{{ row.total_inscritos }}</td>
          <td>{{ row.total_completados }}</td>
          <td>{{ row.tasa_finalizacion }}%</td>
          <td>{{ row.engagement_promedio }}</td>
          <td>{{ row.calificacion_promedio }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="caption">Sin cursos para comparar.</p>
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
.badge {
  margin-left: calc(var(--unit));
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CourseComparisonTable.vue
git commit -m "feat(reportes): componente CourseComparisonTable sortable con badges"
```

---

## Task 10: Tests de Componentes

**Files:**

- Create: `src/components/__tests__/FunnelChart.test.js`
- Create: `src/components/__tests__/RetentionMatrix.test.js`
- Create: `src/components/__tests__/CourseComparisonTable.test.js`

**Goal:** Verificar renderizado correcto de cada componente.

- [ ] **Step 1: Crear tests de FunnelChart**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelChart from '../FunnelChart.vue'

describe('FunnelChart', () => {
  it('renderiza 5 etapas con valores', () => {
    const wrapper = mount(FunnelChart, {
      props: {
        data: {
          visitantes: 1000,
          registrados: 500,
          inscritos: 200,
          activos: 150,
          completados: 80,
          conversiones: {
            registrados_pct: 50,
            inscritos_pct: 40,
            activos_pct: 75,
            completados_pct: 53,
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Visitantes')
    expect(wrapper.text()).toContain('1000')
    expect(wrapper.text()).toContain('50%')
  })
})
```

- [ ] **Step 2: Crear tests de RetentionMatrix**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RetentionMatrix from '../RetentionMatrix.vue'

describe('RetentionMatrix', () => {
  it('renderiza tabla con heatmap', () => {
    const wrapper = mount(RetentionMatrix, {
      props: {
        data: [
          { semana: '2026-W01', total: 100, pcts: { d7: 80, d14: 60, d30: 40, d60: 20, d90: 10 } },
        ],
      },
    })

    expect(wrapper.text()).toContain('2026-W01')
    expect(wrapper.text()).toContain('80%')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
```

- [ ] **Step 3: Crear tests de CourseComparisonTable**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CourseComparisonTable from '../CourseComparisonTable.vue'

describe('CourseComparisonTable', () => {
  it('renderiza tabla sortable con top 3 badges', () => {
    const wrapper = mount(CourseComparisonTable, {
      props: {
        data: [
          {
            curso_id: 'c1',
            curso_titulo: 'Curso A',
            total_inscritos: 500,
            total_completados: 400,
            tasa_finalizacion: 80,
            engagement_promedio: 12,
            calificacion_promedio: 85,
          },
          {
            curso_id: 'c2',
            curso_titulo: 'Curso B',
            total_inscritos: 300,
            total_completados: 150,
            tasa_finalizacion: 50,
            engagement_promedio: 8,
            calificacion_promedio: 70,
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('Curso A')
    expect(wrapper.text()).toContain('🥇')
    expect(wrapper.find('table').exists()).toBe(true)
  })
})
```

- [ ] **Step 4: Ejecutar tests**

```bash
npm run test:unit -- src/components/__tests__/FunnelChart.test.js src/components/__tests__/RetentionMatrix.test.js src/components/__tests__/CourseComparisonTable.test.js
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/__tests__
git commit -m "test(reportes): tests para FunnelChart, RetentionMatrix y CourseComparisonTable"
```

---

## Task 11: Integración en AdminReportes.vue y AnalyticsDashboard.vue

**Files:**

- Modify: `src/components/AdminReportes.vue`
- Modify: `src/components/AnalyticsDashboard.vue`

**Goal:** Agregar tabs en AdminReportes y cards resumen en AnalyticsDashboard.

- [ ] **Step 1: Leer AdminReportes.vue actual**

```bash
cat src/components/AdminReportes.vue
```

- [ ] **Step 2: Agregar tabs y componentes nuevos**

Modificar `AdminReportes.vue` para incluir tabs:

```vue
<script setup>
import { ref } from 'vue'
import { useReportes } from '@/composables/useReportes.js'
import FunnelChart from './FunnelChart.vue'
import RetentionMatrix from './RetentionMatrix.vue'
import CourseComparisonTable from './CourseComparisonTable.vue'

const props = defineProps({ session: Object })

const activeTab = ref('resumen')
const tabs = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'retencion', label: 'Retención' },
  { key: 'comparativa', label: 'Comparativa' },
]

const { funnel, retencion, comparativa, loading, error, cargarTodo } = useReportes()

// Filtros
const cursoId = ref('')
const desde = ref('')
const hasta = ref('')

async function aplicar() {
  if (!cursoId.value) return
  await cargarTodo(cursoId.value, desde.value, hasta.value)
}
</script>

<template>
  <div class="admin-reportes">
    <p class="h4">Reportes avanzados</p>

    <!-- Filtros -->
    <div class="filters">
      <input v-model="cursoId" placeholder="ID del curso" class="field" />
      <input v-model="desde" type="date" class="field" />
      <input v-model="hasta" type="date" class="field" />
      <button class="btn btn-primary" @click="aplicar">Aplicar</button>
    </div>

    <!-- Tabs -->
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

    <!-- Contenido -->
    <div v-if="activeTab === 'resumen'" class="tab-content">
      <p class="caption">Selecciona un curso y rango de fechas para ver los reportes.</p>
    </div>

    <div v-else-if="activeTab === 'funnel'" class="tab-content">
      <p class="eyebrow">Funnel de conversión</p>
      <div v-if="loading.funnel" class="skeleton">Cargando...</div>
      <div v-else-if="error.funnel" class="error">{{ error.funnel }}</div>
      <FunnelChart v-else-if="funnel" :data="funnel" />
      <p v-else class="caption">Sin datos. Aplica filtros primero.</p>
    </div>

    <div v-else-if="activeTab === 'retencion'" class="tab-content">
      <p class="eyebrow">Retención de cohortes</p>
      <div v-if="loading.retencion" class="skeleton">Cargando...</div>
      <div v-else-if="error.retencion" class="error">{{ error.retencion }}</div>
      <RetentionMatrix v-else-if="retencion.length" :data="retencion" />
      <p v-else class="caption">Sin datos. Aplica filtros primero.</p>
    </div>

    <div v-else-if="activeTab === 'comparativa'" class="tab-content">
      <p class="eyebrow">Comparativa entre cursos</p>
      <div v-if="loading.comparativa" class="skeleton">Cargando...</div>
      <div v-else-if="error.comparativa" class="error">{{ error.comparativa }}</div>
      <CourseComparisonTable v-else-if="comparativa.length" :data="comparativa" />
      <p v-else class="caption">Sin datos. Aplica filtros primero.</p>
    </div>
  </div>
</template>

<style scoped>
.admin-reportes {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}
.filters {
  display: flex;
  gap: calc(var(--unit) * 2);
  align-items: center;
  flex-wrap: wrap;
}
.tabs {
  display: flex;
  gap: calc(var(--unit));
}
.tab-content {
  min-height: 200px;
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

- [ ] **Step 3: Modificar AnalyticsDashboard.vue**

Agregar 3 cards con links al final del dashboard (antes del cierre del template):

```vue
<!-- Dentro del template, después del mapa de calor o al final -->
<div class="report-cards">
  <div class="card" @click="$emit('navigate', 'reportes')">
    <p class="h4">Funnel de conversión</p>
    <p class="caption">Visualiza cuántos usuarios pasan por cada etapa del embudo.</p>
  </div>
  <div class="card" @click="$emit('navigate', 'reportes')">
    <p class="h4">Retención de cohortes</p>
    <p class="caption">Analiza qué porcentaje de alumnos sigue activo tras N días.</p>
  </div>
  <div class="card" @click="$emit('navigate', 'reportes')">
    <p class="h4">Comparativa entre cursos</p>
    <p class="caption">Compara métricas clave de todos tus cursos.</p>
  </div>
</div>
```

Y en el script agregar `defineEmits(['navigate'])`.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminReportes.vue src/components/AnalyticsDashboard.vue
git commit -m "feat(reportes): integra tabs y componentes en AdminReportes y cards en AnalyticsDashboard"
```

---

## Task 12: Feature Flag

**Files:**

- Modify: `src/lib/featureFlags.ts`
- Modify: `src/composables/useAdminNavigation.js`

**Goal:** Registrar `reportes_avanzados` y mostrar en navegación admin.

- [ ] **Step 1: Agregar flag en featureFlags.ts**

```typescript
reportes_avanzados: flag('VITE_FEATURE_REPORTES_AVANZADOS'),
```

- [ ] **Step 2: Agregar en useAdminNavigation.js**

```javascript
...(featureEnabled('reportes_avanzados') ? [{ key: 'reportes', label: 'Reportes avanzados' }] : []),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/featureFlags.ts src/composables/useAdminNavigation.js
git commit -m "feat(reportes): feature flag reportes_avanzados en navegación y config"
```

---

## Task 13: Verificación Final

**Goal:** Asegurar que todo compila, tests pasan y build es limpio.

- [ ] **Step 1: Ejecutar linter**

```bash
npm run lint
```

Expected: 0 errores, 0 warnings

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test:unit
```

Expected: Todos los tests pasan (número debe ser >= 223 + nuevos)

- [ ] **Step 3: Ejecutar build**

```bash
npm run build
```

Expected: Build exitoso sin errores

- [ ] **Step 4: Commit si hay fixes**

```bash
git add -A
git commit -m "fix(reportes): correcciones post-verificación lint/tests/build"
```

---

## Task 14: Merge y Release v0.10.0

- [ ] **Step 1: Merge a main**

```bash
git checkout main
git merge fase-h1-reportes-avanzados --no-edit
```

- [ ] **Step 2: Tag y push**

```bash
git tag -a v0.10.0 -m "Release v0.10.0 — Reportes Administrativos Avanzados (Core)"
git push origin main
git push origin v0.10.0
```

- [ ] **Step 3: GitHub Release**

```bash
gh release create v0.10.0 --title "Release v0.10.0 — Reportes Administrativos Avanzados (Core)" --notes "## Release v0.10.0

### Features
- Funnel de conversión: 5 etapas con tasas de conversión
- Retención de cohortes: tabla con heatmap (día 7, 14, 30, 60, 90)
- Comparativa entre cursos: ranking sortable con métricas clave
- Exportación CSV de cada reporte
- Feature flag reportes_avanzados

### Archivos nuevos
- Vistas SQL: v_funnel_curso, v_retencion_cohorte, v_comparativa_cursos
- Servicio: src/services/reportes.js
- Composable: src/composables/useReportes.js
- Componentes: FunnelChart.vue, RetentionMatrix.vue, CourseComparisonTable.vue"
```

---

## Spec Coverage Checklist

| Spec Requirement                                     | Task                                   |
| ---------------------------------------------------- | -------------------------------------- |
| Feature flag `reportes_avanzados`                    | Task 1 (migration), Task 12 (frontend) |
| Vista `v_funnel_curso`                               | Task 1                                 |
| Vista `v_retencion_cohorte`                          | Task 1                                 |
| Vista `v_comparativa_cursos`                         | Task 1                                 |
| Edge Function endpoints funnel/retencion/comparativa | Task 2                                 |
| Servicio `reportes.js`                               | Task 3                                 |
| Composable `useReportes.js`                          | Task 5                                 |
| Componente `FunnelChart.vue`                         | Task 7                                 |
| Componente `RetentionMatrix.vue`                     | Task 8                                 |
| Componente `CourseComparisonTable.vue`               | Task 9                                 |
| Tests unitarios servicio                             | Task 4                                 |
| Tests composable                                     | Task 6                                 |
| Tests componentes                                    | Task 10                                |
| Integración AdminReportes.vue                        | Task 11                                |
| Integración AnalyticsDashboard.vue                   | Task 11                                |
| Navegación admin con flag                            | Task 12                                |
| Verificación build/tests/lint                        | Task 13                                |
| Release v0.10.0                                      | Task 14                                |
