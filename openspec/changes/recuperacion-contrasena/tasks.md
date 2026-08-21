## 1. Cimientos: PKCE y reglas de contraseña

- [x] 1.1 Cambiar el cliente de Supabase a `flowType: 'pkce'`, con el motivo escrito ahí mismo: el enrutador vive en el fragmento y el flujo implícito devuelve el testigo en el fragmento. Sin esa nota, alguien lo revierte.
- [ ] 1.2 Probar **acceso** y **alta** tras el cambio de flujo, en navegador. Son los que PKCE toca sin que nadie lo pidiera; si se rompen, se rompen antes de que exista la recuperación. — **Acceso verificado** de extremo a extremo contra la API real con PKCE activo: la petición sale a `token?grant_type=password` y la interfaz muestra «Correo o contraseña incorrectos». **El alta no**: lo que PKCE cambia ahí es la forma del enlace de confirmación, y eso solo se observa en un correo real; verificarlo exige crear una cuenta. Queda para 9.2, con backend y buzón.
- [x] 1.3 Extraer las reglas de contraseña a un solo módulo (mínimo de longitud y lo que se exija), y hacer que el alta lo use en vez de su comprobación propia.
- [x] 1.4 Prueba de que el alta sigue exigiendo lo mismo que antes del refactor: es la comprobación de que no se cambió una regla al moverla.

## 2. Campo de contraseña compartido

- [x] 2.1 Componente de contraseña con mostrar/ocultar, que anuncia las reglas ANTES de escribir y no solo al rechazar.
- [x] 2.2 El error va junto al campo y lleva texto además de color; el botón de mostrar/ocultar cumple el objetivo táctil de 44 px.
- [x] 2.3 Sustituir el campo del alta por el componente, comprobando que el asistente de cuatro pasos sigue avanzando igual. — Al hacerlo salió un fallo: `id="r-password"` caía en el `<div>` raíz por herencia de atributos y no en el input, así que `#r-password` dejaba de encontrar el campo. Corregido con una prop `id` explícita e `inheritAttrs: false`.
- [x] 2.4 Pruebas del componente: reglas anunciadas, error junto al campo, alternancia de visibilidad, y etiqueta accesible del botón.

## 3. Solicitar el restablecimiento

- [x] 3.1 Enlace «Olvidé mi contraseña» en la pantalla de acceso.
- [x] 3.2 Pantalla de solicitud con el correo, su ruta pública, y `role="alert"` en la respuesta.
- [x] 3.3 Respuesta indistinguible exista o no la cuenta: mismo texto y mismo código. Comprobar también que no se filtra por el TIEMPO de respuesta.
- [x] 3.4 Límite de frecuencia por origen —no por correo—, reutilizando el mecanismo compartido que ya usan las funciones existentes. — El límite tiene que ser del SERVIDOR: uno en el navegador es decorativo, porque quien abusa no usa el navegador. Se añade `GOTRUE_RATE_LIMIT_EMAIL_SENT`, que no estaba declarado en ningún sitio.
- [x] 3.5 Prueba de la indistinguibilidad: correo existente y correo inventado producen la misma respuesta observable.

## 4. El correo lleva un enlace que sirve en cualquier dispositivo

Añadido tras descubrir, al implementar, que PKCE ata el enlace al navegador que
lo pidió. Ver `design.md — decisión 1b`.

- [x] 4.1 Plantilla de correo de recuperación con `{{ .TokenHash }}`, apuntando a la aplicación. Respeta el tema de la instalación: es el primer correo que esta plataforma envía con contenido propio.
- [x] 4.2 Montarla en el contenedor de GoTrue: el servicio `auth` no declara hoy ningún volumen, así que hay que añadírselo, más las variables de plantilla y de asunto.
- [x] 4.3 Declarar esas variables en `docker/.env.example` con un valor por defecto que funcione, y documentarlas.
- [x] 4.4 Que `scripts/deploy.sh` compruebe que la plantilla está montada. Si se pierde en una reinstalación, el correo vuelve al enlace por defecto y la recuperación falla SOLO entre dispositivos: un fallo parcial que nadie atribuiría a esto. — La regla se extrajo a `clasificar_plantilla_recovery`, función pura, siguiendo el criterio que ya rige ese banco de pruebas: lo que no se puede ejecutar en seco no se puede probar. Distingue la plantilla **ausente** de la **sustituida**, que no se arreglan igual.

## 5. Elegir la contraseña nueva

- [ ] 5.1 Pantalla de restablecimiento que canjea el `token_hash` con `verifyOtp`, no el `?code=`: es lo que la hace servir en cualquier dispositivo.
- [ ] 5.2 Limpiar la cadena de consulta en cuanto se canjea, para que el testigo no quede en el historial ni en lo que alguien copie de la barra.
- [ ] 5.3 Vínculo ya usado y vínculo caducado: rechazar, explicar cuál de los dos es, y ofrecer solicitar otro. Son dos mensajes distintos porque son dos situaciones distintas.
- [ ] 5.4 Al terminar con éxito, dejar a la persona con sesión iniciada y decirle que la contraseña cambió.
- [ ] 5.5 Pruebas: canje correcto, vínculo usado, vínculo caducado y contraseña que no cumple las reglas.

## 6. Cambiar la contraseña desde el perfil

- [ ] 6.1 Sección de cambio de contraseña en `PerfilPage`, usando el componente compartido.
- [ ] 6.2 Exigir la contraseña actual y verificarla contra el servidor antes de aceptar la nueva.
- [ ] 6.3 Contraseña actual incorrecta: rechazar, explicarlo, y dejar la anterior en pie.
- [ ] 6.4 Confirmación visible del cambio, con `role="alert"` y foco, no un mensaje que pase inadvertido.
- [ ] 6.5 Pruebas: cambio correcto, contraseña actual incorrecta, y nueva que no cumple las reglas.

## 7. Cuando no se puede enviar correo

- [ ] 7.1 Distinguir el fallo de envío del resto y traducirlo en `mapSupabaseError`, junto a los demás mensajes propios de este repositorio.
- [ ] 7.2 La pantalla lo dice y señala a quién dirigirse; nunca afirma que el correo se envió.
- [ ] 7.3 Documentar en `THEMING.md` que una instalación sin SMTP no puede recuperar contraseñas, y que la salida en ese caso es `scripts/crear-admin.sh` o `admin-set-password`.
- [ ] 7.4 Prueba de que el fallo de envío produce ese mensaje y no el genérico.

## 8. Alinear lo que la plataforma promete

- [ ] 8.1 Revisar el texto de `LandingFaq.vue`, que ya describe este flujo, y alinearlo con lo que acabó existiendo.
- [ ] 8.2 Prueba que ate el texto de las preguntas frecuentes a la existencia real del enlace en el acceso: es lo que evita que la promesa vuelva a separarse del producto.

## 9. Verificación de cierre

- [ ] 9.1 Recorrido completo en navegador con SMTP real: solicitar, recibir, restablecer, entrar con la nueva. **Y el caso que motivó la decisión 1b: pedirlo en un navegador y abrir el enlace en OTRO.**
- [ ] 9.2 Los tres flujos de autenticación —acceso, alta y recuperación— probados juntos tras PKCE.
- [ ] 9.3 Las pantallas nuevas en 375, 768, 1024 y 1440 px, en ambos modos, con `e2e/anchuras.spec.js`.
- [ ] 9.4 Contraste medido en las pantallas nuevas, en ambos modos, hasta 0 combinaciones por debajo de 4.5:1.
- [ ] 9.5 Recorrido con teclado: llegar al enlace, completar la solicitud y restablecer sin tocar el ratón.
