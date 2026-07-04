// theme/theme.config.js — ÚNICA fuente de identidad gráfica de la instalación.
// Personaliza este archivo (y los assets en public/theme/) para tu institución.
// Claves requeridas: ver REQUIRED en src/lib/theme.js. Guía completa: THEMING.md
export default {
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
    accentSoft: '#fde68a',
    ink: '#161a1d',
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
          { label: 'Aviso de privacidad', href: '#' },
          { label: 'Términos de uso', href: '#' },
          { label: 'Contacto', href: '#' },
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
