# Cursos AMX

LMS open source (AGPL-3.0) para instituciones: cursos en video HLS, evaluaciones,
foros, constancias en PDF con verificación pública por QR, y una capa de tema
que permite aplicar tu identidad gráfica sin tocar el código.

## Características

- Vue 3 + Vite, PWA instalable
- Backend Supabase self-hosted (Postgres, Auth, Storage, Edge Functions)
- Video HLS con worker de transcodificación (ffmpeg) y subida reanudable (tus)
- Constancias PDF con folio y verificación pública por QR
- Módulos activables por feature flags: instructor, foros, chat, entregas, aulas, evaluaciones
- Personalización completa vía `theme/theme.config.js` (ver [THEMING.md](THEMING.md))

## Inicio rápido (desarrollo)

1. `npm install`
2. `cp .env.example .env` y configura `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
3. `npm run dev`

## Instalación completa (producción self-hosted)

Ver `docs/MANUAL_ACTUALIZACION.md` y `docker/` (stack Supabase + video-worker).

## Personalización de identidad gráfica

Ver [THEMING.md](THEMING.md).

## Estructura del repo

```
src/
  pages/        Vistas (LandingPage, CursoDetalle, PlayerPage, AdminPage, etc.)
  components/   Componentes compartidos (TopNav, AppLogo, LandingHero, LandingFooter, …)
  composables/  Lógica reutilizable (useHlsPlayer, useVideoStatus, useCachedFetch)
  stores/       Pinia stores (auth, ui)
  services/     Acceso a Supabase por dominio (cursos, progreso, videos, …)
  router/       Vue Router config + guards
  lib/          Cliente Supabase y helpers (theme.js, featureFlags.js)
  assets/       CSS global

theme/
  theme.config.js   Única fuente de identidad gráfica
  sections/         Secciones custom de landing

supabase/
  migrations/   Esquema versionado en SQL (001–029)
  functions/    Edge Functions Deno (hls-playlist, hls-playlist-url, documento-url)

services/
  video-worker/ Sidecar Docker (Node 20 + ffmpeg) que procesa HLS

docker/
  docker-compose.yml    Stack completo Supabase self-hosted + video-worker
  overrides/            Overrides opcionales (nginx, caddy, pg17, MinIO, RustFS)

scripts/
  migrate.sh    Aplica migraciones en orden, transaccional, con registro
  deploy.sh     Actualización del servidor en un paso (pull + migrar + funciones)

docs/
  MANUAL_ACTUALIZACION.md  Guía para actualizar un despliegue existente
  architecture.md          Arquitectura del frontend
```

## Testing

```bash
npm run test:unit           # Vitest + Vue Test Utils (jsdom)
npm run test:unit:watch     # modo watch
npm run test:e2e            # Playwright (Chromium)
```

## Lint y formato

```bash
npm run lint        # ESLint 9 flat config
npm run lint:fix    # ESLint con --fix
npm run format      # Prettier en todo el repo
```

El proyecto usa **husky + lint-staged**: cada commit ejecuta `eslint --fix` y
`prettier --write` automáticamente.

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
