# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) · Versionado: SemVer.

## [Unreleased]

### Añadido

- **CI endurecido**: jobs de type-check (`vue-tsc --noEmit`, bloqueante),
  tests Deno de Edge Functions, E2E con Playwright (no bloqueante: requiere
  backend vivo), `npm audit --audit-level=high` informativo, Dependabot
  semanal (npm, pip, actions) y análisis CodeQL para JS/TS.
- Cobertura Vitest (provider v8) con script `test:unit:cov` y umbral
  trinquete (~28% actual; objetivo ~60% tras Fase 3).

### Corregido

- 6 errores de tipos preexistentes (`usePlayerPage.ts`, `stores/auth.ts`)
  para dejar `vue-tsc` en verde; versión de `package.json` sincronizada
  con el release v0.16.0.
- `npm audit fix`: 0 vulnerabilidades (antes 2 high en vite/ws).

### Seguridad

- **Edge Functions con service_role ahora exigen autenticación** (el runtime
  self-hosted no soporta `verify_jwt` por función, así que se valida el JWT
  dentro de cada una vía `_shared/auth.ts`):
  - `bulk-invite`: solo admins pueden crear usuarios (antes: sin auth).
  - `analytics`: requiere rol admin o instructor; los instructores solo acceden
    a sus acciones y su `instructor_id` se deriva del token, no del body.
  - `push-notify`: el destinatario se deriva del usuario autenticado; solo un
    admin puede enviar push a otro usuario.
  - `video-analytics`: rechaza eventos cuyo `user_id` no coincide con el
    usuario autenticado (salvo admin).
- Handlers extraídos a `handler.ts` con cliente inyectable; 53 tests Deno en
  verde (casos 401/403 y suplantación).

## [0.16.0] — 2026-07-08

### Añadido

- **Calendario, Sesiones en Vivo, Grabaciones y Transcripción (Fase L + M)**:
  - Tablas: `sesiones_rsvp`, `zoom_configuracion`, `sesiones_grabaciones`, `sesiones_transcripciones`
  - ALTER `sesiones_virtuales`: nuevos campos `modulo_id`, `descripcion`, `fin`, `plataforma`, `zoom_meeting_id`, `zoom_join_url`
  - Vistas: `v_calendario_curso` (unifica sesiones, tareas, cursos, anuncios)
  - Edge Functions: `zoom-meeting` (crear/eliminar reuniones), `zoom-webhook` (recording.completed), `transcribir-sesion` (Whisper API)
  - Función RPC: `buscar_transcripciones(text)` con full-text search en español
  - Servicios: `zoom.js`, `grabaciones.js`, `transcripcion.js`
  - Composables: `useCalendario.js`, `useSesiones.js`, `useGrabaciones.js`, `useReproductor.js`
  - Componentes: `CrearSesionPanel`, `SesionesCalendario`, `SesionCard`, `AsistenciaPanel`, `CalendarioCurso`, `MiCalendario`, `AdminZoomConfig`, `ArchivoSesiones`, `ReproductorGrabacion`, `BuscadorSesiones`, `AdminGrabaciones`
  - Feature flags: `sesiones_virtuales`, `zoom_integration`, `sesiones_grabaciones`, `transcripcion_whisper`
  - Badges: `asistir_sesion`, `primera_sesion`
  - Integración en `CursoDetalle.vue`, `InstructorPage.vue`, `PerfilPage.vue`, `AdminPage.vue`

## [0.15.0] — 2026-07-07

### Añadido

- **Entregas y Rúbricas (Fase K)**:
  - Tablas: `tareas`, `entregas`, `entrega_versiones`, `rubricas`, `rubrica_criterios`, `rubrica_niveles`, `calificaciones`
  - Vistas: `v_entregas_pendientes_instructor`
  - Servicios: `entregas.js`, `rubricas.js`
  - Composables: `useEntregas.js`, `useEntregasInstructor.js`
  - Componentes: `CrearTareaPanel`, `RubricaEditor`, `CalificarEntregaModal`, `EntregasInstructorTable`, `EntregaAlumnoPanel`, `RubricaAlumnoView`, `AdminEntregas`, `EntregaUploader`
  - Feature flags: `entregas`, `entregas_rubricas`
  - Integración con notificaciones (Fase I) y gamificación
  - Badges: `primera_entrega`, `entrega_a_tiempo`, `calificacion_perfecta`

