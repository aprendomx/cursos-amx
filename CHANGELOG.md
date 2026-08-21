# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) · Versionado: SemVer.

## [No publicado]

### Agregado

- **Aviso de privacidad, términos de uso y contacto, con CRUD** — los tres
  documentos se redactan y publican desde Administración → Documentos y se
  sirven en `/aviso-privacidad`, `/terminos-uso` y `/contacto`. Los enlaces del
  pie de la portada y el de la casilla del formulario de alta dejan de apuntar
  a `#`. Migración `073_paginas_institucionales.sql`.

  Hasta ahora, esos enlaces venían con `href: '#'` y el alta recababa
  `perfiles.aviso_privacidad = true` **contra un documento que no existía**. No
  era un enlace roto: era un consentimiento vacío.

  Publicar **crea una versión** y conserva las anteriores; una versión publicada
  no se puede modificar ni borrar. El consentimiento registra **contra qué
  versión** se otorgó, así que se puede demostrar qué texto leyó cada persona.
  Al publicar se puede marcar que la versión exige volver a aceptar; solo
  entonces se le pide a quien ya estaba registrado, sin bloquearle el acceso.

  Toda instalación llega con los tres documentos sembrados **como borrador** a
  partir de la plantilla de `docs/AVISO_PRIVACIDAD.md`: publicar una plantilla
  con marcadores daría apariencia de cumplimiento.

  **Cambio de comportamiento:** mientras no haya un aviso publicado, el registro
  de nuevas cuentas queda bloqueado. Es preferible a seguir acumulando
  consentimientos contra la nada. El alta del primer administrador
  (`scripts/crear-admin.sh`) no se ve afectada, porque no declara aceptación.

- **La verificación del despliegue deja de fallar en abierto** — al terminar,
  `scripts/deploy.sh` reportaba como superada cualquier comprobación que no
  hubiera podido ejecutar. Se corrigen tres casos encontrados desplegando en
  vivo: la comprobación de escalada de privilegios **nunca había corrido**
  (su uuid llevaba cinco dígitos hexadecimales en el tercer grupo y Postgres
  rechazaba el literal, con el fallo degradado a un aviso que nadie contaba);
  las funciones que «exigen autenticación» pasaban en verde respondiendo `404`,
  `500` o sin conexión, porque solo `200` se trataba como fallo; y la
  comprobación de RLS afirmaba «todas las tablas lo tienen habilitado» cuando
  la consulta fallaba. La regla —lo que no se pudo comprobar cuenta como
  problema— vive ahora en un solo sitio. La comprobación de escalada verifica
  además que su sesión simulada resuelve `auth.uid()`, para no poder pasar por
  no haber afectado a ninguna fila.

  `PUBLIC_URL` deja de ser obligatoria: se toma `API_EXTERNAL_URL` de
  `docker/.env`. Es la URL de la **API**; el ejemplo anterior apuntaba al
  frontend, contra el cual las cinco comprobaciones de funciones daban `404` y
  se reportaban como superadas. Antes de ese grupo se sondea que la URL enrute
  a la API y, si no, se omite el grupo en lugar de emitir resultados
  engañosos.

  **Cambio de comportamiento:** despliegues que antes terminaban en verde sobre
  una instalación degradada ahora salen con error.

- **Primer administrador al instalar** — `scripts/crear-admin.sh` crea o
  promueve al primer administrador de una instalación, y `scripts/deploy.sh` lo
  invoca en un paso nuevo `[6/6]` cuando detecta que no hay ninguno. Hasta
  ahora, una instalación nueva quedaba sin nadie capaz de entrar al panel: el
  rol vive en `perfiles.es_admin` y el trigger `perfiles_guard_roles` impide
  —correctamente— que un usuario se promueva a sí mismo, así que la única
  salida era escribir el `UPDATE` a mano dentro del contenedor. La cuenta se da
  de alta por la API admin de GoTrue, la contraseña generada se muestra una
  sola vez y no se guarda en ningún archivo ni viaja por la línea de comandos.
  Volver a ejecutarlo es seguro: no duplica cuentas ni regenera contraseñas.
  Sin migraciones y sin cambios en el modelo de permisos.

  **Cambio de comportamiento en `deploy.sh`:** un despliegue sin terminal
  interactiva (CI, `cron`) sobre una instalación sin administradores ahora
  advierte y termina con error en vez de reportar éxito. Se omite con
  `--no-admin`.

- **Avance por módulo** — el reproductor muestra qué tanto llevas del módulo en
  curso, no solo del curso completo, y el panel de instructor resume el grupo
  módulo por módulo (cuántas personas iniciaron, cuántas terminaron y el
  promedio). Migración `072_progreso_por_modulo.sql`: crea la vista
  `v_progreso_modulo` y las funciones `curso_completado_por_usuario` y
  `modulo_completado_por_usuario`, que el motor de insignias ya invocaba sin
  que existieran —por eso las insignias de módulo y de curso nunca se
  desbloqueaban.
- **Constancias configurables por curso** — cada curso puede tener su propio
  diseño visual, uno o varios funcionarios firmantes y textos personalizados
  con marcadores (`{{nombre}}`, `{{curso}}`, `{{folio}}`…). Se agregan el
  catálogo de funcionarios con su firma escaneada y el catálogo de diseños,
  ambos administrables desde la interfaz. Migración
  `070_constancias_disenos_firmantes.sql`. La configuración se **congela** al
  emitir: una constancia ya expedida conserva el diseño, las firmas y los
  textos con los que se emitió, aunque después se cambien.

