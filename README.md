# Cursos AMX

[![CI](https://github.com/aprendomx/cursos-amx/actions/workflows/ci.yml/badge.svg)](https://github.com/aprendomx/cursos-amx/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ECF8E?logo=supabase)](https://supabase.com)

> **Plataforma abierta de capacitación en línea** para instituciones que necesitan cursos en video, evaluaciones, foros y constancias verificables — sin depender de SaaS cerrados ni pagar licencias por alumno.

---

## ¿Por qué Cursos AMX?

| 🎨  | **Tu marca, tu código**                                                                                                                            |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Cambia colores, logos y textos desde un solo archivo (`theme/theme.config.js`). Sin tocar código. Ideal para identidades gráficas institucionales. |

| 🎬  | **Video que escala**                                                                                                                                                      |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|     | Upload resumable de videos grandes, transcodificación automática a HLS ABR (360p/720p/1080p) con ffmpeg, y reproductor adaptativo. No necesitas Vimeo ni YouTube privado. |

| 📜  | **Constancias verificables**                                                                                                                                                                                                                                                                                                                                                                                                         |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Emite constancias en PDF con folio único no enumerable y verificación pública por QR contra la base emisora. Cualquier persona puede comprobar que el folio existe y a quién corresponde, sin entrar al sistema. **No sustituyen una firma electrónica avanzada**: el PDF no va firmado con e.firma, así que el respaldo es el registro en tu servidor, no el documento. Si tu procedimiento exige firma avanzada, hay que añadirla. |

| ⚡  | **Rápido, instalable como app**                                                                                                                                                                                                                              |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | PWA instalable con cache de la aplicación y modo oscuro. El modo sin conexión (descarga de video y sincronización diferida) existe pero viene **apagado por defecto**: actívalo en Administración → Módulos y pruébalo con tu contenido antes de prometerlo. |

| 🔧  | **Activa módulos en caliente**                                                                                                                                                                                                                   |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Foros, chat, entregas, aulas virtuales, analytics e IA se encienden y apagan desde el panel de administración, sin rebuild ni redeploy. Apagar un módulo además **cierra sus tablas** por RLS: no queda accesible por la API. Ver THEMING.md §5. |

| 🏛️  | **Pensado para despliegue institucional**                                                                                                                                                                                                                                                                                                                                |
| :-- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Licencia AGPL-3.0 (la misma libertad que Canvas LMS), self-hosted completo con Docker, catálogo de dependencias y datos que nunca salen de tu servidor. Antes de operar con alumnos reales, revisa [docs/CUMPLIMIENTO.md](docs/CUMPLIMIENTO.md): qué resuelve el software y qué tiene que resolver la institución (aviso de privacidad, ARCO, retención, accesibilidad). |

---

## Comparativa con otras plataformas

| Plataforma     | Stack                        | Licencia | Self-hosted |   Video HLS   | Constancias QR |     White-label sin código     | Feature flags runtime |
| :------------- | :--------------------------- | :------- | :---------: | :-----------: | :------------: | :----------------------------: | :-------------------: |
| **Cursos AMX** | Vue 3 + Vite + TS + Supabase | AGPL-3.0 |     ✅      |      ✅       |       ✅       |               ✅               |          ✅           |
| Moodle         | PHP                          | GPL-3.0  |     ✅      |  ❌ (plugin)  |  ❌ (plugin)   |     ❌ (requiere tema PHP)     |          ❌           |
| Canvas LMS     | Ruby + React MFEs            | AGPL-3.0 |     ✅      |      ❌       |       ❌       |       ❌ (requiere fork)       |          ❌           |
| Open edX       | Python + Django + React MFEs | AGPL-3.0 |     ✅      |      ❌       |       ❌       | ❌ (requiere theming complejo) |          ❌           |
| Chamilo        | PHP + Symfony                | GPL-3.0  |     ✅      | ❌ (limitado) |       ✅       |     ❌ (requiere CSS/PHP)      |          ❌           |
| ILIAS          | PHP                          | GPL-3.0  |     ✅      |      ❌       |       ❌       |     ❌ (requiere skin PHP)     |          ❌           |
| Frappe LMS     | Vue + Python/Frappe          | MIT      |     ✅      |      ❌       |       ❌       |     ❌ (requiere theming)      |          ❌           |
| CourseLit      | React + Node                 | MIT      |     ✅      |      ❌       |       ❌       |      ❌ (requiere código)      |          ❌           |

> **Conclusión:** Cursos AMX es la opción open source con stack JavaScript moderno, video HLS nativo, constancias verificables por QR y personalización de marca vía configuración.
>
> **Alcance de las dos últimas columnas, para no exagerar.** _White-label sin código_: cubre logos, textos, tipografías, la paleta `--brand-*` y las secciones de la landing (ver el contrato en THEMING.md §0.1). Una identidad que exija salirse de esas variables sí requiere CSS propio. _Feature flags runtime_: cubre los 31 módulos de THEMING.md §5, conmutables desde el panel; no es un sistema general de flags por usuario ni por curso.

---

## Características

- **Vue 3 + Vite 6**, Composition API con `<script setup>`, migración progresiva a TypeScript
- **Backend Supabase self-hosted** (Postgres 15, Auth, Storage, Edge Functions, Realtime)
- **Video HLS** con worker de transcodificación (ffmpeg) y subida reanudable (tus)
- **Constancias PDF** con folio y verificación pública por QR
- **Módulos activables en runtime** vía `feature_toggles` en Supabase: instructor, foros, chat, entregas, aulas, evaluaciones, rúbricas, cohortes, importación masiva, gamificación, analytics, IA (quiz generator, resúmenes, chatbot), notificaciones, video analytics
- **Evaluaciones avanzadas** — 6 tipos de pregunta: opción única, múltiple, verdadero/falso, emparejamiento, rellenar huecos y ensayo
- **Rúbricas de evaluación** — editor visual de criterios y niveles de desempeño, asignables a evaluaciones o preguntas individuales
- **Cohortes (grupos)** — agrupa alumnos por curso con cupo máximo, fechas y foro privado exclusivo
- **Importación masiva de usuarios** — carga por CSV con validación en tiempo real y Edge Function `bulk-invite`
- **Gamificación** — sistema de puntos automáticos por actividad (lecciones, quizzes, foros), niveles de usuario (Novato → Leyenda), insignias desbloqueables con criterios configurables, tabla de clasificación por curso y árbol de desbloqueo de módulos con prerequisitos
- **Personalización completa** vía `theme/theme.config.js` (ver [THEMING.md](THEMING.md))
- **Dark mode** con selector Claro / Oscuro / Sistema
- **i18n base** con `vue-i18n` (es/en listos para extender)
- **PWA instalable** con precache de assets y fuentes Google
- **CI/CD** con GitHub Actions (lint + test + build)
- **Prerender SEO** de rutas públicas con Playwright (`npm run prerender`)
- **Video worker escalable** con `FOR UPDATE SKIP LOCKED` — soporta múltiples réplicas Docker sin conflictos
- **Documentación API** OpenAPI completa en `docs/API.md`
- **SSO/SAML** — Supabase Auth (GoTrue) soporta SAML 2.0; la guía para conectar tu IdP está en `docs/SSO_SAML.md`. La aplicación **no trae** pantalla de login SAML ni mapeo de atributos a `perfiles`: eso hay que cablearlo.

## Novedades

La versión en desarrollo se describe en `CHANGELOG.md` (sección «Sin publicar»). Las novedades de versiones anteriores —v0.5.0 a v0.18.0: núcleo educativo, gamificación, analytics, IA, PWA/offline, reportes, notificaciones, entregas y rúbricas, calendario y sesiones en vivo, grabaciones y transcripción, y la revisión técnica de seguridad y CI— están resumidas en `docs/NOVEDADES.md`.

## Roadmap

- **Phase G: PWA y Offline** ✅
  - Service Worker con VitePWA
  - Cache de contenido estático y assets
  - Descarga de videos HLS para offline
  - Cola de sincronización de acciones offline
  - Detector de estado de red
  - Notificaciones push
  - Composables: useOffline, useSyncStatus, useVideoCache
  - Componentes: OfflineBanner, DownloadButton, OfflineStatusPanel
  - Release: v0.9.0

- **Phase H1: Reportes Administrativos Avanzados (Core)** ✅
  - Funnel de conversión: 5 etapas con tasas de conversión
  - Retención de cohortes: tabla con heatmap (día 7, 14, 30, 60, 90)
  - Comparativa entre cursos: ranking sortable con métricas clave
  - Vistas SQL: v_funnel_curso, v_retencion_cohorte, v_comparativa_cursos
  - Edge Function analytics con endpoints funnel, retencion, comparativa
  - Composable: useReportes con carga paralela
  - Componentes: FunnelChart, RetentionMatrix, CourseComparisonTable
  - Feature flag: reportes_avanzados
  - Release: v0.10.0

- **Phase H2: Reportes por Instructor + Análisis de Contenido** ✅
  - Dashboard de instructor: métricas resumidas de cursos asignados
  - Tabla de alumnos por curso: progreso, calificaciones, tiempo dedicado
  - Análisis por lección: completitud, tiempo visto, engagement
  - Vistas SQL: v_instructor_cursos, v_instructor_alumnos, v_leccion_analytics
  - Edge Function analytics con endpoints instructor_dashboard, instructor_alumnos, leccion_analytics
  - Composable: useReportes extendido con instructor y lección
  - Componentes: InstructorReportPanel, InstructorAlumnosTable, LessonAnalyticsTable
  - Integración en InstructorPage.vue
  - Feature flag: reportes_avanzados
  - Release: v0.11.0

- **Phase H3: Financieros + Reportes Personalizables** ✅
  - Dashboard de costos: almacenamiento videos/documentos, tokens IA, costo estimado
  - Gráfico de inscripciones por tiempo
  - Ranking de cursos populares
  - Reportes favoritos: guardar configuraciones de reportes
  - Reportes programados: ejecución automática diaria/semanal/mensual
  - Historial de ejecuciones
  - Vistas SQL: v_costos_infraestructura, v_inscripciones_tiempo, v_cursos_populares
  - Tablas: reportes_favoritos, reportes_programados, reportes_historial
  - Componentes: CostosDashboard, InscripcionesTimeline, ReporteFavoritosManager, ReporteProgramadoForm, ReporteProgramadoList
  - Feature flag: reportes_avanzados
  - Release: v0.12.0

- **Phase I: Notificaciones y Alertas** ✅
  - Sistema de notificaciones en tiempo real (WebSocket/SSE)
  - Tipos: inscripciones, lecciones completadas, anuncios, recordatorios, menciones
  - Canales: in-app, email (opcional), push (opcional)
  - Plantillas de notificación personalizables
  - Preferencias por usuario
  - Tablas: notificaciones, notificacion_plantillas, email_configuracion, notificacion_preferencias, anuncios
  - Edge Function: notifications-worker (procesa cola cada minuto)
  - Composable: useNotificaciones.js
  - Componentes: NotificationBell, NotificationPanel, NotificationPreferences, AdminNotificaciones
  - Feature flags: notificaciones, notificaciones_email
  - Release: v0.13.0

- **Phase J: Analytics de Video** ✅
  - Tracking de eventos de video: play, pause, seek, tick, complete, ratechange
  - Almacenamiento de eventos en tiempo real (video_eventos)
  - Agregación nocturna a intervalos de 10s (video_intervalos) via cron
  - Vistas: v_video_leccion_stats, v_curso_video_stats
  - Edge Function: video-analytics (batch insert con validación)
  - Composable: useVideoAnalytics.js (tracking automático con batching)
  - Componentes: VideoHeatmap, LessonVideoStats, InstructorVideoDashboard, AdminVideoAnalytics
  - Feature flags: video_analytics, video_analytics_heatmap
  - Release: v0.14.0

- **Phase K: Entregas y Rúbricas** ✅
  - Tareas con instrucciones, fechas límite, configuración de archivos
  - Entregas del alumno: archivo + texto enriquecido
  - Historial de versiones (múltiples entregas)
  - Rúbricas de dos tipos: niveles cualitativos y puntaje libre por criterio
  - Penalización por retraso configurable
  - Calificación con retroalimentación estructurada
  - Notificaciones automáticas al instructor y alumno
  - Badges de gamificación: primera_entrega, entrega_a_tiempo, calificacion_perfecta
  - Tablas: tareas, entregas, entrega_versiones, rubricas, rubrica_criterios, rubrica_niveles, calificaciones
  - Vistas: v_entregas_pendientes_instructor
  - Servicios: entregas.js, rubricas.js
  - Composables: useEntregas.js, useEntregasInstructor.js
  - Componentes: CrearTareaPanel, RubricaEditor, CalificarEntregaModal, EntregasInstructorTable, EntregaAlumnoPanel, RubricaAlumnoView, AdminEntregas, EntregaUploader
  - Feature flags: entregas, entregas_rubricas
  - Release: v0.15.0

- **Phase L: Calendario y Sesiones en Vivo** ✅
  - Calendario unificado: sesiones, tareas, cursos, anuncios
  - Soporte dual Jitsi / Zoom con Server-to-Server OAuth
  - RSVP y asistencia para alumnos
  - Edge Functions: zoom-meeting, zoom-webhook
  - Tablas: sesiones_rsvp, zoom_configuracion
  - Vista: v_calendario_curso
  - Servicios: zoom.js, sesionesVirtuales.js (actualizado)
  - Composables: useCalendario.js, useSesiones.js
  - Componentes: CrearSesionPanel, SesionesCalendario, SesionCard, AsistenciaPanel, CalendarioCurso, MiCalendario, AdminZoomConfig
  - Feature flags: sesiones_virtuales, zoom_integration

- **Phase M: Grabaciones y Transcripción** ✅
  - Grabaciones automáticas Zoom via webhook
  - Transcripción con OpenAI Whisper API (~$0.006/min)
  - Búsqueda full-text en español sobre transcripciones
  - Reproductor sincronizado con transcripción
  - Edge Function: transcribir-sesion
  - Tablas: sesiones_grabaciones, sesiones_transcripciones
  - Función RPC: buscar_transcripciones(text)
  - Servicios: grabaciones.js, transcripcion.js
  - Composables: useGrabaciones.js, useReproductor.js
  - Componentes: ArchivoSesiones, ReproductorGrabacion, BuscadorSesiones, AdminGrabaciones
  - Feature flags: sesiones_grabaciones, transcripcion_whisper
  - Badges: asistir_sesion, primera_sesion
  - Release: v0.16.0

- **Revisión técnica: seguridad, CI y mantenibilidad** ✅
  - Auth + roles en Edge Functions con service_role (`_shared/auth.ts`)
  - CI: type-check, tests Deno, E2E, npm audit, Dependabot, CodeQL
  - Cobertura Vitest con umbral trinquete
  - Refactor AdminCourseEditor (1507 → 487 líneas) + 17 tests
  - Migración a TypeScript iniciada (`docs/migracion-typescript.md`)
  - Release: v0.17.0

## Inicio rápido (desarrollo)

```bash
npm install
cp .env.example .env   # configura VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173
```

## Instalación completa (producción self-hosted)

Ver `docs/MANUAL_ACTUALIZACION.md` y `docker/` (stack Supabase + video-worker).

```bash
# Un solo comando en el servidor
scripts/deploy.sh
```

Al terminar, `deploy.sh` verifica la instalación: que las funciones exijan
autenticación, que todas las tablas tengan RLS, que las migraciones estén
aplicadas y que la escalada a administrador siga bloqueada. **Una comprobación
que no se puede ejecutar cuenta como problema**, nunca como comprobación
superada: una instalación degradada no debe terminar en verde.

La URL contra la que se verifica se toma de `API_EXTERNAL_URL` en
`docker/.env`. Es la URL de la **API**, no la del frontend — todas las
comprobaciones van contra `/functions/v1/…`. Para anularla:

```bash
PUBLIC_URL=https://api.tu-dominio.org scripts/deploy.sh
```

### Documentos institucionales

El aviso de privacidad, los términos de uso y la página de contacto se redactan
y publican desde **Administración → Documentos**, y se sirven en
`/aviso-privacidad`, `/terminos-uso` y `/contacto`. Los enlaces del pie de la
portada llevan ahí solos.

- **Publicar crea una versión** con su fecha, y **conserva las anteriores**: una
  versión publicada no se puede modificar ni borrar. Los cambios se hacen
  publicando una versión nueva.
- **El consentimiento del aviso registra qué versión se aceptó.** Al publicar
  una versión puedes marcar que exige volver a aceptarla; solo entonces se le
  pide a quien ya estaba registrado, y no se le bloquea el acceso mientras
  tanto.
- **Hasta que publiques el aviso, el registro de nuevas cuentas está
  bloqueado.** Toda instalación llega con la plantilla cargada como borrador:
  sustituye los marcadores, revísala con tu área jurídica y publícala.

¿Ya los publicas fuera de la plataforma? Pon la URL en `theme.config.local.js`
→ `footer.columns` y esa manda (ver `THEMING.md`).

### El primer administrador

Una instalación nueva no tiene a nadie que pueda entrar al panel: el rol vive en
`perfiles.es_admin`, que nace en `false`, y un usuario **no puede promoverse a sí
mismo** —lo impide el trigger `perfiles_guard_roles`, que es la defensa real
contra la escalada de privilegios—.

`scripts/deploy.sh` se encarga: al terminar cuenta los administradores y, si no
hay ninguno, crea el primero preguntándote correo y nombre.

También puedes correrlo por separado, las veces que haga falta:

```bash
scripts/crear-admin.sh                    # pregunta lo que falte
scripts/crear-admin.sh --email tu@correo.mx --nombres Ana --apellido-paterno Ruiz
```

- Si el correo **no existe**, crea la cuenta y **muestra una contraseña generada
  una sola vez**. No se guarda en ningún archivo, ni en `docker/.env`, ni en los
  logs: anótala en ese momento.
- Si el correo **ya existe**, solo lo promueve. No cambia su contraseña ni sus
  datos.
- Volver a ejecutarlo es seguro: no duplica cuentas ni regenera contraseñas.

En un despliegue **sin terminal interactiva** (CI, `cron`) no se pregunta nada:
`deploy.sh` avisa y termina señalando el problema, porque una instalación sin
administrador está rota aunque todos los contenedores estén arriba.

¿Perdiste la contraseña? Ver «Problemas frecuentes» en
`docs/MANUAL_ACTUALIZACION.md`.

## Curso tutorial preinstalado

Toda instalación trae publicado el curso **«Cómo usar Cursos AMX»**
(`/curso/tutorial-plataforma`), un manual de la propia plataforma que sirve
además como contenido de prueba con el que verificar que todo funciona.

Lo siembra `supabase/migrations/056_curso_tutorial.sql`, así que se aplica solo
con `scripts/migrate.sh`, tanto en instalaciones nuevas como existentes.

- **8 módulos, 26 lecciones, ~2h 25min.** Módulos 1–4 para el alumno, 5 para el
  instructor, 6–7 para el administrador y 8 de cierre.
- **Sin dependencias.** Todas las lecciones son de texto: no hay video que
  transcodificar ni archivos que subir a Storage, y el curso se puede completar
  —y emitir su constancia— en una instalación recién levantada con todos los
  módulos apagados.
- **Editable.** Está sembrado como cualquier otro curso: se puede adaptar desde
  el panel de administración a las reglas de cada institución.

Semillas opcionales en `supabase/seeds/` (no las aplica el runner de
migraciones; se corren a mano con `psql`):

| Archivo                  | Qué hace                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tutorial_examen.sql`    | Agrega la evaluación final del tutorial: 10 preguntas de opción única, múltiple y verdadero/falso. **Requiere `VITE_FEATURE_EVALUACIONES=true`**; sin ese flag la lección no se puede completar y bloquearía la constancia. |
| `tutorial_uninstall.sql` | Elimina el curso tutorial. Para sacarlo del catálogo sin destruir constancias, basta con `publicado = false`.                                                                                                               |

El contenido lo cubre `src/test/cursoTutorial.test.js`, que valida que el JSON
de Tiptap de las 26 lecciones renderice con la whitelist del reproductor.

## Personalización de identidad gráfica

Ver [THEMING.md](THEMING.md). Solo necesitas cambiar:

1. `theme/theme.config.js` — textos, colores, logos
2. `public/theme/` — assets de imagen
3. `theme/sections/` — secciones custom de landing (opcional)

## Estructura del repo

```
src/
  pages/        Vistas (LandingPage, CursoDetalle, PlayerPage, AdminPage, etc.)
  components/   Componentes compartidos y extraídos (AdminDashboard, PlayerChatPane, ...)
  composables/  Lógica reutilizable (useHlsPlayer, useTiempoActividad, useErrorHandler, ...)
  stores/       Pinia stores (auth, ui)
  services/     Acceso a Supabase por dominio (cursos, progreso, videos, ...)
  router/       Vue Router config + guards
  lib/          Cliente Supabase, helpers (theme.js, featureFlags.js, i18n.js, errors.ts)
  locales/      Archivos de traducción (es.json, en.json)
  assets/       CSS global con tokens de marca y modo oscuro

theme/
  theme.config.js   Única fuente de identidad gráfica
  sections/         Secciones custom de landing

supabase/
  migrations/   Esquema versionado en SQL (001–007; 001_base.sql consolida las antiguas 001–076)
  seeds/        Semillas opcionales, fuera del runner de migraciones
  functions/    Edge Functions Deno (hls-playlist, hls-playlist-url, documento-url, bulk-invite, ai-proxy, analytics, push-notify, admin-set-password, notifications-worker, video-analytics, zoom-meeting, zoom-webhook, transcribir-sesion)

services/
  video-worker/   Sidecar Docker (Node 20 + ffmpeg) que procesa HLS
  whisper-service/  Servicio de transcripción local (Python + faster-whisper)

docker/
  docker-compose.yml    Stack completo Supabase self-hosted + video-worker
```

## Testing

```bash
npm run test:unit           # Vitest + Vue Test Utils (jsdom) — 448 tests
npm run test:unit:cov       # con cobertura v8 (umbral trinquete)
npm run test:unit:watch     # modo watch
npm run test:e2e            # Playwright (Chromium)

# Edge Functions (Deno) — 53 tests
deno test --allow-all supabase/functions/_shared/auth.test.ts \
  supabase/functions/{bulk-invite,analytics,push-notify,video-analytics}/index.test.ts
```

## Lint y formato

```bash
npm run lint        # ESLint 9 flat config
npm run lint:fix    # ESLint con --fix
npm run type-check  # vue-tsc --noEmit
npm run format      # Prettier en todo el repo
```

Husky + lint-staged ejecutan `eslint --fix` y `prettier --write` en cada commit.

## Build de producción

```bash
node scripts/generate-icons.js  # genera iconos PWA (una sola vez)
npm run build                   # genera dist/
npm run preview                 # sirve dist/ localmente
```

## Contribuir

Lee [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) y el [Código de Conducta](CODE_OF_CONDUCT.md).

## Licencia

AGPL-3.0-only — ver [LICENSE](LICENSE). © 2026 Julio Adrián.
