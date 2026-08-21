## Context

Ver `proposal.md` — Why para el problema. Lo que condiciona el diseño:

- **El consentimiento ya existe pero es un booleano.** `perfiles.aviso_privacidad`
  se llena en el alta a través del trigger `handle_new_user` (migración 022) y
  `docs/CUMPLIMIENTO.md` lo registra como la prueba de aceptación. No dice
  contra qué.
- **El rol de administrador es `perfiles.es_admin`**, y el trigger
  `perfiles_guard_roles` (057/069) impide que nadie se lo otorgue. El CRUD se
  apoya en lo que ya hay; no se toca el modelo de permisos.
- **El router usa `createWebHashHistory`**, así que las páginas quedan en
  `/#/aviso-privacidad`. Cambiar el modo de historial rompería enlaces
  existentes y queda fuera de alcance, pero conviene saberlo: la URL que se
  imprima en un documento oficial llevará almohadilla.
- **La baja ARCO reinicia el consentimiento.** La migración 064 pone
  `aviso_privacidad = false` al dar de baja a alguien; cualquier columna nueva
  que registre el consentimiento tiene que reiniciarse ahí también, o el
  registro quedaría contradiciéndose.
- **El pie se arma desde la configuración del tema** (`footer.columns[].links`),
  hoy con `href: '#'`. Hay instalaciones que podrían tener sus documentos
  publicados fuera, así que la configuración debe seguir mandando cuando define
  una URL.
- **Ya hay `dompurify` en el árbol**, pero como dependencia transitiva de
  `html2pdf.js`. Apoyarse en una transitiva es frágil: desaparece si cambia esa
  cadena.
- **El repo ya guarda contenido enriquecido como JSON de Tiptap**, no como
  HTML: `LessonRichTextEditor` emite `getJSON()` y `PlayerTextoSurface`
  renderiza con `generateHTML` sobre la whitelist compartida
  `EXTENSIONES_TEXTO`. Tiptap ya es dependencia declarada.

## Goals / Non-Goals

**Goals:**

- Que el consentimiento sea demostrable: qué texto aceptó cada persona y
  cuándo.
- Que una instalación nueva no pueda recabar consentimiento contra la nada.
- Que el historial de un documento legal sea inmutable una vez publicado.
- Que el HTML almacenado no pueda ejecutar nada en la página pública.

**Non-Goals:**

- No se construye un gestor de contenidos general: son tres documentos fijos.
- No hay versiones por idioma ni por dependencia.
- No se cambia el modo de historial del router.
- No se implementa buzón de contacto (decidido en la propuesta).
- No se redacta el contenido legal: se siembra la plantilla en borrador y la
  redacción es del operador, con su área jurídica.

## Decisions

### 1. Una sola tabla de versiones, y «vigente» es un cálculo

`documento_versiones(slug, version, contenido, publicado_en, requiere_reaceptacion, publicado_por)`,
con `(slug, version)` como clave.

- **Borrador** = fila con `publicado_en` nulo. Como mucho una por `slug`.
- **Vigente** = la de `version` mayor entre las que tienen `publicado_en`.

Se prefiere a mantener una columna `es_vigente` porque un booleano de vigencia
hay que actualizarlo en dos filas a la vez y admite estados imposibles —dos
vigentes, ninguna vigente—. Derivarlo de los datos no puede desincronizarse.

Esto además hace la RLS trivial y es lo que la sostiene: **lectura pública de
las filas con `publicado_en` no nulo**, escritura solo para `es_admin`. El
borrador queda invisible sin ninguna condición extra, que es justo lo que pide
el spec.

_Consecuencia buscada_: el historial publicado es legible por cualquiera. Para
un documento legal es deseable —permite comprobar qué decía el aviso en una
fecha— y no expone nada que no se hubiera publicado ya.

La inmutabilidad se aplica con un trigger que rechaza `update` y `delete` sobre
filas con `publicado_en` no nulo. Sin él, «no se puede alterar el historial» es
una intención, no una garantía.

### 2. El consentimiento guarda la versión, y no lo escribe el cliente

Columna nueva `perfiles.aviso_version_aceptada` (entera, nula = sin aceptar).
`aviso_privacidad` se conserva: es lo que ya consulta el resto del sistema y
`docs/CUMPLIMIENTO.md` lo documenta.

La aceptación **no** se hace con un `update` desde el cliente, sino con una
función `aceptar_aviso_vigente()` con `security definer`, que escribe la versión
vigente **que ella misma consulta**. Si el cliente pudiera fijar el número, una
persona podría declararse al día con una versión que nunca se le mostró, y el
registro dejaría de valer como prueba —que es todo el propósito del cambio—.

Un trigger guardián impide modificar la columna por la vía directa, siguiendo el
mismo patrón que `perfiles_guard_roles`, con la misma excepción para el backend
(`auth.uid()` nulo) que necesitan las migraciones y la baja ARCO.

### 3. La re-aceptación se decide por lo que ocurrió entre versiones

Hace falta re-aceptar cuando existe **alguna** versión publicada posterior a la
aceptada que venga marcada con `requiere_reaceptacion`.

No basta con mirar solo la vigente: si se publican dos versiones seguidas y la
que exigía re-aceptación es la primera, mirar únicamente la última perdería la
obligación. Se calcula con la condición sobre el intervalo, no sobre el extremo.

### 4. El contenido se guarda como JSON de Tiptap, no como HTML

