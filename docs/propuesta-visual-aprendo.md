# Propuesta visual — Cursos AMX (dirección «hábito con recompensa»)

> Documento de diseño + prompt de ejecución para Claude Code.
> Maqueta de referencia: `docs/propuesta/Aprendo 1b — Flujo completo.dc.html` (10 pantallas móviles)
> y `docs/propuesta/Propuesta Cursos AMX.dc.html` (las 3 direcciones exploradas).
> Colocar este archivo en `docs/propuesta-visual-aprendo.md` del repo `cursos-amx`.

---

## 1. El problema

La plataforma funciona, pero se lee como un panel administrativo genérico: nada
en pantalla indica que se trata de aprendizaje, y nada empuja a volver mañana.
El sistema de tokens de `src/assets/main.css` ya resolvió la consistencia
(tamaños, radios, sombras, contraste); lo que falta es **carácter** y una
conducta clara que la interfaz premie.

## 2. La dirección elegida

**Papel cálido, tinta gruesa, recompensa visible.**

- El lienzo deja de ser blanco-azulado y pasa a papel cálido; las superficies se
  apoyan en él con **contorno de 2 px de tinta** y **sombra dura desplazada**
  (no difusa). Eso da la textura de cuaderno y hace que lo tocable se distinga
  de lo informativo sin recurrir al color.
- **Una sola acción de acento por pantalla**, siempre la misma: «seguir
  aprendiendo». El acento nunca decora.
- **Cada curso tiene su pastel de categoría** (red, datos, seguridad, personas)
  y su letra inicial como portada: el catálogo se reconoce por color antes que
  por texto, sin depender de ilustración por curso.
- La **meta del día y la racha** encabezan la pantalla de entrada; el catálogo
  queda debajo. Las horas y el XP son soporte, no titular.
- Tipografía: display de peso alto y ancho estrecho para títulos, sans humanista
  para interfaz. La display actual (Fraunces) es editorial y elegante, pero
  arrastra el tono «documento oficial» — justo lo que queremos romper.

## 3. Traducción al sistema de tokens

Nada de esto se implementa con hex sueltos en componentes. Todo entra por el
sistema existente, respetando el contrato de `THEMING.md` (incluida la **regla
del par**: un fondo que sigue al tema no lleva tinta clavada, ni al revés).

### 3.1 Lo que va en el tema de la institución (`theme.config.local.js`)

| Clave                | Valor propuesto                                | Nota                                                                |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `colors.primary`     | `#F04E23`                                      | Acento único de acción. `theme.js` deriva `--primary-fg` para 4.5:1 |
| `colors.primaryDark` | `#C43C17`                                      |                                                                     |
| `colors.primarySoft` | `#FFD9CC`                                      |                                                                     |
| `colors.accent`      | `#B8892B`                                      | Reconocimiento; conserva relación con `--oro`                       |
| `colors.accentSoft`  | `#FFE9B8`                                      | Fondo de recompensa (+XP, pistas)                                   |
| `colors.ink`         | `#1A1714`                                      | Tinta cálida, no negra                                              |
| `colors.danger`      | mantener `#b3261e`                             | Debe seguir distinguiéndose del acento naranja                      |
| `fonts.display`      | `'Bricolage Grotesque', system-ui, sans-serif` | Cargar en `index.html`                                              |
| `fonts.ui`           | `'Manrope', system-ui, sans-serif`             | Cargar en `index.html`                                              |

Dos comprobaciones obligadas al cambiar el primario a naranja: que `--primary-fg`
siga dando 4.5:1 sobre papel y que `danger` no se confunda con él (§ _Color de
error_ de `THEMING.md`).

### 3.2 Tokens nuevos en `src/assets/main.css`

Se añaden a la escala existente; ninguno sustituye a los actuales.

```
/* Papel cálido */
--lienzo: #fff7ee;      /* claro; en [data-theme='dark'] se mantiene el actual */
--paper:  #fffdf9;
--paper-3: #efe2d2;

/* Contorno de tinta */
--borde-ancho: 2px;
--borde-tinta: var(--ink);

/* Elevación dura — sombra desplazada, sin difuminado.
   Convive con --elev-*: las difusas siguen sirviendo para menús y diálogos. */
--elev-dura-1: 3px 3px 0 var(--borde-tinta);
--elev-dura-2: 4px 4px 0 var(--borde-tinta);

/* Pasteles de categoría. Fondo fijo + tinta fija: no siguen al modo,
   igual que los tokens --sobre-*. */
--cat-red: #cfe4ff;      --sobre-cat-red: #1a1714;
--cat-datos: #d9f0c7;    --sobre-cat-datos: #1a1714;
--cat-seguridad: #f3d9ff;--sobre-cat-seguridad: #1a1714;
--cat-personas: #ffd9cc; --sobre-cat-personas: #1a1714;
```

