# Guía de personalización (THEMING)

Cursos AMX separa completamente la identidad gráfica del código de la aplicación.
Todo lo que necesitas cambiar para adaptar la plataforma a tu institución vive en
tres lugares:

| Qué                    | Dónde                          |
| ---------------------- | ------------------------------ |
| Textos, colores, logos | `theme/theme.config.js`        |
| Secciones de landing   | `theme/sections/` + `index.js` |
| Assets de imagen       | `public/theme/`                |

---

## 0. Cómo personalizar (empieza aquí)

```bash
cp theme/theme.config.example.js theme/theme.config.local.js
```

Edita **tu copia**. `theme.config.local.js` está en `.gitignore`, así que
sobrevive a los `git pull` sin conflictos de merge.

> **Por qué importa.** Antes el tema vivía en `theme/theme.config.js`, un
> archivo versionado. Una institución que lo editaba entraba en conflicto en
> cada actualización — y el paso 1 de `scripts/deploy.sh` es precisamente
> `git pull`, así que el despliegue se detenía ahí. Con el archivo local eso
> ya no ocurre.

Si no existe `theme.config.local.js`, la aplicación usa el ejemplo: un clon
recién hecho arranca sin configurar nada.

`theme/theme.config.example.js` **se actualiza con cada versión**. No lo
edites: cuando aparezcan claves nuevas, cópialas de ahí a tu archivo local.

---

## 0.05 Sistema de tokens

Los valores que determinan la apariencia viven en `src/assets/main.css`, no en
cada componente. **Un componente no escribe a mano un tamaño, un radio o una
sombra cuando existe un token para ese propósito.**

Antes de que existieran había 359 declaraciones de `font-size` con 54 valores
distintos, 174 de `border-radius` con 21 y 26 sombras con 19 valores —casi cada
sombra era única—. Eso es lo que hacía que la interfaz se sintiera despareja sin
que se pudiera señalar un culpable concreto.

| Escala         | Tokens                                                                     | Para qué                                                                                                                          |
| -------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Texto          | `--text-xs` … `--text-4xl`                                                 | 12, 14, 16, 18, 20, 24, 32, 44 px. **12 px es el piso**: por debajo el texto deja de ser legible para buena parte de quien lo lee |
| Interlineado   | `--leading-tight/snug/normal`                                              | 1.2 en títulos, 1.6 en cuerpo                                                                                                     |
| Peso           | `--weight-regular/medium/bold`                                             | La jerarquía se sostiene con tamaño y peso, no con color                                                                          |
| Radios         | `--radius-sm/md/lg/full`                                                   | Campos y chips · botones y tarjetas · paneles y diálogos · píldoras                                                               |
| Elevación      | `--elev-0` … `--elev-3`                                                    | Reposo · tarjeta · panel o menú · diálogo sobre velo                                                                              |
| Estado         | `--danger`, `--success`, `--warn` y sus `-soft`                            | Los tres se distinguen entre sí **y del color de marca**                                                                          |
| Primer plano   | `--primary-fg`                                                             | El color de marca cuando es TEXTO: ajustado para cumplir 4.5:1. El de fondo conserva el valor de la institución                   |
| Foco           | `--focus-ring`                                                             | Una superficie con fondo oscuro propio puede invertirlo localmente                                                                |
| Reconocimiento | `--oro`                                                                    | Insignias y logros. Se aclara en oscuro; sobre el amarillo suave del acento usa `--sobre-accent-soft`                             |
| Sobre marca    | `--sobre-primary`, `--sobre-secondary`, `--sobre-accent`, `--sobre-*-soft` | La tinta de una superficie pintada con el color institucional. **No siguen al modo**, siguen al fondo que pisan                   |

### La regla del par

Un color puede seguir al tema o no seguirlo. Los dos son legítimos. Lo que
**nunca** es correcto es mezclarlos en el mismo par fondo/texto:

- Fondo que sigue + tinta clavada → al pasar a oscuro el fondo se va a negro y
  la tinta se queda negra.
