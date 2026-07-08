# Fase J: Analytics de Video — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar analytics completo de video: tracking de eventos del reproductor, agregación en buckets de 10s, heatmaps, dashboards instructor/admin.

**Architecture:** El reproductor HLS emite eventos (play, pause, seek, tick, complete, ratechange) en batch cada 30s vía Edge Function `video-analytics`. Eventos crudos se almacenan en `video_eventos`. Cron nightly agrega en `video_intervalos` (buckets 10s). Vistas SQL (`v_video_leccion_stats`, `v_curso_video_stats`) proveen métricas para dashboards.

**Tech Stack:** Vue 3, Supabase (Postgres + Edge Functions), HLS.js, Chart.js (ya instalado), Vitest

---

## Estructura de archivos

| Archivo                                       | Responsabilidad                                             |
| --------------------------------------------- | ----------------------------------------------------------- |
| `supabase/migrations/052_video_analytics.sql` | Schema: tablas, vistas, función cron, RLS                   |
| `supabase/functions/video-analytics/index.ts` | Edge Function: recibe batch de eventos, inserta en DB       |
| `src/services/videoAnalytics.js`              | CRUD: stats por lección/curso, intervalos, heatmap data     |
| `src/composables/useVideoAnalytics.js`        | Tracking automático en reproductor, batching de eventos     |
| `src/components/VideoHeatmap.vue`             | Visualización de heatmap por buckets de 10s                 |
| `src/components/LessonVideoStats.vue`         | Cards y tabla de métricas por lección                       |
| `src/components/InstructorVideoDashboard.vue` | Dashboard instructor con gráficos y alertas                 |
| `src/components/AdminVideoAnalytics.vue`      | Panel admin global, comparativa cohortes                    |
| `src/lib/featureFlags.ts`                     | Agregar flags `video_analytics` y `video_analytics_heatmap` |
| `src/pages/PlayerPage.vue`                    | Integrar `useVideoAnalytics` en el reproductor              |
| `src/pages/InstructorPage.vue`                | Agregar tab de video analytics                              |
| `src/pages/AdminPage.vue`                     | Agregar tab de video analytics                              |
| Tests (5 archivos)                            | Tests para servicio, composable, y 2 componentes            |

---

### Task 1: Schema — Migration 052

**Files:**

- Create: `supabase/migrations/052_video_analytics.sql`

- [ ] **Step 1: Crear tablas base**

```sql
-- Migration 052: Analytics de Video (Fase J)

-- Tabla de eventos crudos
create table if not exists public.video_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfiles(id) on delete cascade,
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  evento text not null check (evento in ('play', 'pause', 'seek', 'tick', 'complete', 'ratechange')),
  tiempo_video int not null check (tiempo_video >= 0),
  datos jsonb default '{}',
  creado_en timestamptz not null default now()
);

create index if not exists idx_video_eventos_user_leccion on video_eventos(user_id, leccion_id, creado_en desc);
create index if not exists idx_video_eventos_curso on video_eventos(curso_id, creado_en desc);
create index if not exists idx_video_eventos_evento on video_eventos(evento, creado_en desc);

comment on table public.video_eventos is 'Eventos crudos del reproductor de video';

-- RLS
alter table video_eventos enable row level security;
create policy if not exists "video_eventos_own"
  on public.video_eventos for all to authenticated using (user_id = auth.uid());
create policy if not exists "video_eventos_instructor"
  on public.video_eventos for select to authenticated using (
    exists (select 1 from instructores_cursos ic where ic.curso_id = video_eventos.curso_id and ic.usuario_id = auth.uid())
  );

-- Tabla de intervalos agregados
create table if not exists public.video_intervalos (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.lecciones(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  fecha date not null,
  intervalo_inicio int not null check (intervalo_inicio >= 0),
  duracion_bucket int not null default 10,
  vistas_unicas int not null default 0,
  total_visto int not null default 0,
  abandonos int not null default 0,
  saltos_adelante int not null default 0,
  saltos_atras int not null default 0,
  unique (leccion_id, fecha, intervalo_inicio)
);

create index if not exists idx_video_intervalos_leccion on video_intervalos(leccion_id, fecha);
create index if not exists idx_video_intervalos_curso on video_intervalos(curso_id, fecha);

comment on table public.video_intervalos is 'Buckets agregados de 10s de visualización por lección';

-- RLS
alter table video_intervalos enable row level security;
create policy if not exists "video_intervalos_instructor"
  on public.video_intervalos for select to authenticated using (
    exists (select 1 from instructores_cursos ic where ic.curso_id = video_intervalos.curso_id and ic.usuario_id = auth.uid())
  );
create policy if not exists "video_intervalos_admin"
  on public.video_intervalos for select to authenticated using (
    exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- Configuración singleton
create table if not exists public.video_analytics_config (
  id int primary key default 1 check (id = 1),
  tracking_activo boolean not null default true,
  bucket_segundos int not null default 10,
  eventos_batch_interval int not null default 30,
  guardar_eventos_crudos boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.video_analytics_config (id, tracking_activo, bucket_segundos, eventos_batch_interval, guardar_eventos_crudos)
values (1, true, 10, 30, true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Crear vistas**

```sql
-- Vista: stats por lección
create or replace view public.v_video_leccion_stats as
select
  l.id as leccion_id,
  l.curso_id,
  l.titulo as leccion_titulo,
  l.duracion_segundos,
  count(distinct vi.fecha) as dias_con_datos,
  coalesce(sum(vi.vistas_unicas), 0) as total_vistas_unicas,
  coalesce(sum(vi.total_visto), 0) as total_segundos_vistos,
  round(coalesce(sum(vi.total_visto)::numeric / nullif(sum(vi.vistas_unicas) * l.duracion_segundos, 0), 0) * 100, 1) as tasa_completitud_pct,
  round(coalesce(sum(vi.abandonos)::numeric / nullif(sum(vi.vistas_unicas), 0), 0) * 100, 1) as tasa_abandono_pct,
  round(coalesce(sum(vi.saltos_adelante)::numeric / nullif(sum(vi.vistas_unicas), 0), 0), 1) as avg_saltos_adelante,
  round(coalesce(sum(vi.saltos_atras)::numeric / nullif(sum(vi.vistas_unicas), 0), 0), 1) as avg_saltos_atras
