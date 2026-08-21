## Why

Auditoría de la interfaz con la skill UI/UX Pro Max, contrastada contra el
código. El punto de partida es mejor de lo que suele encontrarse: el repo ya
tiene `:focus-visible` global, una regla de `prefers-reduced-motion`, y
utilidades de contraste (`src/lib/contraste.js`) que ajustan automáticamente el
color de marca en modo oscuro. No hay que empezar de cero.

Lo que la auditoría sí encontró, con evidencia:

1. **El anillo de foco desaparece en nueve componentes.** El repo ya detectó y
   arregló este defecto para `.field input`, con un comentario en
   `src/assets/main.css:367` explicando la especificidad. La corrección no se
   generalizó: `AdminZoomConfig`, `BuscadorSesiones`, `ChatPanel`,
   `CrearSesionPanel`, `CrearTareaPanel`, `LandingHero`, `LessonRichTextEditor`,
   `PlayerChatPane` y `RubricaEditor` declaran `outline: none` con
   especificidad que gana al `:focus-visible` global, y ninguno aporta
   sustituto. Quien navega con teclado pierde de vista dónde está.
2. **El contraste solo se valida en modo oscuro.** `theme.js` aplica
   `ajustarParaContraste` contra el papel oscuro; el modo claro se da por
   bueno. Una institución puede configurar un color de marca claro y nada lo
   detecta.
3. **Tres páginas no tienen `h1`**: `AdminPage`, `LandingPage` y `PlayerPage`
   arrancan en `h2`. Un lector de pantalla no encuentra el título de la página.
4. **No hay enlace de salto al contenido.** Con navegación en todas las
   pantallas, quien usa teclado tabula por el menú entero en cada página.
5. **`.btn-sm` queda por debajo del objetivo táctil**: con `--unit: 8px`, su
   caja ronda los 34 px de alto, frente a los 44 px que exigen tanto WCAG 2.5.5
   como las guías de plataforma.
6. **Sin escala tipográfica ni de elevación declaradas.** Hay 56 variables CSS,
   pero los tamaños de texto, los radios y las sombras se escriben a mano en
   cada componente. Es lo que hace que la interfaz se sienta despareja sin que
   se pueda señalar un culpable concreto.

## What Changes

- **Sistema visual con tokens** para tipografía, espaciado, radios, elevación y
  densidad, en lugar de valores escritos a mano en cada componente.
- **Refresco de la apariencia** apoyado en esos tokens: escala tipográfica
  coherente, ritmo vertical, jerarquía por tamaño y espacio —no por color— y
  una escala de elevación única.
- **Corrección de los seis hallazgos** de la auditoría, en las 11 páginas y los
  ~90 componentes, panel de administración incluido.
- **El contraste se valida también en modo claro**, con el mismo mecanismo que
  ya existe para el oscuro.
- **Enlace de salto al contenido** y `h1` en todas las páginas.
- **BREAKING — el esquema del tema sube a la versión 2.** Un refresco que toca
  tipografía, densidad y elevación cambia la apariencia de las instalaciones
  que ya tienen su `theme.config.local.js`. En vez de que eso les ocurra por
  sorpresa en un despliegue, el arranque lo detecta y lo dice, como ya hace hoy
  con una versión mayor distinta.

## Capabilities

### New Capabilities

- `interfaz/accesibilidad`: qué garantiza la interfaz a quien navega con
  teclado o lector de pantalla, y con qué contraste y qué tamaño mínimo se
  presentan los elementos interactivos, en ambos modos de color.
- `interfaz/sistema-visual`: los tokens que definen la apariencia, la regla de
  que los componentes no escriban valores a mano, y el contrato de
  compatibilidad del tema cuando ese sistema cambia.

### Modified Capabilities

Ninguna. Las capacidades existentes (`instalacion/*`, `contenido/*`) describen
comportamiento de instalación y de documentos, no de interfaz.

## Impact

**Código**

- `src/assets/main.css`: tokens nuevos y reglas base.
- `src/lib/theme.js` y `src/lib/contraste.js`: validación de contraste en modo
  claro y versión de esquema.
- `theme/theme.config.example.js` y `THEMING.md`: contrato nuevo y guía de
  migración.
- Los ~90 componentes y 11 páginas, para sustituir valores a mano por tokens y
  corregir los defectos de foco, encabezados y objetivos táctiles.
- `src/components/__tests__/` y `src/lib/__tests__/`: pruebas de las reglas que
  se puedan verificar sin navegador.

**Sin impacto**

- Base de datos: ninguna migración.
- Edge Functions, modelo de permisos y flujos de datos: sin cambios.
- La identidad gráfica de cada institución —colores de marca y logotipos—
  sigue viniendo de su configuración; este cambio no la sustituye.

**Riesgo registrado**

- Es el cambio de mayor superficie de la sesión: toca casi todos los
  componentes. El riesgo no es conceptual sino de volumen, y se aborda por
  tandas verificables en lugar de una sola pasada.

**Supuestos registrados**

- El refresco respeta la identidad institucional configurable: se moderniza el
  sistema que la presenta, no la paleta que cada institución impone.
- Las recomendaciones de paleta fija y de tipografía «playful» que devolvió la
  herramienta de diseño se descartan por inadecuadas para una plataforma que
  emite constancias oficiales. Se conserva de ella la dirección de estilo
  accesible y sus umbrales.