- Fondo clavado —porque es el color de la marca— + tinta que sigue → lo mismo
  al revés.

Así estaban el hero (1.82:1), las preguntas frecuentes (1.08:1) y los chips
(3.44:1): cada uno por una de las dos mitades del mismo error. La barra de
navegación se pinta con el azul institucional, que vale igual en claro y en
oscuro porque **es la marca**; el texto de encima llevaba `--paper`, que sí se
invierte.

Para esas superficies existen los tokens `--sobre-*`. `applyTheme()` los deriva
del color de cada instalación con `tintaLegible()`, así que una identidad clara
—un amarillo, un cian— recibe tinta oscura en vez de blanca.

Un detalle que no es evidente: **`--primary` y `--primary-700` no sirven como
tinta sobre un fondo teñido.** En modo oscuro las dos están derivadas para dar
4.5:1 _justos_ contra el papel, así que cualquier tinte —aunque sea del 8%— se
come el margen entero. Por eso el tinte suave tiene su propia tinta,
`--sobre-primary-100`, derivada contra el tinte real.

`src/lib/__tests__/temaPares.test.js` comprueba la regla sobre todo el CSS del
proyecto, y deduce qué token sigue al tema leyendo si se redefine en
`[data-theme='dark']` — no hay lista que mantener a mano.

Tres cosas que **no** se tokenizan, y conviene saber por qué antes de
«arreglarlas»:

- **El letterbox del reproductor** (`#000` de fondo, `#fff` de texto) y **la
  hoja de la vista previa de constancia** (`#fff`). No son tokens de tema sino
  condiciones de visionado o de impresión: deben ser los mismos en modo claro y
  oscuro. Con `--paper` se invertirían.
- **La constancia** (`ConstanciaPage`). `html2pdf` dibuja el PDF desde el DOM,
  así que sus tamaños son la tipografía del documento oficial: cambiarlos
  desplaza la constancia impresa que la gente ya tiene.
- **Los colores que van a un `<canvas>`.** El contexto 2D **ignora `var()` en
  silencio**: asignarlo es un no-op que conserva el valor anterior. Usa
  `resolverColor()` de `src/lib/colorCanvas.js` antes de dibujar.

## 0.1 Contrato de estabilidad

### Migrar de la versión 1 a la 2

La versión 2 del esquema trae un **refresco visual**. Si tu tema declara
`schemaVersion: 1`, la aplicación **se detiene al arrancar** con un mensaje que
explica esto; es deliberado, para que el cambio no te sorprenda en producción.

Qué cambia en tu instalación, aunque no toques nada:

|                                    | Antes                        | Ahora                      |
| ---------------------------------- | ---------------------------- | -------------------------- |
| Texto base                         | 15 px                        | 16 px                      |
| Texto más pequeño                  | hasta 9 px                   | mínimo 12 px               |
| Tamaños, radios y sombras          | valor por componente         | escalas de tokens          |
| Color de error                     | el color de marca            | color propio, `#b3261e`    |
| Texto tenue (`--ink-3`, `--ink-4`) | 3.95:1 y 1.61:1 sobre blanco | los cuatro niveles ≥ 4.5:1 |

Para migrar:

1. Cambia `schemaVersion: 1` por `schemaVersion: 2` en tu
   `theme.config.local.js`.
2. Si tus enlaces institucionales del pie traen `href: '#'`, considera pasar a
   la clave `doc` (ver «Enlaces institucionales» más abajo).
3. **Opcional:** declara `colors.danger` si el rojo por defecto desentona con tu
   identidad. Antes no existía la clave porque el error usaba tu color de
   marca — lo que hacía que un mensaje de error se viera igual que un botón
   principal.
4. Revisa tus pantallas: el texto es algo mayor y respira más, así que un
   bloque que cabía justo puede necesitar otro salto de línea.

**Si tu tema no declara `schemaVersion`**, la aplicación asume la vigente y solo
deja un aviso en consola. Declararla es lo que hace que el próximo cambio te
avise en vez de sorprenderte.