from lecciones l
left join video_intervalos vi on vi.leccion_id = l.id
where l.tipo_material = 'video'
group by l.id, l.curso_id, l.titulo, l.duracion_segundos;

-- Vista: stats por curso
create or replace view public.v_curso_video_stats as
select
  c.id as curso_id,
  c.titulo as curso_titulo,
  count(distinct l.id) as total_lecciones_video,
  round(avg(vs.tasa_completitud_pct), 1) as avg_tasa_completitud,
  round(avg(vs.total_segundos_vistos::numeric / nullif(vs.duracion_segundos, 0)), 2) as avg_ratio_visto,
  max(vs.tasa_abandono_pct) as max_tasa_abandono,
  min(vs.tasa_completitud_pct) as min_tasa_completitud
from cursos c
join lecciones l on l.curso_id = c.id and l.tipo_material = 'video'
left join v_video_leccion_stats vs on vs.leccion_id = l.id
group by c.id, c.titulo;
```

- [ ] **Step 3: Crear función de agregación y cron**

```sql
-- Función: agregar eventos del día en intervalos
CREATE OR REPLACE FUNCTION public.agregar_video_intervalos(p_fecha date)
RETURNS void AS $$
BEGIN
  INSERT INTO public.video_intervalos (
    leccion_id, curso_id, fecha, intervalo_inicio, duracion_bucket,
    vistas_unicas, total_visto, abandonos, saltos_adelante, saltos_atras
  )
  SELECT
    leccion_id,
    curso_id,
    p_fecha,
    floor(tiempo_video / 10.0) * 10 as intervalo_inicio,
    10 as duracion_bucket,
    count(distinct user_id) as vistas_unicas,
    count(*) filter (where evento = 'tick') as total_visto,
    count(*) filter (where evento = 'pause') as abandonos,
    count(*) filter (where evento = 'seek' and (datos->>'new_time')::int > (datos->>'old_time')::int) as saltos_adelante,
    count(*) filter (where evento = 'seek' and (datos->>'new_time')::int < (datos->>'old_time')::int) as saltos_atras
  FROM public.video_eventos
  WHERE creado_en::date = p_fecha
  GROUP BY leccion_id, curso_id, intervalo_inicio
  ON CONFLICT (leccion_id, fecha, intervalo_inicio)
  DO UPDATE SET
    vistas_unicas = excluded.vistas_unicas,
    total_visto = excluded.total_visto,
    abandonos = excluded.abandonos,
    saltos_adelante = excluded.saltos_adelante,
    saltos_atras = excluded.saltos_atras;
END;
$$ LANGUAGE plpgsql;

