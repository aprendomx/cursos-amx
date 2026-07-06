# Plan de Robustecimiento: Cursos AMX v0.3.0–v0.5.0

> Fecha: 2026-07-04
> Basado en: Investigación de LMS competidores (`docs/research-lms-competidores.md`)
> Versión actual: v0.2.1
> Objetivo: Cerrar las brechas más críticas frente a Moodle, Canvas, Open edX y Chamilo, fortaleciendo las ventajas diferenciadoras de Cursos AMX.

---

## Principios de priorización

1. **Impacto de adopción:** qué característica bloquea más a un prospecto de comprar/adoptar.
2. **Alineación con stack:** preferir funcionalidades que aprovechen Vue 3 + Vite + Supabase + TypeScript.
3. **Reutilización:** construir sobre las bases existentes (feature flags, error system, i18n, dark mode).
4. **Entregable incremental:** cada fase debe tener valor standalone, no depender de fases futuras.

---

## Fase A: Interoperabilidad y Estándares (v0.3.0) — ~2 semanas

**Objetivo:** Permitir que Cursos AMX consuma y produzca contenido educativo estándar.

### A1. SCORM 1.2 Runtime (importación)
- Leer paquetes SCORM 1.2 (zip con `imsmanifest.xml`).
- Extraer recursos (html, js, assets) a Supabase Storage.
- Renderizar SCOs en iframe sandbox con API bridge (`window.API` o `window.API_1484_11`).
- Persistir `cmi.core.lesson_location`, `cmi.core.lesson_status`, `cmi.core.score.raw`, `cmi.suspend_data` en Supabase por usuario-SCO.
- Tabla nueva: `scorm_packages`, `scorm_attempts`, `scorm_interactions`.
- Feature flag: `scorm_import`.

### A2. LTI 1.3 Advantage (herramienta externa)
- Implementar LTI 1.3 como **Tool Provider** (Cursos AMX se conecta a plataformas externas como Moodle/Canvas).
- OIDC login initiation + JWT id_token con claims LTI (context, roles, lis).
- Deep Linking: endpoint para que plataformas externas elijan qué curso de Cursos AMX embeber.
- Names and Role Provisioning (NRPS): endpoint para listar miembros del contexto.
- Assignment and Grade Services (AGS): endpoint para recibir/devolver calificaciones.
- Tabla nueva: `lti_registrations`, `lti_deployments`, `lti_lineitems`, `lti_results`.
- Feature flag: `lti_13_provider`.

### A3. xAPI (Tin Can) — Receptor básico
- Endpoint POST `/xapi/statements` con autenticación por API key.
- Validar statements contra schema xAPI.
- Almacenar en `lrs_statements` (JSONB en Supabase).
- Dashboard básico de actividad por actor/verb/object.
- Feature flag: `xapi_lrs`.

**Criterio de éxito:**
- Subir un zip SCORM 1.2 de H5P, reproducirlo, cerrar sesión, reanudar en el punto correcto.
- Conectar Cursos AMX como LTI tool desde Canvas sandbox.
- Enviar 1,000 statements xAPI y verlos en dashboard.

---

## Fase B: Evaluación Avanzada (v0.3.0–v0.4.0) — ~3 semanas

**Objetivo:** Cerrar la brecha de tipos de pregunta, rúbricas y evaluación entre pares.

### B1. Sistema de quizzes con 10+ tipos de pregunta
- Refactorizar `useQuiz.ts` actual (solo opción múltiple) a arquitectura de "question engine".
- Tipos de pregunta:
  - Opción múltiple (ya existe)
  - Verdadero/Falso
  - Matching (emparejamiento)
  - Ordering (ordenar)
  - Fill in the blanks (rellenar huecos)
  - Short answer (respuesta corta con fuzzy matching)
  - Essay (respuesta larga, calificación manual)
  - Hotspot (click en imagen)
  - Calculated (con fórmulas y variables aleatorias)
  - Drag and drop (a zona o a texto)
