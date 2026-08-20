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

## 0.1 Contrato de estabilidad

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