Esto es lo que puedes usar sabiendo que no se romperá sin aviso, y lo que es
interno y puede cambiar en cualquier versión.

### Contrato estable

| Qué                                                         | Garantía                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Las claves de `theme.config.example.js`                     | No se renombran ni se retiran sin subir `schemaVersion`                            |
| Las 16 claves requeridas (§2)                               | Si falta alguna, el arranque falla con un mensaje que dice cuál                    |
| Las variables CSS `--brand-*` (§ colores)                   | Nombres estables; puedes sobrescribirlas desde tu propio CSS                       |
| Las variantes `--brand-*-on-dark`                           | Se derivan solas para cumplir WCAG AA; puedes fijarlas con `colors.<nombre>OnDark` |
| Los assets bajo `public/theme/` (§4)                        | Las rutas y los nombres de archivo no cambian                                      |
| El registro de secciones custom (`theme/sections/index.js`) | La firma no cambia dentro de una misma `schemaVersion`                             |

### Interno — puede cambiar sin aviso

- Cualquier clase CSS de `src/assets/main.css` que no sea una variable `--brand-*`.
- La estructura del DOM de cualquier componente.
- Los nombres de los chunks del bundle.
- Todo lo que esté bajo `src/`.

Si para lograr tu identidad institucional necesitas tocar algo de la lista
"interno", **eso es un hueco del contrato**: repórtalo como issue en vez de
parchear `src/`, porque un `git pull` te lo va a deshacer.

### `schemaVersion`

`theme.config.example.js` declara `schemaVersion: 1`. La aplicación rechaza en
arranque un tema que declare una versión distinta, con un mensaje que apunta a
esta sección. La clave es **opcional**: un tema que no la declare se asume de
la versión vigente, para no romper instalaciones anteriores a este contrato.

La versión sube solo cuando cambia el contrato: clave nueva obligatoria,
renombrada o retirada. Cada subida se documenta aquí con los pasos de
migración.

| `schemaVersion` | Cambios                      | Cómo migrar |
| --------------- | ---------------------------- | ----------- |
| 1               | Versión inicial del contrato | —           |

---

## 1. `theme/theme.config.example.js` — referencia completa de claves

La validación de claves requeridas ocurre en arranque y en tests (`src/lib/theme.js`).
Si falta alguna clave marcada como **requerida**, la aplicación lanza error inmediatamente.

### Grupo `app`

| Clave               | Efecto                                                    | Consumidores                                                                                    | Requerida |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| `app.name`          | Nombre de la plataforma en nav, hero, footer, correos     | TopNav, AppLogo, LandingHero, LandingFooter, LoginPage, PerfilPage, ConstanciaPage, LandingPage | ✓         |
| `app.shortName`     | Nombre corto para el manifest PWA                         | vite.config.js (plugin PWA)                                                                     | ✓         |
| `app.tagline`       | Frase debajo del nombre en el logo compacto               | AppLogo                                                                                         | —         |
| `app.description`   | Meta descripción del manifest PWA                         | vite.config.js (plugin PWA)                                                                     | ✓         |
| `app.lang`          | Atributo `lang` del HTML                                  | index.html                                                                                      | —         |
| `app.supportEmail`  | Dirección de correo en el enlace de soporte de la landing | LandingPage                                                                                     | ✓         |
| `app.storagePrefix` | Prefijo de la clave de sesión en `localStorage`           | supabase.js (`sb-{prefix}-auth`)                                                                | ✓         |

### Grupo `org`

| Clave         | Efecto                                                 | Consumidores | Requerida |
| ------------- | ------------------------------------------------------ | ------------ | --------- |
| `org.name`    | Nombre del organismo emisor en la pantalla de login    | LoginPage    | —         |
| `org.website` | Sitio web institucional (enlace en el footer opcional) | —            | —         |

### Grupo `nav`

| Clave          | Efecto                                         | Consumidores                  | Requerida |
| -------------- | ---------------------------------------------- | ----------------------------- | --------- |
| `nav.title`    | Título principal de la barra de navegación     | TopNav, LoginPage, PerfilPage | ✓         |
| `nav.subtitle` | Subtítulo debajo del título en la barra de nav | TopNav                        | —         |

