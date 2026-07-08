# Fase K: Entregas y Rúbricas — Design Spec

## Contexto

La plataforma Cursos AMX cuenta con cursos, lecciones, videos, quizzes, foros, aulas virtuales, notificaciones, analytics de video y gamificación. Falta un módulo de **tareas/entregas** donde los alumnos puedan subir trabajo y los instructores lo califiquen con retroalimentación estructurada.

## Objetivo

Implementar un sistema completo de entregas con:

- Creación de tareas por parte del instructor (instrucciones, fechas, configuración de archivos)
- Entregas del alumno con soporte para **archivo + texto enriquecido**
- **Historial de versiones** (múltiples entregas acumulativas)
- **Rúbricas de dos tipos**: niveles cualitativos y puntaje libre por criterio
- Penalización por retraso configurable
- Notificaciones automáticas (integración Fase I)
- Badges de gamificación

## Out of Scope (para fases futuras)

- Exámenes cronometrados con banco de preguntas (ya existe quizzes)
- Revisión entre pares (peer review)
- Plagio detection
- Entregas grupales
- Calificación por IA

---

## Arquitectura

### Modelo de Datos (Migration 053)

#### Tablas

**`tareas`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
curso_id uuid REFERENCES cursos(id) ON DELETE CASCADE,
modulo_id uuid REFERENCES modulos(id) ON DELETE SET NULL,
titulo text NOT NULL,
instrucciones jsonb, -- Tiptap JSON
fecha_apertura timestamptz,
fecha_limite timestamptz,
maximo_archivos int DEFAULT 5,
peso_maximo_mb int DEFAULT 10,
permitir_retraso boolean DEFAULT false,
penalizacion_retraso_pct int DEFAULT 0, -- ej. 10 = -10% por día
creado_en timestamptz DEFAULT now(),
actualizado_en timestamptz DEFAULT now()
```

**`entregas`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tarea_id uuid REFERENCES tareas(id) ON DELETE CASCADE,
user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
estado text NOT NULL CHECK (estado IN ('pendiente', 'entregada', 'calificada', 'devuelta')),
entregado_en timestamptz,
calificado_en timestamptz,
calificado_por uuid REFERENCES auth.users(id),
puntaje_final numeric(5,2),
comentario_instructor jsonb, -- Tiptap JSON
version_actual int DEFAULT 0,
creado_en timestamptz DEFAULT now(),
actualizado_en timestamptz DEFAULT now(),
UNIQUE(tarea_id, user_id)
```

**`entrega_versiones`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
entrega_id uuid REFERENCES entregas(id) ON DELETE CASCADE,
numero_version int NOT NULL,
texto jsonb, -- Tiptap JSON
archivos text[], -- URLs a Supabase Storage
entregado_en timestamptz DEFAULT now(),
comentario_alumno text,
UNIQUE(entrega_id, numero_version)
```

**`rubricas`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tarea_id uuid REFERENCES tareas(id) ON DELETE CASCADE,
tipo text NOT NULL CHECK (tipo IN ('niveles', 'puntaje_libre')),
titulo text NOT NULL,
puntaje_maximo int DEFAULT 100,
creado_en timestamptz DEFAULT now()
```

**`rubrica_criterios`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
rubrica_id uuid REFERENCES rubricas(id) ON DELETE CASCADE,
titulo text NOT NULL,
descripcion text,
orden int NOT NULL,
peso numeric(3,2) DEFAULT 1.0, -- ponderación
puntaje_maximo int, -- solo para puntaje_libre
UNIQUE(rubrica_id, orden)
```

**`rubrica_niveles`** (solo para tipo='niveles')

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
rubrica_id uuid REFERENCES rubricas(id) ON DELETE CASCADE,
etiqueta text NOT NULL, -- 'Excelente', 'Bueno', etc.
puntaje int NOT NULL,
orden int NOT NULL,
UNIQUE(rubrica_id, orden)
```

