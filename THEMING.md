# Guía de personalización (THEMING)

Cursos AMX separa completamente la identidad gráfica del código de la aplicación.
Todo lo que necesitas cambiar para adaptar la plataforma a tu institución vive en
tres lugares:

| Qué                    | Dónde                              |
| ---------------------- | ---------------------------------- |
| Textos, colores, logos | `theme/theme.config.js`            |
| Secciones de landing   | `theme/sections/` + `index.js`     |
| Assets de imagen       | `public/theme/`                    |

---

## 1. `theme/theme.config.js` — referencia completa de claves

La validación de claves requeridas ocurre en arranque y en tests (`src/lib/theme.js`).
Si falta alguna clave marcada como **requerida**, la aplicación lanza error inmediatamente.

### Grupo `app`

| Clave                 | Efecto                                                            | Consumidores                                    | Requerida |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | --------- |
| `app.name`            | Nombre de la plataforma en nav, hero, footer, correos            | TopNav, AppLogo, LandingHero, LandingFooter, LoginPage, PerfilPage, ConstanciaPage, LandingPage | ✓ |
| `app.shortName`       | Nombre corto para el manifest PWA                                 | vite.config.js (plugin PWA)                     | ✓ |
| `app.tagline`         | Frase debajo del nombre en el logo compacto                       | AppLogo                                         | — |
| `app.description`     | Meta descripción del manifest PWA                                 | vite.config.js (plugin PWA)                     | ✓ |
| `app.lang`            | Atributo `lang` del HTML                                          | index.html                                      | — |
| `app.supportEmail`    | Dirección de correo en el enlace de soporte de la landing         | LandingPage                                     | ✓ |
| `app.storagePrefix`   | Prefijo de la clave de sesión en `localStorage`                   | supabase.js (`sb-{prefix}-auth`)                | ✓ |

### Grupo `org`

| Clave      | Efecto                                       | Consumidores | Requerida |
| ---------- | -------------------------------------------- | ------------ | --------- |
| `org.name` | Nombre del organismo emisor en la pantalla de login | LoginPage | — |
| `org.website` | Sitio web institucional (enlace en el footer opcional) | — | — |

### Grupo `nav`

| Clave          | Efecto                                          | Consumidores          | Requerida |
| -------------- | ----------------------------------------------- | --------------------- | --------- |
| `nav.title`    | Título principal de la barra de navegación      | TopNav, LoginPage, PerfilPage | ✓ |
| `nav.subtitle` | Subtítulo debajo del título en la barra de nav  | TopNav                | — |

### Grupo `logos`