En modo oscuro la sombra dura pierde sentido sobre fondo oscuro: ahí
`--elev-dura-*` se reduce a `none` y el contorno de 2 px queda como única señal
de superficie (mismo criterio que ya usa el repo para `--elev-*`).

`src/lib/__tests__/temaPares.test.js` debe seguir en verde: los pasteles se
declaran con su tinta explícita justamente para no romper la regla del par.

### 3.3 Lo que NO cambia

- La escala de texto, radios, pesos e interlineados. Piso de 12 px intacto.
- `ConstanciaPage` y la hoja de vista previa: son documento impreso, no tema.
- El letterbox del reproductor (`#000` / `#fff`): es condición de visionado.
- Los colores que van a `<canvas>`: siguen pasando por `resolverColor()`.
- El correo de recuperación (`docker/volumes/auth/templates/recovery.html`).

## 4. Mapa de pantallas → archivos del repo

| #   | Pantalla de la maqueta        | Dónde vive hoy                                                                                                                               | Estado                                  |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 01  | Onboarding / login            | `src/pages/LoginPage.vue`, `RegistroPage.vue`, `src/assets/auth.css`, `src/components/AppLogo.vue`                                           | Reestilizar                             |
| 02  | Hoy (meta diaria + continuar) | **no existe ruta** — lo más cercano es `LandingPage.vue` + `PerfilPage.vue`                                                                  | Ruta nueva `/hoy`                       |
| 03  | Catálogo / explorar           | `src/pages/LandingPage.vue`, `src/components/LandingCursoBloque.vue`, `LandingHero.vue`                                                      | Reestilizar                             |
| 04  | Detalle de curso              | `src/pages/CursoDetalle.vue`, `src/components/ModuleList.vue`, `ModuleListItem.vue`, `LessonCard.vue`, `ProgressBar.vue`                     | Reestilizar                             |
| 05  | Reproductor de lección        | `src/pages/PlayerPage.vue`, `PlayerVideoSurface.vue`, `PlayerTextoSurface.vue`, `PlayerLessonNavigator.vue`, `src/assets/player-layouts.css` | Reestilizar + notas con marca de tiempo |
| 06  | Evaluación / quiz             | `src/components/EvaluacionPanel.vue`                                                                                                         | Reestilizar (flag `evaluaciones`)       |
| 07  | Mi aprendizaje / avance       | `src/components/UserLevelBar.vue`, `ActivityHeatmap.vue`, `src/composables/useGamificacion.js`                                               | Ruta o pestaña nueva                    |
| 08  | Logros y certificados         | `src/components/BadgeDisplay.vue`, `BadgeNotification.vue`, `src/pages/ConstanciaPage.vue` (solo la tarjeta, no el PDF)                      | Reestilizar                             |
| 09  | Rutas de aprendizaje          | `src/components/UnlockTree.vue`, `src/services/dependencias.js`                                                                              | Rediseñar como escalera vertical        |
| 10  | Panel de instructor           | `src/pages/InstructorPage.vue`, `InstructorAlumnosTable.vue`, `InstructorModulosPanel.vue`, `EntregasInstructorTable.vue`                    | Reordenar por prioridad                 |

**Dependencias de módulo.** Las pantallas 02, 07 y 08 se apoyan en racha, XP e
insignias: eso es el flag `gamificacion`, apagado por defecto. La propuesta
asume que se enciende; si no, 02 se degrada a «continuar + catálogo» y 07 a
horas y progreso por curso, sin racha.

## 5. Los tres huecos

Son las tres incógnitas que ninguna maqueta puede resolver sola, y las que
abren el prompt como **Fase 0**: se cierran con evidencia del código antes de
escribir interfaz.

| Hueco                                                        | Por qué bloquea                                       | Quién decide                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| No hay destino post-login con la meta diaria                 | Sin él, las pantallas 02 y 07 no tienen dónde vivir   | Ruta nueva, pestaña en perfil o bloque en la landing — decisión de producto      |
| `gamificacion` apagado por defecto                           | Racha, XP e insignias sostienen 3 de las 10 pantallas | Encenderlo o diseñar la degradación; la degradación se implementa en ambos casos |
| Racha y notas con marca de tiempo pueden no existir en datos | Son dato, no estilo: exigen esquema y servicio        | Informe primero, migración solo con autorización                                 |

Queda además una pregunta de marca, independiente del código: el naranja
`#F04E23` es una propuesta, no un valor institucional. Si existe manual de
identidad, ese color manda y solo cambia `theme.config.local.js`.

---

## 6. Prompt para Claude Code

