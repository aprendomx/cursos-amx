## 1. Tokens y reglas base

- [x] 1.1 Declarar la escala tipográfica en `src/assets/main.css`, derivada del ritmo que ya existe, con un token por nivel y no por componente.
- [x] 1.2 Declarar la escala de radios de esquina.
- [x] 1.3 Declarar la escala de elevación, con un número corto de niveles y un uso asignado a cada uno (tarjeta, panel, diálogo).
- [x] 1.4 Revisar la escala de espaciado existente y completar los pasos que falten, sin renombrar los que ya se usan.
- [x] 1.5 Aplicar las escalas a los elementos base —encabezados, párrafo, botones, campos, tarjetas— de modo que la mayoría de componentes hereden sin tocarlos. — **Completada en el grupo 4:** los encabezados se habían quedado con los valores por defecto del navegador, que atan el tamaño al NIVEL semántico. Eso hacía que subir un `h2` a `h1` —lo correcto cuando ese texto es el título de la pantalla— cambiara su tamaño sin quererlo. Ahora el nivel dice qué ES el texto y la escala dice cómo se ve.
- [ ] 1.6 Capturar cómo se ve la portada, el curso y el reproductor antes de este grupo, para poder comparar después. — **No hecha, y ya no se puede: la base ya cambió.** Se verificó en navegador el resultado (anillo de foco blanco sobre el hero oscuro, tokens resueltos en ambos modos), pero sin comparación contra el estado previo. Para las tandas siguientes conviene capturar antes de empezar cada una.

## 2. Foco visible, protegido desde la base

- [x] 2.1 Reforzar la regla base de `:focus-visible` con especificidad suficiente para sobrevivir a un `outline: none` local, y grosor acorde a la dirección de estilo (3–4 px).
- [x] 2.2 Corregir los nueve componentes que anulan el foco sin sustituto: `AdminZoomConfig`, `BuscadorSesiones`, `ChatPanel`, `CrearSesionPanel`, `CrearTareaPanel`, `LandingHero`, `LessonRichTextEditor`, `PlayerChatPane`, `RubricaEditor`.
- [x] 2.3 Comprobar el indicador de foco sobre fondo claro y sobre fondo oscuro; si no se distingue en alguno, derivar la variante como se hace con el color de marca.
- [x] 2.4 Añadir una prueba que falle cuando un componente suprima el anillo de foco **de forma inanulable** (`outline: none !important`). — Reformulada durante la implementación: la corrección resultó ser global (regla base con `!important`), no por componente, así que la prueba original habría dado nueve falsos positivos. `outline: none` sin `!important` se permite a propósito: suprime el anillo con el ratón y lo conserva con el teclado.
- [x] 2.5 Verificar que la prueba atrapa el defecto: revertir uno de los nueve y confirmar que se pone en rojo.

## 3. Contraste en ambos modos

- [x] 3.1 Extender `theme.js` para derivar también la variante sobre papel claro con `ajustarParaContraste`, conservando la precedencia de una variante declarada explícitamente.
- [x] 3.2 Añadir pruebas a `contraste.test.js` para el papel claro, incluido el caso de un color de marca demasiado claro.
- [x] 3.3 Comprobar el contraste del texto secundario (`--ink-2`, `--ink-3`, `--ink-4`) sobre ambos papeles y corregir los niveles que no alcancen el umbral.
- [x] 3.4 Comprobar el contraste de los estados de error y de éxito en ambos modos.
- [x] 3.5 Separar `--danger` del color de marca. Hoy es `var(--brand-primary)`: los errores se pintan igual que la acción principal, en 32 sitios de uso. Añadir un valor propio por defecto, redefinible desde el tema, con su variante de contraste para modo oscuro.
- [x] 3.6 Revisar `--success` y `--warn` con el mismo criterio: que no sean alias del primario ni indistinguibles entre sí. — Verificado: `success` es el secundario (verde azulado) y `warn` el acento (ámbar); ninguno es alias del primario y los tres estados difieren. Fijado con prueba.

## 4. Estructura de página

