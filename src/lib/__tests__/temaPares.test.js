import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Un color puede seguir al tema o no seguirlo. Los dos son legítimos; lo que
// no lo es, es MEZCLARLOS en el mismo par fondo/texto.
//
// Si el fondo sigue al tema y la tinta está clavada, al pasar a oscuro el
// fondo se va a negro y la tinta se queda negra. Si el fondo está clavado
// —porque es el color de la marca— y la tinta sigue al tema, pasa lo mismo al
// revés. Así estaban el hero (1.82:1), las preguntas frecuentes (1.08:1) y los
// chips (3.44:1): cada uno por una de las dos mitades del mismo error.
//
// La clasificación NO se escribe a mano: se deduce de si el token se redefine
// en [data-theme='dark']. Así, cuando alguien añada un token nuevo o le dé una
// variante oscura, esta prueba se entera sola.

const RAIZ = resolve(__dirname, '../../..')
const CSS = readFileSync(join(RAIZ, 'src/assets/main.css'), 'utf8')

function bloque(selector) {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
  return CSS.match(re)?.[1] ?? ''
}

function declarados(texto) {
  return new Map(
    [...texto.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()])
  )
}

const EN_CLARO = declarados(bloque(':root'))
const EN_OSCURO = declarados(bloque("\\[data-theme='dark'\\]"))

/**
 * ¿El valor de este token cambia entre claro y oscuro? Se sigue la cadena de
 * alias: --sobre-primary-100 vale var(--primary-700), que sí cambia, así que
 * cuenta como que sigue al tema.
 */
