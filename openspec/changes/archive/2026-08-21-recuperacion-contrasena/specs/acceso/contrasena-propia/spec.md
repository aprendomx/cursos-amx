## Purpose

Fija lo que la plataforma garantiza sobre la contraseña de cada persona: que
pueda recuperarla por sí misma cuando la olvida, que pueda cambiarla cuando
tiene la sesión abierta, qué se le exige a una contraseña nueva, y qué no debe
revelar el sistema por el camino a quien pregunta desde fuera.

## ADDED Requirements

### Requirement: Recuperar la contraseña sin depender de nadie

Una persona que no puede acceder SHALL poder iniciar por sí misma el
restablecimiento de su contraseña, sin intervención de un administrador.

La pantalla de acceso SHALL ofrecer un camino visible hacia ese flujo. No basta
con que el flujo exista: si no se anuncia donde ocurre el problema, no existe
para quien lo necesita.

#### Scenario: Alguien olvida su contraseña

- **WHEN** una persona sin sesión abre la pantalla de acceso
- **THEN** encuentra un camino explícito para recuperar su contraseña

#### Scenario: Solicita el restablecimiento

- **WHEN** indica su correo y confirma la solicitud
- **THEN** el sistema le envía un vínculo de un solo uso a ese correo
- **AND** la pantalla le indica que revise su correo

### Requirement: La solicitud no revela quién tiene cuenta

La respuesta a una solicitud de restablecimiento SHALL ser indistinguible tanto
si el correo corresponde a una cuenta existente como si no.

Esto vale para el texto mostrado, para el código de respuesta y para el tiempo
que tarda: una diferencia apreciable en cualquiera de los tres convierte el
formulario en un detector de cuentas registradas.

#### Scenario: Correo que no corresponde a ninguna cuenta

- **WHEN** se solicita el restablecimiento para un correo sin cuenta
- **THEN** la respuesta es la misma que para un correo con cuenta
- **AND** no se envía ningún correo

#### Scenario: Sondeo repetido

- **WHEN** se solicitan muchos restablecimientos en poco tiempo desde el mismo origen
- **THEN** el sistema limita la frecuencia
- **AND** el mensaje sigue sin distinguir correos existentes de inexistentes

### Requirement: El vínculo de restablecimiento caduca y se agota

El vínculo enviado por correo SHALL dejar de servir una vez usado, y SHALL
caducar por tiempo aunque no se use.

Un vínculo que sigue valiendo después de usarse convierte cualquier copia del
correo —reenviado, en un buzón compartido, en una copia de seguridad— en una
llave permanente de la cuenta.

#### Scenario: Se usa el vínculo dos veces

- **WHEN** se abre por segunda vez un vínculo ya utilizado
- **THEN** el sistema lo rechaza y explica que ya no es válido
- **AND** ofrece solicitar uno nuevo

#### Scenario: Vínculo caducado

- **WHEN** se abre un vínculo cuyo plazo expiró
- **THEN** el sistema lo rechaza, lo explica y ofrece solicitar uno nuevo

### Requirement: Cambiar la contraseña con la sesión abierta

Una persona con sesión SHALL poder cambiar su contraseña desde su perfil.

El cambio SHALL exigir la contraseña actual. Sin ese requisito, una sesión
ajena momentáneamente desatendida basta para apropiarse de la cuenta.

#### Scenario: Cambio correcto

- **WHEN** indica su contraseña actual y una nueva válida
- **THEN** la contraseña queda cambiada
- **AND** el sistema lo confirma de forma visible

#### Scenario: Contraseña actual incorrecta

- **WHEN** la contraseña actual no coincide
- **THEN** el cambio se rechaza y se explica cuál es el problema
- **AND** la contraseña anterior sigue siendo válida

### Requirement: Toda contraseña nueva cumple las mismas reglas

Las reglas que debe cumplir una contraseña SHALL ser las mismas en el alta, en
el restablecimiento y en el cambio desde el perfil.

El sistema SHALL comunicar esas reglas antes de que la persona escriba, no solo
al rechazar lo que escribió.

#### Scenario: Contraseña demasiado corta

- **WHEN** se propone una contraseña por debajo del mínimo
- **THEN** se rechaza indicando el mínimo exigido
- **AND** el mensaje aparece junto al campo afectado

#### Scenario: Las reglas se anuncian

- **WHEN** la persona llega a un campo de contraseña nueva
- **THEN** ve qué se le va a exigir antes de escribir

### Requirement: La instalación sin correo lo dice

Una instalación que no puede enviar correo SHALL indicarlo cuando alguien
intente recuperar su contraseña, en lugar de aceptar la solicitud y no hacer
nada.

Aceptar en silencio una solicitud que nunca llegará deja a la persona
esperando un correo que no existe, sin forma de saber que el problema no es
suyo.

#### Scenario: Instalación sin envío de correo configurado

- **WHEN** se solicita un restablecimiento y la instalación no puede enviar correo
- **THEN** el sistema lo indica y señala a quién dirigirse
- **AND** no afirma que el correo fue enviado
