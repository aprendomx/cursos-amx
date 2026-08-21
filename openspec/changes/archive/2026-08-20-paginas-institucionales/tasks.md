## 1. Migración: documentos y versiones

- [x] 1.1 Crear la migración `073_paginas_institucionales.sql` con la tabla `documento_versiones(slug, version, contenido, publicado_en, requiere_reaceptacion, publicado_por, creado_en)`, clave `(slug, version)` y restricción de que `slug` sea uno de los tres documentos previstos.
- [x] 1.2 Restricción de un solo borrador por documento: índice único parcial sobre `slug` cuando `publicado_en` es nulo.
- [x] 1.3 Vista `v_documento_vigente`: por cada `slug`, la fila de mayor `version` entre las que tienen `publicado_en` no nulo.
- [x] 1.4 RLS: lectura para cualquiera —incluido `anon`— solo de las filas con `publicado_en` no nulo; `insert`/`update`/`delete` solo para `es_admin`.
- [x] 1.5 Trigger de inmutabilidad: rechazar `update` y `delete` sobre filas con `publicado_en` no nulo, con mensaje traducible por `src/lib/errors.ts`.
- [x] 1.6 Sembrar los tres documentos como borrador, convirtiendo `docs/AVISO_PRIVACIDAD.md` a JSON de Tiptap y dejando marcadores visibles para lo que el operador debe sustituir. Ninguno con `publicado_en`.

## 2. Migración: consentimiento versionado

- [x] 2.1 Añadir `perfiles.aviso_version_aceptada` (entera, nula por defecto).
- [x] 2.2 Función `aceptar_aviso_vigente()` con `security definer`, que consulta ella misma la versión vigente y la escribe para `auth.uid()`; falla si no hay versión vigente.
- [x] 2.3 Trigger guardián sobre `aviso_version_aceptada` que impida fijarla por `update` directo desde una sesión autenticada, con la misma excepción de `auth.uid()` nulo que usa `perfiles_guard_roles`.
- [x] 2.4 Función `aviso_requiere_reaceptacion(uid)`: verdadero si existe alguna versión publicada posterior a la aceptada con `requiere_reaceptacion`. Evaluar el intervalo, no solo la versión vigente.
- [x] 2.5 Actualizar la baja ARCO de la migración 064 para que reinicie también `aviso_version_aceptada`.
- [x] 2.6 Impedir el alta sin aviso publicado: en `handle_new_user`, rechazar cuando llega `aviso_privacidad = true` y no existe versión vigente, con un mensaje que diga qué falta.

## 3. Servicios y sanitización

- [x] 3.1 Añadir `dompurify` como dependencia directa con versión declarada, en lugar de heredarla de `html2pdf.js`. Se usa como red de seguridad sobre la salida de `generateHTML`.
- [x] 3.2 Crear `src/lib/sanitizarHtml.js` con la lista de etiquetas, atributos y esquemas de URI permitidos, acotada al formato que produce el editor.
- [x] 3.3 Crear `src/services/documentosInstitucionales.js` (no `documentos.js`, que ya existe y sirve para los adjuntos de lección): obtener la versión vigente por `slug`, obtener el borrador, listar el historial, guardar borrador, publicar, y aceptar el aviso vía la función.
- [x] 3.4 Traducir en `src/lib/errors.ts` los errores nuevos: historial inmutable, alta sin aviso publicado y publicación sin contenido.

## 4. Páginas públicas

- [x] 4.1 Crear `src/pages/DocumentoPage.vue`, que resuelve el documento por `slug` de la ruta y presenta el contenido con `generateHTML` + saneado, envuelto para que un JSON corrupto degrade a un aviso en vez de tumbar la página.
- [x] 4.2 Estado sin versión vigente: indicar que el documento aún no se ha publicado, sin mostrar el borrador.
- [x] 4.3 Registrar las rutas públicas `/aviso-privacidad`, `/terminos-uso` y `/contacto`, accesibles sin sesión.
- [x] 4.4 Mostrar la fecha de publicación y el número de versión, que es lo que da valor probatorio a la página.

## 5. Enlaces de la portada y del alta

- [x] 5.1 Resolver cada enlace institucional del pie: si el tema define una URL, usarla; si no, la ruta interna.
- [x] 5.2 Sustituir los `href: '#'` de `theme/theme.config.example.js` por vacío, para que «no configurado» signifique «usa la página interna».
- [x] 5.3 Apuntar el enlace de la casilla de `src/pages/RegistroPage.vue:299` al aviso, en lugar de `#`.
- [x] 5.4 Documentar el cambio en `THEMING.md`.

