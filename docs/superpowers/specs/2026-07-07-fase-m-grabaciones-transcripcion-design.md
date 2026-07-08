# Fase M: Grabaciones y Transcripción — Design Spec

## Contexto

Fase L (Calendario y Sesiones en Vivo) implementó el sistema de sesiones en vivo con Jitsi y Zoom, RSVP de alumnos, calendario unificado y recordatorios. Fase M extiende ese sistema con grabación automática, transcripción con IA y archivo buscable de sesiones pasadas.

## Objetivo

Implementar un sistema enterprise de grabación y archivo:

- Grabación automática de sesiones Zoom (cloud recording)
- Almacenamiento de grabaciones en Supabase Storage
- Transcripción automática con OpenAI Whisper API
- Búsqueda full-text sobre títulos, descripciones y transcripciones
- Biblioteca de sesiones pasadas accesible para alumnos

## Out of Scope

- Grabación de Jitsi (requiere Jibri, demasiado complejo para esta fase)
- Streaming en vivo de grabaciones (solo descarga/reproducción)
- Traducción automática de transcripciones

---

## Arquitectura

### Modelo de Datos (Migration 055)

#### Tablas

**`sesiones_grabaciones`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
sesion_id uuid REFERENCES sesiones_virtuales(id) ON DELETE CASCADE NOT NULL,
url_grabacion text NOT NULL, -- URL pública en Supabase Storage bucket 'grabaciones'
duracion_segundos int,
tamano_mb numeric(10,2),
estado text DEFAULT 'procesando' CHECK (estado IN ('procesando', 'lista', 'error')),
creado_en timestamptz DEFAULT now()
```

**`sesiones_transcripciones`**

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
sesion_id uuid REFERENCES sesiones_virtuales(id) ON DELETE CASCADE NOT NULL,
texto_completo text NOT NULL,
idioma text DEFAULT 'es',
segmentos jsonb, -- array de {inicio_segundos, fin_segundos, texto}
costo_usd numeric(10,4),
estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completada', 'error')),
creado_en timestamptz DEFAULT now(),
UNIQUE(sesion_id)
```

### Edge Functions

**`zoom-webhook`** — Recibe webhooks de Zoom

- Endpoint: POST `/zoom-webhook`
- Eventos soportados: `recording.completed`
- Cuando llega `recording.completed`:
  1. Verifica firma del webhook con `ZOOM_WEBHOOK_SECRET_TOKEN`
  2. Descarga el archivo de grabación desde la URL de descarga proporcionada por Zoom
  3. Sube el archivo a Supabase Storage bucket `grabaciones` con path: `grabaciones/{curso_id}/{sesion_id}/{filename}.mp4`
  4. Inserta fila en `sesiones_grabaciones`
  5. Inserta fila en `sesiones_transcripciones` con estado='pendiente'
  6. Llama a Edge Function `transcribir-sesion` asíncronamente

**`transcribir-sesion`** — Transcribe con Whisper

- Endpoint: POST `/transcribir-sesion` con body `{ sesion_id }`
- 1. Lee `url_grabacion` de `sesiones_grabaciones`
- 2. Descarga archivo de Storage
- 3. Si es video, extrae audio con ffmpeg (si disponible) o envía video directo a Whisper
- 4. Llama OpenAI Whisper API: `https://api.openai.com/v1/audio/transcriptions`
- 5. Guarda respuesta en `sesiones_transcripciones.texto_completo` y `segmentos`
- 6. Calcula costo: `$0.006 / minuto` (Whisper precio actual)
- 7. Actualiza estado a 'completada'
- 8. Si falla, estado='error', reintenta hasta 3 veces con backoff

### Storage

- Bucket: `grabaciones/` (nuevo)
- Path: `grabaciones/{curso_id}/{sesion_id}/{timestamp}.mp4`
- Política de acceso: lectura para usuarios autenticados del curso
- Retención: considerar política de purga después de 1 año (configurable)

### RLS

- `sesiones_grabaciones`: SELECT si usuario está inscrito en el curso de la sesión, INSERT/DELETE solo admin
- `sesiones_transcripciones`: SELECT si usuario está inscrito en el curso, INSERT/UPDATE solo Edge Function

### Índices

```sql
CREATE INDEX idx_grabaciones_sesion ON sesiones_grabaciones(sesion_id);
CREATE INDEX idx_transcripciones_sesion ON sesiones_transcripciones(sesion_id);
-- Full-text search
CREATE INDEX idx_transcripciones_fts ON sesiones_transcripciones USING gin(to_tsvector('spanish', texto_completo));
```

### Webhook Zoom

Configuración requerida en app Zoom:

- Event subscription: `recording.completed`
- Endpoint URL: `https://<tu-proyecto>.supabase.co/functions/v1/zoom-webhook`
- Verification token: `ZOOM_WEBHOOK_SECRET_TOKEN`

---

## Componentes UI

### Biblioteca de Sesiones

**`ArchivoSesiones.vue`** — biblioteca de sesiones pasadas con grabación

Props:

- `cursoId` (String)

Features:

