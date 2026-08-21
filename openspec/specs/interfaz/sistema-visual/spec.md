# sistema-visual Specification

## Purpose

Define de dónde salen los valores que determinan la apariencia —tipografía,
espaciado, radios, elevación— para que la interfaz sea coherente por
construcción, y establece qué pasa con las instalaciones existentes cuando ese
sistema cambia.

## Requirements

### Requirement: La apariencia se define con tokens

El sistema SHALL declarar en un único lugar los valores que determinan la
apariencia: escala tipográfica, escala de espaciado, radios de esquina y escala
de elevación.

Los componentes SHALL consumir esos tokens. Un componente MUST NOT escribir a
mano un tamaño de texto, un radio o una sombra cuando exista un token para ese
propósito.

#### Scenario: Un componente presenta texto

- **WHEN** un componente muestra texto de cualquier nivel
- **THEN** su tamaño proviene de la escala tipográfica declarada

#### Scenario: Un componente eleva una superficie

- **WHEN** un componente presenta una tarjeta, un panel o un diálogo
- **THEN** su sombra proviene de la escala de elevación declarada
- **AND** no introduce un valor de sombra propio

### Requirement: La jerarquía visual no depende del color

El orden de importancia de los elementos de una pantalla SHALL comunicarse
mediante tamaño, peso tipográfico y espacio.

El color MAY reforzar esa jerarquía, pero MUST NOT ser lo único que la
establezca: en modo oscuro, en escala de grises o para quien no distingue
ciertos colores, la jerarquía tiene que seguir leyéndose.

#### Scenario: Pantalla en escala de grises

- **WHEN** se observa una pantalla sin información de color
- **THEN** se distingue qué es el título, qué es secundario y cuál es la acción
  principal

#### Scenario: Acción principal de una pantalla

- **WHEN** una pantalla ofrece varias acciones
- **THEN** una sola se presenta como principal
- **AND** las demás se subordinan visualmente

### Requirement: La identidad de cada institución se conserva

El sistema visual SHALL seguir tomando de la configuración del tema los colores
de marca, los logotipos y los textos institucionales.

El refresco MUST NOT sustituir esa identidad por una apariencia propia: define
cómo se presenta, no qué marca se presenta.

#### Scenario: Instalación con identidad propia

- **WHEN** una instalación declara sus colores y logotipos
- **THEN** la interfaz los usa
- **AND** el sistema de tokens rige el resto de la apariencia

### Requirement: Un cambio del sistema visual se anuncia, no se descubre

El tema declara la versión del esquema al que se ajusta. Cuando el sistema
visual cambia de forma que altera la apariencia de una instalación existente, el
sistema SHALL incrementar esa versión.

Al arrancar con un tema declarado para una versión mayor distinta, el sistema
MUST NOT continuar en silencio: SHALL detenerse con un mensaje que diga qué
cambió y qué hay que revisar.

#### Scenario: Instalación con un tema de la versión anterior

- **WHEN** se arranca con un tema declarado para la versión previa del esquema
- **THEN** el arranque se detiene con un mensaje accionable
- **AND** el mensaje indica qué revisar en la configuración

#### Scenario: Tema actualizado

- **WHEN** el tema declara la versión vigente
- **THEN** la aplicación arranca con normalidad

### Requirement: La documentación del tema refleja el contrato

La documentación del tema SHALL describir qué claves son públicas —aquellas con
las que una instalación puede contar—, cuáles son internas y qué hay que hacer
para migrar de una versión del esquema a la siguiente.

#### Scenario: Migración entre versiones

- **WHEN** quien mantiene una instalación consulta la documentación tras un
  cambio de versión
- **THEN** encuentra qué claves cambiaron y qué debe ajustar