> Copiar todo el bloque y pegarlo en Claude Code, en la raíz del repo `cursos-amx`.

```
Eres un ingeniero senior de frontend trabajando en este repositorio (Cursos AMX:
Vue 3 + Vite + Supabase self-hosted, PWA). Vas a implementar un rediseño visual
móvil ya definido. La propuesta completa está en
docs/propuesta-visual-aprendo.md — LÉELA ANTES DE TOCAR NADA, junto con
THEMING.md (§0.05 sistema de tokens, §0.1 contrato de estabilidad, la regla del
par) y src/assets/main.css.

## Reglas de trabajo
- Rama `rediseno/habito-recompensa`. Un commit por tarea, mensaje convencional
  (feat:/fix:/refactor:/style:/test:/docs:).
- Antes de cada tarea: lee los archivos implicados y muéstrame el plan. Si algo
  ya está resuelto o mi suposición es incorrecta, dilo y NO lo cambies.
- Tras cada tarea corre `npm run lint`, `npm run test:unit` y
  `npm run type-check`. No avances con nada en rojo.
  `src/lib/__tests__/temaPares.test.js` es el guardián del contraste: si falla,
  el problema es el par fondo/tinta que acabas de escribir, no el test.
- NINGÚN componente escribe a mano un color, tamaño, radio o sombra cuando
  existe un token para ese propósito. Si necesitas un valor nuevo, primero
  creas el token en src/assets/main.css y lo documentas en THEMING.md.
- Piso tipográfico 12px. Áreas tocables ≥ 44px. Mobile-first: la maqueta es de
  390px de ancho; el escritorio es la adaptación, no el punto de partida.
- No toques: ConstanciaPage (tipografía del PDF), el letterbox del reproductor,
  los colores que van a <canvas> (usa resolverColor() de src/lib/colorCanvas.js)
  ni docker/volumes/auth/templates/recovery.html.
- Actualiza CHANGELOG.md al cerrar cada fase.

## FASE 0 — Resolver los tres huecos antes de construir

Son las tres incógnitas que la propuesta NO puede decidir sola. No abras la
Fase 2 sin cerrarlas: cada una cambia lo que hay que construir.

0.1 RUTA `/hoy` — no existe hoy ningún destino post-login con la meta diaria.
    Revisa src/router/index.js y src/router/guards.js, y PerfilPage.vue y
    LandingPage.vue para ver qué cubren ya. Dime cuál de estas tres es la
    correcta y por qué, con la evidencia del código:
    (a) ruta nueva `/hoy` con requiresAuth, y los guards redirigen ahí al
        entrar, dejando `/` como catálogo público;
    (b) `/hoy` como pestaña dentro de PerfilPage.vue, sin ruta nueva;
    (c) la landing detecta sesión y muestra el bloque «hoy» arriba del catálogo.
    Implementa solo la que yo apruebe. Si eliges (a), incluye el test del
    guard en src/router/__tests__.

0.2 FLAG `gamificacion` — está apagado por defecto (THEMING.md §5) y de él
    dependen las pantallas 02, 07 y 08. Comprueba en
    src/services/featureToggles.js y src/composables/useFeatureFlags.js cómo se
    consulta en runtime, y confírmame: ¿lo encendemos como parte de este
    rediseño, o las tres pantallas tienen que funcionar con el módulo apagado?
    Sea cual sea la respuesta, el código de la Fase 3 debe degradarse sin
    huecos vacíos cuando el flag esté en false — eso no es negociable, porque
    cualquier instalación puede apagarlo desde el panel. Escribe el test de
    ambos estados.

0.3 RACHA Y NOTAS CON MARCA DE TIEMPO — dos datos que la maqueta muestra y que
    puede que no existan. Revisa src/services/gamificacion.js,
    src/composables/useGamificacion.js, src/services/progreso.js,
    src/composables/useTiempoActividad.js y el esquema en supabase/migrations,
    y entrégame un informe breve: qué existe ya de racha diaria (días
    consecutivos, mejor racha, corte por zona horaria) y de notas por lección
    con segundo de video. Para lo que falte, propón el cambio mínimo de
    esquema y servicio, con su coste. NO escribas migraciones sin mi OK: si
    algo no existe, se queda fuera de la maqueta implementada y lo digo yo.

Entregable de esta fase: las tres respuestas, sin código de UI todavía.

## FASE 1 — Base del sistema visual

1. Añade a src/assets/main.css los tokens de la propuesta (§3.2): papel cálido
   (--lienzo, --paper, --paper-3), contorno (--borde-ancho, --borde-tinta),
   elevación dura (--elev-dura-1/2) y los cuatro pasteles de categoría con su
   tinta explícita (--cat-* / --sobre-cat-*). En [data-theme='dark'] deja
   --elev-dura-* en none y conserva los neutros oscuros actuales.
   Documenta cada token en la tabla de THEMING.md §0.05, con la razón de ser,
   no solo el valor.

2. Crea theme/theme.config.local.js a partir del ejemplo, con los colores y
   fuentes de la propuesta (§3.1), y carga Bricolage Grotesque y Manrope en
   index.html. Verifica con src/lib/contraste.js que --primary-fg cumple 4.5:1
   sobre el papel nuevo en claro y oscuro, y que danger sigue distinguiéndose
   del primario. Si el naranja no llega, dime el valor mínimo que sí cumple
   antes de ajustarlo por tu cuenta.

3. Introduce las clases utilitarias de superficie que faltan (tarjeta con
   contorno + sombra dura, tarjeta plana informativa, píldora de filtro,
   distintivo de recompensa) en main.css, junto a las primitivas existentes.
   Regla: sombra dura SOLO donde se espera un toque.

Al cerrar la fase, muéstrame capturas de la landing y del detalle de curso a
390px de ancho, en claro y en oscuro, antes de seguir.

## FASE 2 — Pantallas de alumno

Aplica el mapa de §4 de la propuesta, una pantalla por commit, en este orden:

4. Catálogo (LandingPage.vue, LandingCursoBloque.vue, LandingHero.vue): tarjetas
   con pastel de categoría y letra inicial como portada, filtros en píldora,
   buscador de una línea. Comprueba de dónde sale la categoría de un curso en
   src/services/cursos.js; si no existe el campo, propón cómo derivarlo antes de
   inventar uno.
5. Detalle de curso (CursoDetalle.vue + ModuleList/ModuleListItem/LessonCard/
   ProgressBar): barra de progreso como titular, y la lección en curso como
   única fila de acento.
6. Reproductor (PlayerPage.vue, PlayerVideoSurface/TextoSurface/LessonNavigator,
   player-layouts.css): superficie de reproducción oscura arriba, controles de
   ±15 s legibles, y debajo pestañas Notas / Recursos / Dudas. Las notas con
   marca de tiempo entran solo si la Fase 0.3 confirmó que el dato existe o yo
   aprobé crearlo; si no, la pestaña se construye con lo que ya haya.
7. Login y registro (LoginPage.vue, RegistroPage.vue, auth.css, AppLogo.vue): la
   primera pantalla muestra la promesa del hábito, no el catálogo.
8. Evaluación (EvaluacionPanel.vue): progreso por preguntas en segmentos, una
   opción seleccionada con acento, y el mensaje explícito de que fallar manda a
   repaso y no rompe la racha. Respeta el flag `evaluaciones`.

## FASE 3 — Hábito y recompensa (según lo decidido en la Fase 0)

9. Implementa lo aprobado en 0.3: la racha y las notas con marca de tiempo que
   yo haya autorizado, en servicio y esquema, con tests. Lo no autorizado se
   queda fuera y lo dices en el resumen.
10. Pantalla «Hoy», en la forma aprobada en 0.1 (mobile-first): anillo de meta
    diaria, tarjeta «sigue aquí» con el curso en progreso, dos cursos
    siguientes y fila de insignias recientes. Reutiliza UserLevelBar.vue y
    BadgeDisplay.vue en vez de duplicarlos. Con `gamificacion` apagado se
    degrada a «continuar + catálogo», sin huecos vacíos.
11. Avance del alumno: racha como titular, semana en barras, horas/cursos/XP
    como soporte, progreso por curso y meta semanal. Aprovecha
    ActivityHeatmap.vue si su dato ya sirve.
12. Logros y certificados: insignias obtenidas con sombra dura, pendientes en
    línea punteada, y la constancia como tarjeta con acciones compartir y
    descargar. La hoja del PDF no se toca.
13. Rutas de aprendizaje: rediseña UnlockTree.vue como escalera vertical —
    completado en tinta sólida, en curso como tarjeta elevada, bloqueado en
    punteado — y cierra con la tarjeta del certificado de la ruta.

## FASE 4 — Instructor

14. InstructorPage.vue y sus tablas: primero lo que bloquea al alumno
    (proyectos por calificar, dudas sin responder) y después las métricas.
    Mismo lenguaje visual, sin introducir tokens nuevos.

## Entregable por fase
Resumen de qué cambió, qué hallazgos se descartaron por estar ya resueltos,
tokens nuevos añadidos, y el estado de lint / test:unit / type-check. Si en
algún punto el diseño exige tocar algo que THEMING.md marca como «interno», dilo
explícitamente en el resumen: es un hueco del contrato de theming y hay que
decidirlo, no parchearlo.
```
