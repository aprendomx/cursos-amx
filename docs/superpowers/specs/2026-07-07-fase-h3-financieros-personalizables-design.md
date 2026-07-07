# Spec: Fase H3 — Financieros + Reportes Personalizables

**Fecha:** 2026-07-07  
**Versión:** v0.12.0  
**Scope:** Reportes financieros (costos, inscripciones) + Reportes personalizables (favoritos, programados)

---

## 1. Contexto

La Fase H1 (v0.10.0) implementó reportes administrativos avanzados: funnel, retención y comparativa. La Fase H2 (v0.11.0) agregó reportes por instructor y análisis de contenido por lección. Esta fase (H3) cierra el módulo de reportes con métricas financieras y personalización.

El sistema ya cuenta con:

- Tabla `ai_usage_logs` (tokens consumidos, costo estimado)
- Tabla `videos` (tamaño, duración, estado)
- Tabla `inscripciones` (fechas, cursos)
- Tabla `lrs_statements` (eventos xAPI)
- Feature flag `reportes_avanzados`
- Edge Function `analytics` con múltiples endpoints

---

## 2. Objetivos

1. **Reportes financieros:** Visualizar costos de infraestructura (almacenamiento, IA) e inscripciones como métricas de "ventas"
2. **Reportes personalizables:** Permitir guardar configuraciones de reportes, programar ejecuciones automáticas y ver historial

---

## 3. Alcance

### Incluido

- 3 tablas nuevas (`reportes_favoritos`, `reportes_programados`, `reportes_historial`)
- 3 vistas SQL nuevas (`v_costos_infraestructura`, `v_inscripciones_tiempo`, `v_cursos_populares`)
- 3 endpoints nuevos en Edge Function `analytics`
- 1 servicio extendido (`reportes.js`)
- 1 composable extendido (`useReportes.js`)
- 5 componentes Vue nuevos
- Integración en `AdminReportes.vue`
- Tests unitarios y de componentes
- Reutiliza feature flag `reportes_avanzados`

### Excluido

- Integración con sistemas de pago reales (Stripe, PayPal)
- Facturación automática
- Notificaciones por email (ya existe infraestructura, se puede extender)

---

## 4. Arquitectura

### 4.1 Backend (PostgreSQL)

#### reportes_favoritos

```sql
-- Configuración guardada de reportes
id uuid primary key default gen_random_uuid()
usuario_id uuid references auth.users(id)
nombre text not null
tipo_reporte text not null check (tipo_reporte in ('funnel','retencion','comparativa','instructor_dashboard','instructor_alumnos','leccion_analytics','costos','inscripciones_tiempo','cursos_populares'))
filtros jsonb default '{}'
creado_en timestamptz default now()
```

#### reportes_programados

```sql
-- Tareas de reportes automáticos
id uuid primary key default gen_random_uuid()
usuario_id uuid references auth.users(id)
nombre text not null
tipo_reporte text not null
filtros jsonb default '{}'
frecuencia text not null check (frecuencia in ('diario','semanal','mensual'))
ultima_ejecucion timestamptz
activo boolean default true
creado_en timestamptz default now()
```

#### reportes_historial

```sql
-- Log de ejecuciones
id uuid primary key default gen_random_uuid()
programado_id uuid references reportes_programados(id)
estado text not null check (estado in ('exitoso','error'))
resultado_resumen jsonb default '{}'
ejecutado_en timestamptz default now()
```

#### v_costos_infraestructura

```sql
-- Costos estimados por tipo de recurso
-- total_videos_gb, total_documentos_gb, costo_estimado_almacenamiento
-- total_tokens_ia, costo_estimado_ia
-- total_ancho_banda_gb (estimado desde lrs_statements verb='watched')
```

#### v_inscripciones_tiempo

```sql
-- Inscripciones agregadas por día/semana/mes
-- fecha, total_inscripciones, cursos_distintos
```

#### v_cursos_populares

```sql
-- Ranking de cursos por inscripciones y engagement
-- curso_id, titulo, total_inscripciones, total_completados, engagement_score
```

### 4.2 Edge Function

Extender `supabase/functions/analytics/index.ts`:

| Acción                 | Body                                                           | Respuesta                                                                               |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `costos`               | `{ action: 'costos' }`                                         | `{ almacenamiento_videos_gb, almacenamiento_docs_gb, tokens_ia, costo_total_estimado }` |
| `inscripciones_tiempo` | `{ action: 'inscripciones_tiempo', desde, hasta, agrupacion }` | `{ puntos: [{ fecha, total }] }`                                                        |
| `cursos_populares`     | `{ action: 'cursos_populares', limite }`                       | `{ cursos: [{ curso_id, titulo, total_inscripciones, engagement_score }] }`             |

