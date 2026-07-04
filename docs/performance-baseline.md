# Performance Baseline

Medidas de rendimiento de la aplicación Cursos AMX.

## Metodología

- Entorno: Playwright (Chromium headless) contra build de producción servido con `vite preview`
- Métricas: `domContentLoaded`, `loadComplete`, tiempo total de carga
- FCP/LCP no se miden directamente en entorno headless; requieren navegador real con rendering

## Resultados (Fase 5)

| Página  | domContentLoaded | loadComplete | Total  |
| ------- | ---------------- | ------------ | ------ |
| Landing | ~187ms           | ~188ms       | ~628ms |
| Auth    | ~185ms           | ~186ms       | ~626ms |

## Budgets

- `domContentLoaded` < 2.5s
- `loadComplete` < 3.5s
- Total < 4s

## Mejoras aplicadas en Fase 5

1. **Caching SWR**: `withCache` en servicios de progreso y cursos reduce requests repetidos
2. **PWA + Service Worker**: Cache de assets estáticos y fuentes de Google
3. **Chunking manual**: Separación de vendor, db, video y utils
4. **Rate limiting**: Protección de Edge Functions contra abuso

## Próximos pasos

- Medir FCP/LCP con Lighthouse en CI
- Implementar lazy loading de imágenes y componentes
- Revisar bundle size de `vendor` (>1MB)
