# Plan de migración a TypeScript — `src/services` y `src/composables`

> **Estado a día de hoy:** 34 archivos `.ts`, 69 `.js` y 116 `.vue`
> (los `.vue` siguen todos en JavaScript). `vue-tsc --noEmit` corre en verde y
> es bloqueante en CI. Desde la revisión de accesibilidad y calidad, **ESLint
> también cubre los `.ts`** (antes la configuración solo declaraba
> `files: ['**/*.{js,vue}']`, así que el código tipado no se analizaba: al
> cubrirlo aparecieron 12 errores de variables e imports sin usar que llevaban
> tiempo ahí, uno de ellos un `computed` que se calculaba y no se devolvía).

## Rumbo decidido

**Congelar el avance por archivos sueltos; migrar solo lo que se toque.**

El razonamiento: con 34 de 103 archivos no-Vue migrados y cero
`.vue`, el avance parcial cuesta —dos convenciones conviviendo, dos formas de
declarar props— sin haber rendido todavía, porque la mayor superficie de error
está en las plantillas, que siguen sin tipos.

En concreto:

- **No** abrir una tarea de "migrar N archivos" sin una razón funcional.
- **Sí** migrar un archivo cuando ya se va a modificar por otro motivo.
- **Sí** escribir en TypeScript todo lo nuevo (`src/lib/`, `src/services/`).
- La migración de los `.vue` es una decisión aparte: exige `vue-tsc` en modo
  estricto sobre plantillas y es un proyecto en sí mismo, no un goteo.

`@typescript-eslint/no-explicit-any` está en **aviso**, no en error: el código
que envuelve respuestas de supabase-js vive de `any` y ponerlo en error
bloquearía el CI sin mejorar nada hoy. Cuando el número de avisos baje lo
bastante, súbelo a error para que no vuelva a crecer.

## Criterio de priorización

1. **Fan-in** (cuántos archivos lo importan): un error de contrato aquí se
   propaga a más pantallas.
2. **Superficie de datos**: los servicios que mapean filas de PostgREST son
   donde los tipos aportan más (las vistas/joins embebidos son fáciles de
   romper en refactors).
3. **Tamaño/complejidad**: archivos chicos primero para asentar patrones.

## Ranking (importadores × líneas)

| Prioridad | Archivo                               | Importadores | Líneas | Estado     |
| --------- | ------------------------------------- | ------------ | ------ | ---------- |
| 1         | `services/instructores.js`            | 6            | 175    | ✅ migrado |
| 2         | `services/tiempo.js`                  | 5            | 34     | ✅ migrado |
| 3         | `services/analytics.js`               | 5            | 121    | ✅ migrado |
| 4         | `services/entregas.js`                | 5            | 288    | ✅ migrado |
| 5         | `services/sesionesVirtuales.js`       | 5            | 207    | ✅ migrado |
| 6         | `services/aiService.js`               | 4            | 92     | ✅ migrado |
| 7         | `services/evaluaciones.js`            | 3            | 82     | ✅ migrado |
| 8         | `services/videos.js`                  | 3            | 119    | ✅ migrado |
| 9         | `services/rubricas.js`                | 3            | 66     | ✅ migrado |
| 10        | `composables/useCourseEditorModel.js` | 3            | ~197   | ✅ migrado |
| 11        | `composables/useNotificaciones.js`    | 3            | 124    | ✅ migrado |

Fuera del alcance de esta lista pero **candidato prioritario transversal**:
`src/lib/sbRest.js` — ✅ migrado con genéricos (`sbSelect<T>(path):
Promise<SbSelectResult<T>>`, `sbInsert<T>`, `sbPatch<T>`, `sbRpc<T>`); los
consumidores TS pueden parametrizar el tipo de fila y los JS siguen igual.

## Patrones establecidos (ver los 3 migrados)

- **Renombrar con `git mv`** (conserva historial) y actualizar importadores a
  la forma **sin extensión** (`@/services/tiempo`) — Vite y `moduleResolution:
bundler` la resuelven; los `vi.mock` por ruta siguen funcionando.
- **Reutilizar `src/types/database.ts`** con `Pick<>` para proyecciones
  (`PerfilInstructor`, `CursoInstructor`) en vez de duplicar interfaces.
- **Relaciones embebidas to-one**: el cliente supabase sin tipos generados
  infiere arrays donde PostgREST devuelve objeto; castear el resultado
  (`as unknown as Fila[]`) con un comentario, no pelear con la inferencia.
- **Uniones para enums de dominio** (`AccionModeracion`) en lugar de `string`.
- Vistas sin tipo generado → `Record<string, unknown>[]` como tipo honesto
  temporal, no `any[]`.

## Siguientes pasos sugeridos

El ranking está completo (11/11). Siguientes etapas:

1. Generar tipos de BD reales (`supabase gen types typescript`) y sustituir
   los casts manuales.
2. Migrar el resto de `src/services` (fan-in bajo) y de `src/composables`
   oportunistamente al tocarlos.
3. Al terminar `src/services`, subir `checkJs: true` y después `strict: true`
   por etapas (`noImplicitAny` primero).
