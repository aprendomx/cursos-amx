## 1. Instrumentación y línea base (antes de tocar nada)

- [x] 1.1 Migración: tabla `portada_eventos` (sin lectura anónima) y RPC `registrar_evento_portada` con lista blanca de eventos y límite por IP, el mismo patrón que `verificar_constancia` (068). — Sustituye a «aceptarlos en la función analytics»: esa función es de lecturas autenticadas y los eventos de portada son de visitantes anónimos.
- [x] 1.2 Composable de emisión (`portada_hero_cta`, `portada_curso_click` con posición, `curso_detalle_visto`, `registro_iniciado`, `registro_completado`) llamando a la RPC, sin datos personales, y que NUNCA rompa la página si falla.
- [x] 1.3 Vista `v_embudo_portada` (solo admin) que responda «¿dónde se cae la gente?»: hero → curso → detalle → registro, por semana. Con prueba en el banco de migraciones.
- [x] 1.4 Desplegar SOLO esto y anotar la fecha: aquí empieza la línea base de dos semanas. — **Desplegado el 2026-08-21 (20:22 UTC), día 0 de la línea base.** Verificado en vivo: la RPC responde 204 a un anónimo real y el evento queda en la tabla. La portada nueva no puede desplegarse antes del 2026-09-04.

## 2. Resultados de aprendizaje como dato del curso

- [x] 2.1 Campo de resultados en `cursos` (migración), editable desde el panel junto al resto del curso. — `008_cursos_resultados.sql`: `resultados_aprendizaje text[]` nullable (check ≤ 8); el editor lo captura en el paso Básico y lo persiste como array limpio.
- [x] 2.2 El editor del panel lo pide al editar, sin bloquear la publicación si falta. — Texto de ayuda en Básico + aviso no bloqueante en Revisar; vacío se guarda como `null` y la tarjeta degrada a solo metadatos.
- [x] 2.3 Sembrar los resultados del curso tutorial, para que la portada de ejemplo no salga vacía. — UPDATE idempotente en la misma 008 sobre el UUID fijo del tutorial.

## 3. Portada reequilibrada

- [x] 3.1 Hero orientado a resultado, con la constancia como respaldo en el antetítulo. Cambia también el `theme.config.example` y se documenta en THEMING.md. — Titular «Aprende lo que vas a aplicar en tu trabajo», constancia al antetítulo; reparto documentado en THEMING.md §hero. También copiado a `theme.config.local.js` (fuera de git), que traía los textos viejos calcados.
- [x] 3.2 Tarjetas de curso con «al terminar sabrás…», degradando con dignidad si el campo está vacío. — La portada pide `resultados_aprendizaje` y el bloque solo aparece si hay datos; sin ellos la tarjeta queda como estaba.
- [x] 3.3 Fundir `LandingComoConstancia` y `LandingConstancia` en una sección de cierre que conserve los cuatro pasos como subsección compacta. — Fusión en `LandingConstancia`; la clave `como-constancia` queda como alias (documentado en THEMING.md, sin subir schemaVersion porque ninguna clave deja de aceptarse).
- [x] 3.4 Prueba que fije el orden: cursos antes que constancia, y una sola sección de constancia. — `LandingPage.test.js`: sección única aunque el tema declare ambas claves, catálogo antes que constancia, cuatro pasos presentes, y resultados solo cuando el curso los trae.
- [x] 3.5 Revisión de la portada nueva con `e2e/anchuras.spec.js` y contraste en ambos modos. — 9/9 en verde sobre build fresca (4 anchuras × claro/oscuro + movimiento reducido); capturas revisadas en ambos modos con el tema de la instalación.
- [x] 3.6 No desplegar antes de que la línea base cumpla dos semanas; anotar la fecha del cambio para la comparación. — **Desplegado el 2026-09-08 (~22:45 UTC, PR #53, merge `4bace32`)**, por decisión explícita de no esperar más. Backend con `deploy.sh` (respaldo `backup-20260908-223949.sql`, migración 008 aplicada y verificada, tutorial sembrado con 4 resultados) + frontend construido y publicado; verificado contra el sitio servido: hero nuevo, «Al terminar sabrás» en la tarjeta y una sola sección de constancia. **Ojo para 5.1/5.3:** la línea base solo tuvo 5 días limpios (2026-08-21 → 2026-08-26); el rediseño hábito-recompensa (PR #44) partió la ventana, así que la comparación antes/después queda comprometida y pesa más la prueba cualitativa.

## 4. Primera lección abierta (fase 2)

- [ ] 4.1 `hls-playlist-url` y `documento-url` aceptan peticiones anónimas SOLO si la lección es la primera de su curso y el curso está publicado, verificado con service role contra la base. Todo lo demás sigue exigiendo sesión.
- [ ] 4.2 Pruebas de las funciones: primera lección de curso publicado pasa; lección posterior, curso sin publicar y petición sin lección rechazan.
- [ ] 4.3 El enrutador permite `player` sin sesión solo en ese caso; el reproductor entra en modo invitado: sin progreso, sin notas, sin chat.
- [ ] 4.4 El modo invitado invita a registrarse al intentar avanzar, guardar o evaluar, sin perder el punto en el que estaba.
- [ ] 4.5 «Pruébala ahora» en la tarjeta de curso de la portada, enlazando a la primera lección.
- [ ] 4.6 Eventos `leccion_probada` y `registro_desde_leccion`, con su prueba.
- [ ] 4.7 Verificar en vivo tras desplegar: sin sesión, la primera lección reproduce; la segunda rechaza desde el servidor aunque se conozca el identificador.

## 5. Validación (parte fuera del repositorio)

- [ ] 5.1 Leer la línea base a las dos semanas y guardar el corte en el change.
- [ ] 5.2 Cinco sesiones con personas del público real: tarea «encuentra un curso que te sirva y empieza». Guion, notas y hallazgos al change.
- [ ] 5.3 Comparar las ventanas antes/después (mismas semanas de duración) y decidir con eso si la fase 2 se despliega, se ajusta o se descarta.
- [ ] 5.4 Ajustar el texto de las preguntas frecuentes si el recorrido cambió, y la prueba de promesas del FAQ si aplica.
