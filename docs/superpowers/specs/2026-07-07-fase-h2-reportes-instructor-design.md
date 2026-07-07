# Spec: Fase H2 — Reportes por Instructor + Análisis de Contenido por Lección

**Fecha:** 2026-07-07  
**Versión:** v0.11.0  
**Scope:** Reportes por instructor (dashboard, alumnos, engagement) + Análisis de contenido por lección (tiempo visto, completitud, engagement)

---

## 1. Contexto

La Fase H1 (v0.10.0) implementó reportes administrativos avanzados para admin: funnel de conversión, retención de cohortes y comparativa entre cursos. Esta fase (H2) agrega reportes orientados al **instructor** de un curso y análisis de **contenido por lección**.

El sistema ya cuenta con:

- Tabla `cursos_instructores` (asignación instructor-curso)
- Tabla `progreso` con `segundos_vistos`
- Tabla `tiempo_curso` (tiempo activo por usuario)
- Tabla `lrs_statements` (eventos xAPI)
- Edge Function `analytics` con endpoints funnel/retencion/comparativa
- Feature flag `reportes_avanzados`

---

## 2. Objetivos

1. **Reportes por instructor:** Permitir que un instructor vea métricas de sus cursos asignados sin necesidad de ser admin.
2. **Análisis de contenido por lección:** Proporcionar métricas detalladas de engagement y consumo a nivel de lección individual.

---

## 3. Alcance

### Incluido

- 3 vistas SQL nuevas
- 3 endpoints nuevos en Edge Function `analytics`
- 1 servicio extendido (`reportes.js`)
- 1 composable extendido (`useReportes.js`)
- 3 componentes Vue nuevos
- Integración en `InstructorPage.vue`
- Tests unitarios y de componentes
- Reutiliza feature flag `reportes_avanzados`

### Excluido (para H3)

- Reportes financieros
- Reportes personalizables / guardados
- Notificaciones automáticas basadas en reportes
- Exportación CSV (ya existe en H1, se puede extender luego)

---

## 4. Arquitectura

### 4.1 Backend (PostgreSQL)

#### v_instructor_cursos

```sql
-- Métricas agregadas por curso para un instructor específico
-- curso_id, curso_titulo
-- total_alumnos (count inscripciones)
-- tasa_aprobacion (avg calificacion >= 70)
-- promedio_calificacion (avg de intentos_evaluacion aprobados)
-- tiempo_promedio_completar (avg dias entre inscripcion y 100% progreso)
-- total_lecciones (count lecciones en el curso)
-- total_modulos (count modulos en el curso)
```

#### v_instructor_alumnos

```sql
-- Alumnos por curso del instructor con métricas individuales
-- user_id, nombres_completos, correo
-- curso_id, curso_titulo
-- pct_progreso (lecciones completadas / total lecciones * 100)
-- calificacion_promedio (avg intentos_evaluacion)
-- tiempo_dedicado_segundos (sum segundos_vistos de progreso)
-- tiempo_activo_segundos (sum segundos_activos de tiempo_curso)
-- ultima_actividad (max timestamp de lrs_statements)
-- foros_posts (count foro_hilos + foro_respuestas)
-- entregas_realizadas (count entregas_leccion)
```

#### v_leccion_analytics

```sql
-- Métricas por lección dentro de un curso
-- leccion_id, leccion_titulo, modulo_titulo
-- curso_id
-- total_alumnos_vieron (count distinct user_id en progreso con segundos_vistos > 0)
-- total_completaron (count progreso.completado = true)
-- tasa_completitud (completaron / total inscritos * 100)
-- tiempo_promedio_visto_segundos (avg segundos_vistos)
-- total_comentarios (count comentarios)
-- total_entregas (count entregas_leccion)
-- total_foro_hilos (count foro_hilos vía leccion_id)
-- total_evaluaciones (count intentos_evaluacion)
-- calificacion_promedio (avg intentos_evaluacion.calificacion)
```

### 4.2 Edge Function

Extender `supabase/functions/analytics/index.ts`:

| Acción                 | Body                                                | Respuesta                                                                                        |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `instructor_dashboard` | `{ action: 'instructor_dashboard', instructor_id }` | `{ cursos: [{ curso_id, titulo, total_alumnos, tasa_aprobacion, promedio_calificacion, ... }] }` |
| `instructor_alumnos`   | `{ action: 'instructor_alumnos', curso_id }`        | `{ alumnos: [{ user_id, nombres, pct_progreso, calificacion_promedio, ... }] }`                  |
| `leccion_analytics`    | `{ action: 'leccion_analytics', curso_id }`         | `{ lecciones: [{ leccion_id, titulo, tasa_completitud, tiempo_promedio_visto, ... }] }`          |

### 4.3 Frontend

#### Nuevos archivos

```
src/
  components/
    InstructorReportPanel.vue    # Tabs: Mis cursos / Alumnos / Análisis
    InstructorAlumnosTable.vue   # Tabla de alumnos con sorting
    LessonAnalyticsTable.vue     # Tabla de métricas por lección
```

#### Modificaciones

