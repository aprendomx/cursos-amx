import { describe, it, expect } from 'vitest'
import { esNoCacheable, esCatalogo, esDatosUsuario } from '../swRoutes.js'

const u = (p) => new URL(`https://api.ejemplo.mx${p}`)

// Lo más importante que puede hacer mal un service worker es servir una
// respuesta vieja donde no toca. Estas son las reglas que lo impiden.
describe('esNoCacheable', () => {
  it('nunca cachea autenticación', () => {
    expect(esNoCacheable(u('/auth/v1/token'))).toBe(true)
    expect(esNoCacheable(u('/auth/v1/user'))).toBe(true)
  })

  it('nunca cachea Edge Functions', () => {
    expect(esNoCacheable(u('/functions/v1/hls-playlist-url'))).toBe(true)
    expect(esNoCacheable(u('/functions/v1/ai-proxy'))).toBe(true)
  })

  // Una escritura servida desde cache devolvería un éxito falso.
  it('nunca cachea escrituras, sea cual sea la ruta', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(esNoCacheable(u('/rest/v1/cursos'), m)).toBe(true)
      expect(esNoCacheable(u('/rest/v1/progreso'), m)).toBe(true)
    }
  })

  it('deja pasar las lecturas normales', () => {
    expect(esNoCacheable(u('/rest/v1/cursos'), 'GET')).toBe(false)
  })
})

describe('esCatalogo', () => {
  it('reconoce las tablas del catálogo', () => {
    for (const t of ['cursos', 'modulos', 'lecciones', 'dependencias', 'feature_toggles']) {
      expect(esCatalogo(u(`/rest/v1/${t}?select=*`))).toBe(true)
    }
  })

  it('no se traga tablas parecidas', () => {
    expect(esCatalogo(u('/rest/v1/cursos_instructores'))).toBe(false)
    expect(esCatalogo(u('/rest/v1/leccion_subtitulos'))).toBe(false)
  })

  it('no cachea el catálogo en una escritura', () => {
    expect(esCatalogo(u('/rest/v1/cursos'), 'POST')).toBe(false)
  })
})

describe('esDatosUsuario', () => {
  it('reconoce los datos del alumno', () => {
    for (const t of ['progreso', 'inscripciones', 'constancias', 'perfiles']) {
      expect(esDatosUsuario(u(`/rest/v1/${t}?select=*`))).toBe(true)
    }
  })

  it('las dos categorías son excluyentes', () => {
    expect(esCatalogo(u('/rest/v1/progreso'))).toBe(false)
    expect(esDatosUsuario(u('/rest/v1/cursos'))).toBe(false)
  })

  it('no cachea una escritura de progreso', () => {
    expect(esDatosUsuario(u('/rest/v1/progreso'), 'PATCH')).toBe(false)
  })

  it('ignora rutas que no son de PostgREST', () => {
    expect(esDatosUsuario(u('/storage/v1/object/perfiles/foto.png'))).toBe(false)
    expect(esCatalogo(u('/'))).toBe(false)
  })
})