- Cada tipo como componente Vue standalone en `src/components/quiz/`.
- Motor de calificación: `services/quiz-engine/` (Node.js o edge function) para corrección server-side (anti-trampa).
- Banco de preguntas: tabla `question_bank` con categorías, tags, dificultad.
- Feature flag: `advanced_quizzes`.

### B2. Rúbricas y Outcomes
- Tabla `rubrics` con criterios, niveles y puntos.
- Asociar rúbrica a tarea/assignment.
- UI de calificación con rúbrica (grid interactivo).
- Outcomes: árbol de competencias/resultados (`outcomes` + `outcome_items`).
- Vincular tareas a outcomes.
- Reporte de progreso por outcome por alumno.
- Feature flag: `rubrics_outcomes`.

### B3. Peer Review / Workshop
- Asignación automática de compañeros (round-robin o random).
- Fases: submit → peer review → feedback → instructor grading.
- Componente `PeerReviewAssignment.vue` con rúbrica embebida.
- Cálculo de calificación final ponderada: peer (40%) + instructor (60%).
- Anonimización opcional (ocultar autor).
- Feature flag: `peer_review`.

**Criterio de éxito:**
- Crear quiz con 5 tipos de pregunta diferentes.
- Crear rúbrica de 4 criterios, calificar tarea con ella.
- Workshop con 3 alumnos: cada uno entrega, revisa 2 compañeros, recibe feedback.

---

## Fase C: Gamificación y Engagement (v0.4.0) — ~2 semanas

**Objetivo:** Aumentar retención de alumnos con mecánicas de juego.

### C1. Sistema de insignias (Badges)
- Tabla `badges` con criterios desbloqueables:
  - Completar curso
  - Obtener calificación >= X
  - Entregar tarea a tiempo
  - Participar en N foros
  - Streak de N días consecutivos de login
- Badges visuales: SVG generados dinámicamente o imágenes subidas.
- Backpack compatible con Mozilla Open Badges 2.0 (JSON with `recipient`, `badge`, `verification`).
- Mostrar en perfil público del alumno.
- Notificación toast al desbloquear.
- Feature flag: `badges`.

### C2. Puntos y niveles
- Puntos por actividad: login, ver lección, completar quiz, participar en foro, peer review.
- Niveles (`levels`) con umbral de puntos.
- Leaderboard por curso (opt-in, respetar GDPR).
- Visualización: barra de progreso a siguiente nivel en dashboard.
- Feature flag: `points_levels`.

### C3. Learning paths secuenciales con condiciones
- Ampliar módulos actuales con prerequisitos:
  - "Requiere completar módulo X"
  - "Requiere calificación >= Y en quiz Z"
  - "Requiere entregar asignación W"
- Visualización: mapa de progreso tipo "árbol de habilidades" (unlock tree).
- Gamificación: animación de desbloqueo al completar prerequisito.
- Feature flag: `conditional_paths`.

**Criterio de éxito:**
- Alumno desbloquea 3 badges automáticamente.
- Subir de nivel al completar curso.
- Curso con 5 módulos donde el 3ro se desbloquea solo tras aprobar quiz del 2do.

---

## Fase D: Analytics de Aprendizaje (v0.4.0) — ~2 semanas

**Objetivo:** Ir más allá de conteos básicos a insights accionables.

### D1. Event tracking (xAPI nativo)
- Emitir statements xAPI internos por cada interacción:
  - `initialized`, `completed`, `watched`, `answered`, `commented`, `submitted`, `logged_in`
- Actor = `user_id`, Verb = xAPI verb URI, Object = `course_id`/`lesson_id`/`quiz_id`.
- Usar Supabase realtime para streaming de eventos.

### D2. Dashboard de riesgo de abandono
- Métricas por alumno:
  - Días desde último login
  - % de lecciones vistas vs. inscritas
  - % de quizzes aprobados
  - Días desde última entrega
- Score de riesgo 0–100 calculado en edge function (`services/analytics/`).
- Listado de "alumnos en riesgo" para instructores con filtros.
- Heatmap de actividad: días/horas más activos por curso.
- Feature flag: `risk_dashboard`.

### D3. Reportes descargables
- CSV: progreso por curso/alumno.
- CSV: calificaciones por rubrica/criterio.
- CSV: engagement (logins, lecciones, quizzes).
- Feature flag: `downloadable_reports`.