- **Curso tutorial preinstalado** — «Cómo usar Cursos AMX»
  (`/curso/tutorial-plataforma`), sembrado por
  `supabase/migrations/056_curso_tutorial.sql` y publicado por defecto en toda
  instalación. 8 módulos y 26 lecciones (~2h 25min) que documentan la
  plataforma desde las tres perspectivas: alumno (módulos 1–4), instructor
  (5) y administrador (6–7), más un cierre con ejercicios (8).
  Todas las lecciones son de tipo `lectura` con contenido Tiptap: no dependen
  de video, Storage ni de ningún feature flag, de modo que el curso se puede
  completar —y emitir su constancia— en una instalación recién levantada.
  La migración es idempotente (UUIDs fijos + `on conflict do update`), así que
  reaplicarla refresca el contenido sin duplicar filas ni perder progreso.
- **Semillas opcionales en `supabase/seeds/`** (fuera de `scripts/migrate.sh`,
  se aplican a mano con `psql`): `tutorial_examen.sql` agrega la evaluación
  final del tutorial —10 preguntas de tipos básicos— para instalaciones con
  `VITE_FEATURE_EVALUACIONES=true`, y `tutorial_uninstall.sql` lo elimina.
  El examen se dejó fuera de la migración a propósito: con las evaluaciones
  apagadas (el default) el panel de preguntas no se monta y una lección
  `examen` sería imposible de completar, bloqueando la constancia del curso.
- **`src/test/cursoTutorial.test.js`** — valida que el JSON de Tiptap de las 26
  lecciones sea parseable y renderice con la whitelist `EXTENSIONES_TEXTO` del
  reproductor, que la duración declarada del curso cuadre con la suma de sus
  lecciones y que la migración no siembre lecciones tipo `examen`.

### Cambiado

- `src/data.js` — el curso tutorial también aparece en el modo demo sin
  Supabase.

## [0.20.0] — 2026-07-16

### Cambiado

- Migración TS (4ª tanda, ranking completo 11/11):
  `composables/useCourseEditorModel.ts` (modelo del editor con
  `CursoEditor`/`ModuloEditor`/`LeccionEditor`, unión `FuenteLeccion`,
  `BuilderResumen`; las preguntas reutilizan `PreguntaAdmin`) y
  `composables/useNotificaciones.ts` (`Notificacion` contra el esquema,
  `PreferenciasNotificacion`, canal Realtime tipado), con 10
  importadores y mocks actualizados a imports sin extensión. Siguiente
  etapa: generar tipos de BD con `supabase gen types typescript`.

## [0.19.0] — 2026-07-16

### Cambiado

- Migración TS (3ª tanda): `services/aiService.ts` (`ConfigIA`,
  `MensajeChat`, shapes de la Edge Function `ai-proxy`),
  `services/evaluaciones.ts` (unión `TipoPregunta` de 6 tipos,
  `PreguntaAdmin`/`OpcionAdmin`), `services/videos.ts` (`VideoStatus`,
  `VideoRow`, `Playback`) y `services/rubricas.ts`
  (`Rubrica`/`RubricaCriterio`/`RubricaNivel`, `RubricaInput`), con ~20
  importadores y mocks actualizados a imports sin extensión. Del
  ranking del plan solo quedan `useCourseEditorModel` y
  `useNotificaciones`.

## [0.18.0] — 2026-07-16

### Corregido

- `CursoDetalle` pasaba `undefined` como sesión a los paneles de foros,
  chat y sesiones virtuales (la variable `session` no existía en el
  script): quedaban inertes incluso con usuario logueado. Ahora se
  deriva de `auth.session`, con test de regresión.
- El handler `@saved` de crear tarea pasa a método nombrado: prettier
  (`semi: false`) eliminaba el `;` del inline multi-sentencia y rompía
  el parseo del template en cada commit.

### Cambiado

- Migración TS (2ª tanda): `lib/sbRest` con genéricos
  (`sbSelect<T>`/`sbInsert<T>`/`sbPatch<T>`/`sbRpc<T>` + `SbError`),
  `services/entregas` y `services/sesionesVirtuales` con interfaces de
  dominio. ~30 importadores actualizados a imports sin extensión.

## [0.17.0] — 2026-07-15

### Añadido

- **CI endurecido**: jobs de type-check (`vue-tsc --noEmit`, bloqueante),
  tests Deno de Edge Functions, E2E con Playwright (no bloqueante: requiere
  backend vivo), `npm audit --audit-level=high` informativo, Dependabot
  semanal (npm, pip, actions) y análisis CodeQL para JS/TS.
- Cobertura Vitest (provider v8) con script `test:unit:cov` y umbral
  trinquete (subido a ~35% tras la Fase 3; objetivo ~60%).
- 17 tests de componentes para `AdminCourseEditor` y `CursoDetalle`
  (red de seguridad del refactor).
- Plan de migración a TypeScript en `docs/migracion-typescript.md`.

### Cambiado

- `AdminCourseEditor.vue` desglosado (1507 → 487 líneas) en
  `useCourseEditorModel`, `useCursoPersistence`, `PortadaUploadField`
  y `ModuleEditorCard`, sin cambio de comportamiento.
- `services/tiempo`, `services/analytics` y `services/instructores`
  migrados a TypeScript como primeros ejemplos del plan.

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
