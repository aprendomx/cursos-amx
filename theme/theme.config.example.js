// theme/theme.config.example.js — tema por defecto (neutro).
//
// NO edites este archivo: es el que se actualiza con cada `git pull`.
// Para personalizar tu instalación:
//
//     cp theme/theme.config.example.js theme/theme.config.local.js
//
// y edita tu copia. `theme.config.local.js` está fuera de git, así que
// sobrevive a las actualizaciones sin conflictos de merge.
//
// Claves requeridas: ver REQUIRED en src/lib/theme.js.
// Contrato de estabilidad y guía completa: THEMING.md
export default {
  // Versión del contrato de theming que usa este archivo. Si actualizas la
  // aplicación y el arranque se queja de esta clave, THEMING.md dice qué
  // cambió. Puedes omitirla: entonces se asume la versión vigente.
  schemaVersion: 2,

  app: {
    name: 'Cursos AMX',
    shortName: 'CursosAMX',
    tagline: 'Plataforma abierta de capacitación en línea',
    description:
      'Plataforma open source de cursos en línea con video HLS, evaluaciones y constancias verificables.',
    lang: 'es',
    supportEmail: 'soporte@example.org',
    storagePrefix: 'cursosamx',
  },
  org: {
    name: 'Tu Institución',
    website: 'https://example.org',
  },
  nav: {
    title: 'Plataforma de Capacitación',
    subtitle: 'Formación en línea para tu comunidad',
  },
  logos: {
    // Rutas bajo public/. Sustituye los SVG placeholder por los de tu marca.
    nav: '/theme/logo-nav.svg',
    footer: '/theme/logo-nav.svg',
    hero: '/theme/logo-hero.svg',
    constancia: '/theme/logo-constancia.svg',
    mark: 'A', // inicial del logotipo compacto (AppLogo)
  },
  colors: {
    primary: '#1e40af',
    primaryDark: '#1e3a8a',
    primarySoft: '#dbeafe',
    secondary: '#0f766e',
    secondaryDark: '#134e4a',
    secondarySoft: '#ccfbf1',
    accent: '#b45309',

    // Color de ERROR. Opcional: si no se declara, se usa #b3261e.
    //
    // No se deriva de la marca a propósito. Antes `--danger` era un alias de
    // `primary`, así que los mensajes de error se pintaban igual que los
    // botones principales. Si la identidad de tu institución hace que ese rojo
    // desentone —un guinda institucional, por ejemplo— declara aquí el tuyo,
    // cuidando que se distinga de `primary` y cumpla 4.5:1 sobre papel blanco.
    // danger: '#b3261e',
    accentSoft: '#fde68a',
    ink: '#161a1d',

    // Variantes para modo oscuro (OPCIONALES).
    //
    // Los colores de arriba están pensados sobre papel blanco. Sobre el fondo
    // oscuro (#0f1115) suelen quedar por debajo del 4.5:1 que exige WCAG AA
    // —el azul de este ejemplo da 2.17:1— y ese mismo color es el del anillo
    // de foco, así que el foco tampoco se vería.
    //
    // Si no declaras estas claves, la aplicación las deriva aclarando lo justo
    // para cumplir, conservando el tono. Decláralas solo si tu manual de
    // identidad ya define colores para fondo oscuro.
    //
    // primaryOnDark: '#93b4ff',
    // primaryDarkOnDark: '#b9ccff',
    // secondaryOnDark: '#5eccc0',
    // accentOnDark: '#f0a95c',
  },
  fonts: {
    // Familias cargadas en index.html (Google Fonts, licencia abierta).
    display: "'Fraunces', 'Times New Roman', Georgia, serif",
    ui: "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace",
  },
  hero: {
    eyebrow: 'Cursos en línea con constancia verificable',
    title: 'Aprende a tu ritmo',
    description:
      'Explora el catálogo, avanza a tu ritmo y obtén constancias con verificación pública por QR.',
    cta: 'Ver oferta educativa',
    backgroundImage: null, // ej. '/theme/hero.webp' — null usa fondo de color
    partnerLogos: [], // [{ src: '/theme/aliado.svg', alt: 'Aliado' }]
  },
  footer: {
    about:
      'Plataforma de capacitación en línea construida con Cursos AMX, software libre bajo licencia AGPL-3.0.',
    columns: [
      {
        title: 'Institucional',
        links: [
          // Con `href` vacío, el enlace lleva a la página interna del
          // documento, que se redacta y publica desde Administración →
          // Documentos. Si tu institución ya los publica FUERA de la
          // plataforma, pon aquí la URL y esa manda.
          //
          // Antes estos tres traían href '#': el formulario de alta recababa
          // el consentimiento de `perfiles.aviso_privacidad` señalando a un
          // documento que no existía. Ver docs/CUMPLIMIENTO.md.
          { label: 'Aviso de privacidad', doc: 'aviso-privacidad', href: '' },
          { label: 'Términos de uso', doc: 'terminos-uso', href: '' },
          { label: 'Contacto', doc: 'contacto', href: '' },
        ],
      },
      {
        title: 'Proyecto',
        links: [
          { label: 'Código fuente', href: 'https://github.com/aprendomx/cursos-amx' },
          { label: 'Documentación', href: 'https://github.com/aprendomx/cursos-amx#readme' },
        ],
      },
    ],
    copyrightHolder: 'Cursos AMX',
  },
  constancia: {
    folioPrefix: 'AMX',
    emisor: 'Cursos AMX',
    titularCargoDefault: 'Dirección Académica',
    lugarDefault: 'México',
  },
  landing: {
    // Secciones opcionales activas, en orden. 'hero', catálogo y footer son fijos.
    // Custom: registra componentes en theme/sections/index.js y usa su clave aquí.
    sections: ['como-constancia', 'niveles', 'constancia', 'faq'],
  },
  pwa: {
    themeColor: '#1e3a8a',
    backgroundColor: '#ffffff',
  },
}
