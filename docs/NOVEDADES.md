# Novedades por versión

Historial de novedades movido desde README.md para mantenerlo enfocado. Orden: más reciente primero.

> Para v0.19.0 y posteriores (y la versión en desarrollo), ver `CHANGELOG.md`.

---

## Novedades v0.18.0 — Pendientes de la revisión técnica

- **Fix foros/chat/sesiones en detalle de curso** — Los paneles recibían `session` indefinida y quedaban inertes con usuario logueado; ahora se deriva del store de auth (con test de regresión).
- **Migración TS (2ª tanda)** — `lib/sbRest` con genéricos (`sbSelect<T>`, `sbInsert<T>`, `sbPatch<T>`, `sbRpc<T>`), `services/entregas` y `services/sesionesVirtuales` con interfaces de dominio.
- **Handler de crear tarea a método nombrado** — elimina la rotura recurrente del template por prettier (`semi: false`).
- **Tests:** 426 totales.
- **Release:** v0.18.0

## Novedades v0.17.0 — Revisión técnica: seguridad, CI y mantenibilidad

- **Seguridad en Edge Functions** — `bulk-invite`, `analytics`, `push-notify` y `video-analytics` ahora exigen JWT y validan roles (`es_admin`/`es_instructor`) contra la BD vía `_shared/auth.ts`. Los instructores solo acceden a sus acciones y su `instructor_id` se deriva del token. Handlers extraídos a `handler.ts` con cliente inyectable + 53 tests Deno (401/403, suplantación).
- **CI endurecido** — Jobs nuevos: type-check (`vue-tsc --noEmit`, bloqueante), tests Deno de Edge Functions, E2E con Playwright (no bloqueante), `npm audit` informativo. Dependabot semanal (npm, pip, actions) y análisis CodeQL para JS/TS.
- **Cobertura Vitest** — Provider v8 con umbral trinquete (~35% líneas, objetivo 60%). Script `test:unit:cov`.
- **Refactor `AdminCourseEditor`** — De 1507 a 487 líneas: `useCourseEditorModel`, `useCursoPersistence`, `PortadaUploadField`, `ModuleEditorCard`. Sin cambio de comportamiento, respaldado por 17 tests nuevos de `AdminCourseEditor` y `CursoDetalle`.
- **Migración a TypeScript iniciada** — `services/tiempo`, `services/analytics` y `services/instructores` migrados; plan completo en `docs/migracion-typescript.md`.
- **Dependencias** — `npm audit fix`: 0 vulnerabilidades (antes 2 high en vite/ws). Versión de `package.json` sincronizada con los releases.
- **Tests:** 17 nuevos tests unitarios (425 totales) + 53 tests Deno.
- **Release:** v0.17.0

## Novedades v0.16.0 — Fase L + M: Calendario, Sesiones en Vivo, Grabaciones y Transcripción