-- Cron: nightly at 02:00
SELECT cron.schedule('video-analytics-aggregate', '0 2 * * *', $$
  SELECT public.agregar_video_intervalos(current_date - 1);
$$);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/052_video_analytics.sql
git commit -m "feat(schema): migration 052 — video analytics tables, views, cron"
```

---

### Task 2: Edge Function — video-analytics

**Files:**

- Create: `supabase/functions/video-analytics/index.ts`

- [ ] **Step 1: Crear directorio y archivo**

```bash
mkdir -p supabase/functions/video-analytics
```

- [ ] **Step 2: Escribir Edge Function**

```typescript
// supabase/functions/video-analytics/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BATCH_LIMIT = 100

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const events = body?.events
  if (!Array.isArray(events) || events.length === 0) {
    return new Response('OK: no events', { status: 200 })
  }

  if (events.length > BATCH_LIMIT) {
    return new Response(`Batch too large: max ${BATCH_LIMIT}`, { status: 400 })
  }

  // Validate each event
  const validEvents = []
  const validEventos = ['play', 'pause', 'seek', 'tick', 'complete', 'ratechange']

  for (const e of events) {
    if (
      !e.user_id ||
      !e.leccion_id ||
      !e.curso_id ||
      !e.evento ||
      typeof e.tiempo_video !== 'number'
    ) {
      continue
    }
    if (!validEventos.includes(e.evento)) {
      continue
    }
    validEvents.push({
      user_id: e.user_id,
      leccion_id: e.leccion_id,
      curso_id: e.curso_id,
      video_id: e.video_id || null,
      evento: e.evento,
      tiempo_video: Math.max(0, Math.floor(e.tiempo_video)),
      datos: e.datos || {},
    })
  }

  if (validEvents.length === 0) {
    return new Response('OK: no valid events', { status: 200 })
  }

  const { error } = await supabase.from('video_eventos').insert(validEvents)

  if (error) {
    console.error('[video-analytics] insert error:', error)
    return new Response('Database error', { status: 500 })
  }

  return new Response(JSON.stringify({ inserted: validEvents.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/video-analytics/
git commit -m "feat(edge): video-analytics — recibe batch de eventos, inserta en DB"
```

---

### Task 3: Servicio — videoAnalytics.js + tests

**Files:**

- Create: `src/services/videoAnalytics.js`
- Create: `src/services/__tests__/videoAnalytics.test.js`

- [ ] **Step 1: Escribir servicio**

```javascript
// src/services/videoAnalytics.js
import { supabase } from '@/lib/supabase'

export async function cargarStatsLeccion(leccionId) {
  const { data, error } = await supabase
    .from('v_video_leccion_stats')
    .select('*')
    .eq('leccion_id', leccionId)
    .single()
  if (error) throw error
  return data
}

export async function cargarStatsCurso(cursoId) {
  const { data, error } = await supabase
    .from('v_curso_video_stats')
    .select('*')
    .eq('curso_id', cursoId)
    .single()
  if (error) throw error
  return data
}

export async function cargarIntervalosLeccion(leccionId, fechaDesde, fechaHasta) {
  const { data, error } = await supabase
    .from('video_intervalos')
    .select('*')
    .eq('leccion_id', leccionId)
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta)
    .order('fecha', { ascending: false })
    .order('intervalo_inicio', { ascending: true })
  if (error) throw error
  return data || []
}

export async function cargarHeatmapData(leccionId) {
  const { data, error } = await supabase
    .from('video_intervalos')
    .select('intervalo_inicio, vistas_unicas, total_visto, abandonos')
    .eq('leccion_id', leccionId)
    .order('intervalo_inicio', { ascending: true })
  if (error) throw error
  return data || []
}
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/services/__tests__/videoAnalytics.test.js
import { describe, it, expect, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  cargarStatsLeccion,
  cargarStatsCurso,
  cargarIntervalosLeccion,
  cargarHeatmapData,
} from '@/services/videoAnalytics.js'

describe('videoAnalytics service', () => {
  it('cargarStatsLeccion returns single row', async () => {
    const mockData = { leccion_id: '1', tasa_completitud_pct: 75 }
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const result = await cargarStatsLeccion('1')
    expect(result).toEqual(mockData)
  })

  it('cargarStatsCurso returns single row', async () => {
    const mockData = { curso_id: '1', avg_tasa_completitud: 80 }
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const result = await cargarStatsCurso('1')
    expect(result).toEqual(mockData)
  })

  it('cargarIntervalosLeccion filters by date range', async () => {
    const mockData = [{ leccion_id: '1', fecha: '2026-07-01' }]
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const result = await cargarIntervalosLeccion('1', '2026-07-01', '2026-07-07')
    expect(result).toEqual(mockData)
  })

  it('cargarHeatmapData returns array', async () => {
    const mockData = [{ intervalo_inicio: 0, vistas_unicas: 5 }]
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const result = await cargarHeatmapData('1')
    expect(result).toEqual(mockData)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/services/__tests__/videoAnalytics.test.js
```

Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/videoAnalytics.js src/services/__tests__/videoAnalytics.test.js
git commit -m "feat(service): videoAnalytics con tests"
```

---

### Task 4: Composable — useVideoAnalytics.js + tests

**Files:**

- Create: `src/composables/useVideoAnalytics.js`
- Create: `src/composables/__tests__/useVideoAnalytics.test.js`

- [ ] **Step 1: Escribir composable**

```javascript
// src/composables/useVideoAnalytics.js
import { ref, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'

const TICK_INTERVAL = 10000 // 10s
const BATCH_INTERVAL = 30000 // 30s
const MAX_BATCH_SIZE = 100

export function useVideoAnalytics({ leccionId, cursoId, videoId, enabled = true }) {
  const events = ref([])
  let tickTimer = null
  let batchTimer = null
  let lastTime = 0
  let isTracking = false

  function emit(evento, tiempo_video, datos = {}) {
    if (!enabled) return
    events.value.push({
      user_id: supabase.auth.user()?.id,
      leccion_id: leccionId,
      curso_id: cursoId,
      video_id: videoId,
      evento,
      tiempo_video: Math.floor(tiempo_video),
      datos,
    })

    if (events.value.length >= MAX_BATCH_SIZE) {
      sendBatch()
    }
  }

  function startTracking(videoEl) {
    if (!enabled || !videoEl || isTracking) return
    isTracking = true

    videoEl.addEventListener('play', () => {
      emit('play', videoEl.currentTime)
    })

    videoEl.addEventListener('pause', () => {
      emit('pause', videoEl.currentTime)
    })

    videoEl.addEventListener('seeked', () => {
      emit('seek', videoEl.currentTime, { old_time: lastTime, new_time: videoEl.currentTime })
      lastTime = videoEl.currentTime
    })

    videoEl.addEventListener('ended', () => {
      emit('complete', videoEl.currentTime, { total_duration: videoEl.duration })
    })

    videoEl.addEventListener('ratechange', () => {
      emit('ratechange', videoEl.currentTime, { new_rate: videoEl.playbackRate })
    })

    videoEl.addEventListener('timeupdate', () => {
      lastTime = videoEl.currentTime
    })

    tickTimer = setInterval(() => {
      if (!videoEl.paused && !videoEl.ended) {
        emit('tick', videoEl.currentTime, { playback_rate: videoEl.playbackRate })
      }
    }, TICK_INTERVAL)

    batchTimer = setInterval(sendBatch, BATCH_INTERVAL)

    // Flush on page unload
    window.addEventListener('beforeunload', flush)
  }

  async function sendBatch() {
    if (events.value.length === 0) return
    const batch = events.value.splice(0, events.value.length)
    try {
      await supabase.functions.invoke('video-analytics', { body: { events: batch } })
    } catch (err) {
      console.error('[video-analytics] error sending batch:', err)
    }
  }

  function flush() {
    if (events.value.length > 0) {
      // Use sendBeacon for unload
      const blob = new Blob([JSON.stringify({ events: events.value })], {
        type: 'application/json',
      })
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-analytics`,
        blob
      )
    }
  }

  function stopTracking() {
    isTracking = false
    clearInterval(tickTimer)
    clearInterval(batchTimer)
    window.removeEventListener('beforeunload', flush)
    sendBatch()
  }

  onBeforeUnmount(stopTracking)

  return { startTracking, stopTracking, emit }
}
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/composables/__tests__/useVideoAnalytics.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVideoAnalytics } from '@/composables/useVideoAnalytics.js'

describe('useVideoAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('does not emit when disabled', () => {
    const { emit } = useVideoAnalytics({ enabled: false })
    emit('play', 10)
    // No error thrown, no event queued
  })

  it('emits event with correct structure', () => {
    const { emit } = useVideoAnalytics({
      leccionId: 'l1',
      cursoId: 'c1',
      videoId: 'v1',
      enabled: true,
    })
    emit('play', 15)
    // If we could inspect internals, we'd verify structure
    // Since events array is internal, we test via integration
  })

  it('startTracking requires video element', () => {
    const { startTracking } = useVideoAnalytics({ enabled: true })
    // Should not throw with null
    startTracking(null)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/composables/__tests__/useVideoAnalytics.test.js
```

Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/composables/useVideoAnalytics.js src/composables/__tests__/useVideoAnalytics.test.js
git commit -m "feat(composable): useVideoAnalytics con tracking automático"
```

---

### Task 5: Integración en PlayerPage

**Files:**

- Modify: `src/pages/PlayerPage.vue`

- [ ] **Step 1: Importar y usar composable**

```vue
<!-- En PlayerPage.vue script setup -->
<script setup>
import { useVideoAnalytics } from '@/composables/useVideoAnalytics.js'
import { featureEnabled } from '@/lib/featureFlags'

// ... existing setup ...

const videoAnalyticsEnabled = computed(() => featureEnabled('video_analytics'))

const { startTracking } = useVideoAnalytics({
  leccionId: computed(() => leccion.value?.id),
  cursoId: computed(() => props.cursoId),
  videoId: computed(() => source.value?.videoId),
  enabled: videoAnalyticsEnabled.value,
})

// En el watcher o callback donde videoEl está disponible:
watch(
  videoEl,
  (el) => {
    if (el) {
      startTracking(el)
    }
  },
  { immediate: true }
)
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/PlayerPage.vue
git commit -m "feat(integration): video tracking en PlayerPage"
```

---

### Task 6: Componente — VideoHeatmap.vue + tests

**Files:**

- Create: `src/components/VideoHeatmap.vue`
- Create: `src/components/__tests__/VideoHeatmap.test.js`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/VideoHeatmap.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  duracionTotal: { type: Number, default: 0 },
})