### Grupo `logos`

Todas las rutas son relativas al directorio `public/`. Ver la sección
[Reemplazar assets](#4-reemplazar-assets-en-publictheme).

| Clave              | Efecto                                | Consumidores          | Requerida |
| ------------------ | ------------------------------------- | --------------------- | --------- |
| `logos.nav`        | Logotipo en la barra de navegación    | TopNav, LandingFooter | ✓         |
| `logos.footer`     | Logotipo en el pie de página          | LandingFooter         | —         |
| `logos.hero`       | Logotipo grande en la sección hero    | LandingHero           | —         |
| `logos.constancia` | Logotipo impreso en la constancia PDF | ConstanciaPage        | ✓         |
| `logos.mark`       | Inicial o carácter del logo compacto  | AppLogo               | ✓         |

### Grupo `colors`

Los colores se aplican como variables CSS en el elemento `<html>` al arrancar
(`applyTheme()` en `src/lib/theme.js`). Las variables CSS resultantes se listan
en la columna "Variable CSS".

| Clave                  | Variable CSS             | Efecto                             | Requerida |
| ---------------------- | ------------------------ | ---------------------------------- | --------- |
| `colors.primary`       | `--brand-primary`        | Color de acento principal          | ✓         |
| `colors.primaryDark`   | `--brand-primary-dark`   | Variante oscura del primario       | ✓         |
| `colors.primarySoft`   | `--brand-primary-soft`   | Variante suave / fondos sutiles    | —         |
| `colors.secondary`     | `--brand-secondary`      | Color secundario                   | —         |
| `colors.secondaryDark` | `--brand-secondary-dark` | Variante oscura del secundario     | —         |
| `colors.secondarySoft` | `--brand-secondary-soft` | Variante suave del secundario      | —         |
| `colors.accent`        | `--brand-accent`         | Color de énfasis (badges, alertas) | —         |
| `colors.accentSoft`    | `--brand-accent-soft`    | Variante suave del acento          | —         |
| `colors.ink`           | `--brand-ink`            | Color principal de texto           | —         |

### Grupo `fonts`

Las familias se aplican como variables CSS (`--display`, `--ui`, `--mono`) en
`applyTheme()`. Asegúrate de cargar las fuentes en `index.html` antes de usarlas.

| Clave           | Variable CSS | Efecto                               |
| --------------- | ------------ | ------------------------------------ |
| `fonts.display` | `--display`  | Fuente de títulos y encabezados      |
| `fonts.ui`      | `--ui`       | Fuente de interfaz y cuerpo de texto |
| `fonts.mono`    | `--mono`     | Fuente monoespaciada (código)        |

### Grupo `hero`

| Clave                  | Efecto                                                    | Consumidores | Requerida |
| ---------------------- | --------------------------------------------------------- | ------------ | --------- |
| `hero.eyebrow`         | Texto pequeño sobre el título principal                   | LandingHero  | —         |
| `hero.title`           | Título `<h1>` del hero                                    | LandingHero  | —         |
| `hero.description`     | Párrafo descriptivo debajo del título                     | LandingHero  | —         |
| `hero.cta`             | Texto del botón de llamada a la acción                    | LandingHero  | —         |
| `hero.backgroundImage` | Ruta a imagen de fondo del hero (`null` usa color sólido) | LandingHero  | —         |
| `hero.partnerLogos`    | Array de `{ src, alt }` con logos de aliados              | LandingHero  | —         |

### Grupo `footer`

| Clave                    | Efecto                                         | Consumidores  | Requerida |
| ------------------------ | ---------------------------------------------- | ------------- | --------- |
| `footer.about`           | Párrafo "acerca de" en el pie de página        | LandingFooter | —         |
| `footer.columns`         | Array de columnas `{ title, links[] }` del pie | LandingFooter | —         |
| `footer.copyrightHolder` | Nombre en la leyenda de copyright              | LandingFooter | —         |

#### Color de error (`colors.danger`, opcional, desde la versión 2)

Antes el error se pintaba con tu color de marca, de modo que un mensaje de error
se veía igual que un botón principal. Ahora tiene color propio (`#b3261e`) y
puedes sustituirlo:

```js
colors: {
  danger: '#9b2247'
}
```

Cuida dos cosas al elegirlo: que se distinga de `primary` y que alcance 4.5:1
sobre papel blanco. La variante para modo oscuro se deriva sola.

#### Enlaces institucionales

Cada entrada de `footer.columns[].links` admite una clave `doc` opcional, con
el identificador de un documento institucional: `aviso-privacidad`,
`terminos-uso` o `contacto`.

```js
{ label: 'Aviso de privacidad', doc: 'aviso-privacidad', href: '' }
```

Cómo se resuelve el destino:

| Configuración                    | A dónde lleva                                  |
| -------------------------------- | ---------------------------------------------- |
| `href` con una URL               | A esa URL (manda sobre todo lo demás)          |
| `href` vacío y `doc` declarado   | A la página interna del documento              |
| `href` vacío y etiqueta conocida | A la página interna (configuraciones antiguas) |

Los documentos internos se redactan y publican desde **Administración →
Documentos**, y hasta que no se publica el aviso de privacidad el registro de
nuevas cuentas queda bloqueado: recabar el consentimiento sin documento es lo
que este mecanismo viene a impedir.

Si tu institución ya los publica fuera de la plataforma, pon la URL en `href` y
nada cambia.

### Grupo `constancia`

| Clave                            | Efecto                                     | Consumidores                                                   | Requerida |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------------------- | --------- |
| `constancia.folioPrefix`         | Prefijo del folio (ej. `AMX-2026-…`)       | ConstanciaPage                                                 | ✓         |
| `constancia.emisor`              | Nombre del emisor impreso en la constancia | ConstanciaPage, LandingConstancia, RegistroPage, VerificarPage | ✓         |
| `constancia.titularCargoDefault` | Cargo del firmante por defecto             | constanciaConfig.js                                            | —         |
| `constancia.lugarDefault`        | Lugar de emisión por defecto               | constanciaConfig.js                                            | —         |

### Grupo `landing`

| Clave              | Efecto                                                       | Consumidores | Requerida |
| ------------------ | ------------------------------------------------------------ | ------------ | --------- |
| `landing.sections` | Array ordenado de claves de secciones visibles en la landing | LandingPage  | ✓         |

Las secciones `hero`, catálogo y footer son fijas y siempre se renderizan.
Las secciones de este array son las opcionales (built-in o custom).

### Grupo `pwa`

| Clave                 | Efecto                              | Consumidores   | Requerida |
| --------------------- | ----------------------------------- | -------------- | --------- |
| `pwa.themeColor`      | `theme_color` del manifest PWA      | vite.config.js | ✓         |
| `pwa.backgroundColor` | `background_color` del manifest PWA | vite.config.js | —         |

---

## 2. Claves requeridas

Las siguientes claves deben estar presentes y no vacías. Si falta alguna, la
aplicación lanza un error en arranque y los tests fallan:

```
app.name
app.shortName
app.description
app.storagePrefix
app.supportEmail
nav.title
logos.nav
logos.constancia
logos.mark
colors.primary
colors.primaryDark
constancia.folioPrefix
constancia.emisor
landing.sections
pwa.themeColor
```

---

## 3. Cómo crear una sección custom de landing

1. Crea tu componente Vue en `theme/sections/MiSeccion.vue`:

   ```vue
   <template>
     <section class="mi-seccion">
       <h2>Mi sección personalizada</h2>
     </section>
   </template>
   ```

2. Regístrala en `theme/sections/index.js` con una clave en kebab-case:

   ```js
   import MiSeccion from './MiSeccion.vue'
   export const CUSTOM_SECTIONS = {
     'mi-seccion': MiSeccion,
   }
   ```

3. Añade su clave al array `landing.sections` en `theme/theme.config.js`:

   ```js
   landing: {
     sections: ['como-constancia', 'mi-seccion', 'faq'],
   },
   ```

Las secciones se renderizan en el orden del array.

---

## 3.5 El correo de recuperación de contraseña

Es el único texto de esta plataforma que **no** sigue al tema. Lo envía GoTrue
leyendo un fichero del disco, así que no tiene acceso a `theme.config.local.js`
ni a los tokens de CSS.

Vive en `docker/volumes/auth/templates/recovery.html` y se monta en el
contenedor de autenticación. Para poner la identidad de tu institución —nombre,
colores, firma— se edita ese fichero.

Dos cosas que **no** conviene cambiar ahí:

- **El enlace con `{{ .TokenHash }}`.** La plantilla por defecto de GoTrue usa
  `{{ .ConfirmationURL }}`, y con el flujo PKCE de esta aplicación ese enlace
  solo funciona en el mismo navegador que pidió el restablecimiento: el
  verificador vive en su `localStorage`. Quien pida el cambio en el ordenador y
  abra el correo en el móvil se queda fuera. El `token_hash` no necesita
  verificador y sirve en cualquier dispositivo.
- **Las tablas y los estilos en línea.** No son descuido: los clientes de correo
  ignoran las hojas de estilo y buena parte del CSS moderno.

Si el fichero no está montado, GoTrue vuelve **en silencio** a su plantilla por
defecto y la recuperación falla solo entre dispositivos —un fallo parcial que
nadie atribuiría a esto—. Por eso `scripts/deploy.sh` comprueba que está.

Una instalación **sin SMTP** no puede recuperar contraseñas por esta vía. La
salida en ese caso es `scripts/crear-admin.sh` o la función
`admin-set-password`, que un administrador puede usar para asignar una nueva.

## 4. Reemplazar assets en `public/theme/`

Los archivos en `public/theme/` son los assets de identidad gráfica servidos
directamente por el servidor web:

| Archivo                   | Uso                                 |
| ------------------------- | ----------------------------------- |
| `logo-nav.svg`            | Logotipo en barra de navegación     |
| `logo-hero.svg`           | Logotipo grande en la sección hero  |
| `logo-constancia.svg`     | Logotipo impreso en constancias PDF |
| `constancia-fondo.webp`   | Fondo de la constancia PDF          |
| `constancia-pleca.webp`   | Pleca decorativa de la constancia   |
| `constancia-preview.webp` | Vista previa de la constancia       |

Reemplaza cada archivo manteniendo el mismo nombre de archivo. Las rutas en
`theme/theme.config.js` apuntan a estos archivos por convención; si cambias
el nombre de archivo, actualiza también la clave correspondiente en `logos.*`.

---

## 5. Feature flags

Los módulos opcionales se encienden y apagan desde
**Administración → Módulos**, sin reconstruir ni volver a desplegar. La fuente
de verdad es la tabla `feature_toggles` de la base.

Un módulo apagado no solo oculta su interfaz: los marcados abajo como
**cierra datos** además bloquean el acceso a sus tablas mediante políticas RLS
restrictivas (migración 063). Es decir, no son alcanzables por la API aunque
alguien construya la petición a mano.

Las variables `VITE_FEATURE_*` siguen existiendo, pero **solo como valor por
defecto de arranque** y como red de seguridad si la consulta a la base falla.
En cuanto llegan los flags de runtime, mandan ellos.

| Clave                     | Variable de entorno                    | Módulo                      | Default | Cierra datos |
| ------------------------- | -------------------------------------- | --------------------------- | :-----: | :----------: |
| `instructor`              | `VITE_FEATURE_INSTRUCTOR`              | Panel de instructor         | `true`  |              |
| `foros`                   | `VITE_FEATURE_FOROS`                   | Foros por curso             | `false` |      ✔       |
| `chat`                    | `VITE_FEATURE_CHAT`                    | Chat en vivo                | `false` |      ✔       |
| `entregas`                | `VITE_FEATURE_ENTREGAS`                | Entregas de archivos        | `false` |      ✔       |
| `entregas_rubricas`       | `VITE_FEATURE_ENTREGAS_RUBRICAS`       | Rúbricas en entregas        | `false` |      ✔       |
| `rubrics`                 | —                                      | Gestión de rúbricas         | `false` |      ✔       |
| `aulas`                   | `VITE_FEATURE_AULAS`                   | Aulas virtuales (Jitsi)     | `false` |              |
| `sesiones_virtuales`      | `VITE_FEATURE_SESIONES_VIRTUALES`      | Sesiones virtuales          | `false` |      ✔       |
| `zoom_integration`        | `VITE_FEATURE_ZOOM_INTEGRATION`        | Integración con Zoom        | `false` |              |
| `sesiones_grabaciones`    | `VITE_FEATURE_SESIONES_GRABACIONES`    | Grabaciones de sesión       | `false` |              |
| `transcripcion_whisper`   | `VITE_FEATURE_TRANSCRIPCION_WHISPER`   | Transcripción automática    | `false` |              |
| `evaluaciones`            | `VITE_FEATURE_EVALUACIONES`            | Evaluaciones                | `false` |              |
| `advanced_quizzes`        | —                                      | Tipos de pregunta avanzados | `false` |              |
| `cohorts`                 | —                                      | Cohortes                    | `false` |      ✔       |
| `analytics`               | `VITE_FEATURE_ANALYTICS`               | Analytics                   | `false` |      ✔       |
| `risk_dashboard`          | —                                      | Tablero de riesgo           | `false` |              |
| `video_analytics`         | `VITE_FEATURE_VIDEO_ANALYTICS`         | Analytics de video          | `false` |      ✔       |
| `video_analytics_heatmap` | `VITE_FEATURE_VIDEO_ANALYTICS_HEATMAP` | Mapa de calor de video      | `false` |              |
| `reportes_avanzados`      | `VITE_FEATURE_REPORTES_AVANZADOS`      | Reportes avanzados          | `false` |              |
| `downloadable_reports`    | —                                      | Reportes descargables       | `false` |              |
| `gamificacion`            | `VITE_FEATURE_GAMIFICACION`            | Gamificación                | `false` |              |
| `notificaciones`          | `VITE_FEATURE_NOTIFICACIONES`          | Notificaciones en la app    | `false` |              |
| `notificaciones_email`    | `VITE_FEATURE_NOTIFICACIONES_EMAIL`    | Notificaciones por correo   | `false` |              |
| `push_notifications`      | `VITE_FEATURE_PUSH_NOTIFICATIONS`      | Notificaciones push         | `false` |              |
| `pwa_offline`             | `VITE_FEATURE_PWA_OFFLINE`             | Modo sin conexión           | `false` |              |
| `offline_video_cache`     | `VITE_FEATURE_OFFLINE_VIDEO_CACHE`     | Descarga de video           | `false` |              |
| `offline_sync`            | `VITE_FEATURE_OFFLINE_SYNC`            | Sincronización diferida     | `false` |              |
| `ai_quiz_generator`       | `VITE_FEATURE_AI_QUIZ`                 | Generador de cuestionarios  | `false` |              |
| `ai_summaries`            | `VITE_FEATURE_AI_SUMMARIES`            | Resúmenes de lección        | `false` |      ✔       |
| `ai_study_assistant`      | `VITE_FEATURE_AI_CHAT`                 | Asistente de estudio        | `false` |              |
| `bulk_user_import`        | —                                      | Alta masiva de usuarios     | `false` |              |

Las claves sin variable de entorno solo existen en runtime: se conmutan desde
el panel.

### Siembra en una instalación existente

La migración 063 siembra estas claves una sola vez, con esta regla: un módulo
cuyas tablas **ya tienen datos** se enciende; el resto queda apagado. Así una
instalación que venía usando foros o entregas no los pierde de golpe al
actualizar, y una instalación nueva arranca cerrada. La siembra usa
`on conflict do nothing`: nunca pisa lo que el operador ya haya decidido.
