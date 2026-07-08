# Fase L: Calendario y Sesiones en Vivo — Design Spec

## Contexto

La plataforma Cursos AMX cuenta con cursos, lecciones, videos, quizzes, entregas/rúbricas (Fase K), foros, aulas virtuales (Jitsi), notificaciones (Fase I), analytics de video (Fase J) y gamificación. Falta un sistema de calendario unificado donde los instructores puedan programar sesiones en vivo y los alumnos puedan ver todos los eventos del curso (sesiones, deadlines, anuncios) en un solo lugar.

## Objetivo

Implementar un calendario de curso completo con:

- Creación de sesiones en vivo por instructores/admin
- Soporte para Jitsi (auto-generado) y Zoom (via API)
- RSVP de alumnos con confirmación/cancelación
- Calendario unificado: sesiones + deadlines de tareas + fechas de curso + anuncios
- Export iCal
- Recordatorios automáticos 1h antes
- Panel de asistencia para instructores

## Out of Scope (para Fase M)

- Grabación automática de sesiones
- Transcripción con Whisper
- Archivo buscable de sesiones pasadas

---

## Arquitectura

### Modelo de Datos (Migration 054)

#### Tablas

**`sesiones_virtuales`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
curso_id uuid REFERENCES cursos(id) ON DELETE CASCADE NOT NULL,
modulo_id uuid REFERENCES modulos(id) ON DELETE SET NULL,
titulo text NOT NULL,
descripcion text,
inicio timestamptz NOT NULL,
fin timestamptz,
plataforma text NOT NULL CHECK (plataforma IN ('jitsi', 'zoom')),
zoom_meeting_id text,
zoom_join_url text,
jitsi_room_id text,
creado_por uuid REFERENCES auth.users(id),
creado_en timestamptz DEFAULT now(),
actualizado_en timestamptz DEFAULT now()
```

**`sesiones_rsvp`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
sesion_id uuid REFERENCES sesiones_virtuales(id) ON DELETE CASCADE NOT NULL,
user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
estado text NOT NULL CHECK (estado IN ('confirmado', 'cancelado', 'asistio', 'no_asistio')),
confirmado_en timestamptz DEFAULT now(),
asistio_en timestamptz,
UNIQUE(sesion_id, user_id)
```

