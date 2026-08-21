import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MINIMO_LONGITUD, REGLAS, evaluarContrasena, contrasenaValida } from '@/lib/contrasena.js'

const RAIZ = resolve(__dirname, '../../..')

describe('reglas de contraseña', () => {
  it('exige el mismo mínimo que exigía el alta antes de extraerlo', () => {
    // El refactor movió la regla; no debía cambiarla. Si alguien sube o baja
    // este número, que sea a propósito y no como efecto colateral.
    expect(MINIMO_LONGITUD).toBe(8)
  })

  it('rechaza por debajo del mínimo y acepta a partir de él', () => {
    expect(contrasenaValida('1234567')).toBe(false)
    expect(contrasenaValida('12345678')).toBe(true)
  })

  it('trata como inválido lo vacío y lo que no es texto', () => {
    for (const v of ['', null, undefined]) expect(contrasenaValida(v)).toBe(false)
  })

  it('el error nombra el problema concreto, no «contraseña inválida»', () => {
    const r = evaluarContrasena('corta')
    expect(r.valida).toBe(false)
    expect(r.error).toContain(String(MINIMO_LONGITUD))
  })

  it('las reglas se pueden anunciar antes de escribir', () => {
    // Es lo que permite mostrarlas en el formulario en vez de solo al fallar.
    expect(REGLAS.length).toBeGreaterThan(0)
    for (const r of REGLAS) {
      expect(typeof r.texto).toBe('string')
      expect(r.texto.length).toBeGreaterThan(0)
    }
    const r = evaluarContrasena('')
    expect(r.reglas.every((x) => x.cumple === false)).toBe(true)
  })

  // El servidor valida por su cuenta. Si los dos números se separan, la
  // interfaz aceptaría algo que la función edge rechaza, y el fallo aparecería
  // al enviar en vez de al escribir.
  it('coincide con el mínimo que aplica la función edge', () => {
    const edge = readFileSync(join(RAIZ, 'supabase/functions/admin-set-password/index.ts'), 'utf8')
    const m = edge.match(/const MIN_PASSWORD\s*=\s*(\d+)/)
    expect(m, 'no se encontró MIN_PASSWORD en la función edge').toBeTruthy()
    expect(Number(m[1])).toBe(MINIMO_LONGITUD)
  })
})