- **Calendario unificado** — Vista mensual con eventos de sesiones, tareas, cursos y anuncios. Navegación por mes, eventos resaltados por día, lista de eventos del mes.
- **Sesiones virtuales mejoradas** — Soporte dual Jitsi (gratuito) y Zoom (OAuth Server-to-Server). Campos nuevos: descripción, fin, plataforma, zoom_meeting_id, zoom_join_url, modulo_id.
- **RSVP y asistencia** — Alumnos confirman/cancelan asistencia. Instructores marcan asistió/no_asistió desde panel. Trigger de notificación a inscritos al crear sesión.
- **Edge Function `zoom-meeting`** — Crea/elimina reuniones Zoom vía API. Autenticación OAuth con refresh automático.
- **Grabaciones automáticas Zoom** — Webhook `recording.completed` descarga video, sube a Supabase Storage e inserta metadatos.
- **Transcripción Whisper** — Edge Function `transcribir-sesion` usa `faster-whisper` local por defecto (CPU, modelo `medium`), con fallback automático a OpenAI Whisper API si el servicio local no responde. Servicio Docker independiente en `services/whisper-service/`. Soporte GPU opcional vía `docker-compose.gpu.yml`.
- **Búsqueda full-text** — Índice GIN en español sobre transcripciones. Función RPC `buscar_transcripciones()` con snippets resaltados.
- **Reproductor sincronizado** — Video player con panel de transcripción que sigue el tiempo actual, salto a segmento al hacer click.
- **Badges de gamificación** — 2 nuevos criterios: `asistir_sesion`, `primera_sesion`.
- **Tablas SQL:** `sesiones_rsvp`, `zoom_configuracion`, `sesiones_grabaciones`, `sesiones_transcripciones`.
- **Vista SQL:** `v_calendario_curso` (unifica sesiones, tareas, cursos, anuncios).
- **Servicios:** `zoom.js` (4 funciones), `grabaciones.js` (6 funciones), `transcripcion.js` (3 funciones).
- **Composables:** `useCalendario.js`, `useSesiones.js`, `useGrabaciones.js`, `useReproductor.js`.
- **Componentes:** `CrearSesionPanel`, `SesionesCalendario`, `SesionCard`, `AsistenciaPanel`, `CalendarioCurso`, `MiCalendario`, `AdminZoomConfig`, `ArchivoSesiones`, `ReproductorGrabacion`, `BuscadorSesiones`, `AdminGrabaciones`.
- **Feature flags:** `sesiones_virtuales`, `zoom_integration`, `sesiones_grabaciones`, `transcripcion_whisper`.
- **Tests:** 48 nuevos tests (388 totales).
- **Release:** v0.16.0

## Novedades v0.15.0 — Fase K: Entregas y Rúbricas

- **Sistema de tareas/entregas completo** — Instructores crean tareas con instrucciones, fechas límite y configuración de archivos. Alumnos entregan archivo + texto enriquecido con historial de versiones.
- **Rúbricas de dos tipos** — Niveles cualitativos (Excelente/Bueno/Regular/Deficiente) o puntaje libre por criterio con ponderación. Editor visual inline para el instructor.
- **Calificación estructurada** — El instructor califica cada criterio de la rúbrica con retroalimentación por criterio y comentario general. Cálculo automático de puntaje final con penalización por retraso configurable.
- **Notificaciones automáticas** — Trigger en PostgreSQL notifica al instructor cuando hay nueva entrega y al alumno cuando se publica calificación.
- **Badges de gamificación** — 3 nuevos criterios: `primera_entrega`, `entrega_a_tiempo`, `calificacion_perfecta`.
- **Tablas SQL:** `tareas`, `entregas`, `entrega_versiones`, `rubricas`, `rubrica_criterios`, `rubrica_niveles`, `calificaciones`.
- **Vista SQL:** `v_entregas_pendientes_instructor`.
- **Servicios:** `entregas.js` (12 funciones), `rubricas.js` (3 funciones).
- **Composables:** `useEntregas.js`, `useEntregasInstructor.js`.
- **Componentes:** `CrearTareaPanel`, `RubricaEditor`, `CalificarEntregaModal`, `EntregasInstructorTable`, `EntregaAlumnoPanel`, `RubricaAlumnoView`, `AdminEntregas`, `EntregaUploader`.
- **Feature flags:** `entregas`, `entregas_rubricas`.
- **Tests:** 45 nuevos tests (340 totales).
- **Release:** v0.15.0

## Novedades v0.14.0 — Fase J: Analytics de Video

- **Tracking de eventos de video** — play, pause, seek, tick, complete, ratechange. Eventos se envían en batch cada 30s vía Edge Function.
- **Almacenamiento y agregación** — Eventos raw en `video_eventos`, agregación nocturna a buckets de 10s en `video_intervalos` via cron a las 02:00.
- **Vistas SQL:** `v_video_leccion_stats`, `v_curso_video_stats`.
- **Edge Function `video-analytics`** — Batch insert con validación (máximo 100 eventos por batch).
- **Composable `useVideoAnalytics.js`** — Tracking automático con event listeners, tick cada 10s, flush vía `sendBeacon` en `beforeunload`.
- **Componentes:** `VideoHeatmap` (visualización de intensidad por bucket), `LessonVideoStats` (6 métricas por lección), `InstructorVideoDashboard` (dashboard por curso), `AdminVideoAnalytics` (stats del sistema).
- **Feature flags:** `video_analytics`, `video_analytics_heatmap`.
- **Tests:** 20 nuevos tests (295 totales).
- **Release:** v0.14.0

