## Why

La portada invierte los papeles de sus dos protagonistas. Dice «constancia» 65
veces: el hero la promete en el antetítulo, la banda de estadísticas cuenta
constancias emitidas, y dos secciones enteras —427 líneas entre
`LandingComoConstancia` y `LandingConstancia`— explican cómo obtenerla y cómo
verificarla. Los cursos, mientras tanto, se presentan con metadatos: título,
nivel, duración, cuántos módulos, cuántas lecciones. Nada que se pueda probar
ni que diga qué sabrás hacer al terminar.

La constancia es el diferenciador real frente a las plataformas comerciales
—verificable por QR, con validez institucional— y no hay que esconderla. Lo que
hay que corregir es el reparto: **el curso vende, la constancia cierra**. Nadie
quiere una constancia de un curso que no le interesa; el orden actual asume lo
contrario.

Y hay una ventaja estructural sin usar: las plataformas comerciales no pueden
abrir su contenido porque su modelo de negocio es el muro de pago. Una
plataforma pública sí puede dejar que cualquiera pruebe la primera lección en
un clic, sin registrarse. La base de datos ya lo permite —lecciones, videos y
subtítulos son legibles públicamente—; la puerta está solo en el enrutador.

Este cambio se valida, no se asume: con el tráfico actual no hay potencia para
un A/B, así que el plan es instrumentación, línea base, prueba cualitativa con
personas del público real y comparación de ventanas antes/después.

## What Changes

**Fase 1 — medir y reequilibrar**

- Instrumentar la portada con la función `analytics` existente: clics del hero,
  llegadas al detalle de curso, registros iniciados y completados.
- Hero orientado a resultado: qué vas a saber hacer, con la constancia
  verificable como respaldo en el antetítulo, no como titular.
- Tarjetas de curso que vendan: resultados de aprendizaje («al terminar
  sabrás…») además de los metadatos.
- Fundir las dos secciones de constancia en una sola, como cierre de la página.
- Prueba cualitativa con 5 personas del público objetivo y comparación de
  ventanas de dos semanas antes/después.

**Fase 2 — probar antes de registrarse**

- La primera lección de cada curso publicado se puede ver sin sesión.
- El registro es la puerta natural para lo demás: guardar avance, evaluaciones,
  constancia.
- El acceso anónimo a los datos ya existe; el trabajo real es el enrutador, el
  reproductor en modo invitado, y las URLs firmadas de vídeo (las funciones
  edge hoy exigen sesión).

## Capabilities

### New Capabilities

- `portada/conversion`: lo que la portada debe comunicar y en qué orden, qué se
  mide de ella, y qué puede hacer una persona sin registrarse — incluida la
  primera lección abierta y sus límites.

### Modified Capabilities

Ninguna. `interfaz/accesibilidad` e `interfaz/sistema-visual` siguen rigiendo
las pantallas que se toquen, sin cambios en sus requisitos.

## Impact

- `theme.config` (hero), `LandingHero`, `LandingCursoBloque`,
  `LandingComoConstancia` + `LandingConstancia` (fusión), `LandingPage`.
- `useAnalytics` / función `analytics` para los eventos nuevos.
- Fase 2: `router` (quitar `requiresAuth` condicionado), `PlayerPage` en modo
  invitado, funciones `hls-playlist-url`/`documento-url` (acceso anónimo SOLO a
  la primera lección de cursos publicados — hoy exigen sesión y eso está bien
  para el resto).
- Riesgo principal: abrir las URLs firmadas más de lo debido. El diseño acota
  exactamente qué se abre.
- La validación con personas no es código y depende de calendario ajeno; las
  tareas la dejan explícita como trabajo fuera del repositorio.