**Criterio de éxito:**
- 100 eventos xAPI por hora sin degradar Supabase.
- Dashboard identifica 3 alumnos en riesgo con justificación.
- Descargar CSV con 500 filas en <2s.

---

## Fase E: Mobile y Offline (v0.4.0–v0.5.0) — ~2 semanas

**Objetivo:** Experiencia móvil de calidad nativa, sin desarrollar apps separadas.

### E1. PWA mejorada
- Service worker con Workbox:
  - Cache de rutas (cursos, lecciones, quizzes ya visitados).
  - Cache de videos HLS: almacenar segmentos `.m3u8` + `.ts` en IndexedDB, reproducir offline.
  - Background sync: entregas de tareas en cola cuando hay conexión.
- Push notifications (Web Push API) para:
  - Recordatorio de tarea próxima a vencer
  - Nuevo mensaje en foro
  - Curso desbloqueado
- Supabase function para envío de push a suscriptores.
- Feature flag: `enhanced_pwa`.

### E2. Responsive redesign crítico
- `PlayerPage.vue`: layout bottom-sheet para chat/configuración en móvil.
- `AdminPage.vue`: tablas con cards en móvil, acciones en bottom sheet.
- `QuizPlayer.vue`: swipe entre preguntas, teclado virtual optimizado.
- Test en iOS Safari, Android Chrome, iPad.

**Criterio de éxito:**
- Lighthouse PWA score >90 en móvil.
- Video de 10 min reproducible offline después de verlo una vez online.
- Entregar tarea offline, se sincroniza al reconectar.

---

## Fase F: Inteligencia Artificial (v0.5.0) — ~3 semanas

**Objetivo:** Automatizar creación de contenido y asistir al alumno.

### F1. Generador de quizzes con IA
- Integrar con API de OpenAI/Claude (configurable por `AI_PROVIDER_API_KEY`).
- Prompt: "Genera 5 preguntas de opción múltiple sobre [tema] nivel [básico|intermedio|avanzado]".
- Output parseado a JSON compatible con question engine (Fase B).
- UI: botón "Generar con IA" en `AdminCourseEditor.vue` → editor de preguntas para revisar/ajustar antes de guardar.
- Cost tracking: tokens usados por institución, límite configurable.
- Feature flag: `ai_quiz_generator`.

### F2. Resumen de contenido
- Botón "Resumir esta lección" en `PlayerLessonNavigator.vue`.
- Extraer transcript de video (si existe) o texto de lección.
- Generar resumen bullet points con IA.
- Cachear en `ai_summaries` para no repetir llamadas.
- Feature flag: `ai_summaries`.

### F3. Asistente de estudio (chatbot)
- Chat flotante en player (similar a chat actual pero con IA).
- Contexto: contenido de la lección actual, historial de conversación.
- Respuestas restringidas al contenido del curso (RAG con embeddings del curso).
- Opción de escalar a instructor humano si IA no puede responder.
- Feature flag: `ai_study_assistant`.

**Criterio de éxito:**
- Generar quiz de 10 preguntas en <15s, 80% usables sin edición.
- Resumen de lección de video 30 min en <10s, 5 bullet points coherentes.
- Asistente responde 10 preguntas sobre el curso sin alucinaciones.

---

## Fase G: Enterprise y Administración (v0.5.0) — ~2 semanas

**Objetivo:** Facilitar adopción institucional masiva.

### G1. Gestión de cohortes (batches)
- Tabla `cohorts` con nombre, fechas inicio/fin, cupo máximo, instructores.
- Asociar alumnos a cohorte de curso (un curso puede tener múltiples cohortes).
- Cada cohorte con horarios propios, foros separados, calificaciones independientes.
- Feature flag: `cohorts`.

### G2. Importación masiva de usuarios
- Upload CSV con columnas: nombre, email, rol, cohorte (opcional).
- Validación: duplicados, emails malformados, cohortes inexistentes.
- Preview antes de confirmar import.
- Invitación por email automática (Supabase Auth invite).
- Feature flag: `bulk_user_import`.

