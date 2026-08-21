## 1. Instrumentación y línea base (antes de tocar nada)

- [x] 1.1 Migración: tabla `portada_eventos` (sin lectura anónima) y RPC `registrar_evento_portada` con lista blanca de eventos y límite por IP, el mismo patrón que `verificar_constancia` (068). — Sustituye a «aceptarlos en la función analytics»: esa función es de lecturas autenticadas y los eventos de portada son de visitantes anónimos.
- [x] 1.2 Composable de emisión (`portada_hero_cta`, `portada_curso_click` con posición, `curso_detalle_visto`, `registro_iniciado`, `registro_completado`) llamando a la RPC, sin datos personales, y que NUNCA rompa la página si falla.
- [x] 1.3 Vista `v_embudo_portada` (solo admin) que responda «¿dónde se cae la gente?»: hero → curso → detalle → registro, por semana. Con prueba en el banco de migraciones.
- [ ] 1.4 Desplegar SOLO esto y anotar la fecha: aquí empieza la línea base de dos semanas.

## 2. Resultados de aprendizaje como dato del curso

- [ ] 2.1 Campo de resultados en `cursos` (migración), editable desde el panel junto al resto del curso.
- [ ] 2.2 El editor del panel lo pide al editar, sin bloquear la publicación si falta.
- [ ] 2.3 Sembrar los resultados del curso tutorial, para que la portada de ejemplo no salga vacía.

## 3. Portada reequilibrada

- [ ] 3.1 Hero orientado a resultado, con la constancia como respaldo en el antetítulo. Cambia también el `theme.config.example` y se documenta en THEMING.md.
- [ ] 3.2 Tarjetas de curso con «al terminar sabrás…», degradando con dignidad si el campo está vacío.
- [ ] 3.3 Fundir `LandingComoConstancia` y `LandingConstancia` en una sección de cierre que conserve los cuatro pasos como subsección compacta.
- [ ] 3.4 Prueba que fije el orden: cursos antes que constancia, y una sola sección de constancia.
- [ ] 3.5 Revisión de la portada nueva con `e2e/anchuras.spec.js` y contraste en ambos modos.
- [ ] 3.6 No desplegar antes de que la línea base cumpla dos semanas; anotar la fecha del cambio para la comparación.

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
