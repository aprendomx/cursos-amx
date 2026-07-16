# Plan de migración a TypeScript — `src/services` y `src/composables`

> Generado como parte de la revisión técnica (Fase 3). Estado: `vue-tsc --noEmit`
> corre en verde y es bloqueante en CI, con `allowJs: true` y `strict: false`,
> así que la migración puede ser gradual archivo por archivo.

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
| 6         | `services/aiService.js`               | 4            | 92     | pendiente  |
| 7         | `services/evaluaciones.js`            | 3            | 82     | pendiente  |
| 8         | `services/videos.js`                  | 3            | 119    | pendiente  |
| 9         | `services/rubricas.js`                | 3            | 66     | pendiente  |
| 10        | `composables/useCourseEditorModel.js` | 3            | ~197   | pendiente  |
| 11        | `composables/useNotificaciones.js`    | 3            | 124    | pendiente  |

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

1. Migrar `aiService.js`, `evaluaciones.js`, `videos.js` y `rubricas.js`
   (siguientes por fan-in).
2. Generar tipos de BD reales (`supabase gen types typescript`) y sustituir
   los casts manuales.
3. Al terminar `src/services`, subir `checkJs: true` y después `strict: true`
   por etapas (`noImplicitAny` primero).