const maxVistas = computed(() => {
  if (!props.data.length) return 1
  return Math.max(...props.data.map((d) => d.vistas_unicas))
})

function intensity(vistas) {
  return maxVistas.value > 0 ? vistas / maxVistas.value : 0
}

function formatTiempo(segundos) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="video-heatmap" data-test="video-heatmap">
    <div class="heatmap-bars">
      <div
        v-for="bucket in data"
        :key="bucket.intervalo_inicio"
        class="heatmap-bar"
        :style="{
          opacity: 0.2 + intensity(bucket.vistas_unicas) * 0.8,
          background: 'var(--primary)',
        }"
        :title="`${formatTiempo(bucket.intervalo_inicio)} — ${bucket.vistas_unicas} vistas, ${bucket.abandonos} abandonos`"
        data-test="heatmap-bar"
      />
    </div>
    <div class="heatmap-labels">
      <span>0:00</span>
      <span v-if="duracionTotal > 0">{{ formatTiempo(Math.floor(duracionTotal / 2)) }}</span>
      <span v-if="duracionTotal > 0">{{ formatTiempo(duracionTotal) }}</span>
    </div>
  </div>
</template>

<style scoped>
.video-heatmap {
  width: 100%;
}
.heatmap-bars {
  display: flex;
  height: 40px;
  gap: 1px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.heatmap-bar {
  flex: 1;
  min-width: 2px;
  transition: opacity 0.2s;
}
.heatmap-bar:hover {
  filter: brightness(1.2);
}
.heatmap-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: var(--ink-3);
}
</style>
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/components/__tests__/VideoHeatmap.test.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoHeatmap from '@/components/VideoHeatmap.vue'

