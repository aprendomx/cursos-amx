# Guía de contribución

Guía para colaboradores de Cursos AMX.

## Interfaz: usa los tokens

Un componente nuevo **no escribe a mano un tamaño de texto, un radio ni una
sombra** si existe un token para ese propósito. Están en `src/assets/main.css` y
documentados en `THEMING.md` → «Sistema de tokens».

Tres reglas que el CI comprueba o que conviene no romper:

- **No suprimas el anillo de foco de forma inanulable.** `outline: none` a secas
  está bien —oculta el anillo con el ratón y lo conserva con el teclado—, pero
  `outline: none !important` rompe la regla base y hay una prueba que falla.
- **Ningún texto por debajo de 12 px.** El token más pequeño es `--text-xs`.
- **El color no puede ser el único portador de un estado.** Un error se indica
  con texto además de color, junto al campo afectado.

## Requisitos

- Node.js 20+
- npm 10+
- Docker y Docker Compose (para levantar Supabase self-hosted)

## Setup inicial

1. Clonar el repo
2. `npm install`
3. `cp .env.example .env` y configurar `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
4. `npm run dev` → `http://localhost:5173`

## Antes de commitear

```bash
npm run lint      # debe pasar sin errores
npm run test:unit # todas las pruebas deben pasar
```

Husky + lint-staged se encargan del formato automático, pero verifica que no introduces errores de ESLint.

## Estructura de commits

Usa [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user profile page
fix: correct progress bar calculation
style: fix indentation in AdminPage.vue
docs: update README with setup instructions
test: add unit tests for auth store
refactor: extract cache logic into composable
```

## Cómo agregar una nueva página

1. Crear el componente en `src/pages/NombrePage.vue`
2. Agregar la ruta en `src/router/index.js` (usar lazy import si es pesada)
3. Agregar el link de navegación en `TopNav.vue` o donde corresponda
4. Si necesita acceso restringido, agregar guard en `src/router/guards.js`

## Cómo agregar un servicio de Supabase

1. Crear funciones en `src/services/nuevoDominio.js`
2. Para lecturas frecuentes, envolver con `withCache` desde `@/composables/cache.js`
3. Para mutaciones, llamar `invalidateCache(/^patron:/)` después del éxito
4. Exportar desde `src/services/index.js`
5. Escribir tests en `src/services/__tests__/nuevoDominio.test.js`

## Feature flags

Los módulos LMS nuevos deben activarse vía `VITE_FEATURE_*` en `.env`:

```js
// src/lib/featureFlags.js
export const FEATURE_FOROS = import.meta.env.VITE_FEATURE_FOROS === 'true'
```

No commitear código inactivo sin feature flag.

## Video worker

Si modificas `services/video-worker/`, verifica que el build Docker sigue funcionando:

```bash
cd services/video-worker
docker build -t video-worker:test .
```

Y lee `services/video-worker/README.md` para entender el flujo de transcodificación.