Todas las rutas son relativas al directorio `public/`. Ver la sección
[Reemplazar assets](#4-reemplazar-assets-en-publictheme).

| Clave              | Efecto                                   | Consumidores      | Requerida |
| ------------------ | ---------------------------------------- | ----------------- | --------- |
| `logos.nav`        | Logotipo en la barra de navegación       | TopNav, LandingFooter | ✓ |
| `logos.footer`     | Logotipo en el pie de página             | LandingFooter     | — |
| `logos.hero`       | Logotipo grande en la sección hero       | LandingHero       | — |
| `logos.constancia` | Logotipo impreso en la constancia PDF    | ConstanciaPage    | ✓ |
| `logos.mark`       | Inicial o carácter del logo compacto     | AppLogo           | ✓ |

### Grupo `colors`

Los colores se aplican como variables CSS en el elemento `<html>` al arrancar
(`applyTheme()` en `src/lib/theme.js`). Las variables CSS resultantes se listan
en la columna "Variable CSS".

| Clave                  | Variable CSS            | Efecto                             | Requerida |
| ---------------------- | ----------------------- | ---------------------------------- | --------- |
| `colors.primary`       | `--brand-primary`       | Color de acento principal          | ✓ |
| `colors.primaryDark`   | `--brand-primary-dark`  | Variante oscura del primario       | ✓ |
| `colors.primarySoft`   | `--brand-primary-soft`  | Variante suave / fondos sutiles    | — |
| `colors.secondary`     | `--brand-secondary`     | Color secundario                   | — |
| `colors.secondaryDark` | `--brand-secondary-dark`| Variante oscura del secundario     | — |
| `colors.secondarySoft` | `--brand-secondary-soft`| Variante suave del secundario      | — |
| `colors.accent`        | `--brand-accent`        | Color de énfasis (badges, alertas) | — |
| `colors.accentSoft`    | `--brand-accent-soft`   | Variante suave del acento          | — |
| `colors.ink`           | `--brand-ink`           | Color principal de texto           | — |

### Grupo `fonts`

Las familias se aplican como variables CSS (`--display`, `--ui`, `--mono`) en
`applyTheme()`. Asegúrate de cargar las fuentes en `index.html` antes de usarlas.

| Clave          | Variable CSS | Efecto                              |
| -------------- | ------------ | ----------------------------------- |
| `fonts.display`| `--display`  | Fuente de títulos y encabezados     |
| `fonts.ui`     | `--ui`       | Fuente de interfaz y cuerpo de texto|
| `fonts.mono`   | `--mono`     | Fuente monoespaciada (código)       |

### Grupo `hero`

| Clave                  | Efecto                                                      | Consumidores | Requerida |
| ---------------------- | ----------------------------------------------------------- | ------------ | --------- |
| `hero.eyebrow`         | Texto pequeño sobre el título principal                     | LandingHero  | — |
| `hero.title`           | Título `<h1>` del hero                                      | LandingHero  | — |
| `hero.description`     | Párrafo descriptivo debajo del título                       | LandingHero  | — |
| `hero.cta`             | Texto del botón de llamada a la acción                      | LandingHero  | — |
| `hero.backgroundImage` | Ruta a imagen de fondo del hero (`null` usa color sólido)   | LandingHero  | — |
| `hero.partnerLogos`    | Array de `{ src, alt }` con logos de aliados                | LandingHero  | — |

### Grupo `footer`

| Clave                  | Efecto                                        | Consumidores | Requerida |
| ---------------------- | --------------------------------------------- | ------------ | --------- |
| `footer.about`         | Párrafo "acerca de" en el pie de página       | LandingFooter| — |
| `footer.columns`       | Array de columnas `{ title, links[] }` del pie| LandingFooter| — |
| `footer.copyrightHolder`| Nombre en la leyenda de copyright            | LandingFooter| — |

### Grupo `constancia`

| Clave                         | Efecto                                                   | Consumidores                                    | Requerida |
| ----------------------------- | -------------------------------------------------------- | ----------------------------------------------- | --------- |
| `constancia.folioPrefix`      | Prefijo del folio (ej. `AMX-2026-…`)                     | ConstanciaPage                                  | ✓ |
| `constancia.emisor`           | Nombre del emisor impreso en la constancia               | ConstanciaPage, LandingConstancia, RegistroPage, VerificarPage | ✓ |
| `constancia.titularCargoDefault` | Cargo del firmante por defecto                        | constanciaConfig.js                             | — |
| `constancia.lugarDefault`     | Lugar de emisión por defecto                             | constanciaConfig.js                             | — |

### Grupo `landing`

| Clave              | Efecto                                                           | Consumidores | Requerida |
| ------------------ | ---------------------------------------------------------------- | ------------ | --------- |
| `landing.sections` | Array ordenado de claves de secciones visibles en la landing     | LandingPage  | ✓ |

Las secciones `hero`, catálogo y footer son fijas y siempre se renderizan.
Las secciones de este array son las opcionales (built-in o custom).

### Grupo `pwa`

| Clave                 | Efecto                                | Consumidores         | Requerida |
| --------------------- | ------------------------------------- | -------------------- | --------- |
| `pwa.themeColor`      | `theme_color` del manifest PWA        | vite.config.js       | ✓ |
| `pwa.backgroundColor` | `background_color` del manifest PWA   | vite.config.js       | — |

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

| Archivo                    | Uso                                     |
| -------------------------- | --------------------------------------- |
| `logo-nav.svg`             | Logotipo en barra de navegación         |
| `logo-hero.svg`            | Logotipo grande en la sección hero      |
| `logo-constancia.svg`      | Logotipo impreso en constancias PDF     |
| `constancia-fondo.webp`    | Fondo de la constancia PDF              |
| `constancia-pleca.webp`    | Pleca decorativa de la constancia       |
| `constancia-preview.webp`  | Vista previa de la constancia           |

Reemplaza cada archivo manteniendo el mismo nombre de archivo. Las rutas en
`theme/theme.config.js` apuntan a estos archivos por convención; si cambias
el nombre de archivo, actualiza también la clave correspondiente en `logos.*`.

---

## 5. Feature flags (`VITE_FEATURE_*`)

Los módulos opcionales del LMS se activan con variables de entorno en `.env`.
Al no estar activados, sus rutas y componentes no se montan.

| Variable de entorno          | Módulo           | Valor por defecto |
| ---------------------------- | ---------------- | ----------------- |
| `VITE_FEATURE_INSTRUCTOR`    | Panel instructor | `true`            |
| `VITE_FEATURE_FOROS`         | Foros por curso  | `false`           |
| `VITE_FEATURE_CHAT`          | Chat realtime    | `false`           |
| `VITE_FEATURE_ENTREGAS`      | Entregas de archivos | `false`       |
| `VITE_FEATURE_AULAS`         | Aulas virtuales  | `false`           |
| `VITE_FEATURE_EVALUACIONES`  | Evaluaciones     | `false`           |

Los flags se leen en build time (variables Vite). Para cambiar el estado de un
módulo en producción es necesario reconstruir (`npm run build`) y republicar.
