## Context

Ver `proposal.md` — Why para los seis hallazgos con su evidencia. Lo que
condiciona el diseño:

- **El punto de partida no es cero.** Ya existen `:focus-visible` global,
  `prefers-reduced-motion`, y `src/lib/contraste.js` con utilidades WCAG que
  `theme.js` aplica para derivar variantes en modo oscuro. Hay mecanismo; falta
  cobertura.
- **La identidad es configurable y ajena.** `theme/theme.config.local.js` define
  colores, logotipos y textos de cada institución, y `THEMING.md` documenta qué
  claves son públicas. Un refresco que imponga una paleta rompería el motivo por
  el que existe el producto.
- **`THEME_SCHEMA_VERSION` ya es un contrato.** `theme.js` rechaza al arrancar
  un tema declarado para una versión mayor distinta, con mensaje accionable. El
  mecanismo de aviso existe: hay que usarlo, no inventarlo.
- **Hay 56 variables CSS**, todas de color y espaciado base. No hay escala
  tipográfica, ni de radios, ni de elevación: eso se escribe a mano en cada
  componente, y es la causa de que la interfaz se sienta despareja.
- **La superficie es grande**: 11 páginas y ~90 componentes, de los cuales 25
  son del panel de administración.
- **`.field input` ya tuvo este problema de foco y se arregló**, con un
  comentario en `main.css:367` explicando la especificidad. Ese comentario es la
  mejor documentación del defecto que existe, y la corrección no se generalizó.

## Goals / Non-Goals

**Goals:**

- Que la coherencia visual sea consecuencia de los tokens, no de la disciplina
  de quien escribe cada componente.
- Que el foco del teclado no se pueda perder por una regla local.
- Que el contraste se valide en los dos modos con el mismo mecanismo.
- Que las instalaciones existentes se enteren del cambio al arrancar, no al
  verlo.

**Non-Goals:**

- No se sustituye la identidad gráfica de ninguna institución.
- No se adopta la paleta ni la tipografía que sugirió la herramienta de diseño
  (ver decisión 1).
- No se cambia el modo de historial del router ni ninguna ruta.
- No se rehace la arquitectura de componentes: es un cambio de presentación.

## Decisions

### 1. Qué se toma de la herramienta de diseño y qué se descarta

La consulta a UI/UX Pro Max devolvió un sistema para «government institutional
e-learning». **Se adopta su dirección de estilo** —«Accessible & Ethical»: alto
contraste, foco visible de 3-4 px, objetivos de 44 px, enlaces de salto,
movimiento reducido, semántica— porque coincide con lo que la auditoría
encontró y con lo que exige el contexto.

**Se descartan tres de sus recomendaciones, y conviene dejar por qué:**

- **El patrón «Newsletter / Content First»**, con formulario de un solo campo y
  prueba social del tipo «únete a X lectores». Esto no es un boletín: es un
  catálogo de cursos con inscripción, evaluaciones y constancias.
- **La paleta fija** (verde azulado y ámbar). Prescribir colores contradice el
  sistema de theming, que existe para que cada institución imponga los suyos.
- **La tipografía Baloo 2 + Comic Neue**, que la propia herramienta describe
  como «kids, playful, colorful». Es una plataforma que emite constancias
  oficiales; la herramienta emparejó «education» con apps infantiles.

Una herramienta de diseño propone desde categorías generales. Aceptar su salida
entera aquí habría producido una plataforma de gobierno con tipografía de
cuento.

### 2. Los tokens se añaden a la capa que ya existe

Las escalas nuevas —tipografía, radios, elevación— se declaran junto a las 56
variables actuales en `src/assets/main.css`, no en un sistema paralelo.

Un segundo sistema obligaría a decidir, en cada componente, cuál de los dos
manda; y la respuesta se olvidaría. Extender el que ya se usa hace que la
migración sea sustituir valores, no reescribir capas.

Las escalas se derivan del ritmo que ya existe (`--unit`, múltiplos de 8) para
que lo nuevo encaje con lo que no se toca.

### 3. El foco se protege desde la base, no componente a componente

Corregir los nueve componentes uno a uno arregla hoy y no impide mañana: es
exactamente lo que pasó tras arreglar `.field input`.

Dos medidas, y la segunda es la que dura:

