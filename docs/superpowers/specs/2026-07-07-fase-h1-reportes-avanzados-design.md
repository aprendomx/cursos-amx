# Spec: Fase H1 — Reportes Administrativos Avanzados (Core)

**Fecha:** 2026-07-07  
**Versión:** v0.10.0  
**Scope:** Funnel de conversión, Retención de cohortes, Comparativa entre cursos

---

## 1. Contexto

La plataforma ya cuenta con analytics básicos (Fase 3, v0.7.0): xAPI/LRS, dashboard de engagement, riesgo de alumnos, mapa de calor, y exportación CSV. Esta fase (H1) agrega reportes administrativos avanzados para decisiones estratégicas: funnel de conversión, retención de cohortes y comparativa entre cursos.

---

## 2. Objetivos

1. **Funnel de conversión:** Visualizar cuántos usuarios pasan por cada etapa (visitante → registrado → inscrito → activo → completado) y la tasa de conversión entre etapas.
2. **Retención de cohortes:** Identificar qué porcentaje de alumnos inscritos en una semana determinada siguen activos después de N días (0, 7, 14, 30, 60, 90).
3. **Comparativa entre cursos:** Ranking de cursos con métricas clave (inscripciones, tasa de finalización, engagement promedio, calificación promedio).

---

## 3. Alcance

### Incluido

- 3 vistas/materialized views en PostgreSQL
- Extensión de Edge Function `analytics` con 3 nuevos endpoints
- 3 nuevos componentes Vue para visualización
- 1 servicio + 1 composable para acceso a datos
- Feature flag `reportes_avanzados`
- Tests unitarios y de componentes
- Exportación CSV de cada reporte

### Excluido (para H2/H3)

- Reportes por instructor
- Análisis de contenido por lección (heatmap de abandono por minuto)
- Reportes financieros
- Reportes personalizables / guardados
- Notificaciones automáticas basadas en reportes

---

## 4. Arquitectura

### 4.1 Backend (PostgreSQL)

#### v_funnel_curso

```sql
-- Etapas del funnel por curso y rango de fechas
-- visitantes: count de usuarios que vieron la landing del curso (lrs_statements verb='viewed' object_type='curso')
-- registrados: count de usuarios que se registraron en la plataforma (auth.users creado en rango)
-- inscritos: count de inscripciones en el curso en rango
-- activos: count de usuarios con al menos un login (lrs_statements verb='logged_in') después de inscribirse
-- completados: count de usuarios con 100% de lecciones completadas en el curso
```

#### v_retencion_cohorte

```sql
-- Retención por semana de inscripción (cohorte) y día transcurrido
-- cohorte: semana del año de la inscripción (date_trunc('week', inscrito_en))
-- total_inscritos: count de inscripciones en esa cohorte
-- activos_d7: count con login en día 0-7
-- activos_d14: count con login en día 0-14
-- activos_d30: count con login en día 0-30
-- activos_d60: count con login en día 0-60
-- activos_d90: count con login en día 0-90
-- pct_d7, pct_d14, pct_d30, pct_d60, pct_d90: porcentajes sobre total_inscritos
```

#### v_comparativa_cursos

```sql
-- Métricas agregadas por curso para comparación
-- curso_id, curso_titulo
-- total_inscritos
-- total_completados
-- tasa_finalizacion: completados / inscritos * 100
-- engagement_promedio: avg de actividades (logins + lecciones + quizzes + foros) por alumno
-- calificacion_promedio: avg de calificaciones de evaluaciones aprobadas
-- dias_promedio_completar: avg(días entre inscripción y 100% progreso)
```

### 4.2 Edge Function

Extender `supabase/functions/analytics/index.ts`:

| Acción        | Body                                           | Respuesta                                                                        |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `funnel`      | `{ action: 'funnel', curso_id, desde, hasta }` | `{ visitantes, registrados, inscritos, activos, completados, conversiones: {} }` |
| `retencion`   | `{ action: 'retencion', curso_id }`            | `{ cohortes: [{ semana, total, d7, d14, d30, d60, d90, pcts: {} }] }`            |
| `comparativa` | `{ action: 'comparativa', desde, hasta }`      | `{ cursos: [{ ... }] }`                                                          |
| `reporte_csv` | (ya existe)                                    | CSV blob                                                                         |

### 4.3 Frontend

#### Nuevos archivos

```
src/
  services/
    reportes.js              # obtenerFunnel, obtenerRetencion, obtenerComparativa
  composables/
    useReportes.js           # orquesta las 3 consultas
  components/
    FunnelChart.vue          # Barras horizontales con cantidades y %
    RetentionMatrix.vue      # Tabla con heatmap de colores
    CourseComparisonTable.vue # Tabla sortable con métricas
```

#### Modificaciones

- `AdminReportes.vue` — Agregar tabs: "Resumen", "Funnel", "Retención", "Comparativa"
- `AnalyticsDashboard.vue` — Agregar 3 cards con métricas clave y links a reportes detallados
- `useAdminNavigation.js` — Agregar `reportes_avanzados` feature flag

### 4.4 Feature Flags

Nueva flag en `feature_toggles`:

- `reportes_avanzados` (boolean, default false)

Protege todo el módulo H1-H3.

---

## 5. Componentes UI

### FunnelChart.vue

- Props: `data: { visitantes, registrados, inscritos, activos, completados }`
- Visualización: Barras horizontales de ancho proporcional a la cantidad
- Muestra cantidad y % de conversión vs etapa anterior
- Etapas siempre en orden: Visitantes → Registrados → Inscritos → Activos → Completados
- Color: gradiente de azul a verde (más intenso en etapas finales)

