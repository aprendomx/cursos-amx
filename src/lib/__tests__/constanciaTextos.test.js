import { describe, it, expect } from 'vitest'
import {
  aplicarMarcadores,
  marcadoresDesconocidos,
  configDeConstancia,
  MARCADORES,
} from '../constanciaTextos.js'

describe('aplicarMarcadores', () => {
  it('sustituye los marcadores por sus valores', () => {
    expect(
      aplicarMarcadores('a {{nombre}} por el curso {{curso}}', {
        nombre: 'Ana Alumna',
        curso: 'Transparencia',
      })
    ).toBe('a Ana Alumna por el curso Transparencia')
  })

  it('tolera espacios dentro de las llaves', () => {
    expect(aplicarMarcadores('{{ nombre }}', { nombre: 'Ana' })).toBe('Ana')
  })

  // Un marcador mal escrito debe verse, no desaparecer: un hueco vacío
  // parecería un dato faltante en el documento.
  it('deja intacto un marcador desconocido', () => {
    expect(aplicarMarcadores('hola {{nombres}}', { nombre: 'Ana' })).toBe('hola {{nombres}}')
  })

  it('deja intacto un marcador sin valor', () => {
    expect(aplicarMarcadores('{{curso}}', { curso: '' })).toBe('{{curso}}')
    expect(aplicarMarcadores('{{curso}}', {})).toBe('{{curso}}')
  })

  it('devuelve cadena vacía ante entradas no válidas', () => {
    expect(aplicarMarcadores(null)).toBe('')
    expect(aplicarMarcadores(undefined)).toBe('')
    expect(aplicarMarcadores(42)).toBe('')
  })
})

describe('marcadoresDesconocidos', () => {
  it('detecta los que no existen, sin repetir', () => {
    expect(marcadoresDesconocidos('{{nombre}} {{xyz}} {{xyz}} {{curso}}')).toEqual(['xyz'])
  })

  it('no reporta nada cuando todos son válidos', () => {
    const texto = MARCADORES.map((m) => `{{${m.clave}}}`).join(' ')
    expect(marcadoresDesconocidos(texto)).toEqual([])
  })
})

describe('configDeConstancia', () => {
  const congelada = {
    diseno: { clave: 'institucional' },
    firmantes: [{ nombre: 'Ana', cargo: 'Directora' }],
    textos: { texto_titulo: 'DIPLOMA', lugar: 'Puebla' },
  }

  // Lo esencial: una constancia impresa no cambia porque se edite el catálogo.
  it('prioriza SIEMPRE lo congelado sobre la configuración actual', () => {
    const cfg = configDeConstancia(congelada, {
      diseno: { clave: 'otro' },
      firmantes: [{ nombre: 'Beto', cargo: 'Secretario' }],
      texto_titulo: 'CONSTANCIA',
      lugar: 'Ciudad de México',
    })
    expect(cfg.diseno.clave).toBe('institucional')
    expect(cfg.firmantes[0].nombre).toBe('Ana')
    expect(cfg.textoTitulo).toBe('DIPLOMA')
    expect(cfg.lugar).toBe('Puebla')
  })

  // Las constancias emitidas antes de la migración 070 no tienen congelado.
  it('cae a la configuración actual si no hay congelado', () => {
    const cfg = configDeConstancia(
      { folio: 'X' },
      { texto_titulo: 'CONSTANCIA', lugar: 'Ciudad de México' }
    )
    expect(cfg.textoTitulo).toBe('CONSTANCIA')
    expect(cfg.lugar).toBe('Ciudad de México')
  })

  it('devuelve valores usables sin congelado ni respaldo', () => {
    const cfg = configDeConstancia(null)
    expect(cfg.firmantes).toEqual([])
    expect(cfg.textoTitulo).toBe('CONSTANCIA')
  })

  it('no rompe si firmantes viene mal formado', () => {
    expect(configDeConstancia({ firmantes: 'no-es-array' }).firmantes).toEqual([])
  })
})