## [0.14.0] — 2026-07-07

### Añadido

- **Analytics de Video (Fase J)**:
  - Tablas `video_eventos`, `video_intervalos`, `video_analytics_config`
  - Vistas SQL `v_video_leccion_stats` y `v_curso_video_stats`
  - Función `agregar_video_intervalos()` con cron diario a las 02:00
  - Edge Function `video-analytics` para batch insert de eventos (validación, límite 100)
  - Composable `useVideoAnalytics.js` con tracking automático: play, pause, seek, tick, complete, ratechange; batching 30s; flush via `sendBeacon` en `beforeunload`
  - Servicio `videoAnalytics.js` con 4 funciones de consulta
  - Componentes: `VideoHeatmap`, `LessonVideoStats`, `InstructorVideoDashboard`, `AdminVideoAnalytics`
  - Feature flags: `video_analytics`, `video_analytics_heatmap`

## [0.13.0] — 2026-07-07

### Añadido

- **Notificaciones y Alertas (Fase I)**:
  - Tablas `notificaciones`, `notificacion_plantillas`, `email_configuracion`, `notificacion_preferencias`, `anuncios`
  - 7 triggers para eventos: inscripción, lección completada, anuncio, recordatorio, mención, curso publicado, certificación
  - 3 funciones cron: `enviar_notificaciones_email`, `enviar_recordatorios_inactividad`, `procesar_notificaciones_programadas`
  - Edge Function `notifications-worker` (procesa cola cada minuto)
  - Servicio `notificaciones.js` con 9 funciones CRUD
  - Composable `useNotificaciones.js` con suscripción realtime y badge count
  - Componentes: `NotificationBell`, `NotificationPanel`, `NotificationPreferences`, `AdminNotificaciones`
  - Feature flags: `notificaciones`, `notificaciones_email`

## [0.2.0] — 2026-07-03

### Añadido

- **Prerender SEO**: script `npm run prerender` genera HTML estático de rutas públicas con Playwright.
- **Video worker escalable**: arquitectura basada en `FOR UPDATE SKIP LOCKED` para múltiples réplicas sin conflictos, endpoint `/metrics` en formato Prometheus.
- **Feature flags en runtime**: tabla `feature_toggles` en Supabase + composable `useFeatureFlags` para activar módulos sin rebuild.
- **Dark mode**: selector Claro/Oscuro/Sistema con persistencia en `localStorage`.
- **i18n base**: `vue-i18n` con locales `es` y `en`.
- **CI/CD**: GitHub Actions workflow (`lint`, `test-unit`, `build`).
- **Documentación API**: especificación OpenAPI completa en `docs/API.md`.
- **SSO/SAML**: guía de integración con IdP institucional en `docs/SSO_SAML.md`.
- **Sistema de errores unificado**: clases `AppError`, `NetworkError`, `PermissionError`, `ValidationError` + composable `useErrorHandler`.

### Cambiado

- **Refactor masivo**: `AdminPage.vue` y `PlayerPage.vue` reducidos ~50 % extrayendo 6 componentes independientes.
- **Migración progresiva a TypeScript**: `src/lib/errors.ts`, `useErrorHandler.ts`, `cache.ts`, `auth.ts`, `ui.ts`, `featureFlags.ts`.
- **README estilizado**: presentación enfocada al usuario con tabla comparativa vs Moodle, Canvas, Open edX, Chamilo, ILIAS, Frappe LMS y CourseLit.

### Seguridad

- RLS en tabla `feature_toggles`.
- Worker ID en tabla `videos` para trazabilidad de transcodificación.

## [0.1.0] — 2026-07-02

### Añadido

- Primera versión pública, derivada de un LMS institucional.
- Capa de tema (`theme/theme.config.js`): marca, colores, logos, textos,
  secciones de landing y datos de constancia configurables.
- Stack completo: frontend Vue 3, Supabase self-hosted, video-worker HLS,
  migraciones SQL, Edge Functions y CI de GitHub Actions.
