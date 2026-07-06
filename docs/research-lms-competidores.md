# Investigación: Funcionalidades y Ventajas de LMS Competidores

> Fecha: 2026-07-03
> Objetivo: Identificar brechas entre Cursos AMX y los principales LMS open source para construir un plan de robustecimiento.

---

## 1. Moodle (moodle/moodle)

**Estrellas:** 7.2k | **Stack:** PHP | **Licencia:** GPL-3.0

### Ventajas clave
- **Ecosistema masivo:** 2,000+ plugins oficiales. Si existe una necesidad educativa, hay un plugin de Moodle.
- **Tipos de actividad ricos:** Foros (múltiples tipos: Q&A, blog, estándar), Glosarios, Wikis, Bases de datos, Talleres (peer review), Encuestas, Lecciones (ramificación), H5P integrado.
- **SCORM 1.2/2004, LTI 1.1/1.3, xAPI (Tin Can):** interoperabilidad total con contenido externo.
- **Competencias y planes de aprendizaje:** árboles de competencias, vinculación de cursos a competencias, desbloqueo condicional.
- **Gamificación nativa:** insignias (badges), puntos, tablas de clasificación, condiciones de finalización.
- **Analíticas de aprendizaje:** modelos de riesgo de abandono integrados (Inspire).
- **App móvil oficial:** branding personalizado para instituciones.
- **Workshop (Taller):** peer assessment con rubricas, calificación por pares ponderada.
- **Grupos y agrupaciones:** trabajos en grupo, foros separados por grupo, tareas visibles solo a ciertos grupos.

### Fortalezas técnicas
- Multi-idioma completo (más de 100 idiomas).
- Soporte de themes profundo (Boost, Classic, + themes comerciales).
- Cohorts (agrupaciones institucionales).
- Caché multi-nivel (MUC) para escalar a miles de usuarios.

---

## 2. Canvas LMS (instructure/canvas-lms)

**Estrellas:** 6.7k | **Stack:** Ruby on Rails + React MFEs | **Licencia:** AGPL-3.0

### Ventajas clave
- **SpeedGrader:** flujo de calificación ultrarrápido con anotaciones sobre PDF, video, audio y texto. Es el estándar de la industria.
- **Rubricas y Outcomes:** vinculación de tareas a resultados de aprendizaje (outcomes), acumulación automática de métricas por alumno.
- **LTI 1.3 Advantage:** deep linking, Names and Role Provisioning, Assignment and Grade Services.
- **Peer review:** asignación automática de compañeros para revisión con rubricas.
- **Video recording nativo:** grabación de video/audio directamente en el navegador para entregas.
- **SIS Integration:** imports/exports automatizados con sistemas estudiantiles (Banner, PowerSchool, etc.).
- **Blueprint Courses:** cursos maestro/esclavo para contenido centralizado y sobrescritura controlada.
- **Masquerading:** admins e instructores pueden "ver como" cualquier usuario para troubleshooting.
- **Mobile apps:** Canvas Student, Teacher, Parent.
- **Analytics Dashboard:** intervención temprana basada en actividad (page views, assignments, grades).

### Fortalezas técnicas
- Micro-frontends (MFEs) separados: Authoring, Learning, Learner Dashboard, Profile, Account.
- GraphQL para consultas eficientes.
- REST API muy completa (documentada con Swagger).
- Multi-tenant por diseño.

---

## 3. Open edX (openedx/edx-platform)

**Fork:** edx/edx-platform | **Stack:** Python/Django + React MFEs | **Licencia:** AGPL-3.0

### Ventajas clave
- **XBlocks:** framework de componentes de contenido abiertos. Cualquiera puede crear nuevos tipos de problemas, simulaciones, labs, etc.
- **Problem Banks:** bancos de problemas reutilizables entre cursos con randomización.
- **Proctoring integrado:** verificación de identidad y supervisión remota de exámenes.
- **Libraries V2:** contenido reusable (problemas, videos) compartido entre múltiples cursos con granular permissions.
- **Cohorts:** división de alumnos en grupos para discusión y contenido diferenciado.
- **Discusiones ricas:** foros anidados con upvoting, respuestas anidadas, equipos de discusión.
- **Certificates verificados:** con verificación de identidad (proctored), no solo QR.
- **Entitlements:** créditos transferibles entre cursos.
- **CCX (Custom Courses on edX):** instructores pueden crear cursos personalizados derivados de un MOOC maestro.
- **Open Response Assessments (ORA):** ciclos de auto-evaluación + peer-evaluación + instructor-evaluación con rubricas.

