import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// El mismo estado se veía distinto según el componente que lo pintara: tres
// opacidades —0.4, 0.5 y 0.6— repartidas por siete reglas. Un estado que no se
// ve igual en todas partes deja de leerse como un estado.
//
// El otro lado del problema es que «parecer» deshabilitado no es estarlo: una
// clase que solo baja la opacidad no le dice nada a un lector de pantalla.

const RAIZ = resolve(__dirname, '../../..')

function archivos() {
  const salida = []
  for (const dir of ['src/components', 'src/pages', 'src/assets']) {
    for (const nombre of readdirSync(join(RAIZ, dir))) {
      if (!/\.(vue|css)$/.test(nombre)) continue
      const ruta = join(dir, nombre)
      salida.push({ ruta, texto: readFileSync(join(RAIZ, ruta), 'utf8') })
    }
  }
  return salida
}

function reglas(texto) {
  return [...texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].trim().split('\n').pop().trim(),
    cuerpo: m[2],
  }))
}

const ES_DESHABILITADO = /:disabled|\[disabled\]|\.disabled\b|is-disabled/

describe('estado deshabilitado', () => {
  it('ninguna regla escribe su propia opacidad', () => {
    const sueltas = []
    for (const { ruta, texto } of archivos()) {
      for (const { sel, cuerpo } of reglas(texto)) {
        if (!ES_DESHABILITADO.test(sel)) continue
        const op = cuerpo.match(/(?:^|[\s;])opacity:\s*([^;]+);/)
        if (op && !op[1].includes('--disabled-opacity'))
          sueltas.push(`${ruta} ${sel}: ${op[1].trim()}`)
      }
    }
    expect(sueltas, 'usa var(--disabled-opacity)').toEqual([])
  })

  it('el token existe y cae en el rango que recomienda Material', () => {
    const css = readFileSync(join(RAIZ, 'src/assets/main.css'), 'utf8')
    const v = css.match(/--disabled-opacity:\s*([\d.]+)/)
    expect(v, 'falta --disabled-opacity').toBeTruthy()
    const n = Number(v[1])
    expect(n).toBeGreaterThanOrEqual(0.38)
    expect(n).toBeLessThanOrEqual(0.5)
  })

  it('atenuar va siempre acompañado de cursor: not-allowed', () => {
    const sinCursor = []
    for (const { ruta, texto } of archivos()) {
      for (const { sel, cuerpo } of reglas(texto)) {
        if (!/var\(--disabled-opacity\)/.test(cuerpo)) continue
        if (!/cursor:\s*not-allowed/.test(cuerpo)) sinCursor.push(`${ruta} ${sel}`)
      }
    }
    expect(sinCursor).toEqual([])
  })

  // Un <div> con @click no existe para el teclado, y una clase que solo baja la
  // opacidad no llega al lector de pantalla.
  it('la zona de arrastre es alcanzable y declara su estado', () => {
    const t = readFileSync(join(RAIZ, 'src/components/EntregaUploader.vue'), 'utf8')
    expect(t).toMatch(/role="button"/)
    expect(t).toMatch(/:tabindex="uploading \? -1 : 0"/)
    expect(t).toMatch(/:aria-disabled="uploading"/)
    expect(t).toMatch(/@keydown\.enter/)
    expect(t).toMatch(/@keydown\.space/)
  })
})