### 4.3 Frontend

#### Nuevos componentes

```
src/
  components/
    CostosDashboard.vue           # Cards con métricas de costos
    InscripcionesTimeline.vue     # Gráfico de líneas de inscripciones
    ReporteFavoritosManager.vue   # Lista de favoritos
    ReporteProgramadoForm.vue     # Formulario crear/editar programado
    ReporteProgramadoList.vue     # Lista de tareas programadas
```

#### Modificaciones

- `src/services/reportes.js` — Agregar `obtenerCostos`, `obtenerInscripcionesTiempo`, `obtenerCursosPopulares`, `guardarFavorito`, `cargarFavoritos`, `programarReporte`
- `src/composables/useReportes.js` — Estados y funciones nuevas
- `src/components/AdminReportes.vue` — Tabs: "Financieros", "Personalizados"
- `src/components/InstructorReportPanel.vue` — Botón "Guardar como favorito"

---

## 5. Componentes UI

### CostosDashboard.vue

- Props: `data: { almacenamiento_videos_gb, almacenamiento_docs_gb, tokens_ia, costo_total_estimado }`
- 4 cards: Almacenamiento videos, Almacenamiento docs, Tokens IA, Costo total estimado
- Formato monetario en MXN (simulado)

### InscripcionesTimeline.vue

- Props: `data: [{ fecha, total }]`
- Gráfico de líneas simple (usar Chart.js ya instalado)
- Filtros: rango de fechas, agrupación (día/semana/mes)

### ReporteFavoritosManager.vue

- Lista de reportes guardados
- Botón "Cargar" → aplica filtros y navega al reporte
- Botón "Eliminar"
- Formulario "Guardar actual" con nombre

### ReporteProgramadoForm.vue

- Props: `initialData?`
- Campos: nombre, tipo de reporte, filtros (JSON), frecuencia
- Botón "Guardar"

### ReporteProgramadoList.vue

- Tabla de tareas programadas
- Columnas: Nombre, Tipo, Frecuencia, Última ejecución, Estado
- Botón "Ejecutar ahora", "Editar", "Eliminar"

---

## 6. Data Flow

```
Admin visita "Reportes"
  → Tab "Financieros":
    - CostosDashboard carga costos actuales
    - InscripcionesTimeline carga serie temporal
  → Tab "Personalizados":
    - ReporteFavoritosManager lista favoritos
    - ReporteProgramadoList lista tareas
    - ReporteProgramadoForm para crear/editar
```

---

## 7. API

### Servicio reportes.js (nuevas funciones)

```typescript
async function obtenerCostos(): Promise<CostosData>
async function obtenerInscripcionesTiempo(desde, hasta, agrupacion): Promise<PuntoTiempo[]>
async function obtenerCursosPopulares(limite): Promise<CursoPopular[]>
async function guardarFavorito(nombre, tipoReporte, filtros): Promise<Favorito>
async function cargarFavoritos(): Promise<Favorito[]>
async function eliminarFavorito(id): Promise<void>
async function programarReporte(nombre, tipoReporte, filtros, frecuencia): Promise<Programado>
async function cargarProgramados(): Promise<Programado[]>
async function ejecutarProgramado(id): Promise<void>
```

---

## 8. Testing

### Unit tests

- `reportes.test.js` — Tests para 6 nuevas funciones
- `useReportes.test.js` — Tests para favoritos y programados

### Component tests

- `CostosDashboard.test.js` — Renderizado de cards
- `InscripcionesTimeline.test.js` — Gráfico con datos
- `ReporteFavoritosManager.test.js` — Guardar/cargar/eliminar

---

## 9. Migration

### 050_reportes_personalizables.sql

```sql
-- Tablas: reportes_favoritos, reportes_programados, reportes_historial
-- Vistas: v_costos_infraestructura, v_inscripciones_tiempo, v_cursos_populares
-- RLS policies
-- Índices
```

---

## 10. Dependencies

- No se requieren nuevas dependencias npm
- Reutilizar Chart.js (ya instalado) para gráfico de líneas

---

## 11. Acceptance Criteria

- [ ] Admin puede ver dashboard de costos (almacenamiento, IA)
- [ ] Admin puede ver gráfico de inscripciones por tiempo
- [ ] Admin puede ver ranking de cursos populares
- [ ] Usuario puede guardar configuración de reporte como favorito
- [ ] Usuario puede programar reportes automáticos
- [ ] Usuario puede ver historial de ejecuciones
- [ ] Todo protegido por feature flag `reportes_avanzados`
- [ ] Todos los tests pasan
- [ ] Build sin errores
