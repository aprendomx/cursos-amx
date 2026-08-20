// Reglas de cacheo del service worker, extraídas para poder probarlas.
//
// src/sw.js no se puede montar en vitest (depende de `self` y del entorno de
// workbox), y estas reglas son justo lo que no debe romperse sin que nadie se
// entere: si una respuesta de autenticación o una escritura acabaran en cache,
// el usuario vería datos ajenos o revertidos.

/** Endpoints que NUNCA deben cachearse. */
export function esNoCacheable(url, method = 'GET') {
  if (method !== 'GET') return true
  const p = url.pathname
  return p.startsWith('/auth/') || p.startsWith('/functions/')
}

const TABLAS_CATALOGO = ['cursos', 'modulos', 'lecciones', 'dependencias', 'feature_toggles']
const TABLAS_USUARIO = ['progreso', 'inscripciones', 'constancias', 'perfiles']

function tablaDe(url) {
  const m = url.pathname.match(/\/rest\/v1\/([a-z_0-9]+)/)
  return m ? m[1] : null
}

/** Catálogo: cambia poco, es lo primero que se quiere ver sin conexión. */
export function esCatalogo(url, method = 'GET') {
  if (esNoCacheable(url, method)) return false
  const t = tablaDe(url)
  return t !== null && TABLAS_CATALOGO.includes(t)
}

/** Datos del propio alumno: se cachean con caducidad corta. */
export function esDatosUsuario(url, method = 'GET') {
  if (esNoCacheable(url, method)) return false
  const t = tablaDe(url)
  return t !== null && TABLAS_USUARIO.includes(t)
}