### RetentionMatrix.vue

- Props: `data: [{ semana, total, d7, d14, d30, d60, d90, pcts: {} }]`
- Visualización: Tabla con cohortes en filas, días en columnas
- Colores: heatmap de rojo (baja retención) a verde (alta retención)
- Formato: semana como "2026-W01", porcentajes con 1 decimal

### CourseComparisonTable.vue

- Props: `data: [{ curso_id, curso_titulo, total_inscritos, ... }]`
- Visualización: Tabla HTML sortable por cualquier columna
- Columnas: Curso | Inscritos | Completados | Tasa finalización | Engagement | Calificación promedio
- Sorting: click en header, toggle asc/desc
- Destacado: Top 3 cursos con badge 🥇🥈🥉

---

## 6. Data Flow

```
Admin visita "Reportes" en AdminPage
  → AdminReportes muestra tabs (Resumen/Funnel/Retención/Comparativa)
    → Admin selecciona curso + rango de fechas
      → useReportes dispara 3 llamadas en paralelo (Promise.all)
        → funnel → FunnelChart
        → retencion → RetentionMatrix
        → comparativa → CourseComparisonTable
      → Estados: loading (skeleton), error (toast), success (datos)
    → Admin click "Descargar CSV"
      → Invoca Edge Function con action='reporte_csv' + tipo + filtros
      → Trigger descarga de archivo
```

---

## 7. API

### Servicio reportes.js

```typescript
// Funnel de conversión
async function obtenerFunnel(cursoId: string, desde?: string, hasta?: string): Promise<FunnelData>

// Retención de cohortes
async function obtenerRetencion(cursoId: string): Promise<RetencionData[]>

// Comparativa entre cursos
async function obtenerComparativa(desde?: string, hasta?: string): Promise<ComparativaData[]>

// Tipos
interface FunnelData {
  visitantes: number
  registrados: number
  inscritos: number
  activos: number
  completados: number
  conversiones: {
    registrados_pct: number
    inscritos_pct: number
    activos_pct: number
    completados_pct: number
  }
}

interface RetencionData {
  semana: string
  total: number
  d7: number
  d14: number
  d30: number
  d60: number
  d90: number
  pcts: {
    d7: number
    d14: number
    d30: number
    d60: number
    d90: number
  }
}

interface ComparativaData {
  curso_id: string
  curso_titulo: string
  total_inscritos: number
  total_completados: number
  tasa_finalizacion: number
  engagement_promedio: number
  calificacion_promedio: number
  dias_promedio_completar: number
}
```

---

## 8. Testing

### Unit tests (src/services/**tests**/reportes.test.js)

- Mock de Supabase/Edge Function
- Verificar que obtenerFunnel llama a la función con los parámetros correctos
- Verificar que obtenerRetencion devuelve datos formateados
- Verificar manejo de errores

### Composable tests (src/composables/**tests**/useReportes.test.js)

- Carga paralela de los 3 reportes
- Estados de loading/error
- Reactividad de filtros (cambio de curso dispara recarga)

### Component tests

- FunnelChart: renderizado con datos de ejemplo, cantidades visibles
- RetentionMatrix: heatmap colorea celdas correctamente
- CourseComparisonTable: sorting funciona, top 3 destacados

### Edge Function tests

- Verificar que funnel, retencion, comparativa devuelven estructura correcta
- Verificar reporte_csv con filtros

---

## 9. Performance

- Las vistas SQL usan índices existentes (`lrs_statements_actor_timestamp_idx`, etc.)
- Si el dataset crece >100k registros, evaluar materialized views con refresh diario
- Frontend: cargar reportes en paralelo (Promise.all)
- Cache: los reportes no cambian en tiempo real, pueden cachearse 5 min en memoria

---

## 10. Error Handling

- Si un reporte falla, mostrar error específico por reporte (no bloquear los otros)
- Si no hay datos para el rango seleccionado, mostrar estado vacío con sugerencia de ampliar fechas
- Si el curso no tiene inscripciones, mostrar mensaje informativo

---

## 11. UX/UI

- Filtros globales: selector de curso, date picker (desde/hasta), botón "Aplicar"
- Skeleton loaders mientras cargan los reportes
- Cada reporte en su propia card con título y descripción breve
- Botón "Descargar CSV" en cada reporte
- Responsive: tablas con scroll horizontal en móvil

---

## 12. Migration

### 048_reportes_avanzados.sql

```sql
-- Feature flag
insert into feature_toggles (key, value) values ('reportes_avanzados', 'false');

-- Vista funnel
-- Vista retención
-- Vista comparativa
-- Índices adicionales si se necesitan
```

---

## 13. Dependencies

- No se requieren nuevas dependencias npm
- Reutilizar: Chart.js (ya instalado), vue-datepicker o input type="date" nativo

---

## 14. Post-H1 (H2/H3 Preview)

- H2: Reportes por instructor, análisis de contenido por lección
- H3: Financieros, reportes personalizables/guardados

---

## 15. Acceptance Criteria

- [ ] El admin puede ver funnel de conversión con 5 etapas y porcentajes
- [ ] El admin puede ver tabla de retención con cohortes y heatmap
- [ ] El admin puede comparar cursos con tabla sortable
- [ ] Cada reporte se puede descargar como CSV
- [ ] Los reportes están protegidos por feature flag `reportes_avanzados`
- [ ] Todos los tests pasan (unit + component)
- [ ] Build sin errores ni warnings
