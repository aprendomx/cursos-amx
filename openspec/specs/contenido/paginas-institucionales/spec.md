# paginas-institucionales Specification

## Purpose

Permite que cada instalación publique y mantenga sus propios documentos
institucionales —aviso de privacidad, términos de uso y contacto— dentro de la
plataforma, con historial de versiones, en lugar de depender de una URL externa
pegada en la configuración del tema.

## Requirements

### Requirement: Los tres documentos institucionales existen y son públicos

El sistema SHALL servir una página pública por cada documento institucional:
aviso de privacidad, términos de uso y contacto.

Estas páginas MUST ser accesibles sin haber iniciado sesión: quien todavía no se
registra necesita leer el aviso antes de aceptarlo.

#### Scenario: Visita sin sesión

- **WHEN** una persona sin sesión abre la página del aviso de privacidad
- **THEN** ve el contenido de la versión vigente
- **AND** no se le pide iniciar sesión

#### Scenario: Documento sin versión vigente

- **WHEN** se abre la página de un documento que no tiene ninguna versión
  publicada
- **THEN** la página indica que el documento aún no ha sido publicado
- **AND** no muestra contenido en borrador

### Requirement: Publicar crea una versión y conserva las anteriores

Publicar un documento SHALL crear una versión nueva con su fecha de
publicación, y MUST NOT modificar ni borrar las versiones ya publicadas.

Cada documento MUST tener como mucho una versión vigente en un momento dado, y
SHALL ser la más reciente publicada.

#### Scenario: Segunda publicación

- **WHEN** un administrador publica una versión nueva de un documento que ya
  tenía una versión vigente
- **THEN** la nueva pasa a ser la vigente
- **AND** la anterior se conserva consultable en el historial
- **AND** la página pública muestra la nueva

#### Scenario: El historial no se puede alterar

- **WHEN** se edita el contenido de un documento tras haberlo publicado
- **THEN** el cambio queda como borrador
- **AND** la versión vigente que ven las personas no cambia hasta publicarlo

### Requirement: Administración de los documentos

El sistema SHALL permitir a un administrador editar el contenido de cada
documento con formato enriquecido —al menos negritas, cursivas, listas
ordenadas y sin ordenar, enlaces y encabezados—, previsualizarlo tal como se
verá, publicarlo y consultar su historial de versiones.

Solo los administradores MUST poder crear, editar o publicar. Cualquier otro
usuario, con sesión o sin ella, MUST NOT poder modificar estos documentos ni
leer sus borradores.

#### Scenario: Un administrador publica

- **WHEN** un administrador edita el aviso y pulsa publicar
- **THEN** el contenido queda disponible en la página pública

#### Scenario: Un usuario sin permisos intenta modificar

- **WHEN** una persona autenticada que no es administradora intenta modificar
  un documento
- **THEN** la operación es rechazada
- **AND** el contenido publicado no cambia

#### Scenario: Los borradores no son públicos

- **WHEN** existe un borrador sin publicar
- **THEN** no es legible por quien no es administrador, ni siquiera conociendo
  su identificador

### Requirement: El contenido se presenta saneado

El contenido almacenado es marcado enriquecido. El sistema MUST sanearlo **al
presentarlo**, no solo al guardarlo, admitiendo únicamente un conjunto conocido
de etiquetas de formato.

Esta regla aplica aunque el contenido haya llegado sin pasar por el editor: un
administrador puede escribir directamente contra la API.

#### Scenario: Contenido con marcado peligroso

- **WHEN** el contenido almacenado incluye una etiqueta ejecutable o un
  atributo de evento
- **THEN** la página pública lo presenta sin ese elemento
- **AND** no se ejecuta nada de lo que traía

#### Scenario: Formato legítimo

- **WHEN** el contenido incluye encabezados, listas, negritas y enlaces
- **THEN** se presentan con su formato

### Requirement: Los enlaces de la portada apuntan a los documentos

Los enlaces institucionales del pie de la portada y el del formulario de alta
SHALL llevar a las páginas de estos documentos.

El sistema SHALL seguir permitiendo sustituir cualquiera de ellos por una URL
externa mediante la configuración del tema, para las instalaciones que ya
publican sus documentos fuera de la plataforma.

#### Scenario: Configuración por defecto

- **WHEN** la configuración del tema no define una URL propia para el aviso
- **THEN** el enlace del pie lleva a la página del aviso de la plataforma

#### Scenario: URL externa configurada

- **WHEN** la configuración del tema define una URL externa para el aviso
- **THEN** el enlace del pie lleva a esa URL

#### Scenario: Ningún enlace institucional queda vacío

- **WHEN** se carga la portada en una instalación recién desplegada
- **THEN** ninguno de los enlaces institucionales apunta a `#`

### Requirement: Una instalación nueva no publica una plantilla como suya

El sistema SHALL sembrar los tres documentos con un contenido inicial de
partida, y ese contenido MUST quedar como borrador, sin versión vigente.

Publicar MUST ser una acción deliberada del operador.

#### Scenario: Instalación recién desplegada

- **WHEN** se despliega una instalación nueva
- **THEN** los tres documentos existen como borrador editable
- **AND** ninguno tiene versión vigente
- **AND** sus páginas públicas indican que aún no se han publicado
