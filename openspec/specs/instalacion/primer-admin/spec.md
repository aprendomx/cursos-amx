# primer-admin Specification

## Purpose

Garantiza que toda instalación de Cursos AMX termine con al menos una persona
capaz de entrar al panel de administración, sin que el operador tenga que
manipular la base de datos a mano ni sortear el trigger que bloquea la escalada
de privilegios.

## Requirements

### Requirement: Comando dedicado para crear el primer administrador

El sistema SHALL ofrecer un comando ejecutable desde la raíz del repositorio que
deje a una persona identificada por su correo con `es_admin = true`, sin exigir
que el operador escriba SQL ni acceda directamente al contenedor de la base de
datos.

El comando MUST poder correrse tanto en una instalación recién desplegada como
en una que ya tenga administradores.

#### Scenario: Instalación sin ningún administrador

- **WHEN** el operador ejecuta el comando en una instalación donde
  `select count(*) from perfiles where es_admin` es `0`
- **THEN** al terminar existe exactamente un perfil con `es_admin = true`
  correspondiente al correo indicado
- **AND** ese usuario puede iniciar sesión con contraseña y abrir el panel de
  administración

#### Scenario: El comando no depende de la interfaz web

- **WHEN** el operador ejecuta el comando sin que nadie se haya registrado nunca
  por la pantalla de registro
- **THEN** la operación tiene éxito
- **AND** no se requiere que el registro público esté habilitado

### Requirement: Alta de un usuario nuevo con contraseña generada

Cuando el correo indicado no corresponde a ningún usuario existente, el sistema
SHALL crear la cuenta completa —credenciales de acceso y perfil— y SHALL generar
una contraseña aleatoria de al menos 16 caracteres provenientes de una fuente
criptográficamente segura.

La contraseña generada MUST mostrarse exactamente una vez en la salida estándar,
acompañada de un aviso de que no volverá a mostrarse.

El correo MUST quedar confirmado, de modo que el inicio de sesión no dependa de
que el operador reciba un mensaje de verificación.

#### Scenario: Correo desconocido

- **WHEN** el operador indica un correo que no existe y proporciona nombres y
  apellido paterno
- **THEN** se crea la cuenta con esos datos personales y con `es_admin = true`
- **AND** se imprime la contraseña generada junto con la advertencia de que se
  muestra una sola vez
- **AND** el perfil resultante conserva los nombres y apellidos indicados, no
  valores de relleno

#### Scenario: La cuenta creada puede autenticarse de inmediato

- **WHEN** se ha creado la cuenta mediante el comando
- **THEN** una petición de inicio de sesión con ese correo y esa contraseña es
  aceptada sin requerir confirmación previa por correo

### Requirement: Promoción de un usuario ya existente

Cuando el correo indicado ya corresponde a un usuario, el sistema SHALL limitarse
a otorgarle `es_admin = true`.

El sistema MUST NOT crear una segunda cuenta con el mismo correo, MUST NOT
modificar su contraseña y MUST NOT alterar sus datos personales.

#### Scenario: Correo ya registrado

- **WHEN** el operador indica el correo de alguien que ya se registró por la
  interfaz
- **THEN** ese perfil pasa a tener `es_admin = true`
- **AND** su contraseña sigue siendo la que la persona ya conocía
- **AND** no se imprime ninguna contraseña en pantalla
- **AND** la salida indica explícitamente que se promovió a un usuario existente
  en lugar de crear uno nuevo

### Requirement: Idempotencia

Ejecutar el comando más de una vez con el mismo correo SHALL ser seguro: la
segunda ejecución MUST NOT fallar, MUST NOT duplicar cuentas y MUST NOT
regenerar ni invalidar la contraseña vigente.

#### Scenario: Segunda ejecución sobre un administrador existente

- **WHEN** el operador vuelve a ejecutar el comando con el correo de alguien que
  ya es administrador
- **THEN** el comando termina con código de salida `0`
- **AND** informa que esa persona ya era administradora
- **AND** el estado de la base de datos queda idéntico al previo

### Requirement: La contraseña generada no se persiste

El sistema MUST NOT escribir la contraseña generada en ningún archivo del
servidor, incluidos los archivos de entorno del stack, los registros de
`docker compose` y cualquier bitácora del despliegue.

La contraseña MUST NOT pasarse a otros procesos por argumentos de línea de
comandos, donde sería visible para cualquier usuario del sistema mediante la
tabla de procesos.

#### Scenario: Auditoría posterior al alta

- **WHEN** se ha creado un administrador con contraseña generada
- **AND** se inspeccionan los archivos de entorno del stack y la salida de
  registros de los contenedores
- **THEN** la contraseña no aparece en ninguno de ellos

### Requirement: Modo no interactivo