- Grid/tabla de sesiones con grabación
- Filtros: por fecha, por palabra clave (búsqueda full-text)
- Cada tarjeta: miniatura placeholder, título, fecha, duración, botón reproducir
- Expandir para ver transcripción
- Buscador full-text con highlight

**`ReproductorGrabacion.vue`** — reproductor de video con transcripción sincronizada

Props:

- `grabacion` (Object) — { url_grabacion, duracion_segundos }
- `transcripcion` (Object) — { texto_completo, segmentos: [] }

Features:

- Reproductor HTML5 video con controles
- Panel lateral con transcripción
- Segmentos clickeables: click en un segmento salta el video a ese timestamp
- Highlight automático del segmento actual mientras el video avanza
- Scroll automático para seguir el segmento activo

**`BuscadorSesiones.vue`** — búsqueda full-text

- Input de búsqueda
- Resultados agrupados por sesión
- Snippets con palabras resaltadas
- Filtro por curso

### Admin

**`AdminGrabaciones.vue`** — panel admin

- Lista de sesiones con grabaciones
- Estado de transcripción (pendiente/procesando/completada/error)
- Costo acumulado de Whisper
- Botón "Reintentar transcripción" para errores
- Configuración de retención (días)

**`AdminTranscripcionConfig.vue`** — configuración de Whisper

- Input: OpenAI API Key
- Selector de modelo (whisper-1)
- Costo estimado por minuto
- Total costo acumulado

---

## Servicios

**`src/services/grabaciones.js`**

- `listarGrabaciones(cursoId)` → array con sesiones + grabaciones
- `obtenerGrabacion(sesionId)` → grabación + transcripción
- `buscarSesiones(cursoId, query)` → full-text search
- `obtenerSegmentoActual(sesionId, tiempoSegundos)` → segmento que corresponde al tiempo actual del video

**`src/services/transcripcion.js`**

- `solicitarTranscripcion(sesionId)` → llama Edge Function (solo admin)
- `obtenerTranscripcion(sesionId)`

---

## Composables

**`src/composables/useGrabaciones.js`**

- `grabaciones`: array
- `buscar(query)`: full-text search
- `cargarGrabaciones(cursoId)`

**`src/composables/useReproductor.js`**

- `tiempoActual`: ref (segundos)
- `segmentoActual`: computed
- `saltarATiempo(segundos)`
- `inicializar(videoElement)`

---

## Feature Flags

```typescript
sesiones_grabaciones: flag('VITE_FEATURE_SESIONES_GRABACIONES'),
transcripcion_whisper: flag('VITE_FEATURE_TRANSCRIPCION_WHISPER'),
```

---

## Integraciones

### Con Fase L (Sesiones)

- Cuando se elimina una sesión virtual, cascada elimina grabación y transcripción
- `ArchivoSesiones.vue` se monta como pestaña adicional en `CursoDetalle.vue`

### Con Notificaciones (Fase I)

- Trigger cuando transcripción se completa → notifica al instructor
- Trigger cuando grabación está lista → notifica a alumnos inscritos

### Costos

- **Whisper API**: $0.006 por minuto de audio (aproximadamente $0.36 por hora)
- **Storage**: depende del tamaño de video. Aproximadamente 500MB por hora de video 720p
- Para 100 sesiones de 1 hora: ~$36 en Whisper + ~50GB storage

---

## Testing

### Unit tests objetivo: 12+

- Servicio grabaciones: listar, buscar
- Composable useGrabaciones: búsqueda
- Composable useReproductor: segmento actual
- Componentes: ArchivoSesiones, ReproductorGrabacion, BuscadorSesiones

### Integration tests

- Flujo: crear sesión Zoom → simular webhook → verificar grabación en Storage
- Flujo: transcribir audio mock → verificar segmentos

---

## Release

- **Versión:** v0.17.0
- **Feature flags:** `sesiones_grabaciones`, `transcripcion_whisper`
- **Migración:** 055_grabaciones_transcripciones.sql
- **Dependencias:** Fase L (sesiones virtuales), OpenAI API Key

## Notas de Implementación

### Zoom Webhook Security

El webhook de Zoom debe verificarse con el `secret token` proporcionado en la app Zoom. El Edge Function debe:

1. Verificar header `X-ZM-Signature` contra HMAC-SHA256 del payload con el secret token
2. Responder a eventos `endpoint.url_validation` con la `plainToken` encriptada

### Whisper Limitaciones

- Whisper soporta archivos hasta 25MB
- Para archivos más grandes, se debe dividir en chunks
- Formatos soportados: mp3, mp4, mpeg, mpga, m4a, wav, webm

### Fallback sin Zoom

Si no hay configuración Zoom, el sistema funciona igual pero sin grabación automática. El instructor puede subir manualmente un archivo de video a la sesión (futuro).

---

## Referencias

- Fase L spec: `docs/superpowers/specs/2026-07-07-fase-l-calendario-sesiones-design.md`
- Zoom API Docs: https://developers.zoom.us/docs/api/
- Whisper API Docs: https://platform.openai.com/docs/guides/speech-to-text
