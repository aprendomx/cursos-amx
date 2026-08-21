# consentimiento-aviso Specification

## Purpose

Hace que la aceptación del aviso de privacidad quede registrada contra una
versión concreta del documento, de modo que años después se pueda demostrar qué
texto leyó cada persona, y define qué ocurre con los consentimientos ya
recabados cuando se publica una versión nueva.

## Requirements

### Requirement: El consentimiento se registra contra una versión concreta

Cuando una persona acepta el aviso de privacidad, el sistema SHALL registrar
**qué versión** aceptó, además de que lo aceptó.

Ese registro MUST sobrevivir a publicaciones posteriores del aviso: publicar una
versión nueva MUST NOT alterar la versión registrada en los consentimientos ya
otorgados.

#### Scenario: Alta con el aviso vigente

- **WHEN** una persona se registra aceptando el aviso
- **THEN** su consentimiento queda asociado a la versión que estaba vigente en
  ese momento

#### Scenario: Publicación posterior

- **WHEN** se publica una versión nueva del aviso
- **THEN** los consentimientos otorgados antes siguen indicando la versión que
  cada persona aceptó

### Requirement: No se recaba consentimiento sin documento

El sistema MUST NOT permitir completar un alta que declare la aceptación del
aviso cuando no existe una versión vigente del aviso.

#### Scenario: Instalación sin aviso publicado

- **WHEN** una persona intenta registrarse en una instalación donde el aviso
  aún no se ha publicado
- **THEN** el alta no se completa
- **AND** el mensaje indica que la instalación todavía no tiene aviso de
  privacidad publicado

#### Scenario: El enlace del formulario lleva al documento

- **WHEN** se muestra la casilla de aceptación en el formulario de alta
- **THEN** su enlace lleva al texto del aviso que se está aceptando

### Requirement: Publicar puede exigir volver a aceptar

Al publicar una versión nueva del aviso, el administrador SHALL poder indicar si
esa versión exige volver a recabar el consentimiento.

Cuando no lo exige, el sistema MUST NOT molestar a quienes ya aceptaron.

#### Scenario: Cambio menor

- **WHEN** se publica una versión que no exige re-aceptación
- **THEN** quien ya había aceptado no recibe ninguna solicitud
- **AND** su consentimiento sigue registrado contra la versión que aceptó

#### Scenario: Cambio sustantivo

- **WHEN** se publica una versión que exige re-aceptación
- **THEN** quien había aceptado una versión anterior recibe la solicitud de
  revisarla y aceptarla

### Requirement: La re-aceptación es visible y no destruye el registro previo

Cuando a una persona se le pide volver a aceptar, el sistema SHALL mostrarle que
el aviso cambió y darle acceso al texto nuevo antes de que acepte.

Al aceptar, el sistema SHALL actualizar la versión registrada. El sistema MUST
NOT dar por aceptada la versión nueva sin un acto explícito de la persona.

#### Scenario: Se le pide y acepta

- **WHEN** una persona con consentimiento pendiente de renovar inicia sesión
- **THEN** se le indica que el aviso cambió y puede leer el texto nuevo
- **AND** al aceptarlo, su consentimiento queda registrado contra la versión
  nueva

#### Scenario: Se le pide y no acepta todavía

- **WHEN** una persona con consentimiento pendiente no acepta
- **THEN** su registro sigue indicando la versión anterior
- **AND** el sistema no lo cuenta como aceptación de la versión nueva

### Requirement: El estado del consentimiento es consultable

El sistema SHALL permitir a un administrador conocer, para el conjunto de
personas registradas, qué versión del aviso tienen aceptada y cuántas están
pendientes de renovar.

#### Scenario: Consulta tras publicar una versión que exige re-aceptación

- **WHEN** un administrador consulta el estado del consentimiento
- **THEN** puede ver cuántas personas tienen la versión vigente aceptada y
  cuántas están pendientes
