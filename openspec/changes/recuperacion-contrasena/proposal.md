## Why

Quien olvida su contraseña hoy no tiene salida: la pantalla de acceso no ofrece
ninguna forma de recuperarla, y `PerfilPage` tampoco permite cambiarla con la
sesión abierta. La única vía es que un administrador la reemplace a mano con
`admin-set-password`, lo que obliga a la persona a contar su problema y a
confiar su cuenta a otro.

Además, **la plataforma ya promete esta función**. Las preguntas frecuentes de
la portada (`LandingFaq.vue`) dicen textualmente que en el acceso hay un enlace
«Olvidé mi contraseña» y que se envía un correo con un vínculo seguro. Ese
enlace no existe. La aplicación describe hoy un comportamiento que no tiene.

La infraestructura para hacerlo ya está montada y en uso: la instalación tiene
SMTP configurado, envía correos de confirmación de alta y declara la ruta de
recuperación (`MAILER_URLPATHS_RECOVERY`). Lo que falta es la interfaz y el
flujo.

## What Changes

- Enlace **«Olvidé mi contraseña»** en la pantalla de acceso, que hoy no existe
  pese a estar anunciado en las preguntas frecuentes.
- Pantalla para **solicitar el restablecimiento** pidiendo el correo. Responde
  siempre lo mismo exista o no la cuenta, para no revelar qué correos están
  registrados.
- Pantalla para **elegir la contraseña nueva**, a la que se llega desde el
  vínculo del correo.
- Sección **«Cambiar contraseña» en el perfil**, para quien ya tiene la sesión
  abierta. Exige la contraseña actual antes de aceptar una nueva.
- Un solo componente de campo de contraseña, compartido por los tres sitios:
  mismas reglas de fortaleza, mismo mostrar/ocultar y mismos mensajes.
- **BREAKING (interno):** el cliente de Supabase pasa al flujo **PKCE**. El
  enlace de recuperación devuelve entonces el testigo en la cadena de consulta
  (`?code=`) y no en el fragmento, que es donde vive el enrutador de la
  aplicación. Afecta a los tres flujos de autenticación —acceso, alta y
  recuperación—, aunque no invalida las sesiones ya abiertas.
- Límite de frecuencia en la solicitud, reutilizando el mecanismo compartido que
  ya usan las funciones existentes.
- Corregir el texto de las preguntas frecuentes si el flujo final difiere de lo
  que hoy describe.

## Capabilities

### New Capabilities

- `acceso/contrasena-propia`: lo que la plataforma garantiza sobre la contraseña
  de cada persona —que pueda recuperarla sin intervención de nadie, que pueda
  cambiarla teniendo sesión, y qué se le exige a una contraseña nueva—, además
  de lo que el sistema no debe revelar por el camino.

### Modified Capabilities

Ninguna. Los requisitos de `interfaz/accesibilidad` e `interfaz/sistema-visual`
se aplican a las pantallas nuevas, pero no cambian: son el contrato que estas
pantallas deben cumplir, no algo que este cambio modifique.

Nota: esas dos specs entran con el PR #36, todavía sin fusionar cuando se
escribe esto. Si ese PR no llegara a entrar, sus requisitos siguen valiendo
igual para estas pantallas —foco visible, contraste en ambos modos, objetivos
táctiles de 44 px, error con texto y no solo color—, solo que sin estar
escritos en ninguna parte.

## Impact

**Código de la aplicación**

- `src/pages/LoginPage.vue` — enlace de recuperación.
- `src/pages/PerfilPage.vue` — sección de cambio de contraseña.
- Pantallas nuevas para solicitar y para restablecer, con sus rutas.
- Componente compartido de campo de contraseña.
- `src/lib/supabase.js` — `flowType: 'pkce'`.
- `src/router/index.js` — rutas nuevas, públicas.
- `src/lib/errors.ts` — mensajes de los fallos propios de este flujo.
- `src/components/LandingFaq.vue` — alinear el texto con el flujo real.

**Infraestructura**

- No requiere migraciones ni funciones edge nuevas: GoTrue ya expone el flujo y
  el envío de correo está configurado y en uso.
- Sí depende de que cada instalación tenga SMTP. Sin él, la recuperación no
  puede funcionar y hay que decirlo, no fallar en silencio.

**Riesgos**

- PKCE cambia el acceso y el alta, no solo la recuperación: los tres necesitan
  prueba antes de desplegar.
- El enrutado por hash es la razón de ser de esa decisión; conviene dejarlo
  escrito para que nadie lo revierta sin saber por qué.
