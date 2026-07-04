# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) · Versionado: SemVer.

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