## Novedades v0.13.0 — Fase I: Notificaciones y Alertas Automáticas

- **Sistema de notificaciones completo** — In-app, push y email para 11 eventos del LMS: curso asignado, evaluación calificada, insignia desbloqueada, respuesta en foro, certificación lista, deadline próximo, anuncio del instructor, reporte listo, alerta de riesgo académico, SLA de respuesta.
- **Triggers PostgreSQL** — 7 eventos automáticos vía triggers (`curso_asignado`, `evaluacion_calificada`, `badge_desbloqueado`, `foro_respuesta`, `anuncio_instructor`, `certificacion_lista`, `reporte_listo`).
- **Alertas programadas** — 3 funciones cron diarias: deadline próximo (08:00), alerta de riesgo académico (09:00), SLA de respuesta (09:00).
- **Edge Function `notifications-worker`** — Procesa cola de notificaciones cada minuto, envía push/email según preferencias del usuario.
- **Panel de notificaciones** — Historial con filtros (Todas/No leídas), agrupación por fecha (Hoy/Ayer/Anteriores), marcar leídas.
- **Campana de notificaciones** — Badge con count unread, dropdown preview de últimas 5 notificaciones.
- **Preferencias por usuario** — Silenciar tipos de notificación, elegir canal default (Todos/Push/Email/Solo app).
- **Panel admin** — Configurar plantillas de notificación, canales globales, proveedor de email (Resend/SMTP/SendGrid) con API key.
- **Tabla `anuncios`** — Instructores pueden enviar broadcast a toda la cohorte.
- **Tablas SQL:** `notificaciones`, `notificacion_plantillas`, `email_configuracion`, `notificacion_preferencias`, `anuncios`.
- **Feature flags:** `notificaciones`, `notificaciones_email`.
- **Componentes:** `NotificationBell`, `NotificationPanel`, `NotificationPreferences`, `AdminNotificaciones`.
- **Composable:** `useNotificaciones` con suscripción realtime.
- **Servicio:** `notificaciones.js` con 9 funciones CRUD.
- **Tests:** 24 nuevos tests (275 totales).
- **Release:** v0.13.0

## Novedades v0.12.0 — Fase H3: Financieros + Reportes Personalizables

- **Dashboard de costos** — Métricas de almacenamiento (videos y documentos), tokens de IA consumidos y costo estimado en USD. Cálculos basados en tamaños reales de archivos y precios de OpenAI/Claude.
- **Gráfico de inscripciones por tiempo** — Línea temporal de inscripciones diarias/semanales/mensuales con Chart.js. Filtros por curso y rango de fechas.
- **Ranking de cursos populares** — Tabla sortable con métricas de inscripciones, tasa de finalización, calificación promedio y tiempo de visualización.
- **Reportes favoritos** — Guarda configuraciones de reportes con nombre personalizado. Acceso rápido desde el panel de reportes.
- **Reportes programados** — Ejecución automática diaria, semanal o mensual. Notificación por email con resultados. Historial de ejecuciones con estado (pendiente, completado, fallido).
- **Tablas SQL:** `reportes_favoritos`, `reportes_programados`, `reportes_historial` con políticas RLS.
- **Vistas SQL:** `v_costos_infraestructura`, `v_inscripciones_tiempo`, `v_cursos_populares`.
- **Edge Function** analytics con endpoints `costos`, `inscripciones_tiempo`, `cursos_populares`.
- **Componentes:** `CostosDashboard`, `InscripcionesTimeline`, `ReporteFavoritosManager`, `ReporteProgramadoForm`, `ReporteProgramadoList`.
- **Feature flag:** `reportes_avanzados`.

