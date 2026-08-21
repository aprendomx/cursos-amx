## Context

Ver `proposal.md — Why` para la motivación.

Tres hechos del repositorio condicionan todo lo demás:

1. **El enrutador vive en el fragmento.** `src/router/index.js` usa
   `createWebHashHistory()`, así que la ruta de la aplicación es lo que va tras
   `#`. El flujo implícito de GoTrue devuelve el testigo **también** en el
   fragmento (`#access_token=…&type=recovery`). Los dos reclaman el mismo sitio
   de la URL.

2. **La instalación ya envía correo.** `docker-compose.yml` cablea las claves
   SMTP y `MAILER_URLPATHS_RECOVERY`; en producción están definidas y
   `ENABLE_EMAIL_AUTOCONFIRM=false`, es decir, el correo de confirmación de alta
   ya se envía y llega. No hay que construir envío de correo.

3. **Ya existe un camino de administrador.** `admin-set-password` reemplaza la
   contraseña de otra persona, con límite de frecuencia por
   `_shared/rateLimit.ts`. Este cambio añade el camino de la propia persona; no
   sustituye aquel, que sigue haciendo falta para quien perdió también el acceso
   al correo.

## Goals / Non-Goals

**Goals:**

- Que el testigo de recuperación llegue por un canal que no colisione con el
  enrutador.
- Un solo lugar donde vivan las reglas de contraseña, compartido por alta,
  restablecimiento y cambio desde el perfil.
- Que una instalación sin SMTP lo diga en vez de aceptar en silencio.

**Non-Goals:**

- Cambiar `createWebHashHistory` por historial de rutas. Sería la solución de
  fondo, pero afecta a toda la aplicación, al servidor web y a los enlaces ya
  compartidos. Fuera de este cambio.
- Segundo factor, preguntas de seguridad o cualquier otro mecanismo de
  recuperación distinto del correo.
- Política de caducidad periódica de contraseñas.
- Sustituir `admin-set-password`.

## Decisions

### 1. Flujo PKCE en lugar del implícito

`flowType: 'pkce'` en el cliente de Supabase. El testigo vuelve entonces en la
**cadena de consulta** (`?code=…`), que no compite con el fragmento del
enrutador:

```
https://cursos.aprendo.mx/?code=abc123#/restablecer
                          └── consulta   └── ruta
```

_Alternativas descartadas:_

- **Desenredar el fragmento a mano.** Leer el testigo antes de que el enrutador
  actúe y limpiar la URL. No toca acceso ni alta, pero el resultado depende de
  quién lee el fragmento primero —`detectSessionInUrl` de la librería, el
  enrutador, o nuestro código—, y ese orden es justo lo que ya nos dio un
  defecto de arranque en este repositorio. Además el testigo queda en el
  historial del navegador.
- **Página estática fuera de la SPA.** Evita el conflicto de raíz, pero duplica
  tema, tipografía, tokens y mensajes fuera del sistema de diseño, y se queda
  sin las pruebas del resto.

_Consecuencia que hay que asumir:_ PKCE cambia acceso y alta, no solo
recuperación. Los tres se prueban antes de desplegar. No invalida sesiones
abiertas, porque el testigo de sesión ya emitido no depende del flujo que lo
originó.

### 1b. El enlace del correo NO usa PKCE: usa `token_hash`

_Descubierto al implementar, no al diseñar._ PKCE resuelve la colisión con el
enrutador, pero ata el enlace al navegador que lo pidió. El verificador vive en
su `localStorage`, y la librería instalada lo exige sin alternativa:

```js
const storageItem = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`)
if (!codeVerifier && this.flowType === 'pkce') {
  throw new AuthPKCECodeVerifierMissingError()
}
```

Pedir el restablecimiento en el ordenador y abrir el correo en el móvil —que
es lo que hace la mayoría— falla. Eso vacía el primer requisito del spec: si
hay que acertar el dispositivo, para mucha gente no hay recuperación.

Así que el enlace se envía con `{{ .TokenHash }}` y se canjea con
`verifyOtp({ token_hash, type: 'recovery' })`, que no necesita verificador y
por tanto funciona entre dispositivos.

**PKCE se queda** para acceso y alta: la decisión 1 sigue en pie, y sigue
siendo lo que evita que el testigo aterrice en el fragmento. Lo que cambia es
el mecanismo del enlace de recuperación, no el flujo general.

_Coste asumido:_ una plantilla de correo propia montada en el contenedor de
GoTrue. El servicio `auth` no declara hoy ningún volumen, así que hay que
añadírselo, junto con las variables de plantilla y asunto. Es infraestructura
que no estaba prevista y por eso tiene su propio grupo de tareas.

_Alternativas descartadas:_

- **Aceptar la restricción y avisar.** Cero trabajo de infraestructura, pero
  deja fuera el caso normal —mirar el correo en el móvil— y convierte una
  función de recuperación en una que solo sirve a veces.
- **Volver al flujo implícito.** Funcionaría entre dispositivos, pero devuelve
  la fragilidad de orden en el arranque que este repositorio ya pagó, y deja el
  testigo en el historial del navegador.

### 2. Un componente de contraseña, tres usos

Las reglas de fortaleza, el mostrar/ocultar y los mensajes viven en un único
componente que usan el alta, el restablecimiento y el perfil.

El motivo no es ahorrar líneas: es que **tres copias divergen**. Este
repositorio ya tuvo tres opacidades distintas para el mismo estado deshabilitado
y dieciocho estados de error con casi tantos colores. Un mínimo de longitud
escrito en tres sitios acaba siendo tres mínimos distintos.

Ese componente cumple lo que ya exige `interfaz/accesibilidad`: mensaje junto al
campo, error con texto además de color, y objetivo táctil suficiente en el botón
de mostrar/ocultar.

### 3. La respuesta a la solicitud es siempre la misma

Mismo texto, mismo código y mismo tiempo, exista o no la cuenta. El límite de
frecuencia se aplica por origen, no por correo: limitar por correo revelaría
—por la diferencia de comportamiento— cuáles están registrados, que es
exactamente lo que se quiere evitar.

_Alternativa descartada:_ decir «ese correo no está registrado». Es más amable y
convierte el formulario en un detector de cuentas.

### 4. La ausencia de SMTP se detecta y se comunica

GoTrue devuelve error cuando no puede enviar. Ese caso se distingue del resto y
se traduce en `mapSupabaseError`, junto a los demás mensajes propios de este
repositorio.

No se comprueba la configuración SMTP desde el navegador: el cliente no debe
conocer la infraestructura. Se reacciona al fallo real.

## Risks / Trade-offs

- **PKCE toca acceso y alta** → Probar los tres flujos antes de desplegar, y
  dejarlo escrito en las tareas como requisito de cierre, no como sugerencia.
- **`?code=` conserva un testigo en la URL mientras dura la pantalla** → Limpiar
  la cadena de consulta en cuanto se canjea, para que no quede en el historial
  ni en lo que alguien copie de la barra de direcciones.
- **La plantilla se pierde en una reinstalación** → El correo volvería al enlace
  por defecto y la recuperación fallaría solo entre dispositivos: un fallo
  parcial y difícil de atribuir. La verificación de despliegue debe comprobar
  que la plantilla está montada.
- **Alguien revierte PKCE sin saber por qué está** → El motivo va como
  comentario en `src/lib/supabase.js`, donde se toma la decisión, no solo en
  este documento.
- **Una instalación sin SMTP no puede recuperar contraseñas** → Se comunica en
  la interfaz y se documenta en `THEMING.md`; `admin-set-password` sigue siendo
  la salida para ese caso.
- **El texto de las preguntas frecuentes ya promete este flujo** → Revisarlo al
  cerrar y alinearlo con lo que acabe existiendo. Si no, la aplicación seguiría
  describiendo algo distinto de lo que hace.

## Migration Plan

No hay migraciones de base ni funciones edge nuevas.

0. Montar la plantilla de recuperación en el contenedor de GoTrue y reiniciarlo.
   Sin ella, el correo sale con el enlace por defecto —el que lleva `?code=`— y
   la recuperación entre dispositivos no funciona.
1. Desplegar con los tres flujos probados en un entorno con SMTP.
2. Verificar en producción **acceso** y **alta** antes de anunciar la
   recuperación: son los que PKCE cambia sin que nadie lo haya pedido.
3. Vuelta atrás: revertir `flowType` restaura el comportamiento anterior sin
   tocar datos. Las pantallas nuevas quedarían inertes, no rotas.