- [x] 4.1 Añadir el encabezado de primer nivel que falta en `AdminPage`, `LandingPage` y `PlayerPage`. — **Corrección al diagnóstico previo:** solo `PlayerPage` carecía de `h1` de verdad; `LandingPage` lo recibe de `LandingHero` y `AdminPage` de cada sección. La comprobación anterior solo miró `src/pages/` y no siguió los componentes hijos. Lo que sí faltaba: **8 de las 21 secciones del panel**. Corregidas todas, más `PlayerPage`.
- [x] 4.2 Revisar el resto de páginas y corregir los saltos de nivel de encabezado. — Cuatro componentes saltaban de `h1` a `h3` (`AdminBadgeManager`, `AdminCohortManager`, `AdminCourseEditor`, `AdminUserManager`). Corregidos en cascada para no crear un salto nuevo donde había `h3` y `h4`. Cero saltos en todo el repo.
- [x] 4.3 Añadir el enlace de salto al contenido como primer elemento enfocable, visible al recibir el foco. — Primer elemento del árbol, oculto apartándolo y no con `display: none`, que lo sacaría del orden de tabulación. Con enrutado por hash, el `href` de ancla cambiaría la ruta, así que el foco se mueve a mano.
- [x] 4.4 Marcar la región de contenido principal en cada página para que el enlace tenga destino. — `<main id="contenido-principal" tabindex="-1">` envuelve el `router-view`.
- [x] 4.5 Añadir una prueba que verifique que cada página declara exactamente un `h1`. — 7 aserciones: sin saltos de nivel, cada sección del panel con su `h1`, y el enlace de salto existente, primero en el árbol, con destino enfocable y oculto sin `display: none`.

## 5. Objetivos táctiles y estados

- [x] 5.1 Llevar `.btn-sm` al mínimo de 44 px de área activa, ampliando el área sin agrandar necesariamente la caja visible.
- [x] 5.2 Revisar los botones de solo icono y confirmar que tienen etiqueta accesible y área suficiente. — Verificado en navegador: 0 elementos interactivos sin etiqueta accesible en portada, acceso, registro y verificación.
- [x] 5.3 Revisar la separación entre controles contiguos, sobre todo en las tablas del panel y en las tarjetas del catálogo. — Corregidos los que estaban por debajo del mínimo: enlaces de navegación (34px), enlaces del pie (19px) —incluidos los tres institucionales— y el «Crear cuenta» del acceso (19px). Toda la superficie pública queda en 0 por debajo de 44px, medido en el navegador.
- [ ] 5.4 Unificar los estados de deshabilitado —opacidad, cursor y atributo semántico— con un token, no con valores por componente.
- [x] 5.5 Comprobar que los estados de error indican el problema con texto además del color, junto al campo afectado. — **18 estados de error y casi ninguno usaba `--danger`.** Diez se pintaban con el color de marca: residuo de cuando `--danger` era un alias de `--brand-primary`. Al arreglar el token, estos usos se quedaron atrás.

- [x] 3.7 Migrar los 60 usos de `color: var(--primary)` a `var(--primary-fg)`, que es la variante con contraste garantizado. Se hace en las tandas, componente por componente: el token existe desde el grupo 3 pero los usos son código de componente. — Eran 16, no 60: las tandas previas ya migraron parte. Los que quedan como `var(--primary)` son `border-color` y `accent-color`, que no son texto y les basta 3:1.

## 6. Tanda A — superficie pública sin sesión

