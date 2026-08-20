// Capa de tema: valida el tema de la instalación y expone helpers.
// Un tema incompleto debe fallar aquí (arranque/tests), no en runtime disperso.
//
// '@theme' lo resuelve vite.config.js: theme/theme.config.local.js si existe,
// theme/theme.config.example.js si no. Ver THEMING.md.
import themeConfig from '@theme'
import { ajustarParaContraste } from './contraste.js'

// Versión del ESQUEMA del tema (no del producto). Se incrementa solo cuando
// cambia el contrato: una clave nueva obligatoria, una renombrada o una
// retirada. Un tema declarado para una versión mayor distinta se rechaza en
// arranque con un mensaje accionable, en vez de romperse a mitad de runtime.
// Ver "Contrato de estabilidad" en THEMING.md.
export const THEME_SCHEMA_VERSION = 1

const REQUIRED = [
  'app.name',
  'app.shortName',
  'app.description',
  'app.storagePrefix',
  'app.supportEmail',
  'nav.title',
  'logos.nav',
  'logos.constancia',
  'logos.mark',
  'colors.primary',
  'colors.primaryDark',
  'constancia.folioPrefix',
  'constancia.emisor',
  'landing.sections',
  'pwa.themeColor',
]

export function validateTheme(config) {
  // schemaVersion es opcional: un tema sin declararla se asume de la versión
  // vigente, para no romper las instalaciones que existían antes del contrato.
  const declarada = config?.schemaVersion
  if (declarada !== undefined && declarada !== THEME_SCHEMA_VERSION) {
    throw new Error(
      `[theme] Tu theme.config.local.js declara schemaVersion ${declarada}, ` +
        `pero esta versión de la aplicación usa ${THEME_SCHEMA_VERSION}. ` +
        `Consulta la sección "Contrato de estabilidad" de THEMING.md para ver ` +
        `qué cambió y cómo migrar tu tema.`
    )
  }

  const missing = REQUIRED.filter((path) => {
    const value = path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), config)
    return value === undefined || value === null || value === ''
  })
  if (missing.length) {
    throw new Error(
      `[theme] Claves requeridas ausentes en tu theme.config.local.js: ${missing.join(', ')}. ` +
        `Cópialas de theme/theme.config.example.js.`
    )
  }
  return config
}

export const theme = validateTheme(themeConfig)

const COLOR_VARS = {
  primary: '--brand-primary',
  primaryDark: '--brand-primary-dark',
  primarySoft: '--brand-primary-soft',
  secondary: '--brand-secondary',
  secondaryDark: '--brand-secondary-dark',
  secondarySoft: '--brand-secondary-soft',
  accent: '--brand-accent',
  accentSoft: '--brand-accent-soft',
  ink: '--brand-ink',
}

// Papel del modo oscuro. Debe coincidir con --paper de [data-theme='dark']
// en src/assets/main.css.
const PAPEL_OSCURO = '#0f1115'

// Colores que se usan como PRIMER PLANO (texto, iconos, anillo de foco) y por
// tanto necesitan contraste suficiente contra el fondo.
const COLORES_PRIMER_PLANO = ['primary', 'primaryDark', 'secondary', 'accent']

export function applyTheme(root = document.documentElement) {
  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    if (theme.colors[key]) root.style.setProperty(cssVar, theme.colors[key])
  }

  // Variantes para modo oscuro.
  //
  // El tema declara un solo juego de colores, pensado sobre papel blanco. En
  // modo oscuro esos mismos valores no llegan al 4.5:1 que pide WCAG AA — con
  // el tema de ejemplo, --brand-primary daba 2.17:1, y como es también el
  // color del anillo de foco, el foco tampoco se veía.
  //
  // Si el tema declara `colors.<nombre>OnDark`, manda ese valor. Si no, se
  // deriva aclarando lo justo para cumplir, conservando el tono de la marca.
  for (const key of COLORES_PRIMER_PLANO) {
    const base = theme.colors[key]
    if (!base) continue
    const explicito = theme.colors[`${key}OnDark`]
    const valor = explicito || ajustarParaContraste(base, PAPEL_OSCURO, 4.5)
    root.style.setProperty(`${COLOR_VARS[key]}-on-dark`, valor)
  }
  if (theme.fonts?.display) root.style.setProperty('--display', theme.fonts.display)
  if (theme.fonts?.ui) root.style.setProperty('--ui', theme.fonts.ui)
  if (theme.fonts?.mono) root.style.setProperty('--mono', theme.fonts.mono)
}

export function storageKey(suffix) {
  return `${theme.app.storagePrefix}.${suffix}`
}
