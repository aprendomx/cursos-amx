import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// App.vue pasa props a TODOS los componentes de ruta a través de <router-view>.
// Si una página declara un nombre que App no pasa, la prop se queda en su valor
// por defecto para siempre y no hay ningún aviso: Vue no se queja, el atributo
// sobrante cae en el elemento raíz y ya está.
//
// Así estuvo el alta: App pasaba `:registro-error`, la página declaraba `error`
// —que es el del LOGIN—, y un registro fallido no mostraba nada. Ni carga, ni
// mensaje. El usuario pulsaba «Crear cuenta» y la página se quedaba quieta.

const RAIZ = resolve(__dirname, '../../..')
const app = readFileSync(join(RAIZ, 'src/App.vue'), 'utf8')

function guionesACamello(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/** Props que App.vue entrega por router-view, en camelCase. */
function propsQueApPasa() {
  const bloque = app.match(/<router-view([\s\S]*?)\/>/)
  expect(bloque, 'no se encontró el router-view de App.vue').toBeTruthy()
  return new Set(
    [...bloque[1].matchAll(/(?:^|\s):([a-z][\w-]*)=/g)].map((m) => guionesACamello(m[1]))
  )
}

/** Props que declara un componente de página. */
function propsQueDeclara(ruta) {
  const t = readFileSync(join(RAIZ, ruta), 'utf8')
  const bloque = t.match(/defineProps\(\{([\s\S]*?)\n\}\)/)
  if (!bloque) return []
  return [...bloque[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
}

// Páginas que App alimenta por router-view. Las demás se valen por sí mismas.
const PAGINAS_CON_PROPS = ['src/pages/LoginPage.vue', 'src/pages/RegistroPage.vue']

describe('props que App entrega a las rutas', () => {
  it('toda prop declarada por una página existe en el router-view', () => {
    const entregadas = propsQueApPasa()
    const huerfanas = []
    for (const ruta of PAGINAS_CON_PROPS) {
      for (const prop of propsQueDeclara(ruta)) {
        // `nextPage` no la entrega App: queda anotada aparte, ver más abajo.
        if (prop === 'nextPage') continue
        if (!entregadas.has(prop)) huerfanas.push(`${ruta}: declara "${prop}", App no la pasa`)
      }
    }
    expect(
      huerfanas,
      'una prop que nadie pasa se queda en su valor por defecto para siempre'
    ).toEqual([])
  })

  it('el alta recibe el estado del ALTA y no el del acceso', () => {
    const props = propsQueDeclara('src/pages/RegistroPage.vue')
    expect(props).toContain('registroError')
    expect(props).toContain('registroLoading')
    // Si volviera a declarar `error`, recibiría loginError y el fallo de alta
    // volvería a ser invisible.
    expect(props).not.toContain('error')
    expect(props).not.toContain('loading')
  })

  it('el acceso sigue recibiendo el suyo', () => {
    const props = propsQueDeclara('src/pages/LoginPage.vue')
    expect(props).toContain('error')
    expect(props).toContain('loading')
  })
})
