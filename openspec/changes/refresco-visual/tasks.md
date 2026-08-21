## 1. Tokens y reglas base

- [x] 1.1 Declarar la escala tipográfica en `src/assets/main.css`, derivada del ritmo que ya existe, con un token por nivel y no por componente.
- [x] 1.2 Declarar la escala de radios de esquina.
- [x] 1.3 Declarar la escala de elevación, con un número corto de niveles y un uso asignado a cada uno (tarjeta, panel, diálogo).
- [x] 1.4 Revisar la escala de espaciado existente y completar los pasos que falten, sin renombrar los que ya se usan.
- [x] 1.5 Aplicar las escalas a los elementos base —encabezados, párrafo, botones, campos, tarjetas— de modo que la mayoría de componentes hereden sin tocarlos.
- [ ] 1.6 Capturar cómo se ve la portada, el curso y el reproductor antes de este grupo, para poder comparar después. — **Pendiente: requiere navegador con la app levantada.**

## 2. Foco visible, protegido desde la base

- [x] 2.1 Reforzar la regla base de `:focus-visible` con especificidad suficiente para sobrevivir a un `outline: none` local, y grosor acorde a la dirección de estilo (3–4 px).
- [x] 2.2 Corregir los nueve componentes que anulan el foco sin sustituto: `AdminZoomConfig`, `BuscadorSesiones`, `ChatPanel`, `CrearSesionPanel`, `CrearTareaPanel`, `LandingHero`, `LessonRichTextEditor`, `PlayerChatPane`, `RubricaEditor`.
- [x] 2.3 Comprobar el indicador de foco sobre fondo claro y sobre fondo oscuro; si no se distingue en alguno, derivar la variante como se hace con el color de marca.
- [x] 2.4 Añadir una prueba que falle cuando un componente suprima el anillo de foco **de forma inanulable** (`outline: none !important`). — Reformulada durante la implementación: la corrección resultó ser global (regla base con `!important`), no por componente, así que la prueba original habría dado nueve falsos positivos. `outline: none` sin `!important` se permite a propósito: suprime el anillo con el ratón y lo conserva con el teclado.
- [x] 2.5 Verificar que la prueba atrapa el defecto: revertir uno de los nueve y confirmar que se pone en rojo.

## 3. Contraste en ambos modos

- [ ] 3.1 Extender `theme.js` para derivar también la variante sobre papel claro con `ajustarParaContraste`, conservando la precedencia de una variante declarada explícitamente.
- [ ] 3.2 Añadir pruebas a `contraste.test.js` para el papel claro, incluido el caso de un color de marca demasiado claro.
- [ ] 3.3 Comprobar el contraste del texto secundario (`--ink-2`, `--ink-3`, `--ink-4`) sobre ambos papeles y corregir los niveles que no alcancen el umbral.
- [ ] 3.4 Comprobar el contraste de los estados de error y de éxito en ambos modos.

## 4. Estructura de página

- [ ] 4.1 Añadir el encabezado de primer nivel que falta en `AdminPage`, `LandingPage` y `PlayerPage`.
- [ ] 4.2 Revisar el resto de páginas y corregir los saltos de nivel de encabezado.
- [ ] 4.3 Añadir el enlace de salto al contenido como primer elemento enfocable, visible al recibir el foco.
- [ ] 4.4 Marcar la región de contenido principal en cada página para que el enlace tenga destino.
- [ ] 4.5 Añadir una prueba que verifique que cada página declara exactamente un `h1`.

## 5. Objetivos táctiles y estados

- [x] 5.1 Llevar `.btn-sm` al mínimo de 44 px de área activa, ampliando el área sin agrandar necesariamente la caja visible.
- [ ] 5.2 Revisar los botones de solo icono y confirmar que tienen etiqueta accesible y área suficiente.
- [ ] 5.3 Revisar la separación entre controles contiguos, sobre todo en las tablas del panel y en las tarjetas del catálogo.
- [ ] 5.4 Unificar los estados de deshabilitado —opacidad, cursor y atributo semántico— con un token, no con valores por componente.
- [ ] 5.5 Comprobar que los estados de error indican el problema con texto además del color, junto al campo afectado.