El sistema SHALL permitir suministrar correo, nombres, apellidos y —de forma
opcional— una contraseña explícita mediante argumentos, para poder ejecutarse en
automatizaciones y pruebas sin intervención humana.

Cuando faltan datos obligatorios y sí hay terminal interactiva, el sistema SHALL
solicitarlos por pantalla. Cuando faltan datos obligatorios y no hay terminal
interactiva, el sistema MUST fallar con un mensaje que nombre el argumento que
falta, en lugar de quedarse esperando entrada.

#### Scenario: Todos los datos por argumentos

- **WHEN** se ejecuta el comando con correo, nombres y apellido paterno como
  argumentos
- **THEN** no se solicita nada por pantalla y la operación se completa

#### Scenario: Faltan datos y no hay terminal

- **WHEN** se ejecuta el comando sin correo y con la entrada estándar
  redirigida desde un origen no interactivo
- **THEN** el comando termina con código de salida distinto de `0`
- **AND** el mensaje de error nombra el argumento faltante
- **AND** el comando no queda bloqueado esperando entrada

### Requirement: Validación de la entrada

El sistema SHALL rechazar un correo con formato inválido y una contraseña
explícita de menos de 8 caracteres, sin haber modificado nada, y SHALL explicar
el motivo del rechazo.

#### Scenario: Correo mal formado

- **WHEN** el operador indica un correo sin `@` o sin dominio
- **THEN** el comando termina con error antes de crear o modificar ninguna cuenta
- **AND** el mensaje indica que el correo es inválido

#### Scenario: Contraseña explícita demasiado corta

- **WHEN** el operador suministra una contraseña de menos de 8 caracteres
- **THEN** el comando termina con error sin crear la cuenta
- **AND** el mensaje indica la longitud mínima exigida

### Requirement: El despliegue detecta la ausencia de administradores

El proceso de despliegue SHALL comprobar, al final de su ejecución, cuántos
administradores existen, y SHALL usar ese conteo para decidir si interviene.

Cuando ya existe al menos un administrador, el despliegue MUST NOT crear,
promover ni modificar cuenta alguna, y SHALL informar que no hay nada que hacer.

#### Scenario: Instalación que ya tiene administradores

- **WHEN** se ejecuta el despliegue en una instalación con uno o más
  administradores
- **THEN** el paso informa cuántos hay y no realiza ninguna modificación
- **AND** no se solicita ningún dato por pantalla

#### Scenario: Instalación sin administradores y con terminal interactiva

- **WHEN** se ejecuta el despliegue en una instalación con cero administradores
  desde una terminal interactiva
- **THEN** el despliegue invoca la creación del primer administrador
- **AND** al terminar existe al menos un administrador

### Requirement: El despliegue no se bloquea sin terminal interactiva

Cuando no hay administradores y el despliegue corre sin terminal interactiva
—integración continua, `cron` o una tubería—, el sistema MUST NOT solicitar
datos. En su lugar SHALL emitir una advertencia visible al final del despliegue
que nombre el comando exacto a ejecutar.

Esa advertencia SHALL contarse como un problema del despliegue, de modo que el
resultado no se reporte como completamente exitoso mientras la instalación siga
sin administrador.

#### Scenario: Despliegue automatizado sin administradores

- **WHEN** se ejecuta el despliegue sin terminal interactiva en una instalación
  con cero administradores
- **THEN** el despliegue no solicita ninguna entrada
- **AND** la salida incluye una advertencia con el comando a ejecutar
- **AND** el despliegue termina señalando el problema en lugar de reportar éxito
  limpio

### Requirement: El despliegue permite omitir el paso y respeta la simulación

El proceso de despliegue SHALL ofrecer una opción explícita para omitir por
completo el paso del primer administrador.

En modo de simulación, el sistema MUST describir lo que haría sin consultar ni
modificar la base de datos.

#### Scenario: Paso omitido por bandera

- **WHEN** se ejecuta el despliegue con la opción de omitir el paso
- **THEN** no se consulta el número de administradores
- **AND** no se crea ni promueve ninguna cuenta

#### Scenario: Simulación

- **WHEN** se ejecuta el despliegue en modo de simulación
- **THEN** la salida describe el paso del primer administrador
- **AND** no se crea, promueve ni consulta ninguna cuenta

### Requirement: El procedimiento queda documentado

La documentación de instalación SHALL describir cómo se obtiene el primer
administrador, en qué momento del despliegue ocurre y qué hacer si se pierde la
contraseña mostrada.

#### Scenario: Operador que perdió la contraseña

- **WHEN** el operador consulta la documentación tras perder la contraseña
  mostrada una sola vez
- **THEN** encuentra un procedimiento indicado para restablecerla