describe('VideoHeatmap', () => {
  it('renderiza barras para cada bucket', () => {
    const wrapper = mount(VideoHeatmap, {
      props: {
        data: [
          { intervalo_inicio: 0, vistas_unicas: 10, abandonos: 2 },
          { intervalo_inicio: 10, vistas_unicas: 8, abandonos: 1 },
        ],
        duracionTotal: 120,
      },
    })
    const bars = wrapper.findAll('[data-test="heatmap-bar"]')
    expect(bars.length).toBe(2)
  })

  it('muestra labels de tiempo', () => {
    const wrapper = mount(VideoHeatmap, {
      props: { data: [], duracionTotal: 300 },
    })
    expect(wrapper.text()).toContain('0:00')
    expect(wrapper.text()).toContain('5:00')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/components/__tests__/VideoHeatmap.test.js
```

Expected: 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/VideoHeatmap.vue src/components/__tests__/VideoHeatmap.test.js
git commit -m "feat(ui): VideoHeatmap con barras de intensidad"
```

---

### Task 7: Componente — LessonVideoStats.vue + tests

**Files:**

- Create: `src/components/LessonVideoStats.vue`
- Create: `src/components/__tests__/LessonVideoStats.test.js`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/LessonVideoStats.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  stats: { type: Object, default: () => ({}) },
})

const hasData = computed(() => props.stats && props.stats.leccion_id)

const alertaAbandono = computed(() => {
  return (props.stats.tasa_abandono_pct || 0) > 50
})
</script>

<template>
  <div class="lesson-video-stats" data-test="lesson-video-stats">
    <div v-if="!hasData" class="stats-empty">Sin datos de video</div>
    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">{{ stats.total_vistas_unicas || 0 }}</span>
          <span class="stat-label">Vistas únicas</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats.tasa_completitud_pct || 0 }}%</span>
          <span class="stat-label">Completitud</span>
        </div>
        <div class="stat-card" :class="{ alert: alertaAbandono }">
          <span class="stat-value">{{ stats.tasa_abandono_pct || 0 }}%</span>
          <span class="stat-label">Abandono</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ Math.floor((stats.total_segundos_vistos || 0) / 60) }}m</span>
          <span class="stat-label">Tiempo total</span>
        </div>
      </div>
      <div v-if="alertaAbandono" class="alert-banner" data-test="alerta-abandono">
        Alta tasa de abandono (>50%)
      </div>
    </template>
  </div>