- `src/services/reportes.js` — Agregar `obtenerInstructorDashboard`, `obtenerInstructorAlumnos`, `obtenerLeccionAnalytics`
- `src/composables/useReportes.js` — Agregar estados y funciones de carga
- `src/pages/InstructorPage.vue` — Agregar tab "Reportes" con `InstructorReportPanel`

### 4.4 Seguridad

- Las vistas SQL filtran por `instructor_id` usando `cursos_instructores`
- RLS: instructor solo ve datos de sus cursos asignados
- Edge Function valida que el instructor_id coincida con el usuario autenticado

---

## 5. Componentes UI

### InstructorReportPanel.vue

- Props: `instructorId` (string)
- Tabs:
  - **Mis cursos:** Cards con métricas resumidas de cada curso asignado
  - **Alumnos:** Selector de curso + tabla `InstructorAlumnosTable`
  - **Análisis:** Selector de curso + tabla `LessonAnalyticsTable`
- Usa `useReportes()` para cargar datos
- Estados: loading, error, empty

### InstructorAlumnosTable.vue

- Props: `data: [{ user_id, nombres_completos, pct_progreso, calificacion_promedio, tiempo_dedicado_segundos, ... }]`
- Columnas: Alumno | Progreso % | Calificación | Tiempo dedicado | Última actividad | Posts foro | Entregas
- Sorting por cualquier columna
- Barra de progreso visual para `pct_progreso`
- Tiempo en formato legible (horas/minutos)

### LessonAnalyticsTable.vue

- Props: `data: [{ leccion_id, leccion_titulo, tasa_completitud, tiempo_promedio_visto_segundos, ... }]`
- Columnas: Lección | Módulo | Vieron | Completaron % | Tiempo promedio | Comentarios | Entregas | Evaluaciones | Calificación
- Sorting por cualquier columna
- Destacado: lecciones con baja completitud (< 50%) en rojo

---

## 6. Data Flow

```
Instructor visita "Reportes" en InstructorPage
  → InstructorReportPanel monta
    → Carga dashboard (cursos del instructor)
      → Tab "Mis cursos": muestra cards resumen
      → Tab "Alumnos":
        - Selector de curso
        - Carga alumnos del curso seleccionado
        - Muestra InstructorAlumnosTable
      → Tab "Análisis":
        - Selector de curso
        - Carga analytics de lecciones
        - Muestra LessonAnalyticsTable
  → Todo protegido por feature flag `reportes_avanzados`
```

---

## 7. API

### Servicio reportes.js (nuevas funciones)

```typescript
// Dashboard del instructor
async function obtenerInstructorDashboard(instructorId: string): Promise<InstructorCursoData[]>

// Alumnos por curso (vista del instructor)
async function obtenerInstructorAlumnos(cursoId: string): Promise<InstructorAlumnoData[]>

// Analytics por lección
async function obtenerLeccionAnalytics(cursoId: string): Promise<LeccionAnalyticsData[]>

// Tipos
interface InstructorCursoData {
  curso_id: string
  curso_titulo: string
  total_alumnos: number
  tasa_aprobacion: number
  promedio_calificacion: number
  tiempo_promedio_completar: number
  total_lecciones: number
  total_modulos: number
}

interface InstructorAlumnoData {
  user_id: string
  nombres_completos: string
  correo: string
  pct_progreso: number
  calificacion_promedio: number
  tiempo_dedicado_segundos: number
  tiempo_activo_segundos: number
  ultima_actividad: string
  foros_posts: number
  entregas_realizadas: number
}

interface LeccionAnalyticsData {
  leccion_id: string
  leccion_titulo: string
  modulo_titulo: string
  total_alumnos_vieron: number
  total_completaron: number
  tasa_completitud: number
  tiempo_promedio_visto_segundos: number
  total_comentarios: number
  total_entregas: number
  total_foro_hilos: number
  total_evaluaciones: number
  calificacion_promedio: number
}
```

---

## 8. Testing

### Unit tests

- `src/services/__tests__/reportes.test.js` — Tests para 3 nuevas funciones
- `src/composables/__tests__/useReportes.test.js` — Tests para carga de instructor/lección

### Component tests

- `InstructorReportPanel.test.js` — Renderizado de tabs
- `InstructorAlumnosTable.test.js` — Sorting y formato de datos
- `LessonAnalyticsTable.test.js` — Destacado de baja completitud

---

## 9. Migration

### 049_reportes_instructor.sql

```sql
-- Feature flag ya existe (reportes_avanzados de H1)

-- Vista: Cursos del instructor con métricas
-- Vista: Alumnos por curso del instructor
-- Vista: Analytics por lección
-- Índices adicionales para performance
```

---

## 10. Dependencies

- No se requieren nuevas dependencias npm
- Reutilizar componentes de tabla y estilos de H1

---

## 11. Acceptance Criteria

- [ ] Instructor puede ver dashboard con sus cursos y métricas resumidas
- [ ] Instructor puede ver tabla de alumnos por curso (progreso, calificaciones, tiempo)
- [ ] Instructor puede ver analytics por lección (completitud, tiempo visto, engagement)
- [ ] Los reportes están protegidos por feature flag `reportes_avanzados`
- [ ] Solo instructores asignados a un curso ven sus datos (RLS)
- [ ] Todos los tests pasan (unit + component)
- [ ] Build sin errores