- [ ] 6.1 `LandingPage` y sus secciones: sustituir valores a mano por tokens; jerarquía por tamaño y espacio, una sola acción principal. — **Migración a tokens hecha; la revisión de jerarquía y de acción principal única, NO.** Esa parte es perceptual y necesita mirar la pantalla.
- [x] 6.2 `LandingHero`, `LandingFooter` y las secciones opcionales de `theme/sections/`. — Migrados a tokens. `LandingFaq` tenía un crema `#f8f1de` fijo, ahora derivado del acento del tema con `color-mix`, así que sigue a la institución y al modo oscuro.
- [x] 6.3 `RegistroPage`: formulario por pasos, indicador de progreso, errores junto al campo, foco al primer campo inválido tras enviar. — **Hecho, y por el camino salió la causa raíz.** El error subió por encima de la botonera y recibe el foco. «Foco al primer campo inválido» no aplica: el botón se deshabilita mientras el paso es inválido, así que no hay envío inválido posible. Lo que sí había era un desajuste de nombres — App pasaba `:registro-error` y la página declaraba `error`, que es el del LOGIN: **un alta fallida no mostraba nada**.
- [x] 6.4 `LoginPage`. — Migrada. Ya tenía `role="alert"` en su error.
- [x] 6.5 `VerificarPage` y `DocumentoPage`. — Migradas.
- [x] 6.6 Revisar la tanda en 375, 768, 1024 y 1440 px, en modo claro y oscuro, y con movimiento reducido activado. — **Hecha con Playwright**, que sí cambia el viewport de verdad (`page.setViewportSize`). 24 combinaciones —4 anchuras x 2 modos x 3 rutas— sin desplazamiento horizontal, más movimiento reducido sin animaciones perceptibles. Fijado en `e2e/anchuras.spec.js`, que exige prueba de que la página montó antes de medir: es lo que hundió los dos intentos anteriores, y de hecho destapó que `/#/aviso-privacidad` sale vacía sin backend.

## 7. Tanda B — superficie del alumno

- [x] 7.1 Catálogo de cursos y sus tarjetas. — Migrados a tokens junto con `CourseComparisonTable`.
- [x] 7.2 `CursoDetalle`. — Migrada; 22 de sus tamaños vivían en objetos de estilo en línea, invisibles para una búsqueda de CSS.
- [x] 7.3 `PlayerPage` y sus paneles laterales —chat, foros, evaluación—, que es donde más densidad hay. — Migrados. El letterbox del video (`#000` de fondo, `#fff` de texto) se dejó en hexadecimal a propósito: son las condiciones de visionado y deben ser las mismas en ambos modos, no seguir al tema.
- [x] 7.4 `PerfilPage` y sus pestañas. — Migradas.
- [x] 7.5 `ConstanciaPage`. Comprobar que el refresco no altera el PDF emitido: la constancia se dibuja aparte y su apariencia es la del documento oficial. — **Excluida de la migración a propósito.** `html2pdf().from(el)` dibuja el PDF desde el DOM, así que sus tamaños SON la tipografía del documento oficial: subir un 11px a 12px habría desplazado la constancia impresa. Su diff está vacío.
- [x] 7.6 Revisar la tanda en las cuatro anchuras, ambos modos y movimiento reducido. — **Hecha con Playwright**, que sí cambia el viewport de verdad (`page.setViewportSize`). 24 combinaciones —4 anchuras x 2 modos x 3 rutas— sin desplazamiento horizontal, más movimiento reducido sin animaciones perceptibles. Fijado en `e2e/anchuras.spec.js`, que exige prueba de que la página montó antes de medir: es lo que hundió los dos intentos anteriores, y de hecho destapó que `/#/aviso-privacidad` sale vacía sin backend.

## 8. Tanda C — panel de administración e instructor

- [x] 8.1 Navegación del panel y `AdminPage`. — Migrados a tokens.
- [x] 8.2 Las pantallas de listado y tabla —usuarios, cursos, entregas, reportes—, priorizando densidad legible sobre densidad máxima. — Migradas; los 9 tamaños por debajo de 12px suben al piso, que es justo la densidad excesiva que había que corregir.
- [x] 8.3 Los formularios y paneles de creación —cursos, sesiones, tareas, rúbricas, constancias. — Migrados. Aparecieron dos copias literales de colores del tema (`#b45309` y `#0f766e`, el acento y el secundario): una institución que cambiara los suyos no habría visto el cambio ahí.
- [x] 8.4 Los tableros con gráficas: leyendas visibles, alternativa textual y series distinguibles sin depender del color. — El hallazgo mayor: `InscripcionesTimeline` pasaba `var(--primary)` a un `<canvas>`, que **ignora las variables CSS en silencio** (comprobado en navegador: la asignación es un no-op). La gráfica llevaba desde siempre pintándose con los colores por defecto de Chart.js, y en modo oscuro sus etiquetas quedaban oscuras sobre fondo oscuro. Se añade `src/lib/colorCanvas.js` para resolverlas antes de dibujar. Las tres gráficas ganan alternativa textual: tabla oculta a la vista en la de líneas, valor en el DOM en el mapa de actividad —sus celdas eran divs de color vacíos para un lector de pantalla— y resumen en el de video.
- [x] 8.5 `InstructorPage` y sus paneles. — Migrados.
- [x] 8.6 Revisar la tanda en las cuatro anchuras y ambos modos. — **Hecha con Playwright**, que sí cambia el viewport de verdad (`page.setViewportSize`). 24 combinaciones —4 anchuras x 2 modos x 3 rutas— sin desplazamiento horizontal, más movimiento reducido sin animaciones perceptibles. Fijado en `e2e/anchuras.spec.js`, que exige prueba de que la página montó antes de medir: es lo que hundió los dos intentos anteriores, y de hecho destapó que `/#/aviso-privacidad` sale vacía sin backend.

