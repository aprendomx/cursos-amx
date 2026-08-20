# verificacion-despliegue Specification

## Purpose

Define qué comprueba el despliegue antes de declararse terminado y, sobre todo,
qué cuenta como comprobación superada — de modo que una instalación degradada
nunca se reporte como sana solo porque la comprobación no se pudo ejecutar.

## Requirements

### Requirement: Una comprobación no ejecutable nunca se reporta como superada

Cuando una comprobación de la verificación no se puede ejecutar —el cliente de
base de datos falla, la consulta da error, la petición HTTP no conecta o la
respuesta es ininterpretable—, el sistema MUST reportarlo como problema y MUST
NOT presentarlo como comprobación superada.

Cada comprobación en ese estado SHALL sumar al recuento de problemas que decide
el código de salida del despliegue.

#### Scenario: El cliente de base de datos falla

- **WHEN** una comprobación que consulta la base de datos no obtiene respuesta
- **THEN** la salida indica que la comprobación no se pudo ejecutar
- **AND** no afirma que la propiedad comprobada se cumple
- **AND** el despliegue termina con código distinto de `0`

#### Scenario: La API no responde

- **WHEN** una comprobación HTTP no logra conectar con la URL indicada
- **THEN** se reporta como problema y no como comprobación superada

### Requirement: Las comprobaciones de autenticación exigen el código esperado

Para cada función que debe rechazar peticiones sin credenciales, el sistema
SHALL considerar superada la comprobación **únicamente** cuando la respuesta es
un código de autenticación esperado (`401` o `403`).

Cualquier otro código MUST reportarse como problema. El mensaje SHALL distinguir
entre una función que responde sin exigir autenticación y una que no responde en
absoluto, porque la reparación es distinta en cada caso.

#### Scenario: La función exige autenticación

- **WHEN** una función responde `401` a una petición sin credenciales
- **THEN** la comprobación se reporta como superada

#### Scenario: La función responde sin exigir autenticación

- **WHEN** una función responde `200` a una petición sin credenciales
- **THEN** se reporta como problema indicando que la función es accesible sin
  autenticación

#### Scenario: La función no existe o el runtime no la encuentra

- **WHEN** una función responde `404` o `5xx`
- **THEN** se reporta como problema indicando que la función no está
  respondiendo
- **AND** no se reporta como «exige autenticación»

#### Scenario: No hay conexión

- **WHEN** la petición no logra conectar y no hay código de respuesta
- **THEN** se reporta como problema indicando que no hubo conexión

### Requirement: La comprobación de escalada de privilegios se ejecuta de verdad

El sistema SHALL comprobar, contra la base de datos en vivo, que una sesión
autenticada no puede otorgarse `es_admin`.

La comprobación MUST ejecutarse sin errores de SQL: un literal inválido, una
columna inexistente o cualquier otro fallo de la consulta es un problema del
despliegue, no un aviso.

La comprobación MUST NOT dejar rastro en la base de datos: toda su actividad
ocurre dentro de una transacción que termina revertida.

El sistema MUST distinguir tres desenlaces —bloqueada, abierta y no
comprobable— y MUST NOT confundir el tercero con el primero.

#### Scenario: La escalada está bloqueada

- **WHEN** la sesión simulada intenta otorgarse `es_admin` y la operación es
  rechazada
- **THEN** la comprobación se reporta como superada
- **AND** al terminar no queda ninguna fila nueva en la base de datos

#### Scenario: La escalada está abierta

- **WHEN** la sesión simulada consigue otorgarse `es_admin`
- **THEN** se reporta como problema
- **AND** el despliegue termina con código distinto de `0`

#### Scenario: La consulta da error

- **WHEN** la comprobación falla por un error de SQL
- **THEN** se reporta como problema, no como aviso
- **AND** el mensaje incluye el error devuelto por la base de datos

#### Scenario: La sesión simulada es efectiva

- **WHEN** se prepara la sesión autenticada de la comprobación
- **THEN** el identificador de usuario de esa sesión resuelve al usuario
  simulado
- **AND** la comprobación no puede pasar por no haber afectado a ninguna fila

### Requirement: La comprobación de RLS distingue «ninguna tabla desprotegida» de «no se pudo consultar»

El sistema SHALL reportar que todas las tablas tienen RLS habilitado solo
cuando la consulta se ejecutó y devolvió un conjunto vacío de tablas
desprotegidas.

#### Scenario: Consulta ejecutada sin tablas desprotegidas

- **WHEN** la consulta devuelve que no hay tablas sin RLS
- **THEN** la comprobación se reporta como superada

#### Scenario: Consulta no ejecutada

- **WHEN** la consulta de RLS falla
- **THEN** la salida indica que no se pudo comprobar
- **AND** no afirma que todas las tablas tienen RLS habilitado
- **AND** cuenta como problema

### Requirement: La URL de verificación es la de la API y se resuelve sola

El sistema SHALL usar por defecto la URL de la API declarada en la
configuración del stack, y SHALL permitir anularla explícitamente.

La documentación y la ayuda del comando SHALL indicar que se trata de la URL de
la **API**, no la del frontend.

Antes de las comprobaciones de funciones, el sistema SHALL confirmar que esa URL
enruta a la API. Si no lo hace, MUST reportarlo como problema —indicando qué URL
se usó y de dónde salió— y MUST NOT ejecutar las comprobaciones de funciones,
cuyos resultados serían engañosos.

#### Scenario: Sin anulación explícita

- **WHEN** se ejecuta el despliegue sin indicar una URL
- **THEN** se usa la URL de la API de la configuración del stack
- **AND** la salida indica qué URL se está usando

#### Scenario: URL que no enruta a la API

- **WHEN** la URL indicada corresponde al frontend y no a la API
- **THEN** se reporta como problema, nombrando la URL usada y su origen
- **AND** no se emite ningún resultado de las comprobaciones de funciones

### Requirement: El desajuste de migraciones cuenta como problema

Cuando el número de migraciones registradas no coincide con las presentes en
disco, el sistema MUST reportarlo como problema.

Cuando el recuento no se pueda obtener, aplica la regla general: se reporta como
problema y no como comprobación superada.

#### Scenario: Registradas y en disco no coinciden

- **WHEN** el recuento registrado difiere del que hay en disco
- **THEN** se reporta como problema indicando ambos números
- **AND** el despliegue termina con código distinto de `0`
