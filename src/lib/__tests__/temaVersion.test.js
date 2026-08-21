import { describe, it, expect, vi } from 'vitest'
import { validateTheme, THEME_SCHEMA_VERSION } from '@/lib/theme.js'
import ejemplo from '@theme'

// El refresco visual cambia la apariencia de una instalación existente. El
// contrato del tema es lo que convierte eso en un aviso al arrancar en vez de
// en una sorpresa en producción.
// Se parte del tema de ejemplo real en vez de recrear la lista de claves
// obligatorias a mano: si esa lista cambia, la prueba no se queda obsoleta
// afirmando algo que ya no se comprueba.
function temaCon(schemaVersion) {
  const t = JSON.parse(JSON.stringify(ejemplo))
  if (schemaVersion === undefined) delete t.schemaVersion
  else t.schemaVersion = schemaVersion
  return t
}

describe('versión del esquema del tema', () => {
  it('la versión vigente es la 2, la del refresco visual', () => {
    expect(THEME_SCHEMA_VERSION).toBe(2)
  })

  it('un tema de la versión anterior DETIENE el arranque', () => {
    expect(() => validateTheme(temaCon(1))).toThrow(/schemaVersion 1/)
  })

  it('y el mensaje dice qué cambió y dónde mirarlo', () => {
    try {
      validateTheme(temaCon(1))
      throw new Error('debió lanzar')
    } catch (e) {
      expect(e.message).toMatch(/refresco visual/i)
      expect(e.message).toMatch(/THEMING\.md/)
    }
  })

  it('un tema de la versión vigente arranca', () => {
    expect(() => validateTheme(temaCon(2))).not.toThrow()
  })

  // No se convierte en error: rompería el arranque de todas las instalaciones
  // que existían antes del contrato. Pero se avisa.
  it('un tema sin declarar versión arranca, avisando en consola', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(() => validateTheme(temaCon(undefined))).not.toThrow()
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/no declara schemaVersion/))
    info.mockRestore()
  })
})