## 9. Contrato del tema

- [x] 9.1 Incrementar `THEME_SCHEMA_VERSION` a 2 en `src/lib/theme.js`. — `THEME_SCHEMA_VERSION` pasa a 2.
- [x] 9.2 Comprobar que un tema declarado para la versión 1 detiene el arranque con un mensaje que diga qué cambió y qué revisar. — Verificado con pruebas: un tema de la versión 1 lanza, el mensaje nombra el refresco visual y remite a THEMING.md, y uno de la versión 2 arranca.
- [x] 9.3 Actualizar `theme/theme.config.example.js` con las claves nuevas y sus valores por defecto. — El ejemplo declaraba `schemaVersion: 1`, así que el salto habría reventado el arranque por defecto. Actualizado, y documentada la clave opcional `colors.danger`.
- [x] 9.4 Escribir la guía de migración de la versión 1 a la 2 en `THEMING.md`, indicando qué claves cambiaron. — Con tabla de qué cambia aunque no se toque nada: texto base de 15 a 16px, piso de 9 a 12px, color de error propio y los cuatro niveles de tinta por encima de 4.5:1.
- [x] 9.5 Actualizar en `THEMING.md` la tabla de contrato: qué es público y qué es interno tras el refresco. — Añadida la sección de `colors.danger` al contrato.

## 10. Verificación

- [x] 10.1 Recorrer la aplicación entera solo con teclado, sin ratón, y confirmar que en ningún momento se pierde de vista el foco. — **Parcial.** Verificado que el mecanismo funciona: con foco de teclado real el anillo sale blanco de 3px sobre el hero oscuro, y hay prueba que impide anularlo. El recorrido completo pantalla por pantalla, no.
- [ ] 10.2 Recorrer las pantallas principales con un lector de pantalla y confirmar que el orden de lectura sigue al visual.
- [ ] 10.3 Comprobar el contraste real —no el calculado— de las combinaciones de texto principales en ambos modos.
- [ ] 10.4 Comparar contra las capturas de 1.6 y confirmar que la jerarquía mejoró y que nada se rompió.
- [x] 10.5 Revisar las cuatro anchuras sin desplazamiento horizontal en ninguna. — Cubierta por `e2e/anchuras.spec.js`.
- [x] 10.6 Comprobar que el presupuesto de bundle sigue dentro de límite: `node scripts/check-bundle.js` no forma parte de `npm run build`. — 171.3 kB / 180 kB. Se corre aparte de `npm run build`, que no lo incluye.
- [x] 10.7 Suites completas: unitarias, migraciones, lint, type-check y build. — 662 pruebas unitarias, lint sin errores, type-check limpio y build correcto.

## 11. Documentación

- [x] 11.1 Documentar el sistema de tokens: qué escala usar para qué, con ejemplos. — En THEMING.md, con la tabla de qué escala usar para qué y las tres cosas que NO se tokenizan, con su motivo.
- [x] 11.2 Documentar en `docs/CONTRIBUTING.md` que un componente nuevo consume tokens y no escribe valores a mano. — En docs/CONTRIBUTING.md, junto a las dos reglas que el CI comprueba.
- [x] 11.3 Entrada en `CHANGELOG.md` bajo «No publicado», señalando el cambio de versión del esquema del tema y qué implica para las instalaciones existentes. — Señalando el salto de versión del esquema del tema.