- Una regla base con especificidad suficiente para sobrevivir a un
  `outline: none` local.
- Una **prueba que falle** si aparece un `outline: none|0` sin indicador de foco
  acompañante en el mismo componente. Es comprobable estáticamente sobre los
  archivos `.vue`, sin navegador, y encaja con las suites que ya existen.

Sin esa prueba, el décimo componente que anule el foco lo descubriremos igual
que los nueve primeros: por casualidad.

### 4. El contraste en modo claro reutiliza el mecanismo del oscuro

`theme.js` ya deriva variantes con `ajustarParaContraste` contra el papel
oscuro. Se aplica lo mismo contra el papel claro.

No es simétrico por casualidad: los colores institucionales suelen elegirse
sobre papel blanco, así que el modo claro fallará mucho menos. Pero «fallará
menos» no es «no fallará», y hoy nada lo comprueba.

Se conserva la precedencia actual: si el tema declara una variante explícita,
manda esa.

### 5. El esquema del tema sube a 2, con guía de migración

El refresco cambia tipografía, densidad y elevación. Una instalación con su
`theme.config.local.js` de la versión 1 se vería distinta tras un despliegue.

`theme.js` ya sabe detenerse ante una versión mayor distinta con un mensaje
accionable. Se incrementa la versión y se escribe la guía en `THEMING.md`.

_Alternativa descartada_: mantener la versión 1 y confiar en que el cambio pase
inadvertido. Es lo que convierte un refresco en una incidencia de soporte.

### 6. La migración va por tandas verificables

~90 componentes no se migran de una pasada. El orden sigue el riesgo y la
visibilidad:

1. Tokens y reglas base, sin tocar componentes. Aquí ya cambia la apariencia.
2. Superficie pública sin sesión: portada, registro, login, verificación,
   documentos institucionales.
3. Superficie del alumno: catálogo, curso, reproductor, perfil, constancia.
4. Panel de administración y de instructor.

Cada tanda cierra con su verificación. Así, si algo se tuerce, se sabe en qué
tanda y no en un diff de noventa archivos.

### 7. Lo que se prueba y lo que se mira

Se prueba automáticamente lo que es estructural y no requiere navegador:

- que ningún componente anule el foco sin sustituto;
- que el contraste derivado cumpla el umbral en ambos papeles;
- que cada página declare un `h1`;
- que los componentes no escriban a mano valores con token disponible.

Lo perceptual —si la jerarquía se lee, si el ritmo es agradable— **no se
prueba: se mira**, en las cuatro anchuras de la lista de comprobación, en los
dos modos de color y con movimiento reducido activado. Fingir que eso se
automatiza es cómo se cuelan las interfaces técnicamente correctas y
desagradables.

## Risks / Trade-offs

- **Es el cambio de mayor superficie de todo el repositorio** → mitigado por
  tandas; cada una es revisable y reversible por separado.
- **Las instalaciones existentes cambian de aspecto** → intencional, anunciado
  por la versión de esquema y documentado. Sin esa versión, sería una sorpresa.
- **La regla base de foco puede dar un anillo donde antes se ocultaba a
  propósito** → es el resultado buscado; si algún caso concreto lo justifica,
  que declare su indicador propio, que es lo que exige el spec.
- **La prueba de «no escribas valores a mano» puede resultar ruidosa** →
  se acota a las propiedades con token equivalente, y no a toda declaración
  CSS.
- **El panel de administración es el mayor volumen y el de menos ojos encima**
  → va al final a propósito: si hay que recortar alcance, es donde menos duele.

## Migration Plan

Sin migración de datos ni de esquema de base.

1. Tokens y reglas base.
2. Las tres tandas de componentes, en orden de visibilidad.
3. Incremento de `THEME_SCHEMA_VERSION` y guía en `THEMING.md`, al final: hasta
   que la apariencia no esté cerrada, no se sabe qué hay que documentar.

Rollback: revertir por tandas. Como no hay cambios de datos ni de rutas, cada
tanda revertida deja el producto funcional, solo con la apariencia anterior en
las pantallas de esa tanda.

## Open Questions

- Si conviene publicar el sistema de tokens como referencia visible —una
  pantalla o un documento con las escalas— para quien construya componentes
  nuevos. No afecta a las specs ni al reparto de tareas: puede decidirse
  después.
