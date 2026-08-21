## Purpose

Fija lo que la interfaz garantiza a quien no la usa con ratón y vista perfecta:
que el foco del teclado siempre se vea, que el texto se lea en ambos modos de
color, que los elementos interactivos se puedan pulsar con el dedo, y que la
estructura de la página sea navegable con un lector de pantalla.

## ADDED Requirements

### Requirement: El foco del teclado es siempre visible

Todo elemento que pueda recibir el foco por teclado SHALL mostrar un indicador
visible cuando lo recibe.

Ningún componente MUST anular ese indicador sin aportar otro equivalente. Esto
incluye los campos de formulario, que son donde más se anula por motivos
estéticos.

El indicador MUST distinguirse del fondo sobre el que aparece, tanto en modo
claro como en oscuro.

#### Scenario: Recorrido con teclado por un formulario

- **WHEN** una persona tabula por los campos de un formulario
- **THEN** en cada parada ve un indicador de foco
- **AND** el indicador no es únicamente un cambio de color de un borde de un
  píxel

#### Scenario: Un componente anula el contorno

- **WHEN** un componente declara que no quiere el contorno por defecto
- **THEN** define un indicador propio con al menos la misma visibilidad

#### Scenario: Foco en modo oscuro

- **WHEN** se recorre la interfaz con el teclado en modo oscuro
- **THEN** el indicador de foco se distingue del fondo

### Requirement: El texto cumple el contraste mínimo en ambos modos

El sistema SHALL garantizar que el texto se presenta con una relación de
contraste de al menos 4.5:1 frente a su fondo, y de 3:1 para texto grande.

Esta garantía MUST cubrir el modo claro y el modo oscuro por igual. No basta
con validar uno y suponer el otro.

Cuando el color configurado por la institución no alcance el umbral, el sistema
SHALL derivar una variante que sí lo alcance, en lugar de presentar texto
ilegible o de exigir que cada institución calcule las variantes a mano.

#### Scenario: Color de marca insuficiente sobre fondo claro

- **WHEN** una institución configura un color de marca que no alcanza 4.5:1
  sobre el papel claro
- **THEN** el sistema usa una variante derivada que sí lo alcanza
- **AND** la identidad de la institución se mantiene reconocible

#### Scenario: Variante declarada explícitamente

- **WHEN** la configuración del tema declara una variante propia para un modo
- **THEN** se respeta esa variante en lugar de derivar una

### Requirement: Los elementos interactivos se pueden pulsar

Todo control accionable SHALL ofrecer un área activa de al menos 44 por 44
píxeles, o disponer de separación suficiente respecto a los controles vecinos
cuando su tamaño visible sea menor.

#### Scenario: Botón pequeño

- **WHEN** la interfaz presenta un botón de tamaño reducido
- **THEN** su área activa alcanza el mínimo, aunque su caja visible sea menor

#### Scenario: Controles contiguos

- **WHEN** dos controles accionables aparecen uno junto a otro
- **THEN** existe separación suficiente para no pulsar el equivocado

### Requirement: Cada página tiene un título y una estructura navegable

Cada página SHALL tener exactamente un encabezado de primer nivel que la
identifique, y los encabezados MUST descender sin saltarse niveles.

#### Scenario: Página del panel de administración

- **WHEN** se abre una pantalla del panel
- **THEN** tiene un encabezado de primer nivel que dice de qué pantalla se
  trata

#### Scenario: Recorrido por encabezados

- **WHEN** se recorre una página por sus encabezados con un lector de pantalla
- **THEN** los niveles descienden sin saltos

### Requirement: Se puede saltar la navegación

El sistema SHALL ofrecer, como primer elemento enfocable de cada página, un
enlace que lleve directamente al contenido principal.

Ese enlace MUST hacerse visible al recibir el foco, aunque no se muestre con el
ratón.

#### Scenario: Primera pulsación de tabulador

- **WHEN** una persona pulsa el tabulador al abrir una página
- **THEN** el primer elemento enfocado es el enlace de salto, y se ve
- **AND** activarlo lleva el foco al contenido principal, sin recorrer la
  navegación

### Requirement: El movimiento se puede reducir

Cuando el sistema operativo indica preferencia por movimiento reducido, la
interfaz MUST suprimir o reducir sus animaciones y desplazamientos suaves.

#### Scenario: Preferencia activada

- **WHEN** alguien tiene configurado «reducir movimiento»
- **THEN** la interfaz no ejecuta transiciones ni desplazamientos animados
- **AND** todo el contenido sigue siendo alcanzable

### Requirement: Los estados semánticos se distinguen de la acción principal

Los colores que comunican estado —error, éxito, advertencia— MUST ser
distinguibles entre sí y del color de la acción principal.

El sistema MUST NOT definir un estado semántico como un alias del color de
marca: un mensaje de error que se pinta igual que un botón primario no comunica
error.

Cada uno de esos colores MUST cumplir el contraste mínimo sobre su fondo en
ambos modos, y SHALL poder redefinirse desde la configuración del tema para las
instituciones cuya identidad lo requiera.

#### Scenario: Mensaje de error junto a una acción principal

- **WHEN** una pantalla muestra un mensaje de error y un botón de acción
  principal
- **THEN** se distinguen por color, además de por su forma y su texto

#### Scenario: Institución que redefine el color de error

- **WHEN** la configuración del tema declara su propio color de error
- **THEN** se usa ese color
- **AND** el sistema sigue garantizando su contraste mínimo en ambos modos

### Requirement: El color no es el único portador de significado

Cuando la interfaz comunique un estado —error, éxito, advertencia, elemento
activo—, MUST hacerlo además del color con un texto, un icono o una forma.

#### Scenario: Error en un formulario

- **WHEN** un campo queda en estado de error
- **THEN** se indica con un texto además del color
- **AND** ese texto aparece junto al campo afectado
