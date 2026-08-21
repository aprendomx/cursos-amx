## Context

Ver `proposal.md — Why`. Lo que condiciona el diseño:

1. **Los datos ya son públicos; la puerta es del frontend.** `lecciones`,
   `videos` y `leccion_subtitulos` tienen lectura anónima en RLS desde las
   migraciones 001/003/065. Lo que sí exige sesión son las funciones edge que
   firman URLs de contenido (`hls-playlist-url`, `documento-url`) — y eso es
   correcto: son la única barrera real.
2. **La analítica montada es de LECTURA, no de ingesta.** La función
   `analytics` sirve informes autenticados y la única tabla de eventos
   (`video_eventos`) exige sesión. Los eventos de portada vienen de visitantes
   anónimos, así que el canal de ingesta hay que construirlo — corrigiendo la
   premisa con la que se escribió la primera versión de este diseño.
3. **El tráfico es bajo.** Un A/B no tiene potencia estadística; cualquier plan
   de validación que lo proponga se está engañando.
4. La portada es configurable por instalación (`theme.config`, secciones
   activables): los cambios deben funcionar para cualquier tema, no solo el de
   ejemplo.

## Goals / Non-Goals

**Goals:**

- Que el reequilibrio sea medible: instrumentar ANTES de cambiar, para tener
  línea base.
- Abrir exactamente la primera lección de cursos publicados, y nada más, con la
  barrera en el servidor.
- Que el modo invitado del reproductor invite a registrarse sin perder el sitio.

**Non-Goals:**

- Pruebas A/B: sin tráfico no hay potencia; se usa antes/después + cualitativo.
- Rediseñar el detalle de curso o el reproductor más allá del modo invitado.
- Testimonios y prueba social: no hay datos aún; cuando los haya, es otra
  iteración con su propia evidencia.
- Tocar el flujo de constancias en sí — solo su lugar en la portada.

## Decisions

### 1. Instrumentar primero, cambiar después

Los eventos se despliegan solos y corren dos semanas antes del rediseño. Sin
línea base, el «después» no se puede comparar con nada y la validación sería
teatro.

La ingesta sigue el patrón que el repositorio ya usa para su otra superficie
pública anónima, la verificación de constancias (migración 068): una RPC
`registrar_evento_portada` con SECURITY DEFINER, lista blanca de nombres de
evento, límite por IP vía `rate_limit_check`, e inserción en una tabla
`portada_eventos` que el rol anónimo no puede leer. La lectura es solo de
administradores, a través de una vista de embudo por semana.

_Alternativa descartada:_ una función edge de ingesta. Rompería la regla que la
verificación del despliegue ya vigila —«toda función exige autenticación»— y
obligaría a excepcionarla; la RPC con límite es el camino que la instalación ya
recorrió.

Eventos mínimos, sin datos personales: `portada_hero_cta`,
`portada_curso_click` (con posición), `curso_detalle_visto`,
`registro_iniciado`, `registro_completado`, y en fase 2 `leccion_probada` y
`registro_desde_leccion`. Con eso se responde la única pregunta que importa:
¿dónde se cae la gente?

### 2. El orden nuevo de la portada

```
Hero (resultado + buscar)         «Aprende X. Constancia oficial al terminar.»
Cursos (con resultados)           «Al terminar sabrás…» + probar la 1a lección
Niveles                           (igual que hoy)
Constancia (UNA sección)          cómo se obtiene + validez verificable, fusionadas
FAQ + pie                         (igual que hoy)
```

_Alternativa descartada:_ quitar la constancia del hero por completo. Es el
diferenciador; se degrada a respaldo, no se elimina.

### 3. Los resultados de aprendizaje son datos, no adorno

`cursos` gana un campo de resultados (qué sabrás hacer), editable desde el
panel como el resto del curso. La tarjeta lo muestra. Sin el dato, la tarjeta
se ve como hoy: ninguna instalación se rompe por no haberlo rellenado.

_Alternativa descartada:_ derivarlos del temario con IA. Generaría texto
genérico justo donde hace falta voz institucional.

### 4. La primera lección abierta: barrera en el servidor, no en el enrutador

El enrutador deja de exigir sesión para `player` cuando la lección pedida es la
primera de un curso publicado; el reproductor entra en modo invitado (sin
progreso, sin notas, sin chat). Pero la barrera REAL está en las funciones que
firman URLs: `hls-playlist-url` acepta peticiones anónimas SOLO si la lección
pedida es la primera de su curso y el curso está publicado — verificado contra
la base con el service role, no contra lo que diga el cliente.

_Alternativa descartada:_ quitar el `requiresAuth` y confiar en que la interfaz
no ofrezca más. Un identificador adivinado bastaría para ver cualquier lección:
la RLS de lecciones ya es pública y la única puerta seria son las URLs
firmadas.

### 5. Validación con personas: pequeña y honesta

Cinco sesiones con personas del público real (servidoras y servidores
públicos), tarea única: «encuentra un curso que te sirva y empieza a
aprender». Se observa dónde se atascan y qué papel juega la constancia en su
decisión. Cinco no es estadística: es suficiente para detectar los problemas
gruesos de comprensión, que es lo que se busca.

## Risks / Trade-offs

- **[Abrir URLs firmadas de más]** → La comprobación vive en la función edge
  con service role; las pruebas del banco de funciones cubren lección no-primera
  y curso no publicado. Es el requisito «abrir la primera lección no abre nada
  más».
- **[Métricas que nadie mira]** → El plan fija fechas de lectura: línea base a
  las 2 semanas, comparación a las 4 tras el despliegue. Si nadie las lee, la
  fase 2 no se decide.
- **[El campo de resultados queda vacío]** → La tarjeta degrada con dignidad y
  el panel lo pide al editar un curso. No bloquea publicar.
- **[La fusión de secciones pierde el paso a paso]** → La sección fusionada
  conserva los cuatro pasos como subsección compacta; lo que se elimina es la
  duplicación, no el contenido.

## Migration Plan

1. Fase 1a: eventos + línea base (despliegue solo de frontend).
2. Fase 1b: portada reequilibrada tras dos semanas de línea base.
3. Fase 2: primera lección abierta — cambia funciones edge, así que su
   despliegue incluye reiniciar el runtime de funciones.
4. Vuelta atrás: cada fase es reversible por sí sola; la 2 se apaga
   restaurando el `requiresAuth` y el rechazo anónimo de las funciones.

## Open Questions

- Las fechas concretas de las 5 sesiones cualitativas y quién las convoca:
  fuera del repositorio, no bloquea ninguna tarea de código.