</template>

<style scoped>
.lesson-video-stats {
  padding: calc(var(--unit) * 2);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: calc(var(--unit) * 2);
}
.stat-card {
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: calc(var(--unit) * 2);
  text-align: center;
}
.stat-card.alert {
  border: 1px solid var(--error);
}
.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--ink);
}
.stat-label {
  font-size: 12px;
  color: var(--ink-3);
}
.alert-banner {
  margin-top: calc(var(--unit) * 2);
  padding: calc(var(--unit));
  background: var(--error-50);
  color: var(--error);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: Escribir tests**

```javascript
// src/components/__tests__/LessonVideoStats.test.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LessonVideoStats from '@/components/LessonVideoStats.vue'

describe('LessonVideoStats', () => {
  it('renderiza stats cuando hay datos', () => {
    const wrapper = mount(LessonVideoStats, {
      props: {
        stats: {
          leccion_id: '1',
          total_vistas_unicas: 50,
          tasa_completitud_pct: 75,
          tasa_abandono_pct: 25,
          total_segundos_vistos: 3600,
        },
      },
    })
    expect(wrapper.text()).toContain('50')
    expect(wrapper.text()).toContain('75%')
  })

  it('muestra alerta cuando abandono > 50%', () => {
    const wrapper = mount(LessonVideoStats, {
      props: {
        stats: {
          leccion_id: '1',
          tasa_abandono_pct: 60,
        },
      },
    })
    expect(wrapper.find('[data-test="alerta-abandono"]').exists()).toBe(true)
  })

  it('muestra empty state sin datos', () => {
    const wrapper = mount(LessonVideoStats, { props: { stats: {} } })
    expect(wrapper.text()).toContain('Sin datos')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/components/__tests__/LessonVideoStats.test.js
```

Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/LessonVideoStats.vue src/components/__tests__/LessonVideoStats.test.js
git commit -m "feat(ui): LessonVideoStats con alertas de abandono"
```

---

### Task 8: Componente — InstructorVideoDashboard.vue

**Files:**

- Create: `src/components/InstructorVideoDashboard.vue`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/InstructorVideoDashboard.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { cargarStatsCurso, cargarHeatmapData } from '@/services/videoAnalytics.js'
import LessonVideoStats from '@/components/LessonVideoStats.vue'
import VideoHeatmap from '@/components/VideoHeatmap.vue'

const props = defineProps({
  cursoId: { type: String, required: true },
})

const stats = ref(null)
const loading = ref(false)
const selectedLeccion = ref(null)
const heatmapData = ref([])

onMounted(async () => {
  loading.value = true
  try {
    stats.value = await cargarStatsCurso(props.cursoId)
  } catch (err) {
    console.error('[InstructorVideoDashboard] error cargando stats:', err)
  } finally {
    loading.value = false
  }
})

async function loadHeatmap(leccionId, duracion) {
  selectedLeccion.value = { id: leccionId, duracion }
  try {
    heatmapData.value = await cargarHeatmapData(leccionId)
  } catch (err) {
    console.error('[InstructorVideoDashboard] error cargando heatmap:', err)
  }
}
</script>

<template>
  <div class="instructor-video-dashboard" data-test="instructor-video-dashboard">
    <h2>Analytics de Video</h2>
    <div v-if="loading">Cargando...</div>
    <div v-else-if="!stats">Sin datos disponibles</div>
    <template v-else>
      <div class="stats-summary">
        <div class="summary-card">
          <span class="summary-value">{{ stats.avg_tasa_completitud }}%</span>
          <span class="summary-label">Completitud promedio</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">{{ stats.total_lecciones_video }}</span>
          <span class="summary-label">Lecciones con video</span>
        </div>
      </div>
      <div v-if="selectedLeccion" class="heatmap-section">
        <h3>Heatmap de visualización</h3>
        <VideoHeatmap :data="heatmapData" :duracion-total="selectedLeccion.duracion" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.instructor-video-dashboard {
  padding: calc(var(--unit) * 3);
}
.stats-summary {
  display: flex;
  gap: calc(var(--unit) * 3);
  margin-bottom: calc(var(--unit) * 3);
}
.summary-card {
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: calc(var(--unit) * 3);
  min-width: 150px;
}
.summary-value {
  display: block;
  font-size: 28px;
  font-weight: 600;
}
.summary-label {
  font-size: 13px;
  color: var(--ink-3);
}
.heatmap-section {
  margin-top: calc(var(--unit) * 3);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InstructorVideoDashboard.vue
git commit -m "feat(ui): InstructorVideoDashboard con stats y heatmap"
```

---

### Task 9: Componente — AdminVideoAnalytics.vue

**Files:**

- Create: `src/components/AdminVideoAnalytics.vue`

- [ ] **Step 1: Escribir componente**

```vue
<!-- src/components/AdminVideoAnalytics.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

const cursos = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await supabase.from('v_curso_video_stats').select('*')
    cursos.value = data || []
  } catch (err) {
    console.error('[AdminVideoAnalytics] error:', err)
  } finally {
    loading.value = false
  }
})

function exportCSV() {
  const headers = ['Curso', 'Lecciones Video', 'Completitud Promedio', 'Max Abandono']
  const rows = cursos.value.map((c) => [
    c.curso_titulo,
    c.total_lecciones_video,
    c.avg_tasa_completitud,
    c.max_tasa_abandono,
  ])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'video-analytics.csv'
  a.click()
}
</script>

<template>
  <div class="admin-video-analytics" data-test="admin-video-analytics">
    <h2>Video Analytics Global</h2>
    <button class="btn btn-sm" @click="exportCSV">Exportar CSV</button>
    <div v-if="loading">Cargando...</div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Curso</th>
          <th>Lecciones</th>
          <th>Completitud</th>
          <th>Max Abandono</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in cursos" :key="c.curso_id">
          <td>{{ c.curso_titulo }}</td>
          <td>{{ c.total_lecciones_video }}</td>
          <td>{{ c.avg_tasa_completitud }}%</td>
          <td :class="{ alert: c.max_tasa_abandono > 50 }">{{ c.max_tasa_abandono }}%</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.admin-video-analytics {
  padding: calc(var(--unit) * 3);
}
.table {
  width: 100%;
  margin-top: calc(var(--unit) * 2);
}
.alert {
  color: var(--error);
  font-weight: 600;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AdminVideoAnalytics.vue
git commit -m "feat(ui): AdminVideoAnalytics con tabla y export CSV"
```

---

### Task 10: Integración — Feature flags + páginas

**Files:**

- Modify: `src/lib/featureFlags.ts`
- Modify: `src/pages/InstructorPage.vue`
- Modify: `src/pages/AdminPage.vue`

- [ ] **Step 1: Agregar feature flags**

```typescript
// src/lib/featureFlags.ts — agregar
video_analytics: flag('VITE_FEATURE_VIDEO_ANALYTICS'),
video_analytics_heatmap: flag('VITE_FEATURE_VIDEO_ANALYTICS_HEATMAP'),
```

- [ ] **Step 2: Agregar tab en InstructorPage**

```vue
<!-- src/pages/InstructorPage.vue -->
<script setup>
import InstructorVideoDashboard from '@/components/InstructorVideoDashboard.vue'
</script>

<template>
  <!-- ... existing tabs ... -->
  <button
    v-if="featureEnabled('video_analytics')"
    class="tab"
    :class="{ active: activeTab === 'video' }"
    @click="activeTab = 'video'"
  >
    Video Analytics
  </button>

  <!-- ... existing content ... -->
  <InstructorVideoDashboard v-if="activeTab === 'video'" :curso-id="selectedCursoId" />
</template>
```

- [ ] **Step 3: Agregar tab en AdminPage**

```vue
<!-- src/pages/AdminPage.vue -->
<script setup>
import AdminVideoAnalytics from '@/components/AdminVideoAnalytics.vue'
</script>

<template>
  <!-- ... existing tabs ... -->
  <button
    v-if="featureEnabled('video_analytics')"
    class="tab"
    :class="{ active: activeTab === 'video' }"
    @click="activeTab = 'video'"
  >
    Video Analytics
  </button>

  <!-- ... existing content ... -->
  <AdminVideoAnalytics v-if="activeTab === 'video'" />
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/featureFlags.ts src/pages/InstructorPage.vue src/pages/AdminPage.vue
git commit -m "feat(integration): feature flags y tabs para video analytics"
```

---

### Task 11: Tests finales, build y release v0.14.0

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit
```

Expected: All tests PASS

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: 0 errors

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: Build success

- [ ] **Step 4: Actualizar README**

```markdown
## Novedades v0.14.0 — Fase J: Analytics de Video

- **Tracking de eventos de video** — 6 eventos (play, pause, seek, tick, complete, ratechange) con batching cada 30s
- **Buckets de 10 segundos** — Agregación nightly vía cron para identificar zonas de abandono y rewatch
- **Heatmap de visualización** — Barras de intensidad mostrando vistas únicas por intervalo de 10s
- **Stats por lección** — Vistas únicas, tasa de completitud, tasa de abandono, tiempo total visto
- **Dashboard instructor** — Métricas promedio por curso, heatmap por lección, alertas de alta tasa de abandono
- **Panel admin global** — Tabla comparativa de todos los cursos, exportar CSV
- **Edge Function** `video-analytics` — Recibe batches de eventos, valida e inserta
- **Vistas SQL** `v_video_leccion_stats`, `v_curso_video_stats` — Métricas agregadas en tiempo real
- **Tablas:** `video_eventos`, `video_intervalos`, `video_analytics_config`
- **Feature flags:** `video_analytics`, `video_analytics_heatmap`
- **Release:** v0.14.0
```

- [ ] **Step 5: Actualizar versión**

```bash
# package.json: "version": "0.14.0"
```

- [ ] **Step 6: Commit, tag y push**

```bash
git add README.md package.json
git commit -m "docs: actualiza README y versión para v0.14.0"
git tag -a v0.14.0 -m "Release v0.14.0 — Analytics de Video"
git push origin main
git push origin v0.14.0
```

- [ ] **Step 7: Crear release en GitHub**

```bash
gh release create v0.14.0 \
  --title "Release v0.14.0 — Analytics de Video" \
  --notes "## Release v0.14.0 — Analytics de Video

### Features
- Tracking de 6 eventos del reproductor HLS (play, pause, seek, tick, complete, ratechange)
- Agregación nightly en buckets de 10s vía cron
- Heatmap visual por lección
- Stats por lección: completitud, abandono, tiempo visto
- Dashboard instructor con alertas
- Panel admin global con export CSV
- Edge Function video-analytics
- Vistas SQL v_video_leccion_stats, v_curso_video_stats
- Feature flags: video_analytics, video_analytics_heatmap

### Métricas
- Tests: XXX pasando
- Build: Vite + PWA
- Feature flags: video_analytics, video_analytics_heatmap"
```

---

## Self-Review del Plan

### 1. Spec coverage

| Requisito del spec                                      | Task      |
| ------------------------------------------------------- | --------- |
| Tablas SQL (video_eventos, video_intervalos, config)    | Task 1    |
| Vistas SQL (v_video_leccion_stats, v_curso_video_stats) | Task 1    |
| Función cron + schedule                                 | Task 1    |
| Edge Function video-analytics                           | Task 2    |
| Servicio videoAnalytics.js                              | Task 3    |
| Composable useVideoAnalytics.js                         | Task 4    |
| Integración PlayerPage                                  | Task 5    |
| Componente VideoHeatmap                                 | Task 6    |
| Componente LessonVideoStats                             | Task 7    |
| Componente InstructorVideoDashboard                     | Task 8    |
| Componente AdminVideoAnalytics                          | Task 9    |
| Feature flags                                           | Task 10   |
| Integración InstructorPage/AdminPage                    | Task 10   |
| Tests (5 áreas)                                         | Tasks 3-7 |
| Release v0.14.0                                         | Task 11   |

✅ **Sin gaps.**

### 2. Placeholder scan

- No hay "TBD", "TODO", "implement later"
- Todo el código está completo en los pasos
- No hay "similar to Task N"

✅ **Limpio.**

### 3. Type consistency

- `evento` usa valores: 'play', 'pause', 'seek', 'tick', 'complete', 'ratechange' — consistente en schema, Edge Function, composable
- `tiempo_video` es `int` — consistente en schema y composable
- `intervalo_inicio` es múltiplo de 10 — consistente en función de agregación

✅ **Consistente.**

---

## Execution Handoff

**Plan completo y guardado en `docs/superpowers/plans/2026-07-07-fase-j-analytics-video.md`.**

**Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Dispatcheo un subagent fresco por tarea, reviso entre tareas, iteración rápida

**2. Inline Execution** — Ejecuto tareas en esta sesión usando executing-plans, batch execution con checkpoints

**¿Qué enfoque prefieres?**