## Novedades v0.11.0 — Fase H2: Reportes por Instructor + Análisis de Contenido

- **Dashboard de instructor** — Métricas resumidas de cursos asignados: total de alumnos, tasa de finalización, calificación promedio, tiempo total de visualización.
- **Tabla de alumnos por curso** — Progreso porcentual, calificación promedio, tiempo dedicado y última actividad. Filtros por curso y búsqueda por nombre/email.
- **Análisis por lección** — Completitud (% de alumnos que terminaron), tiempo promedio visto, engagement score (interacciones/minuto).
- **Vistas SQL:** `v_instructor_cursos`, `v_instructor_alumnos`, `v_leccion_analytics`.
- **Edge Function** analytics con endpoints `instructor_dashboard`, `instructor_alumnos`, `leccion_analytics`.
- **Composable:** `useReportes` extendido con estados para instructor y lección.
- **Componentes:** `InstructorReportPanel`, `InstructorAlumnosTable`, `LessonAnalyticsTable`.
- **Integración** en `InstructorPage.vue` (panel condicional para instructores).
- **Feature flag:** `reportes_avanzados`.

## Novedades v0.10.0 — Fase H1: Reportes Administrativos Avanzados (Core)

- **Funnel de conversión** — 5 etapas (visitas → inscripciones → primer progreso → evaluación → certificación) con tasas de conversión entre cada etapa.
- **Retención de cohortes** — Tabla tipo heatmap con tasas de retención en día 7, 14, 30, 60 y 90. Cálculo por cohorte de inscripción mensual.
- **Comparativa entre cursos** — Ranking sortable con métricas clave: inscripciones, tasa de finalización, calificación promedio, NPS (Net Promoter Score).
- **Vistas SQL:** `v_funnel_curso`, `v_retencion_cohorte`, `v_comparativa_cursos`.
- **Edge Function** analytics con endpoints `funnel`, `retencion`, `comparativa`.
- **Composable:** `useReportes` con carga paralela de múltiples reportes.
- **Componentes:** `FunnelChart`, `RetentionMatrix`, `CourseComparisonTable`.
- **Integración** en `AdminReportes.vue` con pestañas de navegación.
- **Feature flag:** `reportes_avanzados`.

## Novedades v0.9.0 — Fase G: PWA y Offline

- **Service Worker con VitePWA** — `injectManifest` con `src/sw.js` personalizado. Precache de 21 assets (3083 KiB).
- **Modo offline completo** — Los alumnos pueden navegar, ver progreso y continuar cursos sin conexión.
- **Cola de sincronización** — `SyncQueue` con FIFO, reintentos con backoff exponencial y deduplicación. Sincroniza acciones offline (progreso, foros, evaluaciones) al recuperar conexión.
- **Cache de videos HLS** — Almacenamiento en IndexedDB con política LRU y límite de 2 GB. Descarga selectiva de lecciones para offline.
- **Detector de estado de red** — Composable `useNetworkStatus` con eventos `online`/`offline` y heartbeat periódico.
- **Notificaciones push** — Suscripción vía `push_subscriptions`, Edge Function `push-notify` para envío masivo. Soporte para títulos, cuerpo, icono y URL de acción.
- **Composables:** `useOffline`, `useSyncStatus`, `useVideoCache`.
- **Componentes:** `OfflineBanner`, `DownloadButton`, `OfflineStatusPanel`.
- **Base de datos offline** — `offline-db.ts` con 5 stores (cursos, lecciones, progreso, evaluaciones, foros) usando `idb`.

## Novedades v0.8.0 — Fase 4 Inteligencia Artificial