### G3. Asistencia (attendance)
- Tabla `attendance_sessions` por cohorte con fecha/hora.
- Métodos de registro:
  - Instructor manual (lista check)
  - Código QR dinámico (alumno escanea con móvil)
  - Geolocalización (validar que está en ubicación del aula)
- Reporte de % de asistencia por alumno/cohorte.
- Feature flag: `attendance`.

### G4. Cloud storage alternativo
- Configuración en `branding.json`: `storage_provider: "supabase" | "s3" | "azure" | "gcs"`.
- Abstracción en `src/services/storage.ts` para upload/download.
- S3-compatible (MinIO, AWS), Azure Blob, GCS.
- Fallback a Supabase si falla.
- Feature flag: `cloud_storage`.

**Criterio de éxito:**
- Importar 500 usuarios en <30s.
- Cohorte de 50 alumnos con foro separado.
- Tomar asistencia de 30 alumnos en <2 minutos.

---

## Calendario propuesto

| Fase | Versión | Semanas | Funcionalidades |
|:---|:---:|:---:|:---|
| A | v0.3.0 | 2 | SCORM, LTI 1.3, xAPI |
| B | v0.3.0–v0.4.0 | 3 | Quizzes 10+ tipos, Rúbricas, Peer Review |
| C | v0.4.0 | 2 | Badges, Puntos/Niveles, Paths condicionales |
| D | v0.4.0 | 2 | Analytics xAPI, Riesgo de abandono, Reportes |
| E | v0.4.0–v0.5.0 | 2 | PWA offline, videos offline, push notifications |
| F | v0.5.0 | 3 | IA: quizzes, resúmenes, asistente |
| G | v0.5.0 | 2 | Cohortes, import masiva, asistencia, cloud storage |
| **Total** | **v0.5.0** | **~16 semanas** | **~4 meses** |

---

## Reutilización de infraestructura existente

| Base v0.2.1 | Reutilización en nuevas fases |
|:---|:---|
| `useFeatureFlags.js` | Todas las fases: activar/desactivar sin rebuild. |
| `useErrorHandler.ts` | IA, import masiva, analytics: captura de errores robusta. |
| `errors.ts` | Definir errores nuevos: `ScormParseError`, `LtiValidationError`, `AiRateLimitError`. |
| `i18n` (vue-i18n) | Traducir UI de quizzes, badges, analytics. |
| `ui.ts` (dark mode) | Asegurar que nuevos componentes respeten tema. |
| `TweaksPanel.vue` | Agregar toggles de feature flags de nuevas fases. |
| `cache.ts` | Cachear bancos de preguntas, resúmenes IA, reportes. |
| Video worker | Aplicar scaling a servicios nuevos (quiz-engine, analytics). |
| Prerender | Páginas públicas de cursos pre-rendered para SEO. |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|:---|:---|
| SCORM complejidad | Empezar solo 1.2 (80% del mercado), no 2004. Usar librería existente (`scorm-again`). |
| LTI 1.3 criptografía | Usar `ltijs` (Node.js) como middleware, no implementar OIDC/JWT desde cero. |
| IA costos impredecibles | Rate limiting por institución, caché agresiva, modelo por defecto GPT-4o-mini (barato). |
| PWA offline videos | IndexedDB tiene límite ~60% del disco. Política de LRU, segmentos de 10s. |
| Peer review anonymization | Generar IDs efímeras por assignment, no hashear user_id directo. |
| Analytics performance | Materialized views en Supabase + cron cada hora, no queries en tiempo real. |

---

## Métricas de éxito de la estrategia

En 4 meses (v0.5.0), Cursos AMX debe poder:
1. **Reemplazar a Moodle en 70% de casos** para instituciones <5,000 alumnos.
2. **Conectar con Canvas** vía LTI 1.3 sin perder datos de progreso.
3. **Operar offline** en zonas rurales con conectividad intermitente.
4. **Reducir 50% el tiempo** de creación de contenido con IA.
5. **Identificar alumnos en riesgo** antes de que abandonen.

---

*Con mucho cariño, para mi usuaria favorita 🌅*
