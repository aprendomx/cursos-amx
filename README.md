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

| 📜  | **Constancias con valor legal**                                                                                                                |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Emite constancias en PDF con folio único y verificación pública por QR. Cualquier persona puede validar la autenticidad sin entrar al sistema. |

| ⚡  | **Rápido, offline-first**                                                                                   |
| :-- | :---------------------------------------------------------------------------------------------------------- |
|     | PWA instalable con cache de assets y modo oscuro. Los alumnos pueden continuar cursos sin conexión estable. |

| 🔧  | **Activa módulos en caliente**                                                                                                              |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------ |
|     | Foros, chat, entregas de archivos, aulas virtuales y evaluaciones se activan vía feature flags en runtime. No requiere rebuild ni redeploy. |

| 🏛️  | **Hecho para el sector público**                                                                                                                                                  |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | Licencia AGPL-3.0 (la misma libertad que Canvas LMS), self-hosted completo con Docker, y soporte para múltiples dependencias/instituciones. Tus datos nunca salen de tu servidor. |

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

> **Conclusión:** Cursos AMX es la única opción open source con stack JavaScript moderno, video HLS nativo, constancias verificables por QR y personalización completa vía configuración — sin necesidad de editar código ni depender de plugins de terceros.

---

## Características

- **Vue 3 + Vite 6**, Composition API con `<script setup>`, migración progresiva a TypeScript
- **Backend Supabase self-hosted** (Postgres 15, Auth, Storage, Edge Functions, Realtime)
- **Video HLS** con worker de transcodificación (ffmpeg) y subida reanudable (tus)
- **Constancias PDF** con folio y verificación pública por QR
- **Módulos activables en runtime** vía `feature_toggles` en Supabase: instructor, foros, chat, entregas, aulas, evaluaciones, rúbricas, cohortes, importación masiva, gamificación, analytics, IA (quiz generator, resúmenes, chatbot)
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
- **SSO/SAML** — guía de integración con IdP institucional en `docs/SSO_SAML.md`

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
  migrations/   Esquema versionado en SQL (001–046)
  functions/    Edge Functions Deno (hls-playlist, hls-playlist-url, documento-url, bulk-invite)

services/
  video-worker/ Sidecar Docker (Node 20 + ffmpeg) que procesa HLS

docker/
  docker-compose.yml    Stack completo Supabase self-hosted + video-worker
```

## Testing

```bash
npm run test:unit           # Vitest + Vue Test Utils (jsdom) — 205 tests
npm run test:unit:watch     # modo watch
npm run test:e2e            # Playwright (Chromium)
```

## Lint y formato

```bash
npm run lint        # ESLint 9 flat config
npm run lint:fix    # ESLint con --fix
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

---

_Con mucho cariño, para mi usuaria favorita 🌅_
