import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Las preguntas frecuentes describieron durante meses un enlace «Olvidé mi
// contraseña» que NO existía: la plataforma prometía un comportamiento que no
// tenía, y nada lo detectaba. Esta prueba ata el texto al producto: si la
// promesa y la pantalla se separan otra vez, falla.

const RAIZ = resolve(__dirname, '../../..')
const faq = readFileSync(join(RAIZ, 'src/components/LandingFaq.vue'), 'utf8')
const login = readFileSync(join(RAIZ, 'src/pages/LoginPage.vue'), 'utf8')
const router = readFileSync(join(RAIZ, 'src/router/index.js'), 'utf8')

describe('lo que las preguntas frecuentes prometen existe', () => {
  it('el enlace que describen está en la pantalla de acceso, con ese texto', () => {
    // La cita del FAQ, extraída del propio texto para no fijarla dos veces.
    const m = faq.match(/usa el enlace "([^"]+)"/)
    expect(m, 'el FAQ ya no menciona el enlace: revisar si la promesa cambió').toBeTruthy()
    expect(login).toContain(m[1])
  })

  it('el enlace lleva a una ruta que existe', () => {
    expect(login).toMatch(/router\.push\(\{ name: 'recuperar' \}\)/)
    expect(router).toMatch(/name: 'recuperar'/)
  })

  it('la respuesta no promete más de lo que el flujo hace', () => {
    const respuesta = faq.match(/olvid[eé] mi contraseña\?',\s*\n\s*a: '([^']+)'/i)
    expect(respuesta).toBeTruthy()
    // Promete correo con vínculo: ambas cosas están implementadas.
    expect(respuesta[1]).toMatch(/correo/i)
    expect(respuesta[1]).toMatch(/vínculo|enlace/i)
  })
})