**Corregido durante la implementación.** El diseño original decía guardar HTML y
sanearlo con DOMPurify al renderizar. Al ir a construirlo apareció que el repo
ya había resuelto esto para las lecciones, y de otra forma:

```
LessonRichTextEditor.vue → ed.getJSON()                 (JSON, no HTML)
PlayerTextoSurface.vue   → generateHTML(json, EXTENSIONES_TEXTO)
```

`EXTENSIONES_TEXTO` es una whitelist compartida entre editor y renderizador, y
el propio código la describe como la sanitización. Seguir con HTML habría
metido un segundo formato de contenido y una segunda vía de saneado en paralelo
a la que ya existe, para el mismo problema.

Se adopta la convención: `contenido` es `jsonb`, el editor es el que ya hay, y
el renderizado va por `generateHTML` con la misma whitelist.

**Con una red de seguridad encima**: la salida de `generateHTML` pasa por
DOMPurify antes de insertarse. Dos razones concretas:

- Se comprobó que `generateHTML` **lanza** ante un nodo desconocido en vez de
  descartarlo. Falla cerrado, que está bien, pero obliga a envolver el
  renderizado: un JSON corrupto no debe tumbar la página, tiene que degradarse
  a un aviso.
- No se pudo confirmar si un `href: "javascript:…"` escrito a mano en el JSON
  sobrevive al renderizado. La opción `protocols` de Link gobierna el pegado y
  el autoenlace; el render es otra cosa. Pasar por DOMPurify con una lista
  explícita de esquemas de URI cierra la duda sin depender de resolverla.

La frontera de confianza sigue estando en el renderizado y no en el editor: un
administrador puede escribir contra PostgREST sin pasar por él.

### 5. Se reutiliza el editor existente

`LessonRichTextEditor.vue` ya envuelve Tiptap con la whitelist, y Tiptap ya es
dependencia declarada. No se añade nada: se reutiliza.

El diseño original preveía introducir Tiptap y construir un editor. Habría sido
trabajo duplicado y, peor, una segunda configuración de la misma librería que
podría divergir de la de lecciones sin que nadie lo notase.

### 6. Los enlaces se resuelven con la configuración por delante

Para cada enlace institucional: si la configuración del tema define una URL, se
usa; si no, se usa la ruta interna. Así una instalación que ya publica sus
documentos fuera no cambia de comportamiento, y una nueva deja de tener `#`.

El valor `'#'` de la plantilla del tema se sustituye por vacío, para que
«no configurado» signifique «usa la página interna» y no «enlaza a ninguna
parte».

### 7. La siembra queda en borrador, deliberadamente

La migración crea los tres documentos con la plantilla de
`docs/AVISO_PRIVACIDAD.md` convertida, **sin publicar**.

Publicar una plantilla con marcadores `{{ }}` como si fuera el aviso de la
institución sería peor que no tener aviso: daría apariencia de cumplimiento. El
spec exige que el alta se bloquee mientras no haya versión vigente, así que el
operador se entera en cuanto alguien intenta registrarse, no meses después.

## Risks / Trade-offs

- **El alta queda bloqueada en instalaciones nuevas hasta publicar el aviso** →
  es intencional y es el punto del cambio, pero es un cambio de comportamiento
  visible. El mensaje de error dice exactamente qué falta y quién puede
  resolverlo.
- **El historial publicado es legible por cualquiera** → deseable para un
  documento legal; conviene que el operador lo sepa antes de publicar un
  borrador a medias, porque publicar es irreversible por diseño.
- **La URL llevará almohadilla** (`/#/aviso-privacidad`) por el modo de
  historial del router → si se va a imprimir en documentos oficiales, quizá
  convenga un cambio de modo, que es un cambio aparte y con su propio riesgo.
- **Tiptap añade peso al panel** → mitigado con importación dinámica; no afecta
  a la portada ni al reproductor.
- **Un administrador puede publicar contenido dañino** → el saneado al
  renderizar acota el daño a lo que permita la lista de etiquetas. Frente a un
  administrador hostil no hay defensa técnica completa; es el mismo supuesto
  que ya sostiene el resto del panel.

## Migration Plan

1. Migración nueva: tabla de versiones, RLS, trigger de inmutabilidad, columna
   en `perfiles`, función de aceptación, trigger guardián y siembra en borrador
   de los tres documentos.
2. Actualizar la baja ARCO de la migración 064 para que reinicie también la
   versión aceptada.
3. Despliegue normal con `scripts/deploy.sh`, que aplica migraciones y respalda
   antes.

Rollback: la migración es aditiva —tabla nueva y una columna—, así que revertir
el frontend deja la base con datos inertes. Si hubiera que deshacerla del todo,
la tabla se elimina y la columna se descarta; el booleano `aviso_privacidad`
sigue como estaba, así que ningún consentimiento previo se pierde.

### 8. El servicio no se llama `documentos.js`

`src/services/documentos.js` ya existe y sirve para otra cosa: los archivos
adjuntos a una lección (`uploadDocumento`, `getDocumentoUrl`). El servicio de
esta capacidad va en `documentosInstitucionales.js`.

Se descubrió al construirlo, sobrescribiendo el archivo existente por accidente
y rompiendo el build. Queda anotado aquí porque el nombre obvio está tomado y
la colisión no salta a la vista: los dos hablan de «documentos» y son cosas
distintas.

## Open Questions

- Si conviene o no imprimir la URL del aviso en las constancias emitidas. No
  afecta a las specs ni al reparto de tareas de este cambio: puede decidirse
  después sin tocar nada de lo aquí definido.
