// Capa de tema: valida theme/theme.config.js y expone helpers.
// Un tema incompleto debe fallar aquí (arranque/tests), no en runtime disperso.
import themeConfig from '../../theme/theme.config.js'

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
  const missing = REQUIRED.filter((path) => {
    const value = path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), config)
    return value === undefined || value === null || value === ''
  })
  if (missing.length) {
    throw new Error(
      `[theme] Claves requeridas ausentes en theme/theme.config.js: ${missing.join(', ')}`
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

export function applyTheme(root = document.documentElement) {
  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    if (theme.colors[key]) root.style.setProperty(cssVar, theme.colors[key])
  }
  if (theme.fonts?.display) root.style.setProperty('--display', theme.fonts.display)
  if (theme.fonts?.ui) root.style.setProperty('--ui', theme.fonts.ui)
  if (theme.fonts?.mono) root.style.setProperty('--mono', theme.fonts.mono)
}

export function storageKey(suffix) {
  return `${theme.app.storagePrefix}.${suffix}`
}