### Fortalezas técnicas
- Tutor: distribución Docker oficial para deploy simplificado.
- Event tracking (xAPI/Tin Can compatible).
- Elasticsearch para búsqueda de cursos/contenido.
- Multi-site (microsites).

---

## 4. Chamilo (chamilo/chamilo-lms)

**Estrellas:** 967 | **Stack:** PHP + Symfony + Vue 3 | **Licencia:** GPL-3.0

### Ventajas clave
- **AI-powered tools:** generación automática de ejercicios, learning paths, AI-assisted grading. Soporta OpenAI, Grok, Gemini, Claude, DeepSeek.
- **Learning paths:** secuencias de lecciones con condiciones de avance (SCORM-like nativo).
- **Quizzes:** 20+ tipos de pregunta, selección aleatoria por categorías, tests adaptativos, límites de tiempo, co-creación con IA.
- **Skills management:** creación, edición, asignación a usuarios, niveles/escalas de adquisición.
- **Gradebook con QR:** generación de badges y certificados con códigos QR.
- **OnlyOffice integration:** edición colaborativa de documentos dentro de la plataforma.
- **Cloud storage nativo:** Azure Blob, AWS S3, Google Cloud Storage.
- **Videoconferencia:** integraciones con BigBlueButton, Jitsi, Zoom.
- **Attendance tracking:** toma de asistencia, firma digital, reporting Qualiopi.
- **Sessions:** reutilización de cursos múltiples veces con diferentes cohortes de alumnos.
- **Surveys:** creación, toma y análisis de encuestas.
- **SCORM 1.2, QTI, LTI, xAPI CMI5, Aiken:** soporte completo de estándares.
- **E-commerce module:** catálogo de cursos con pagos integrados.

### Fortalezas técnicas
- JWT authentication para API.
- Vue 3 + PrimeVue (stack moderno para PHP).
- 60+ idiomas traducidos, incluyendo RTL.
- GDPR-ready: export de datos personales.

---

## 5. ILIAS (ILIAS-eLearning/ILIAS)

**Estrellas:** 492 | **Stack:** PHP | **Licencia:** GPL-3.0

### Ventajas clave
- **Portfolios:** portafolios electrónicos de aprendizaje con estructura personalizada.
- **Learning modules:** contenido estructurado con navegación secuencial y ramificación.
- **Workshops:** calificación por pares con criterios definidos.
- **Booking system:** reserva de espacios, equipos, eventos.
- **Individual learning plans (ILPs):** planes personalizados por alumno con metas y plazos.
- **Competence management:** árboles de competencias, requisitos de cursos, certificados.
- **MediaCast:** canal de video tipo podcast para distribución de contenido multimedia.
- **Biblioteca de objetos de aprendizaje:** repositorio central de materiales reutilizables.
- **Plugin ecosystem:** plugins para la mayoría de necesidades.

### Fortalezas técnicas
- Muy orientado a cumplimiento regulatorio (Alemania/EU).
- Soporte SCORM, LTI.
- Multi-client (multi-tenant).

---

## 6. Frappe LMS (frappe/lms)

**Estrellas:** 3k | **Stack:** Vue + Python/Frappe Framework | **Licencia:** MIT

### Ventajas clave
- **Batch management:** gestión de lotes/cohortes de alumnos con fechas de inicio/fin.
- **Payments:** integración de pagos para cursos de pago.
- **Mentor sessions:** sesiones 1:1 entre mentor y alumno.
- **Quizzes:** evaluaciones integradas.
- **Assignments:** tareas con entregas y calificación.
- **Certificates:** emisión automática al completar.
- **Job board:** bolsa de trabajo relacionada con cursos.
- **Community:** foros y discusiones integradas en el framework Frappe.
- **Form builder:** creación de formularios sin código.
- **Reporting:** reportes configurables con Frappe Report Builder.