function sigueAlTema(token, vistos = new Set()) {
  if (vistos.has(token)) return false
  vistos.add(token)
  if (EN_OSCURO.has(token)) return true
  const valor = EN_CLARO.get(token)
  if (!valor) return false
  return [...valor.matchAll(/var\((--[\w-]+)/g)].some((m) => sigueAlTema(m[1], vistos))
}

// Tokens de un valor que se usan tanto de fondo como de texto.
//
// Los RESPALDOS no cuentan: en `var(--brand-secondary, var(--success))` el
// respaldo solo entra si el primero no existe, y existe. Contarlos daba falsos
// positivos —`.qe-correct.on` parecía mezclar un fondo fijo con tinta que sigue
// al tema cuando su fondo es fijo y punto.
function tokensDe(valor) {
  // Se recorren los paréntesis a mano: una expresión regular no distingue el
  // respaldo cuando está anidado, como en `var(--brand-secondary,
  // var(--success))`, y ahí el respaldo no se usa nunca porque el primero
  // existe. Contarlo daba un falso positivo.
  const tokens = []
  for (let i = 0; i < valor.length; i++) {
    if (!valor.startsWith('var(', i)) continue
    let j = i + 4
    while (j < valor.length && /\s/.test(valor[j])) j++
    let nombre = ''
    while (j < valor.length && /[\w-]/.test(valor[j])) nombre += valor[j++]
    if (nombre.startsWith('--')) tokens.push(nombre)
    // Saltar hasta cerrar ESTE var(), respaldo incluido.
    let nivel = 1
    while (j < valor.length && nivel > 0) {
      if (valor[j] === '(') nivel++
      else if (valor[j] === ')') nivel--
      j++
    }
    i = j - 1
  }
  return tokens
}

// La constancia es un documento IMPRESO: se genera con html2pdf sobre papel
// blanco real, así que sus colores están clavados a propósito y no deben
// seguir al tema de la pantalla.
const EXENTOS = [/ConstanciaPage\.vue$/]

function archivosDeEstilo() {
  const salida = []
  for (const dir of ['src/components', 'src/pages', 'src/assets']) {
    for (const nombre of readdirSync(join(RAIZ, dir))) {
      if (!/\.(vue|css)$/.test(nombre)) continue
      const ruta = join(dir, nombre)
      if (EXENTOS.some((re) => re.test(ruta))) continue
      salida.push({ ruta, texto: readFileSync(join(RAIZ, ruta), 'utf8') })
    }
  }
  return salida
}

describe('pares de fondo y tinta', () => {
  it('ninguna regla mezcla un color que sigue al tema con uno que no', () => {
    const mezclas = []
    for (const { ruta, texto } of archivosDeEstilo()) {
      for (const regla of texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const cuerpo = regla[2]
        const fondo = cuerpo.match(/(?:^|[\s;])(?:background|background-color)\s*:\s*([^;]+);/)
        // `[^-]color` evita que `border-color` pase por texto.
        const texto_ = cuerpo.match(/(?:^|[\s;])color\s*:\s*([^;]+);/)
        if (!fondo || !texto_) continue

        const tf = tokensDe(fondo[1])
        const tt = tokensDe(texto_[1])
        if (!tf.length || !tt.length) continue

        const fondoSigue = tf.some((t) => sigueAlTema(t))
        const tintaSigue = tt.some((t) => sigueAlTema(t))
        if (fondoSigue !== tintaSigue) {
          const sel = regla[1].trim().split('\n').pop().trim()
          mezclas.push(
            `${ruta} ${sel}: fondo ${tf.join(',')} ${fondoSigue ? 'sigue' : 'fijo'} ` +
              `con tinta ${tt.join(',')} ${tintaSigue ? 'sigue' : 'fija'}`
          )
        }
      }
    }
    expect(mezclas, 'un par mezclado se vuelve ilegible al cambiar de modo').toEqual([])
  })

  // Hueco que tenía esta prueba: solo comparaba token contra token, así que un
  // color escrito a mano se le escapaba. `.btn-danger` llevaba `color: #fff`
  // sobre `background: var(--danger)` — y --danger pasa de rojo oscuro a rosa
  // claro en modo oscuro, dejando blanco sobre rosa claro.
  it('ningún fondo que sigue al tema lleva una tinta escrita a mano', () => {
    const mezclas = []
    for (const { ruta, texto } of archivosDeEstilo()) {
      for (const regla of texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const cuerpo = regla[2]
        const fondo = cuerpo.match(/(?:^|[\s;])(?:background|background-color)\s*:\s*([^;]+);/)
        const tinta = cuerpo.match(/(?:^|[\s;])color\s*:\s*([^;]+);/)
        if (!fondo || !tinta) continue
        const tf = tokensDe(fondo[1])
        if (!tf.length || !tf.some((t) => sigueAlTema(t))) continue
        // La tinta es literal si no menciona ninguna variable.
        if (/var\(/.test(tinta[1])) continue
        if (/^\s*(inherit|currentcolor|transparent)\s*$/i.test(tinta[1])) continue
        const sel = regla[1].trim().split('\n').pop().trim()
        mezclas.push(
          `${ruta} ${sel}: fondo ${tf.join(',')} sigue al tema, tinta ${tinta[1].trim()} fija`
        )
      }
    }
    expect(mezclas, 'la tinta se queda quieta mientras el fondo se invierte').toEqual([])
  })

  it('los tokens --sobre-* de marca NO se redefinen en oscuro', () => {
    // Su trabajo es justamente no seguir al modo: van sobre el color de la
    // marca, que tampoco cambia. Si alguien les diera variante oscura, el
    // texto del hero y de la barra volvería a invertirse.
    const marca = [...EN_CLARO.keys()].filter((t) => /^--sobre-(primary|secondary|accent)/.test(t))
    expect(marca.length, 'no se encontraron los tokens --sobre-*').toBeGreaterThan(3)
    for (const t of marca) {
      if (t === '--sobre-primary-100') continue // este sí acompaña a un fondo que sigue al tema
      expect(EN_OSCURO.has(t), `${t} no debe redefinirse en [data-theme='dark']`).toBe(false)
    }
  })
})
