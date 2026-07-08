# Checklist de Despliegue — v0.14.0 (Fase J: Analytics de Video)

## Pre-requisitos

- [ ] Acceso a proyecto Supabase (producción)
- [ ] CLI de Supabase instalado y autenticado (`supabase login`)
- [ ] Node.js 20+ y npm instalados
- [ ] Variables de entorno configuradas en `.env` (ver `.env.example`)

---

## 1. Base de Datos

### 1.1 Aplicar migración 052

```bash
supabase db push
```

O manualmente desde el SQL Editor:

```bash
cat supabase/migrations/052_video_analytics.sql | supabase sql
```

**Verificar:**

- [ ] Tablas creadas: `video_eventos`, `video_intervalos`, `video_analytics_config`
- [ ] Vistas creadas: `v_video_leccion_stats`, `v_curso_video_stats`
- [ ] Función `agregar_video_intervalos(p_fecha date)` creada
- [ ] Cron job `video-analytics-aggregate` configurado (02:00 UTC diario)
- [ ] RLS habilitado en las 3 tablas
- [ ] Índices: `idx_video_eventos_leccion_fecha`, `idx_video_eventos_user`, `idx_video_intervalos_leccion_fecha`

### 1.2 Verificar cron job

```sql
SELECT * FROM cron.job WHERE jobname = 'video-analytics-aggregate';
```

Debe retornar 1 fila con schedule `0 2 * * *`.

---

## 2. Edge Function

### 2.1 Desplegar `video-analytics`

```bash
supabase functions deploy video-analytics
```

**Verificar:**

- [ ] Function deployada sin errores
- [ ] Logs accesibles: `supabase functions logs video-analytics --tail`

### 2.2 Configurar secrets (si aplica)

```bash
supabase secrets set VIDEO_ANALYTICS_MAX_BATCH_SIZE=100
```

> Default ya está en código (100). Solo si necesitas override.

---

## 3. Feature Flags

Activar desde el panel de administración o directamente en Supabase:

```sql
-- Activar analytics de video (requerido)
INSERT INTO feature_toggles (clave, habilitado, descripcion)
VALUES ('video_analytics', true, 'Analytics de video: tracking de eventos y dashboards')
ON CONFLICT (clave) DO UPDATE SET habilitado = true;

-- Activar heatmap (opcional)
INSERT INTO feature_toggles (clave, habilitado, descripcion)
VALUES ('video_analytics_heatmap', true, 'Visualización de heatmap en reproductor')
ON CONFLICT (clave) DO UPDATE SET habilitado = true;
```

**Verificar:**

- [ ] `video_analytics` = true
- [ ] `video_analytics_heatmap` = true (si se desea)

---

## 4. Frontend

### 4.1 Variables de entorno

Asegurar que el build de producción tenga:

```bash
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

> Nota: los feature flags se leen en runtime desde Supabase, no requieren rebuild.

### 4.2 Build y deploy

```bash
npm ci
npm run build
# Subir contenido de `dist/` a tu CDN/hosting estático
```

**Verificar:**

- [ ] Build exitoso sin errores
- [ ] Tests pasando: `npm run test:unit` (295 tests)

---

## 5. Validación Post-Deploy

### 5.1 Tracking de eventos

1. Abrir un curso con video (con `video_analytics` habilitado)
2. Reproducir, pausar, hacer seek
3. Verificar en Supabase:

```sql
SELECT * FROM video_eventos ORDER BY creado_en DESC LIMIT 10;
```

- [ ] Eventos `play`, `pause`, `seek`, `tick` aparecen en la tabla

### 5.2 Agregación nocturna

Para probar manualmente (sin esperar al cron):

```sql
SELECT agregar_video_intervalos(CURRENT_DATE);
```

Luego verificar:

```sql
SELECT * FROM video_intervalos WHERE fecha = CURRENT_DATE LIMIT 10;
```

- [ ] Buckets de 10s generados con `vistas_unicas`, `total_visto`, `abandonos`

### 5.3 Dashboards

- [ ] Admin: pestaña "Analytics Video" muestra stats del sistema
- [ ] Instructor: sección "Mis Videos" muestra dashboard por curso
- [ ] Reproductor: heatmap visible debajo del video (si `video_analytics_heatmap` está activo)

### 5.4 Performance

- [ ] El tracking no afecta la reproducción (< 1ms por evento)
- [ ] Batching reduce requests a 1 cada 30s máximo
- [ ] `sendBeacon` en beforeunload no bloquea navegación

---

## Rollback

Si es necesario revertir:

```sql
-- Desactivar feature flags
UPDATE feature_toggles SET habilitado = false WHERE clave IN ('video_analytics', 'video_analytics_heatmap');

-- Opcional: limpiar datos
TRUNCATE video_eventos, video_intervalos;
DROP VIEW IF EXISTS v_video_leccion_stats, v_curso_video_stats;
DROP TABLE IF EXISTS video_eventos, video_intervalos, video_analytics_config CASCADE;
SELECT cron.unschedule('video-analytics-aggregate');
```

> La Edge Function puede mantenerse deployada; con el feature flag desactivado no recibe tráfico.

---

## Notas

- **Retention de eventos raw**: `video_eventos` puede crecer rápido. Considerar política de retención (ej. PURGE después de 90 días) o particionamiento si > 10M filas.
- **Buckets**: 10 segundos es un balance entre granularidad y eficiencia. Ajustar en `agregar_video_intervalos()` si es necesario.
- **sendBeacon**: funciona en todos los navegadores modernos. Fallback automático a fetch síncrono si no está disponible.

---

## Referencias

- Spec: `docs/superpowers/specs/2026-07-07-fase-j-analytics-video-design.md`
- Plan: `docs/superpowers/plans/2026-07-07-fase-j-analytics-video.md`
- Schema: `supabase/migrations/052_video_analytics.sql`
- Edge Function: `supabase/functions/video-analytics/index.ts`
