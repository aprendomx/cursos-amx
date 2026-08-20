import { describe, it, expect } from 'vitest'
import themeConfig from '@theme'
import { validateTheme, applyTheme, storageKey, THEME_SCHEMA_VERSION } from '../theme.js'
import { cumpleAA } from '../contraste.js'

describe('theme', () => {
  it('el tema por defecto es válido', () => {
    expect(() => validateTheme(themeConfig)).not.toThrow()
  })

  it('falla si falta una clave requerida', () => {
    const roto = structuredClone(themeConfig)
    delete roto.app.name
    expect(() => validateTheme(roto)).toThrow(/app\.name/)
  })

  it('applyTheme inyecta los colores como variables CSS', () => {
    applyTheme(document.documentElement)
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe(themeConfig.colors.primary)
  })

  it('storageKey usa el prefijo del tema', () => {
    expect(storageKey('registered')).toBe(`${themeConfig.app.storagePrefix}.registered`)
  })
})

describe('contrato de theming', () => {
  it('rechaza un tema declarado para otra versión de esquema', () => {
    expect(() =>
      validateTheme({ ...themeConfig, schemaVersion: THEME_SCHEMA_VERSION + 1 })
    ).toThrow(/schemaVersion/)
  })

  it('acepta un tema sin schemaVersion (instalaciones previas al contrato)', () => {
    const sinVersion = { ...themeConfig }
    delete sinVersion.schemaVersion
    expect(() => validateTheme(sinVersion)).not.toThrow()
  })

  it('el mensaje de clave faltante dice de dónde copiarla', () => {
    const incompleto = { ...themeConfig, app: { ...themeConfig.app, name: '' } }
    expect(() => validateTheme(incompleto)).toThrow(/theme.config.example.js/)
  })
})

describe('applyTheme y modo oscuro', () => {
  function raizFalsa() {
    const props = {}
    return { props, style: { setProperty: (k, v) => (props[k] = v) } }
  }

  it('publica las variables de marca', () => {
    const raiz = raizFalsa()
    applyTheme(raiz)
    expect(raiz.props['--brand-primary']).toBe(themeConfig.colors.primary)
  })

  // Los colores del tema están pensados sobre papel blanco. En modo oscuro no
  // llegan al 4.5:1 de AA, y el de marca es además el del anillo de foco.
  it('deriva variantes con contraste suficiente para el modo oscuro', () => {
    const raiz = raizFalsa()
    applyTheme(raiz)

    for (const v of [
      '--brand-primary-on-dark',
      '--brand-primary-dark-on-dark',
      '--brand-secondary-on-dark',
      '--brand-accent-on-dark',
    ]) {
      expect(raiz.props[v]).toBeDefined()
      expect(cumpleAA(raiz.props[v], '#0f1115')).toBe(true)
    }
  })

  it('el color original NO cumple: la derivación no es decorativa', () => {
    expect(cumpleAA(themeConfig.colors.primary, '#0f1115')).toBe(false)
  })

  it('una variante declarada explícitamente por el tema tiene prioridad', () => {
    const raiz = raizFalsa()
    const original = themeConfig.colors.primaryOnDark
    themeConfig.colors.primaryOnDark = '#ffcc00'
    try {
      applyTheme(raiz)
      expect(raiz.props['--brand-primary-on-dark']).toBe('#ffcc00')
    } finally {
      if (original === undefined) delete themeConfig.colors.primaryOnDark
      else themeConfig.colors.primaryOnDark = original
    }
  })
})
