# Corte del embudo de portada — 2026-09-10

Lectura de `v_embudo_portada` hecha el 2026-09-10 por decisión explícita de no
esperar al 2026-09-22 (dos semanas de la portada nueva). Cubre TODO lo
registrado desde el día 0 de la instrumentación (2026-08-21).

## Los números completos

| semana     | hero_cta | curso_click | detalle_visto | reg_iniciado | reg_completado | leccion_probada | reg_desde_leccion |
| ---------- | -------- | ----------- | ------------- | ------------ | -------------- | --------------- | ----------------- |
| 2026-08-17 | 1        | 0           | 0             | 19           | 0              | 0               | 0                 |
| 2026-08-24 | 0        | 0           | 1             | 0            | 0              | 0               | 0                 |
| 2026-08-31 | 2        | 0           | 1             | 0            | 0              | 0               | 0                 |
| 2026-09-07 | 0        | 1           | 0             | 0            | 0              | 1               | 0                 |

Contexto adicional: `registro_completado` = 0 en todo el periodo; perfiles
nuevos desde el 2026-08-20: 1 (creado el propio 08-20, antes de la
instrumentación). Los dos eventos del 2026-09-09 (`portada_curso_click` y
`leccion_probada`) son de la verificación del despliegue de la fase 2, no de
una visita real.

## Qué dice esto de verdad

1. **No hay tráfico.** Fuera del día 0, la portada registra 1–2 eventos por
   semana. No hay embudo que leer porque no hay personas entrando: el
   problema por delante no es la conversión de la portada, es la llegada.
2. **La anomalía del día 0**: 19 `registro_iniciado` de 19 visitas distintas
   el 2026-08-21, con cero completados y cero perfiles nuevos. No parece
   humano (¿monitores, rastreadores sobre `/#/registro`, o la propia
   verificación del despliegue?). Se anota para no leerlo jamás como demanda
   real.
3. **La comparación antes/después (5.3) es inviable con estos datos**, y no
   solo porque la ventana se partió dos veces (rediseño 08-26, portada nueva
   09-08): con este volumen, ninguna ventana de dos semanas distinguiría nada.

## Decisión (tarea 5.3)

- **La fase 2 se queda desplegada.** Ya estaba en vivo por decisión del
  2026-09-09; nada en estos datos pide apagarla, y la vuelta atrás sigue
  siendo barata (restaurar `requiresAuth` y el rechazo anónimo).
- **El embudo no aporta señal para ajustar nada todavía.** Los instrumentos
  que sí pueden aportar: (a) las 5 sesiones cualitativas (5.2), que no
  dependen del tráfico, y (b) llevar visitas a la portada — difusión,
  convocatoria institucional — sin lo cual ninguna métrica de conversión va a
  significar nada.
- Próxima lectura útil del embudo: cuando exista una fuente de visitas real,
  no por calendario.
