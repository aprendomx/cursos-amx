# Spec: Fase J — Analytics de Video (v0.14.0)

**Fecha:** 2026-07-07  
**Estado:** Aprobado para implementación  
**Scope:** Analytics completo de video: eventos, intervalos, heatmaps, dashboards instructor/admin  
**Feature flags:** `video_analytics`, `video_analytics_heatmap`

---

## 1. Objetivos

1. Trackear eventos detallados del reproductor HLS (play, pause, seek, tick, complete, ratechange).
2. Agregar eventos en buckets de 10 segundos para identificar zonas de abandono y rewatch.
3. Proveer dashboards de video analytics para instructores y admins.
4. Visualizar heatmaps de visualización por lección.
5. Permitir comparativas entre cohortes y predicción de riesgo basada en patrones de visualización.

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Player    │  │  Instructor  │  │      Admin       │   │
│  │  (events)   │  │  Dashboard   │  │   Video Analytics │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────┘   │
│         │                │                                    │
│         └────────────────┘                                    │
│                   │                                          │
│         ┌─────────▼──────────┐                              │
│         │  useVideoAnalytics │                              │
│         └─────────┬──────────┘                              │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION: video-analytics                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Receive batch│  │  Validate    │  │ Insert to    │      │
│  │  of events   │  │   events     │  │ video_eventos│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (Postgres)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │video_eventos │  │video_interval│  │video_resumen │      │
│  │  (raw events)│  │  os (10s)    │  │   (mv)       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                │                                    │
│         │  Cron nightly 02:00                                  │
│         └────────────────────────────────────────────────    │
└─────────────────────────────────────────────────────────────┘
```

### Flujo

1. **Reproductor HLS** emite eventos en batch cada 30s (o al pausar/salir).
2. **Edge Function `video-analytics`** recibe batch, valida, inserta en `video_eventos`.
3. **Cron nightly** (02:00) agrega eventos del día en `video_intervalos` (buckets de 10s).
4. **Vistas SQL** (`v_video_leccion_stats`, `v_curso_video_stats`) resumen métricas.
5. **Frontend** lee datos agregados para dashboards.

---

## 3. Esquema de Datos

### 3.1 Tabla `video_eventos`

```sql
create table public.video_eventos (
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

create index idx_video_eventos_user_leccion on video_eventos(user_id, leccion_id, creado_en desc);
create index idx_video_eventos_curso on video_eventos(curso_id, creado_en desc);
create index idx_video_eventos_evento on video_eventos(evento, creado_en desc);

comment on table public.video_eventos is 'Eventos crudos del reproductor de video';
```

**RLS:**

```sql
alter table video_eventos enable row level security;
create policy "video_eventos_own"
  on public.video_eventos for all to authenticated using (user_id = auth.uid());
create policy "video_eventos_instructor"
  on public.video_eventos for select to authenticated using (
    exists (select 1 from instructores_cursos ic where ic.curso_id = video_eventos.curso_id and ic.usuario_id = auth.uid())
  );
```

### 3.2 Tabla `video_intervalos`

```sql
create table public.video_intervalos (
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

create index idx_video_intervalos_leccion on video_intervalos(leccion_id, fecha);
create index idx_video_intervalos_curso on video_intervalos(curso_id, fecha);

comment on table public.video_intervalos is 'Buckets agregados de 10s de visualización por lección';
```

**RLS:**

```sql
alter table video_intervalos enable row level security;
create policy "video_intervalos_instructor"
  on public.video_intervalos for select to authenticated using (
    exists (select 1 from instructores_cursos ic where ic.curso_id = video_intervalos.curso_id and ic.usuario_id = auth.uid())
  );
create policy "video_intervalos_admin"
  on public.video_intervalos for select to authenticated using (
    exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin')
  );
```

### 3.3 Vista `v_video_leccion_stats`

```sql
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
```

### 3.4 Vista `v_curso_video_stats`

```sql
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

### 3.5 Tabla `video_analytics_config` (singleton)

```sql
create table public.video_analytics_config (
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

---

## 4. Eventos del Reproductor

| Evento       | Trigger                                 | Payload (`datos` jsonb)                           |
| ------------ | --------------------------------------- | ------------------------------------------------- |
| `play`       | `video.play()`                          | `{ current_time: number }`                        |
| `pause`      | `video.pause()`                         | `{ current_time: number }`                        |
| `seek`       | `video.seeked`                          | `{ old_time: number, new_time: number }`          |
| `tick`       | Intervalo cada 10s durante reproducción | `{ current_time: number, playback_rate: number }` |
| `complete`   | `video.ended`                           | `{ total_duration: number }`                      |
| `ratechange` | `video.ratechange`                      | `{ old_rate: number, new_rate: number }`          |

### Batching strategy

- Acumular eventos en array de memoria (`window._videoEvents`)
- Enviar batch cada 30 segundos (configurable)
- Enviar inmediatamente al: `pause`, `seek`, `complete`, `beforeunload`
- Máximo 100 eventos por batch (si se excede, enviar y resetear)

---

## 5. Edge Function: `video-analytics`

```typescript
// supabase/functions/video-analytics/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { events } = await req.json()
  if (!Array.isArray(events) || events.length === 0) {
    return new Response('OK: no events', { status: 200 })
  }

  const { error } = await supabase.from('video_eventos').insert(
    events.map((e) => ({
      user_id: e.user_id,
      leccion_id: e.leccion_id,
      curso_id: e.curso_id,
      video_id: e.video_id,
      evento: e.evento,
      tiempo_video: e.tiempo_video,
      datos: e.datos || {},
    }))
  )

  if (error) {
    console.error('[video-analytics] insert error:', error)
    return new Response('Error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})
```

---

## 6. Cron Job: Agregación Nightly

```sql
-- Function: agregar_video_intervalos
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

-- Cron: every night at 02:00
SELECT cron.schedule('video-analytics-aggregate', '0 2 * * *', $$
  SELECT public.agregar_video_intervalos(current_date - 1);
$$);
```

---

## 7. Composables y Servicios

### `useVideoAnalytics.js`

```javascript
// src/composables/useVideoAnalytics.js
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'

const TICK_INTERVAL = 10000 // 10s
const BATCH_INTERVAL = 30000 // 30s

export function useVideoAnalytics({ leccionId, cursoId, videoId, enabled = true }) {
  const events = ref([])
  let tickTimer = null
  let batchTimer = null

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
  }

  function startTracking(videoEl) {
    if (!enabled || !videoEl) return

    videoEl.addEventListener('play', () => emit('play', videoEl.currentTime))
    videoEl.addEventListener('pause', () => emit('pause', videoEl.currentTime))
    videoEl.addEventListener('seeked', () =>
      emit('seek', videoEl.currentTime, {
        old_time: videoEl._lastTime || 0,
        new_time: videoEl.currentTime,
      })
    )
    videoEl.addEventListener('ended', () =>
      emit('complete', videoEl.currentTime, { total_duration: videoEl.duration })
    )
    videoEl.addEventListener('ratechange', () =>
      emit('ratechange', videoEl.currentTime, { new_rate: videoEl.playbackRate })
    )

    tickTimer = setInterval(() => {
      if (!videoEl.paused) {
        emit('tick', videoEl.currentTime, { playback_rate: videoEl.playbackRate })
      }
    }, TICK_INTERVAL)

    batchTimer = setInterval(sendBatch, BATCH_INTERVAL)
  }

  async function sendBatch() {
    if (events.value.length === 0) return
    const batch = [...events.value]
    events.value = []
    await supabase.functions.invoke('video-analytics', { body: { events: batch } })
  }

  function stopTracking() {
    clearInterval(tickTimer)
    clearInterval(batchTimer)
    sendBatch() // flush remaining
  }

  onBeforeUnmount(stopTracking)

  return { emit, startTracking, stopTracking }
}
```

### `videoAnalyticsService.js`

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

---

## 8. Componentes UI

### 8.1 `VideoHeatmap.vue`

- Bar chart horizontal o vertical mostrando cada bucket de 10s
- Color intensity según `vistas_unicas` o `total_visto`
- Tooltip con: vistas únicas, abandonos, saltos
- Marks para indicar inicio de secciones del video

### 8.2 `LessonVideoStats.vue`

- Cards: tiempo promedio visto, tasa completitud, punto abandono promedio
- Tabla comparativa entre lecciones del curso
- Badge: "Alta tasa de abandono" si >50%

### 8.3 `InstructorVideoDashboard.vue`

- Gráfico de líneas: tasa de completitud por lección a lo largo del tiempo
- Ranking de lecciones más problemáticas
- Alertas: lecciones con abandono >50% antes del 50% del video

### 8.4 `AdminVideoAnalytics.vue`

- Vista global de todos los cursos
- Comparativa entre cohortes (mismo curso, diferentes grupos)
- Predicción de riesgo: alumnos con <30% de visualización promedio en última semana
- Exportar CSV

---

## 9. Feature Flags

```typescript
// lib/featureFlags.ts
video_analytics: flag('VITE_FEATURE_VIDEO_ANALYTICS'),
video_analytics_heatmap: flag('VITE_FEATURE_VIDEO_ANALYTICS_HEATMAP'),
```

- `video_analytics` — Maestro. Desactiva tracking, servicios, componentes.
- `video_analytics_heatmap` — Sub-flag para mostrar/ocultar heatmaps.

---

## 10. Testing Strategy

| Componente              | Tests                                               |
| ----------------------- | --------------------------------------------------- |
| `useVideoAnalytics`     | Emite eventos correctos, batching, flush on unmount |
| `videoAnalyticsService` | Carga stats, intervalos, heatmap data               |
| `VideoHeatmap`          | Renderiza barras, tooltips, colores                 |
| `LessonVideoStats`      | Muestra métricas, alertas de abandono               |
| Integration             | Player emite eventos, servicio los recibe           |

---

## 11. Dependencias

- **Ninguna nueva** — Reutiliza Chart.js (ya instalado en H3) para heatmaps y gráficos.

---

## 12. Migraciones SQL

**Migration 052:** `video_analytics.sql`

- Crear tablas: `video_eventos`, `video_intervalos`, `video_analytics_config`
- Crear vistas: `v_video_leccion_stats`, `v_curso_video_stats`
- Crear función `agregar_video_intervalos`
- Configurar cron job nightly
- RLS policies
- Insertar config default

---

## 13. Plan de Rollout

1. **Schema + vistas** (Task 1)
2. **Edge Function `video-analytics`** (Task 2)
3. **Servicio `videoAnalytics.js`** (Task 3)
4. **Composable `useVideoAnalytics.js`** (Task 4)
5. **Integración en PlayerPage** (Task 5)
6. **Componentes UI** (Tasks 6-9)
7. **Tests** (Task 10)
8. **Verificación y release v0.14.0** (Task 11)

---

## 14. Notas

- **Privacidad:** Los eventos crudos (`video_eventos`) tienen RLS estricto. Solo el usuario puede ver sus propios eventos; instructores ven agregados.
- **Retención:** Considerar política de retención para `video_eventos` (ej: mantener 90 días de crudos, intervals indefinidamente).
- **Performance:** El índice `idx_video_eventos_curso` permite queries rápidas para agregación nightly.
- **Offline:** Si el alumno está offline, los eventos se pueden acumular en `localStorage` y enviar al reconectar (extensión futura).
