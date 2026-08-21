## Why

La portada enlaza «Aviso de privacidad», «Términos de uso» y «Contacto» con
`href: '#'` (`theme/theme.config.example.js:98-100`), y el formulario de alta
hace lo mismo: en `src/pages/RegistroPage.vue:299` la casilla dice «He leído y
acepto el aviso de privacidad» sobre un enlace que no lleva a ninguna parte.

Esto no es un enlace roto, es un defecto de cumplimiento. **Cada persona
registrada tiene `perfiles.aviso_privacidad = true` frente a un documento que
no existe.** El propio repositorio lo advierte —el comentario junto a esas
líneas y `docs/CUMPLIMIENTO.md` lo señalan— y la solución prevista era publicar
el documento en una URL externa y pegarla en la configuración del tema. Eso
deja el texto legal fuera del sistema, sin historia y sin relación con el
consentimiento que sí se guarda en la base.

Además, un aviso de privacidad cambia con el tiempo. Con el consentimiento
guardado como un simple booleano no hay forma de saber **qué texto** aceptó
cada persona, que es justo lo que habría que demostrar ante una autoridad.

## What Changes

- **Páginas públicas nuevas**: `/aviso-privacidad`, `/terminos-uso` y
  `/contacto`, servidas por la propia plataforma. Contacto es una página
  informativa —correo, teléfono, domicilio y horarios—, no un buzón de
  mensajes.
- **Documentos versionados**: publicar no sobrescribe. Cada publicación crea
  una versión nueva con su fecha, y la anterior se conserva. Siempre hay como
  mucho una versión vigente por documento.
- **CRUD en el panel de administración** para editar, previsualizar, publicar y
  consultar el historial de los tres documentos, con editor enriquecido
  (negritas, cursivas, listas, enlaces y encabezados).
- **El consentimiento registra la versión**: al aceptar el aviso durante el
  alta se guarda contra qué versión se otorgó. Al publicar una versión nueva el
  administrador decide si exige volver a aceptarla; solo entonces se pide de
  nuevo a quien ya estaba registrado.
- **Los enlaces de la portada y del formulario de alta dejan de apuntar a `#`**
  y llevan a las páginas reales. La configuración del tema sigue permitiendo
  sustituirlos por una URL externa para quien ya publique sus documentos fuera.
- **El alta se bloquea si no hay aviso publicado**, en lugar de recabar un
  consentimiento vacío.

## Capabilities

### New Capabilities

- `contenido/paginas-institucionales`: los tres documentos institucionales —su
  contenido, versionado, publicación, edición desde el panel y presentación
  pública—, incluido cómo se resuelven los enlaces de la portada.
- `contenido/consentimiento-aviso`: cómo se recaba y se registra la aceptación
  del aviso de privacidad contra una versión concreta, y qué ocurre con quien
  ya lo había aceptado cuando se publica una versión que exige re-aceptación.

### Modified Capabilities

Ninguna. Las capacidades existentes (`instalacion/primer-admin` e
`instalacion/verificacion-despliegue`) no cambian de comportamiento.

## Impact

**Base de datos**

- Migración nueva: tabla de documentos institucionales con sus versiones, RLS
  (lectura pública solo de la versión vigente, escritura solo para
  administradores) y una columna en `perfiles` para la versión aceptada del
  aviso.
- La migración siembra los tres documentos a partir de la plantilla
  `docs/AVISO_PRIVACIDAD.md`, marcados **como borrador**, para que ninguna
  instalación quede publicando una plantilla como si fuera su aviso.

**Frontend**

- Páginas y rutas públicas nuevas; componente de administración con el editor;
  enlaces del pie y del formulario de alta; aviso de re-aceptación.
- Dependencia nueva para el editor enriquecido, cargada solo en el panel.

**Sin impacto**

- Constancias, cursos, evaluaciones y video: sin cambios.
- Edge Functions: ninguna cambia.
- El modelo de roles: no se toca; el CRUD se apoya en `es_admin`, que ya existe.

**Riesgo registrado**

- El editor enriquecido guarda HTML. Un administrador puede escribir contra la
  API sin pasar por el editor, así que el HTML **debe** sanearse al renderizar
  y no solo al guardar. Se trata en el diseño.

**Supuestos registrados**

- Los tres documentos son únicos por instalación: no hay versiones por idioma
  ni por dependencia.
- La plantilla sembrada queda en borrador; publicarla es una decisión
  deliberada del operador, con revisión jurídica, como ya advierte
  `docs/CUMPLIMIENTO.md`.