**`zoom_configuracion`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
client_id text NOT NULL,
client_secret text NOT NULL,
account_id text NOT NULL,
access_token text,
refresh_token text,
expires_at timestamptz,
creado_en timestamptz DEFAULT now()
```

### Vistas

**`v_calendario_curso`**

```sql
SELECT 'sesion' as tipo, id, titulo, inicio as fecha, fin, curso_id, null as extra
FROM sesiones_virtuales
UNION ALL
SELECT 'tarea_deadline' as tipo, id, titulo, fecha_limite as fecha, null, curso_id, null
FROM tareas WHERE fecha_limite IS NOT NULL
UNION ALL
SELECT 'curso_fecha' as tipo, id, titulo, fecha_inicio as fecha, fecha_fin, id as curso_id, null
FROM cursos WHERE fecha_inicio IS NOT NULL
UNION ALL
SELECT 'anuncio' as tipo, id, titulo, creado_en as fecha, null, curso_id, null
FROM anuncios
```

### Edge Functions

**`zoom-meeting`** — POST/DELETE

- POST: crea reunión Zoom via API con access_token de zoom_configuracion
- DELETE: elimina reunión Zoom por meeting_id

### RLS

- `sesiones_virtuales`: SELECT public (si curso publicado), INSERT/UPDATE/DELETE instructor/admin
- `sesiones_rsvp`: SELECT own o instructor, INSERT/UPDATE own
- `zoom_configuracion`: SELECT/UPDATE solo admin

### Índices

```sql
CREATE INDEX idx_sesiones_curso_inicio ON sesiones_virtuales(curso_id, inicio);
CREATE INDEX idx_sesiones_rsvp_sesion ON sesiones_rsvp(sesion_id);
CREATE INDEX idx_sesiones_rsvp_user ON sesiones_rsvp(user_id);
```

### Notificaciones (integración Fase I)

Triggers:

- `trg_nueva_sesion`: AFTER INSERT en sesiones_virtuales → notificación a alumnos inscritos
- Cron `recordatorio_sesion`: cada 15 min, busca sesiones con inicio <= 1h y no notificado → notifica confirmados

---

## Componentes UI

### Instructor/Admin

**`CrearSesionPanel.vue`**

- Formulario: título, descripción, datetime inicio, datetime fin
- Selector plataforma: Jitsi / Zoom
- Si Zoom: checkbox "Crear automáticamente" (llama Edge Function) o input manual de URL
- Botón guardar/cancelar

**`SesionesCalendario.vue`**

- Vista mensual/semanal/lista (toggle)
- Días con eventos resaltados
- Click en día → popup con eventos
- Colores por tipo: sesión=azul, deadline=rojo, anuncio=amarillo, curso=verde

**`SesionCard.vue`**

- Título, descripción, hora inicio-fin
- Badge plataforma (Jitsi/Zoom)
- Si instructor: editar/eliminar
- Si alumno: RSVP (Confirmar/Cancelar) + estado
- Si activa (ahora entre inicio-fin): "Unirse ahora"
- Botón "Agregar a calendario" (.ics)

**`AsistenciaPanel.vue`**

- Lista de confirmados vs no confirmados
- Marcar asistió/no asistió post-sesión
- Exportar CSV

**`AdminZoomConfig.vue`**

- Inputs: Client ID, Client Secret, Account ID
- Botón "Conectar con Zoom"
- Estado de conexión

### Alumno

**`CalendarioCurso.vue`** — pestaña en CursoDetalle

- Muestra todos los eventos del curso
- Leyenda de colores por tipo
- Click en evento → detalle

**`MiCalendario.vue`** — en PerfilPage

- Todas las sesiones de todos sus cursos
- Próximas sesiones destacadas

---

## Servicios

**`src/services/sesiones.js`**

- `crearSesion(datos)` → UUID
- `actualizarSesion(id, datos)`
- `eliminarSesion(id)`
- `listarSesionesPorCurso(cursoId)`
- `confirmarRSVP(sesionId, userId)`
- `cancelarRSVP(sesionId, userId)`
- `listarRSVP(sesionId)`
- `marcarAsistencia(sesionId, userId, asistio)`
- `exportarCalendario(cursoId)` → genera .ics

**`src/services/zoom.js`**

- `crearReunionZoom(titulo, inicio, fin)` → llama Edge Function
- `eliminarReunionZoom(meetingId)`
- `guardarConfiguracion(config)`
- `obtenerConfiguracion()`

---

## Composables

**`src/composables/useCalendario.js`**

- `eventos`: array de todos los eventos del curso
- `eventosPorMes`: computed
- `cargarCalendario(cursoId)`

**`src/composables/useSesiones.js`**

- `sesiones`: array
- `miRSVP`: computed
- `puedeUnirse`: computed (sesión activa)
- `confirmar()`, `cancelar()`
- `cargarSesiones(cursoId)`

---

## Feature Flags

```typescript
sesiones_virtuales: flag('VITE_FEATURE_SESIONES_VIRTUALES'),
zoom_integration: flag('VITE_FEATURE_ZOOM_INTEGRATION'),
```

---

## Integraciones

### Notificaciones (Fase I)

- Trigger `trg_nueva_sesion`: notifica a alumnos inscritos
- Cron: recordatorio 1h antes para confirmados

### Gamificación

- Nuevos badges: `asistir_sesion`, `primera_sesion`

---

## Testing

### Unit tests objetivo: 18+

- Servicio sesiones: CRUD + RSVP
- Servicio zoom: mock de API
- Composable useCalendario: filtrar por tipo
- Composable useSesiones: RSVP toggle
- Componentes: SesionesCalendario, SesionCard, CrearSesionPanel, AsistenciaPanel

### Integration tests

- Flujo: crear sesión Zoom → RSVP → recordatorio
- Crear sesión Jitsi → unirse

---

## Release

- **Versión:** v0.16.0
- **Feature flags:** `sesiones_virtuales`, `zoom_integration`
- **Migración:** 054_sesiones_virtuales.sql
- **Dependencias:** Fase I (notificaciones) opcional pero recomendada

## Referencias

- Patrón: similar a entregas (Fase K) para CRUD y a notificaciones (Fase I) para triggers
- Jitsi: ya existe `AulaVirtualModal.vue` con integración Jitsi
- Zoom: nueva integración via Edge Function
