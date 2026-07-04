import { describe, it, expect } from 'vitest'
import themeConfig from '../../../theme/theme.config.js'
import { validateTheme, applyTheme, storageKey } from '../theme.js'

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
