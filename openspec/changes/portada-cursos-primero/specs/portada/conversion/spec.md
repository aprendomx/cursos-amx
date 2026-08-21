## Purpose

Fija lo que la portada debe comunicar y en qué orden, qué se mide de ella para
poder afirmar que funciona, y qué puede hacer una persona sin registrarse —
incluida la primera lección abierta y sus límites exactos.

## ADDED Requirements

### Requirement: El curso vende y la constancia cierra

La portada SHALL presentar primero qué se aprende y después cómo se acredita.
El titular del hero SHALL hablar del resultado de aprender; la constancia
verificable puede respaldarlo, pero no SHALL ser el titular.

#### Scenario: Orden de la página

- **WHEN** una persona recorre la portada de arriba abajo
- **THEN** encuentra los cursos y qué sabrá hacer antes que las secciones de constancia
- **AND** la constancia aparece una sola vez como sección, al cierre

### Requirement: Cada curso comunica su resultado

Cada tarjeta de curso en la portada SHALL decir qué sabrá hacer quien lo
termine, además de sus metadatos.

#### Scenario: Tarjeta de curso

- **WHEN** se muestra un curso en la portada
- **THEN** incluye al menos un resultado de aprendizaje en lenguaje de la persona
- **AND** los metadatos (nivel, duración, módulos) no son lo único visible

### Requirement: La portada se puede medir

Las decisiones sobre la portada SHALL poder evaluarse con datos propios: la
plataforma registra cuántas personas pasan del hero a un curso, del curso al
detalle, y del detalle al registro.

#### Scenario: Recorrido instrumentado

- **WHEN** una persona hace clic en el hero, abre un detalle de curso o inicia el registro
- **THEN** queda registrado un evento con la sección de origen
- **AND** los eventos no contienen datos personales

### Requirement: La primera lección se puede probar sin registro

Cualquier persona SHALL poder ver la primera lección de un curso publicado sin
tener sesión.

#### Scenario: Probar desde la portada

- **WHEN** una persona sin sesión abre la primera lección de un curso publicado
- **THEN** la lección se reproduce completa, incluido su video si lo tiene

#### Scenario: El resto exige registro

- **WHEN** una persona sin sesión intenta pasar de la primera lección, guardar avance o presentar una evaluación
- **THEN** se le invita a registrarse, explicando qué gana con ello
- **AND** no pierde el punto en el que estaba

### Requirement: Abrir la primera lección no abre nada más

El acceso anónimo SHALL limitarse a la primera lección de cursos publicados.
Las URLs firmadas de contenido SHALL seguir exigiendo sesión para cualquier
otra lección y para cursos no publicados.

#### Scenario: Intento de acceso a una lección posterior

- **WHEN** alguien sin sesión pide el contenido de una lección que no es la primera
- **THEN** el servidor lo rechaza, aunque conozca el identificador

#### Scenario: Curso sin publicar

- **WHEN** alguien sin sesión pide la primera lección de un curso no publicado
- **THEN** el servidor lo rechaza igual que hoy