**`calificaciones`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
entrega_id uuid REFERENCES entregas(id) ON DELETE CASCADE,
criterio_id uuid REFERENCES rubrica_criterios(id) ON DELETE CASCADE,
nivel_id uuid REFERENCES rubrica_niveles(id) ON DELETE SET NULL,
puntaje numeric(5,2), -- para puntaje_libre
comentario text,
UNIQUE(entrega_id, criterio_id)
```

### Vistas

**`v_entregas_pendientes_instructor`** — entregas pendientes de calificación por curso

```sql
SELECT e.*, t.titulo as tarea_titulo, t.fecha_limite, p.nombres, p.apellido_paterno, c.titulo as curso_titulo
FROM entregas e
JOIN tareas t ON e.tarea_id = t.id
JOIN perfiles p ON e.user_id = p.id
JOIN cursos c ON t.curso_id = c.id
WHERE e.estado = 'entregada'
```

### Storage

- Bucket: `entregas/` (nuevo o reutilizar `uploads/`)
- Path: `entregas/{tarea_id}/{user_id}/v{version}/{filename}`
- Límite de tamaño validado en Edge Function o cliente

### RLS

- **`tareas`**: SELECT public (si curso publicado), INSERT/UPDATE/DELETE solo instructor del curso
- **`entregas`**: SELECT propio o instructor del curso, INSERT propio, UPDATE instructor del curso
- **`entrega_versiones`**: SELECT propio o instructor del curso, INSERT propio
- **`rubricas`**, **`rubrica_criterios`**, **`rubrica_niveles`**: SELECT public (si tarea visible), INSERT/UPDATE/DELETE solo instructor
- **`calificaciones`**: SELECT propio o instructor, INSERT/UPDATE solo instructor

### Índices

```sql
CREATE INDEX idx_entregas_tarea_user ON entregas(tarea_id, user_id);
CREATE INDEX idx_entregas_estado ON entregas(estado);
CREATE INDEX idx_entrega_versiones_entrega ON entrega_versiones(entrega_id);
CREATE INDEX idx_calificaciones_entrega ON calificaciones(entrega_id);
```

---

## Componentes UI

### Instructor

**`CrearTareaPanel.vue`**

- Formulario: título, instrucciones (Tiptap), fechas, config archivos
- Toggle retraso + input penalización
- Toggle "usar rúbrica" → monta `RubricaEditor`
- Botón guardar/publicar

**`RubricaEditor.vue`**

- Selector tipo: niveles / puntaje libre
- Lista ordenable de criterios (drag-and-drop)
- Por criterio: título, descripción, peso, puntaje máximo (si libre)
- Editor de niveles globales (si tipo='niveles'): etiqueta + puntaje
- Preview en tiempo real

**`CalificarEntregaModal.vue`**

- Layout: sidebar izquierdo (versión actual/archivos/texto), sidebar derecho (rúbrica)
- Selector de versión del alumno
- Rúbrica interactiva:
  - Niveles: radio buttons con descripción hover
  - Puntaje libre: input numérico con validación
- Comentario general (Tiptap)
- Cálculo automático puntaje final (con penalización)
- Botones: "Guardar borrador" (estado='entregada') / "Publicar calificación" (estado='calificada')
- Botón "Devolver para corrección" (estado='devuelta')

**`EntregasInstructorTable.vue`**

- Tabla: alumno, tarea, estado, versión, fecha entrega, días retraso, puntaje
- Filtros: estado, buscador
- Acciones: calificar (modal), ver historial

**`RubricaPreview.vue`** — vista previa de solo lectura para el alumno antes de entregar

### Alumno

**`EntregaAlumnoPanel.vue`**

- Estado banner: pendiente/entregada/calificada/devuelta con color
- Si pendiente: Tiptap editor + `EntregaUploader` + botón "Entregar"
- Si entregada: mostrar versión actual + botón "Nueva versión" (si aplica)
- Si calificada: `RubricaAlumnoView` + comentario instructor + puntaje final
- Si devuelta: mensaje de instructor + botón "Reenviar"
- Dropdown "Historial de versiones"
- Countdown a fecha límite

**`EntregaUploader.vue`**

- Drag & drop zone
- Validación: tipo (PDF, DOC, DOCX, PNG, JPG, ZIP), tamaño
- Upload progresivo a Supabase Storage
- Lista de archivos con preview (imágenes/PDF) y eliminar
- Máximo N archivos (de la tarea)

**`RubricaAlumnoView.vue`** — solo lectura

- Criterios con nivel/puntaje resaltado
- Colores por nivel (verde=Excelente, amarillo=Bueno, etc.)
- Comentarios por criterio
- Puntaje final destacado
- Desglose con/without penalización

### Admin

**`AdminEntregas.vue`** (tab en AdminPage)

- Resumen: entregas totales, pendientes de calificación, tasa de entrega
- Tabla de tareas con estadísticas
- Filtros por curso, fecha

---

## Servicios

**`src/services/entregas.js`**

- `crearTarea(tarea)` → UUID
- `actualizarTarea(tareaId, datos)`
- `eliminarTarea(tareaId)`
- `listarTareasPorCurso(cursoId)`
- `crearEntrega(tareaId, datos)` → crea entrega + versión 1
- `nuevaVersion(entregaId, datos)` → versión N+1
- `obtenerEntrega(tareaId, userId)` → entrega + versiones + calificaciones
- `listarEntregasPorTarea(tareaId)` → para instructor
- `calificarEntrega(entregaId, calificaciones, comentario)` → update entrega + insert calificaciones
- `devolverEntrega(entregaId, comentario)` → estado='devuelta'

**`src/services/rubricas.js`**

- `crearRubrica(tareaId, rubrica)` → con criterios y niveles
- `actualizarRubrica(rubricaId, datos)`
- `obtenerRubrica(tareaId)`

---

## Composables

**`src/composables/useEntregas.js`**

- `entrega`: entrega actual + versiones
- `tarea`: datos de la tarea
- `rubrica`: rúbrica asociada
- `estado`: computed del estado
- `puedeEntregar`: computed (en fecha o retraso permitido)
- `diasRestantes`: computed
- `diasRetraso`: computed
- `subirVersion(datos)`: crea nueva versión
- `cargarEntrega(tareaId)`

**`src/composables/useEntregasInstructor.js`**

- `entregasPendientes`: lista de entregas por calificar
- `estadisticas`: counts por estado
- `calificar(entregaId, calificacion)`
- `devolver(entregaId, comentario)`

---

## Feature Flags

```typescript
entregas: flag('VITE_FEATURE_ENTREGAS'),
entregas_rubricas: flag('VITE_FEATURE_ENTREGAS_RUBRICAS'),
```

- `entregas`: master flag. Si false, no se monta nada del módulo.
- `entregas_rubricas`: sub-flag. Si false, las tareas solo usan calificación simple (puntaje 0-100 sin criterios).

---

## Integraciones

### Notificaciones (Fase I)

Triggers PostgreSQL en `entregas`:

- `INSERT` con estado='entregada' → notificación al instructor: "Nueva entrega en {tarea.titulo}"
- `UPDATE` estado 'entregada' → 'calificada' → notificación al alumno: "Tu entrega en {tarea.titulo} ha sido calificada: {puntaje_final}"
- `UPDATE` estado → 'devuelta' → notificación al alumno: "Tu entrega en {tarea.titulo} fue devuelta para corrección"

### Gamificación

Nuevos criterios en `badgeEngine.js`:

- `primera_entrega`: COUNT entregas >= 1
- `entrega_a_tiempo`: entrega con diasRetraso = 0
- `calificacion_perfecta`: puntaje_final = 100

---

## Edge Cases

1. **Sin rúbrica**: instructor califica con puntaje libre único (0-100) y comentario general
2. **Entrega vacía**: validar que haya al menos archivo.length > 0 o texto con contenido
3. **Fecha límite pasada**: si `permitir_retraso=true`, seguir aceptando pero marcar como retrasada. Si `false`, deshabilitar botón
4. **Tarea sin abrir**: si `fecha_apertura` > ahora, mostrar countdown, deshabilitar entrega
5. **Cambio de rúbrica después de entregas**: permitir editar rúbrica, pero calificaciones previas quedan con los criterios antiguos. Nuevas calificaciones usan rúbrica actual.
6. **Penalización > 100%**: cap en 100% (puntaje_final mínimo 0)

---

## Testing

### Unit tests objetivo: 20+

**Servicios:**

- `crearTarea` con/sin rúbrica
- `crearEntrega` + `nuevaVersion`
- `calificarEntrega` con rúbrica de niveles
- `calificarEntrega` con rúbrica de puntaje libre
- Penalización por retraso (varios escenarios)
- `devolverEntrega`

**Composables:**

- `useEntregas`: estado, puedeEntregar, diasRestantes
- `useEntregasInstructor`: calificar, estadísticas

**Componentes:**

- `RubricaEditor`: agregar/eliminar criterios, cambiar tipo
- `CalificarEntregaModal`: calcular puntaje, aplicar penalización
- `EntregaAlumnoPanel`: mostrar estado calificada con rúbrica
- `EntregaUploader`: validación de tipo/tamaño

### Integration tests

- Flujo completo: crear tarea → entregar → calificar → ver feedback
- Rúbrica niveles: criterio con 4 niveles, calificar cada uno, ver puntaje final
- Rúbrica puntaje libre: criterios con pesos, ver ponderación
- Penalización: entrega con 2 días de retraso, -10% por día → verificar puntaje

---

## Release

- **Versión:** v0.15.0
- **Feature flags:** `entregas`, `entregas_rubricas`
- **Migración:** 053_entregas_rubricas.sql
- **Dependencias:** Fase I (notificaciones) opcional pero recomendada

## Referencias

- Patrón: similar a foros (`foros.js`, `ForosPanel.vue`, `ForoRespuestaItem.vue`)
- Tiptap: ya usado en `LessonRichTextEditor.vue`, `PlayerTextoSurface.vue`
- Upload: patrón similar a subida de videos pero más simple
- Gamificación: `badgeEngine.js` con criterios tipo `participar_foros`