## 6. CRUD en el panel

- [x] 6.1 Crear `src/components/AdminDocumentos.vue` con la lista de los tres documentos y su estado: sin publicar, publicado, o con borrador pendiente.
- [x] 6.2 Reutilizar `LessonRichTextEditor.vue` en lugar de construir un editor nuevo: Tiptap ya es dependencia y su whitelist `EXTENSIONES_TEXTO` es compartida. El panel ya se carga bajo demanda.
- [x] 6.3 Guardar borrador sin publicar, y que ello no altere la versión que ven las personas.
- [x] 6.4 Vista previa que use exactamente el mismo componente de presentación que la página pública, para que lo previsualizado sea lo que se publica.
- [x] 6.5 Publicar: crear la versión nueva, con la casilla de «esta versión exige volver a aceptar» y una confirmación que advierta de que publicar es irreversible.
- [x] 6.6 Historial: listar las versiones con su fecha y quién publicó, y poder leer cada una.
- [x] 6.7 Enganchar la pantalla en `AdminPage.vue`, siguiendo el patrón de las demás secciones.

## 7. Re-aceptación

- [x] 7.1 Al iniciar sesión, consultar si el consentimiento está pendiente de renovar.
- [x] 7.2 Componente que avise de que el aviso cambió, con acceso al texto nuevo antes de aceptar.
- [x] 7.3 Aceptar llama a la función; no marcar nada como aceptado sin un acto explícito de la persona.
- [x] 7.4 Quien no acepte conserva su versión anterior registrada y puede seguir usando la plataforma; no se le bloquea el acceso.
- [x] 7.5 En el panel: cuántas personas tienen la versión vigente aceptada y cuántas están pendientes.

## 8. Pruebas

- [x] 8.1 Tests de `sanitizarHtml`: se eliminan etiquetas ejecutables y atributos de evento; sobreviven encabezados, listas, negritas y enlaces.
- [x] 8.2 Test de que la página pública sanea **al renderizar**, partiendo de contenido malicioso ya almacenado —el caso del administrador que escribe contra la API.
- [x] 8.3 Tests de `DocumentoPage`: versión vigente, documento sin publicar, y que nunca muestra el borrador.
- [x] 8.4 Tests de resolución de enlaces: con URL en el tema y sin ella.
- [x] 8.5 Tests de `AdminDocumentos`: guardar borrador no cambia lo publicado; publicar crea versión; la vista previa usa el mismo componente que la pública.
- [x] 8.6 Test de la regla de re-aceptación con dos versiones seguidas, donde la que la exige es la primera: debe seguir exigiéndola.
- [x] 8.7 Añadir los casos SQL a `scripts/test-migrations.sh`: RLS del borrador, inmutabilidad del historial, y que la aceptación por `update` directo se rechaza.

## 9. Verificación manual

- [ ] 9.1 Sobre una base sin aviso publicado: comprobar que el alta se bloquea con el mensaje correcto y que la página lo indica.
- [ ] 9.2 Publicar el aviso, registrar una cuenta y verificar en la base que quedó la versión aceptada correcta.
- [ ] 9.3 Publicar una versión sin re-aceptación y confirmar que a esa cuenta no se le pide nada.
- [ ] 9.4 Publicar una que sí la exija y confirmar que se le pide, que al aceptar se actualiza la versión, y que si no acepta conserva la anterior.
- [ ] 9.5 Intentar `update` y `delete` sobre una versión publicada y confirmar el rechazo.
- [ ] 9.6 Comprobar en el navegador que los tres enlaces del pie llevan a las páginas y ninguno queda en `#`.

## 10. Documentación

- [x] 10.1 Actualizar `docs/CUMPLIMIENTO.md`: el consentimiento pasa a registrar versión, y el aviso se administra desde el panel.
- [x] 10.2 Ajustar `docs/AVISO_PRIVACIDAD.md` para que apunte al panel como lugar de publicación, en vez de a una URL externa pegada en el tema.
- [x] 10.3 Documentar las páginas y su CRUD en el README.
- [x] 10.4 Entrada en `CHANGELOG.md` bajo «No publicado», señalando el cambio de comportamiento: el alta se bloquea mientras no haya aviso publicado.