## 6. Tanda A — superficie pública sin sesión

- [ ] 6.1 `LandingPage` y sus secciones: sustituir valores a mano por tokens; jerarquía por tamaño y espacio, una sola acción principal.
- [ ] 6.2 `LandingHero`, `LandingFooter` y las secciones opcionales de `theme/sections/`.
- [ ] 6.3 `RegistroPage`: formulario por pasos, indicador de progreso, errores junto al campo, foco al primer campo inválido tras enviar.
- [ ] 6.4 `LoginPage`.
- [ ] 6.5 `VerificarPage` y `DocumentoPage`.
- [ ] 6.6 Revisar la tanda en 375, 768, 1024 y 1440 px, en modo claro y oscuro, y con movimiento reducido activado.

## 7. Tanda B — superficie del alumno

- [ ] 7.1 Catálogo de cursos y sus tarjetas.
- [ ] 7.2 `CursoDetalle`.
- [ ] 7.3 `PlayerPage` y sus paneles laterales —chat, foros, evaluación—, que es donde más densidad hay.
- [ ] 7.4 `PerfilPage` y sus pestañas.
- [ ] 7.5 `ConstanciaPage`. Comprobar que el refresco no altera el PDF emitido: la constancia se dibuja aparte y su apariencia es la del documento oficial.
- [ ] 7.6 Revisar la tanda en las cuatro anchuras, ambos modos y movimiento reducido.

## 8. Tanda C — panel de administración e instructor

- [ ] 8.1 Navegación del panel y `AdminPage`.
- [ ] 8.2 Las pantallas de listado y tabla —usuarios, cursos, entregas, reportes—, priorizando densidad legible sobre densidad máxima.
- [ ] 8.3 Los formularios y paneles de creación —cursos, sesiones, tareas, rúbricas, constancias.
- [ ] 8.4 Los tableros con gráficas: leyendas visibles, alternativa textual y series distinguibles sin depender del color.
- [ ] 8.5 `InstructorPage` y sus paneles.
- [ ] 8.6 Revisar la tanda en las cuatro anchuras y ambos modos.

## 9. Contrato del tema

- [ ] 9.1 Incrementar `THEME_SCHEMA_VERSION` a 2 en `src/lib/theme.js`.
- [ ] 9.2 Comprobar que un tema declarado para la versión 1 detiene el arranque con un mensaje que diga qué cambió y qué revisar.
- [ ] 9.3 Actualizar `theme/theme.config.example.js` con las claves nuevas y sus valores por defecto.
- [ ] 9.4 Escribir la guía de migración de la versión 1 a la 2 en `THEMING.md`, indicando qué claves cambiaron.
- [ ] 9.5 Actualizar en `THEMING.md` la tabla de contrato: qué es público y qué es interno tras el refresco.

## 10. Verificación

- [ ] 10.1 Recorrer la aplicación entera solo con teclado, sin ratón, y confirmar que en ningún momento se pierde de vista el foco.
- [ ] 10.2 Recorrer las pantallas principales con un lector de pantalla y confirmar que el orden de lectura sigue al visual.
- [ ] 10.3 Comprobar el contraste real —no el calculado— de las combinaciones de texto principales en ambos modos.
- [ ] 10.4 Comparar contra las capturas de 1.6 y confirmar que la jerarquía mejoró y que nada se rompió.
- [ ] 10.5 Revisar las cuatro anchuras sin desplazamiento horizontal en ninguna.
- [ ] 10.6 Comprobar que el presupuesto de bundle sigue dentro de límite: `node scripts/check-bundle.js` no forma parte de `npm run build`.
- [ ] 10.7 Suites completas: unitarias, migraciones, lint, type-check y build.

## 11. Documentación

- [ ] 11.1 Documentar el sistema de tokens: qué escala usar para qué, con ejemplos.
- [ ] 11.2 Documentar en `docs/CONTRIBUTING.md` que un componente nuevo consume tokens y no escribe valores a mano.
- [ ] 11.3 Entrada en `CHANGELOG.md` bajo «No publicado», señalando el cambio de versión del esquema del tema y qué implica para las instalaciones existentes.
