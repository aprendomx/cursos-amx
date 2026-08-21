import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'

// La estructura de encabezados es cómo se navega una página con un lector de
// pantalla: sin un `h1` no hay título, y un salto de nivel rompe el índice que
// el lector construye.
//
// Se comprueba estáticamente porque el defecto es estructural y no depende de
// datos. Lo que NO cubre —que el orden de lectura siga al visual— hay que
// mirarlo, y está anotado como tal en el plan.

const RAIZ = resolve(__dirname, '../../..')
const PAGINAS = join(RAIZ, 'src/pages')
const COMPONENTES = join(RAIZ, 'src/components')

function leer(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.vue'))
    .map((n) => ({ nombre: n, texto: readFileSync(join(dir, n), 'utf8') }))
}

function niveles(texto) {
  return [...texto.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))
}

describe('estructura de encabezados', () => {
  it('ninguna página ni componente se salta un nivel', () => {
    const malos = []
    for (const dir of [PAGINAS, COMPONENTES]) {
      for (const { nombre, texto } of leer(dir)) {
        const n = niveles(texto)
        const saltos = n.map((v, i) => [n[i - 1], v]).filter(([a, b]) => a && b - a > 1)
        if (saltos.length)
          malos.push(`${nombre}: ${saltos.map(([a, b]) => `h${a}→h${b}`).join(', ')}`)
      }
    }
    expect(malos, 'un salto de nivel rompe el índice del lector de pantalla').toEqual([])
  })

  // El panel es una SPA: cada sección ES la pantalla, así que cada una necesita
  // su propio h1. Ocho de las veintiuna no lo tenían.
  it('cada sección del panel declara su título de primer nivel', () => {
    const admin = readFileSync(join(PAGINAS, 'AdminPage.vue'), 'utf8')
    const secciones = [
      ...admin.matchAll(/<(\w+)\s+v-(?:else-)?if="activeSection === '([a-z_]+)'"/g),
    ]
    expect(secciones.length, 'no se detectaron secciones del panel').toBeGreaterThan(10)

    const sinTitulo = secciones
      .filter(([, comp]) => {
        try {
          return !readFileSync(join(COMPONENTES, `${comp}.vue`), 'utf8').includes('<h1')
        } catch {
          return false // el componente vive en otro sitio; no es este el sitio de detectarlo
        }
      })
      .map(([, comp, key]) => `${key} (${comp})`)

    expect(sinTitulo).toEqual([])
  })

  it('ninguna página declara más de un h1 en la misma rama de plantilla', () => {
    // PlayerPage declara dos, pero en diseños excluyentes (v-else-if / v-else):
    // solo uno se renderiza. Se comprueba que si hay más de uno, exista esa
    // exclusión, en vez de prohibirlo sin más.
    const sospechosas = []
    for (const { nombre, texto } of leer(PAGINAS)) {
      const cuantos = (texto.match(/<h1[\s>]/g) || []).length
      if (cuantos > 1 && !/v-else/.test(texto))
        sospechosas.push(`${nombre}: ${cuantos} h1 sin alternancia`)
    }
    expect(sospechosas).toEqual([])
  })
})

describe('enlace de salto al contenido', () => {
  const app = readFileSync(join(RAIZ, 'src/App.vue'), 'utf8')
  const css = readFileSync(join(RAIZ, 'src/assets/main.css'), 'utf8')

  it('existe y apunta a la región principal', () => {
    expect(app).toMatch(/class="salto-contenido"/)
    expect(app).toMatch(/href="#contenido-principal"/)
    expect(app).toMatch(/<main id="contenido-principal"/)
  })

  it('es el primer elemento del árbol, no uno cualquiera', () => {
    const inicioApp = app.indexOf('<div class="app">')
    const salto = app.indexOf('salto-contenido', inicioApp)
    const nav = app.indexOf('<TopNav', inicioApp)
    expect(salto).toBeGreaterThan(-1)
    expect(salto, 'el enlace de salto debe preceder a la navegación').toBeLessThan(nav)
  })

  it('el destino puede recibir el foco sin entrar en el orden de tabulación', () => {
    expect(app).toMatch(/<main id="contenido-principal" tabindex="-1"/)
  })

  it('se oculta apartándolo, no con display none', () => {
    const regla = css.match(/\.salto-contenido\s*\{[^}]*\}/)[0]
    // `display: none` lo sacaría del orden de tabulación: dejaría de existir
    // justo para quien lo necesita.
    expect(regla).not.toMatch(/display:\s*none/)
    expect(regla).toMatch(/transform:\s*translateY/)
    expect(css).toMatch(/\.salto-contenido:focus[^{]*\{[^}]*translateY\(0\)/)
  })
})