### Fortalezas técnicas
- Frappe Framework: ERP-like, muy orientado a "doctypes" (tablas definidas por UI).
- REST API auto-generada por cada doctype.
- Multi-tenant por diseño.

---

## 7. CourseLit (codelitdev/courselit)

**Estrellas:** 1.2k | **Stack:** React + Node.js | **Licencia:** MIT

### Ventajas clave
- **Monetization:** venta de cursos y descargas digitales.
- **Blog integrado:** CMS para contenido de marketing.
- **Branding:** sitio propio con dominio personalizado.
- **Email marketing:** newsletters integradas.
- **Community:** foros y comentarios.
- **Open source alternative to Teachable/Thinkific/Podia.**

---

## Cuadro comparativo resumido: Cursos AMX vs Competidores

| Característica | Cursos AMX | Moodle | Canvas | Open edX | Chamilo | ILIAS | Frappe |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Self-hosted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Video HLS nativo | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Constancias QR | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| White-label sin código | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Feature flags runtime | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SCORM/LTI/xAPI** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Tipos de pregunta 20+** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Peer review / Workshop** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Rúbricas / Outcomes** | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Portafolios** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **App móvil nativa** | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **AI generativa** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **SIS Integration** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **E-commerce / Pagos** | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **OnlyOffice / Colab docs** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Asistencia / Attendance** | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Cloud storage (S3/Azure/GCS)** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Proctoring / Anti-trampa** | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Analíticas de aprendizaje** | básico | avanzado | avanzado | avanzado | medio | medio | básico |
| **Badges / Gamificación** | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Cohorts / Batches** | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Learning paths secuenciales** | módulos | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Soporte multi-idioma** | es/en | 100+ | 50+ | 50+ | 60+ | 30+ | 20+ |
| **REST API documentada** | manual | limitada | Swagger | limitada | OpenAPI | limitada | auto |
| **App PWA** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Conclusión de la investigación

**Cursos AMX tiene ventajas únicas difíciles de replicar:**
1. Stack JavaScript moderno (Vue 3 + Vite + TS) — los demás son PHP o Python/Ruby monolitos.
2. Video HLS nativo con transcodificación — ningún otro lo tiene out-of-the-box.
3. White-label real sin tocar código — configurable por JSON.
4. Feature flags runtime — activación de módulos sin rebuild.
5. PWA instalable — offline-first, los demás dependen de apps nativas.

**Brechas significativas que deben cerrarse:**
1. **SCORM/LTI/xAPI** — interoperabilidad con contenido externo. Estándar de la industria.
2. **Gamificación (badges/puntos)** — engagement y motivación de alumnos.
3. **Peer review / Workshops** — evaluación entre pares, estándar en universidades.
4. **Rúbricas / Outcomes** — vinculación de tareas a competencias/resultados.
5. **Tipos de pregunta avanzados** — matching, ordering, hotspot, calculated, etc.
6. **App móvil nativa** o al menos PWA mejorada con notificaciones push.
7. **Analíticas de aprendizaje** — más allá de conteos básicos: riesgo de abandono, heatmaps.
8. **AI generativa** — generación de quizzes, resúmenes, asistente de estudios.
9. **Portafolios** — evidencia de aprendizaje acumulada.
10. **Proctoring básico** — bloqueo de pestañas, randomización de preguntas, límite de tiempo.
11. **Cohorts / Batches** — gestión de grupos/cohortes de alumnos.
12. **Asistencia** — tracking de participación en sesiones.
13. **SIS Integration** — importación masiva de alumnos desde CSV/API.
14. **Cloud storage** — S3/Azure como alternativa a Supabase Storage local.

**Oportunidades de diferenciación (que nadie tiene bien):**
- **Constancias con firma electrónica (FIEL/SAT)** — solo Cursos AMX puede hacerlo por ser de México.
- **Identidad gráfica institucional gob.mx** — integración con lineamientos de gobierno.
- **Offline-first completo** — cache de videos ya vistos, no solo assets.