- **Generador de quizzes con IA** — Desde el editor de evaluaciones, los instructores pueden generar preguntas de opción múltiple automáticamente indicando tema, nivel (básico/intermedio/avanzado) y cantidad. Las preguntas se insertan directamente en el editor y son editables antes de publicar.
- **Resumen de lecciones con IA** — Botón "✨ Resumir esta lección" en el reproductor. Extrae el texto del contenido de la lección (Tiptap) y genera 5 bullet points claros. Usa caché en `ai_summaries` para no repetir llamadas.
- **Asistente de estudio (chatbot)** — Chat flotante en el reproductor con contexto de la lección actual. El alumno puede hacer preguntas y la IA responde basándose ÚNICAMENTE en el contenido de la lección, evitando alucinaciones.
- **Configuración de IA en admin** — Panel para elegir proveedor (OpenAI / Claude), modelo, API key y límite de tokens diarios. Todo se oculta del frontend vía Edge Function `ai-proxy`.
- **Tracking de costos** — Tabla `ai_usage_logs` registra tokens consumidos y costo estimado por cada llamada, separado por feature (quiz, summary, chat).
- **Feature flags** — `ai_quiz_generator`, `ai_summaries`, `ai_study_assistant` activables/desactivables en runtime.

## Novedades v0.7.0 — Fase 3 Analytics de Aprendizaje

- **Eventos xAPI (Experience API)** — Emisión automática de statements al LRS (`lrs_statements`) cuando el alumno completa lecciones, aprueba evaluaciones y participa en foros.
- **Dashboard de analytics** — Panel admin con métricas de engagement, progreso y riesgo académico. Filtros por curso, rango de fechas y vista de tabla con alumnos en riesgo.
- **Tabla de alumnos en riesgo** — Identifica alumnos con bajo progreso, baja calificación o inactividad. Score ponderado de 0-100 con umbral configurable.
- **Mapa de calor de actividad** — Visualización tipo GitHub-contributions de la actividad diaria de un alumno en un curso.
- **Descarga de reportes CSV** — Exporta datos de engagement, riesgo y progreso en CSV desde el panel de analytics.

## Novedades v0.6.0 — Fase 2 Gamificación y Engagement

- **Sistema de puntos automáticos** — Gana puntos al completar lecciones (10 pts), aprobar evaluaciones (50 pts) y participar en foros (5 pts). Triggers PostgreSQL garantizan que no se pueda farmear puntos duplicados.
- **Niveles de usuario** — 6 niveles desde Novato hasta Leyenda, con barra de progreso visual en el perfil. Cada nivel requiere más puntos acumulados.
- **Insignias (badges) desbloqueables** — 5 badges predefinidos (Bienvenida, Primer paso, Social, Aprobado, Constante) con criterios configurables. El admin puede crear nuevos badges con criterios personalizados desde el panel.
- **Tabla de clasificación** — Leaderboard por curso que muestra el ranking de alumnos por puntos totales.
- **Árbol de desbloqueo** — Visualización de progreso por módulo con prerequisitos condicionales (completar módulo previo, aprobar evaluación, obtener badge).
- **Notificaciones toast** — Al desbloquear una insignia, aparece una notificación animada en la esquina inferior derecha con los puntos ganados.

## Novedades v0.5.0 — Fase 1 Núcleo Educativo

- **Evaluaciones avanzadas** — 3 nuevos tipos de pregunta: emparejamiento, rellenar huecos y ensayo, además de los clásicos (opción única, múltiple, verdadero/falso).
- **Sistema de rúbricas** — Crea rúbricas con criterios y niveles de desempeño desde el panel admin. Asignables a evaluaciones completas o a preguntas de ensayo individuales.
- **Cohortes (grupos)** — Organiza alumnos en cohortes por curso, con cupo máximo, fechas de inicio/fin y foro privado exclusivo para cada grupo.
- **Importación masiva de usuarios** — Sube un CSV con nombre, email, apellidos, teléfono y cargo. Validación en tiempo real y creación masiva vía Edge Function `bulk-invite`.
- **Feature flags runtime** — Todos los nuevos módulos se activan/desactivan desde la tabla `feature_toggles` en Supabase, sin redeploy.
