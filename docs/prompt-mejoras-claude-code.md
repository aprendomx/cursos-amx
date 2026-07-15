# Prompt para ejecutar en Claude Code — Plan de mejora Cursos AMX

> Copia todo el bloque de abajo y pégalo en Claude Code, en la raíz del repo `cursos-amx`.

---

```
Eres un ingeniero senior trabajando en este repositorio (Cursos AMX: Vue 3 + Vite +
Supabase self-hosted, Edge Functions Deno/TS, worker de video, PWA). Vas a ejecutar un
plan de mejora derivado de una revisión técnica. Trabaja de forma incremental y segura.

## Reglas de trabajo
- Antes de cambiar nada, lee el archivo o función implicada y confirma el hallazgo. Si el
  problema ya está resuelto o mi suposición es incorrecta, dilo y NO hagas el cambio.
- Un commit por tarea, con mensaje convencional (feat:/fix:/chore:/ci:/refactor:/test:).
- No rompas el build ni los tests existentes. Corre `npm run lint` y `npm run test:unit`
  tras cada tarea; si añades E2E/type-check, respétalos.
- Trabaja en una rama `mejora/revision-tecnica`. Muéstrame un plan por tarea antes de
  aplicarlo y pregúntame solo si hay ambigüedad de negocio.
- Actualiza CHANGELOG.md cuando corresponda.

## FASE 1 — Crítico (seguridad y consistencia)

1. Auditoría de Edge Functions con service_role. Revisa
   `supabase/functions/{bulk-invite,analytics,push-notify,video-analytics}/index.ts`
   y `supabase/config.toml`:
   - Confirma si `verify_jwt` está activo para cada una. Si no, actívalo o justifica la excepción.
   - En `bulk-invite` y `analytics`: valida que el llamador tenga rol admin/instructor
     (extrae el JWT del header Authorization, resuelve el usuario y verifica su rol en la BD)
     ANTES de usar el cliente service_role. Rechaza con 401/403 si no.
   - En `push-notify` y `video-analytics`: no confíes en `userId`/`user_id` del body;
     derívalo del usuario autenticado o valida que coincide con el del token.
   - Añade/expande tests en los `index.test.ts` para los casos sin auth y de rol insuficiente.

2. Sincroniza la versión: `package.json` está en 0.13.0 pero el CHANGELOG va en 0.16.0.
   Ponla en 0.16.0 (o la que corresponda al último tag) y verifica que no haya otras
   referencias de versión desincronizadas.

## FASE 2 — Corto plazo (endurecer CI y cobertura)

3. Amplía `.github/workflows/ci.yml`:
   - Job de type-check con `vue-tsc --noEmit` (o `npm run type-check` si lo creas).
   - Job de E2E con Playwright (`npm run test:e2e`) — cachea navegadores; si requiere
     servicios externos, márcalo como `continue-on-error` o móntalo con el global-setup existente.
   - Paso de `npm audit --audit-level=high` (no bloqueante al inicio).
   - Deja los jobs existentes (lint, unit, build) intactos.

4. Añade `.github/dependabot.yml` para npm (y submódulos en services/ si aplica), semanal.

5. Activa cobertura en Vitest: configura `coverage` en `vite.config.js` (provider v8),
   añade script `test:unit:cov`, y fija un umbral inicial realista (~60%) sin romper CI.
   Añade el job/paso correspondiente.

6. Activa CodeQL (workflow `github/codeql-action`) para JavaScript/TypeScript.

## FASE 3 — Mantenibilidad (hacer solo si Fases 1-2 pasan en verde)

7. Cobertura de seguridad de refactor: antes de tocar componentes grandes, añade tests
   unitarios a `src/components/AdminCourseEditor.vue` (1507 líneas) y `src/pages/CursoDetalle.vue`
   (951) cubriendo sus flujos principales.

8. Refactor incremental de `AdminCourseEditor.vue`: extrae subcomponentes y composables
   (no cambies comportamiento; los tests del paso 7 deben seguir verdes). Propón el desglose
   antes de aplicarlo.

9. Plan de migración a TypeScript: genera un informe de qué archivos `.js` de `src/services`
   y `src/composables` conviene migrar primero (los más usados/críticos) y migra 2-3 como
   ejemplo, manteniendo `vue-tsc` en verde.

## Entregable final
Al terminar cada fase, dame un resumen: qué cambió, qué hallazgos se descartaron por estar
ya resueltos, y el estado de lint/tests/type-check. No avances a la siguiente fase sin mi OK.
```

---

**Sugerencia de uso:** ejecuta fase por fase. Empieza pegando solo hasta el final de la FASE 1 si prefieres validar los cambios de seguridad antes de tocar el CI.
